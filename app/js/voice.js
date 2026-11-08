// =====================================================================
// voice.js — le vocal façon Discord, en pair-à-pair (WebRTC)
//
// Chaque salon de Discussion a son vocal. Le SON va directement d'un PC à
// l'autre, chiffré : il ne passe ni par Supabase ni par nous, et ne coûte rien.
// Supabase Realtime sert seulement à :
//   - savoir qui est dans le vocal (présence) ;
//   - échanger les infos de connexion entre PC (signalisation).
// Canal privé par salon : « voice:<project_id>:<channel_id> », réservé aux
// membres du projet par les règles de supabase/migrations/003_vocal.sql.
//
// Limite du pair-à-pair : chacun envoie sa voix à chacun. Au-delà de
// VOICE_MAX personnes, la connexion et le processeur saturent.
// Sans serveur relais (TURN), certains réseaux très fermés (entreprise,
// certains partages de connexion) peuvent empêcher la connexion.
// =====================================================================

const VOICE_MAX = 6;
// Visio : caméra facultative, 6 au plus. Chacun envoie sa vidéo à chacun (pair-à-pair) :
// plus il y a de caméras, plus on baisse un peu la qualité pour ne pas saturer les connexions.
const VIDEO_MAX = 6;
const VIDEO_TIERS = [
  { upTo: 2, maxBitrate: 1500000, scale: 1, fps: 30 },    // 2 caméras : 720p
  { upTo: 4, maxBitrate: 600000, scale: 1.5, fps: 24 },   // 3-4 : environ 480p
  { upTo: 6, maxBitrate: 350000, scale: 2, fps: 20 }      // 5-6 : environ 360p
];
B.VOICE_MAX = VOICE_MAX;
B.VIDEO_MAX = VIDEO_MAX;
const VOICE_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const VOICE_SPEAKING_LEVEL = 0.035; // seuil de volume pour l'anneau « parle »

B.voice = null; // le vocal où je suis : { project, channel, ch, stream, peers, people, muted, deafened, noMic, … }

// ---------------------------------------------------------------------
// Appareils audio (Paramètres → Vocal) : réglage de CE poste. '' = celui par défaut de Windows.
// ---------------------------------------------------------------------

B.voiceDevices = () => ({ mic: store.get('voice:mic', ''), speaker: store.get('voice:speaker', ''), cam: store.get('voice:cam', '') });

/** Liste des caméras (les noms n'apparaissent qu'après une première autorisation) */
B.listVideoDevices = async () => {
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.some((d) => d.kind === 'videoinput' && !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch { /* pas de caméra, ou refusée */ }
  }
  return devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
};

/** Ouvre la caméra choisie (à défaut celle par défaut) en 720p ; null si aucune */
B.openCamera = async (id = store.get('voice:cam', '')) => {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
  for (const video of id ? [{ ...base, deviceId: { exact: id } }, base] : [base]) {
    try { return await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch { /* essai suivant */ }
  }
  return null;
};
B.voiceSetCam = (id) => store.set('voice:cam', id || '');

/** Liste des micros et haut-parleurs. Les noms n'apparaissent qu'après une première autorisation du micro. */
B.listAudioDevices = async () => {
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.some((d) => d.kind === 'audioinput' && !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      s.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch { /* pas de micro, ou refusé : on garde la liste sans noms */ }
  }
  const keep = (kind) => devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return { mics: keep('audioinput'), speakers: keep('audiooutput') };
};

/** Ouvre le micro choisi ; à défaut celui de Windows ; à défaut aucun (écoute seule) */
async function openMic() {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const { mic } = B.voiceDevices();
  const tries = mic ? [{ ...base, deviceId: { exact: mic } }, base] : [base];
  for (const audio of tries) {
    try { return await navigator.mediaDevices.getUserMedia({ audio, video: false }); } catch { /* essai suivant */ }
  }
  return null;
}

/** Envoie le son des autres vers le haut-parleur / casque choisi */
async function applySpeaker(audio) {
  const { speaker } = B.voiceDevices();
  if (!audio.setSinkId) return;
  try { await audio.setSinkId(speaker || ''); } catch { await audio.setSinkId('').catch(() => {}); }
}

/** Changement de haut-parleur (Paramètres ou clic droit sur le casque) : appliqué tout de suite */
B.voiceSetSpeaker = (id) => {
  store.set('voice:speaker', id || '');
  if (B.voice?.out) applySpeaker(B.voice.out);
};
B.voiceSetMic = (id) => store.set('voice:mic', id || '');

// ---------------------------------------------------------------------
// Volumes (réglages de CE poste) : volume général de sortie (0 à 100 %) et
// volume de chaque personne (0 à 200 %), mémorisé pour elle.
// Le son des autres passe par un petit mélangeur Web Audio :
//   voix de chacun → volume de la personne → volume général → haut-parleur choisi
// ---------------------------------------------------------------------

B.voiceOutVolume = () => Math.max(0, Math.min(1, Number(store.get('voice:volume', 1))));
B.voicePersonVolume = (uid) => Math.max(0, Math.min(2, Number(store.get(`voice:vol:${uid}`, 1))));

B.voiceSetOutVolume = (x) => {
  store.set('voice:volume', Math.max(0, Math.min(1, x)));
  if (B.voice?.master) B.voice.master.gain.value = B.voiceOutVolume();
};
B.voiceSetPersonVolume = (uid, x) => {
  store.set(`voice:vol:${uid}`, Math.max(0, Math.min(2, x)));
  const g = B.voice?.peers.get(uid)?.gain;
  if (g) g.gain.value = B.voicePersonVolume(uid);
};

/** Le mélangeur du vocal (créé à la première voix reçue) */
function voiceMixer(v) {
  if (v.master) return v;
  v.ctx ||= new AudioContext();
  v.master = v.ctx.createGain();
  v.master.gain.value = B.voiceOutVolume();
  v.dest = v.ctx.createMediaStreamDestination();
  v.master.connect(v.dest);
  v.out = new Audio();
  v.out.autoplay = true;
  v.out.muted = v.deafened;
  v.out.srcObject = v.dest.stream;
  applySpeaker(v.out);
  v.out.play().catch(() => {});
  return v;
}

/** Nombre de caméras allumées dans le vocal (moi compris) */
const camCount = (v) => (v.cam ? 1 : 0) + [...v.people.entries()].filter(([uid, i]) => uid !== B.me.id && i.cam).length;

/** Qualité de MA vidéo selon le nombre de caméras : 2 = HD, 3-4 = un peu moins, 5-6 = encore un peu moins */
function applyVideoQuality(v) {
  if (!v.cam) return;
  const n = Math.max(1, camCount(v));
  const tier = VIDEO_TIERS.find((t) => n <= t.upTo) || VIDEO_TIERS[VIDEO_TIERS.length - 1];
  if (v.tier === tier) return;
  v.tier = tier;
  for (const p of v.peers.values()) {
    const sender = p.video?.sender;
    if (!sender) continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    Object.assign(params.encodings[0], { maxBitrate: tier.maxBitrate, scaleResolutionDownBy: tier.scale, maxFramerate: tier.fps });
    sender.setParameters(params).catch(() => {});
  }
}

/** Allume / coupe ma caméra (sans couper le son ni renégocier) */
B.voiceToggleCamera = async () => {
  const v = B.voice;
  if (!v) return;
  if (v.cam) {
    for (const p of v.peers.values()) p.video?.sender.replaceTrack(null).catch(() => {});
    v.cam.stop();
    v.cam = null;
    v.tier = null;
  } else {
    const others = [...v.people.entries()].filter(([uid, i]) => uid !== B.me.id && i.cam).length;
    if (others >= VIDEO_MAX) return B.toast(tr('{n} caméras maximum : attendez qu\'une se coupe.', { n: VIDEO_MAX }), { type: 'error' });
    const s = await B.openCamera();
    if (!s) return B.toast(tr('Aucune caméra détectée ou caméra refusée. Vérifiez-la dans Paramètres → Vocal et vidéo.'), { type: 'error', timeout: 8000 });
    if (B.voice !== v) { s.getTracks().forEach((t) => t.stop()); return; }
    v.cam = s.getVideoTracks()[0];
    v.cam.addEventListener('ended', () => { if (B.voice === v && v.cam) B.voiceToggleCamera(); }); // caméra débranchée
    for (const p of v.peers.values()) p.video?.sender.replaceTrack(v.cam).catch(console.error);
    v.tier = null;
  }
  v.ch?.track(voiceMyState(v)).catch(() => {});
  applyVideoQuality(v);
  B.emit('voice');
};

/** Change de caméra en pleine visio */
B.voiceSwitchCamera = async (id) => {
  B.voiceSetCam(id);
  const v = B.voice;
  if (!v?.cam) return;
  const s = await B.openCamera(id);
  if (!s) return B.toast(tr('Cette caméra ne répond pas : on garde la précédente.'), { type: 'error' });
  const old = v.cam;
  v.cam = s.getVideoTracks()[0];
  for (const p of v.peers.values()) await p.video?.sender.replaceTrack(v.cam).catch(console.error);
  old.stop();
  v.tier = null;
  applyVideoQuality(v);
  B.emit('voice');
};

/** Change de micro en plein vocal, sans raccrocher */
B.voiceSwitchMic = async (id) => {
  B.voiceSetMic(id);
  const v = B.voice;
  if (!v) return;
  // Sans micro au départ : il faut renégocier, on rejoint simplement à nouveau
  if (v.noMic) return B.voiceJoin({ ...v.project }, { ...v.channel }, { rejoin: true });
  const fresh = await openMic();
  if (!fresh || !fresh.getAudioTracks().length) {
    return B.toast(tr('Ce micro ne répond pas : on garde le précédent.'), { type: 'error' });
  }
  const track = fresh.getAudioTracks()[0];
  track.enabled = !(v.muted || v.deafened);
  for (const p of v.peers.values()) {
    const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
    if (sender) await sender.replaceTrack(track).catch(console.error);
  }
  v.stream.getAudioTracks().forEach((t) => { v.stream.removeTrack(t); t.stop(); });
  v.stream.addTrack(track);
  voiceMeter(v, B.me.id, v.stream);
  B.toast(tr('Micro changé.'), { type: 'success', timeout: 2500 });
};

B.voiceTopic = (projectId, channelId) => `voice:${projectId}:${channelId}`;

/** Ouvre un canal Realtime privé sur un vocal (présence + signalisation) */
async function voiceChannel(project, channel) {
  try { await B.sb.realtime.setAuth(); } catch { /* jeton déjà transmis */ }
  return B.sb.channel(B.voiceTopic(project.id, channel.id), {
    config: { private: true, presence: { key: B.me.id }, broadcast: { self: false } }
  });
}

/** Personnes présentes, d'après la présence Realtime : Map userId -> { name, muted, deafened } */
function voicePeople(ch) {
  const state = ch.presenceState();
  return new Map(Object.entries(state).map(([uid, metas]) => [uid, metas[metas.length - 1] || {}]));
}

// ---------------------------------------------------------------------
// Rejoindre / quitter
// ---------------------------------------------------------------------

B.voiceJoin = async (project, channel, { rejoin = false } = {}) => {
  if (B.voice?.channel.id === channel.id && !rejoin) return;
  await B.voiceLeave();

  // Sans micro (absent, débranché ou refusé), on rejoint quand même : on entend les autres,
  // eux ne nous entendent pas, et un avertissement le dit clairement.
  const mic = await openMic();
  const noMic = !mic || !mic.getAudioTracks().length;
  const stream = mic || new MediaStream();

  const v = {
    project, channel, stream, noMic,
    peers: new Map(),     // userId -> { pc, audio, pending: [] }
    people: new Map(),    // userId -> { name, muted, deafened }
    earlyIce: new Map(),  // candidats reçus avant la connexion correspondante
    meters: new Map(),    // userId -> analyseur de volume
    muted: noMic,
    deafened: false,
    connecting: true
  };
  B.voice = v;
  B.emit('voice');

  const ch = await voiceChannel(project, channel);
  v.ch = ch;
  ch.on('presence', { event: 'sync' }, () => voiceSync(v));
  ch.on('broadcast', { event: 'signal' }, ({ payload }) => voiceSignal(v, payload).catch(console.error));
  ch.subscribe(async (status) => {
    if (B.voice !== v) return;
    if (status === 'SUBSCRIBED') {
      v.connecting = false;
      B.playSound('voiceIn');
      await ch.track(voiceMyState(v));
      B.emit('voice');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      B.error(new Error(tr('Connexion au vocal impossible. Vérifiez internet, ou que la migration 003_vocal.sql est installée sur Supabase.')));
      B.voiceLeave();
    }
  });
  if (!noMic) voiceMeter(v, B.me.id, stream);
  else B.toast(tr('Aucun micro détecté ou micro désactivé : vous entendez les autres, mais ils ne vous entendent pas.'), { type: 'error', timeout: 8000 });
};

B.voiceLeave = async () => {
  const v = B.voice;
  if (!v) return;
  B.voice = null;
  if (!v.connecting) B.playSound('voiceOut');
  v.cam?.stop();
  v.cam = null;
  clearInterval(v.timer);
  for (const uid of [...v.peers.keys()]) voiceClosePeer(v, uid);
  v.stream.getTracks().forEach((t) => t.stop());
  if (v.out) { v.out.pause(); v.out.srcObject = null; }
  v.ctx?.close().catch(() => {});
  if (v.ch) {
    await v.ch.untrack().catch(() => {});
    await B.sb.removeChannel(v.ch).catch(() => {});
  }
  B.emit('voice');
};

B.voiceToggleMute = () => {
  const v = B.voice;
  if (!v) return;
  if (v.noMic) {
    return B.toast(tr("Aucun micro détecté ou micro désactivé. Branchez-en un (ou autorisez-le dans Windows), choisissez-le dans Paramètres → Vocal, puis rejoignez à nouveau le vocal."), { type: 'error', timeout: 9000 });
  }
  v.muted = !v.muted;
  if (!v.muted && v.deafened) v.deafened = false; // réactiver le micro rend aussi le son
  voiceApply(v);
};

B.voiceToggleDeafen = () => {
  const v = B.voice;
  if (!v) return;
  v.deafened = !v.deafened;
  voiceApply(v);
};

function voiceMyState(v) {
  return { name: B.me.display_name, muted: v.muted || v.deafened || v.noMic, deafened: v.deafened, noMic: Boolean(v.noMic), cam: Boolean(v.cam) };
}

/** Applique micro coupé / son coupé, et prévient les autres */
function voiceApply(v) {
  v.stream.getAudioTracks().forEach((t) => (t.enabled = !(v.muted || v.deafened)));
  if (v.out) v.out.muted = v.deafened;
  v.ch?.track(voiceMyState(v)).catch(() => {});
  B.emit('voice');
}

// En quittant ou rechargeant l'application (changement de langue), on raccroche proprement
window.addEventListener('beforeunload', () => { B.voiceLeave(); });

// ---------------------------------------------------------------------
// Connexions pair-à-pair
// Pour éviter que deux personnes s'appellent en même temps, c'est toujours
// celle dont l'identifiant est le plus petit qui lance l'appel.
// ---------------------------------------------------------------------

function voiceSync(v) {
  if (B.voice !== v) return;
  const before = v.people;
  v.people = voicePeople(v.ch);
  // Son quand quelqu'un d'autre entre ou sort du vocal où je suis
  const others = (m) => [...m.keys()].filter((u) => u !== B.me.id);
  if (others(v.people).some((u) => !before.has(u)) && before.size) B.playSound('voiceIn');
  else if (others(before).some((u) => !v.people.has(u))) B.playSound('voiceOut');
  for (const uid of v.people.keys()) {
    if (uid !== B.me.id && !v.peers.has(uid) && B.me.id < uid) voiceConnect(v, uid, true);
  }
  for (const uid of [...v.peers.keys()]) if (!v.people.has(uid)) voiceClosePeer(v, uid);
  applyVideoQuality(v);
  B.emit('voice');
}

function voiceSend(v, to, data) {
  return v.ch.send({ type: 'broadcast', event: 'signal', payload: { ...data, from: B.me.id, to } });
}

function voiceConnect(v, uid, offerer) {
  const pc = new RTCPeerConnection({ iceServers: VOICE_ICE });
  // L'élément audio, muet, garde le flux WebRTC actif ; le son sort par le mélangeur (volumes)
  const audio = new Audio();
  audio.autoplay = true;
  audio.muted = true;
  const peer = { pc, audio, offerer, pending: v.earlyIce.get(uid) || [] };
  v.earlyIce.delete(uid);
  v.peers.set(uid, peer);

  if (v.stream.getAudioTracks().length) v.stream.getTracks().forEach((t) => pc.addTrack(t, v.stream));
  else pc.addTransceiver('audio', { direction: 'recvonly' }); // pas de micro : on reçoit seulement
  // Canal vidéo prévu d'avance (celui qui appelle le crée, l'autre l'accepte en envoi + réception)
  if (offerer) {
    peer.video = pc.addTransceiver('video', { direction: 'sendrecv' });
    if (v.cam) peer.video.sender.replaceTrack(v.cam).catch(() => {});
  }
  pc.onicecandidate = (e) => { if (e.candidate) voiceSend(v, uid, { type: 'ice', candidate: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    if (e.track.kind === 'video') {
      peer.videoStream = new MediaStream([e.track]);
      B.emit('voice');
      return;
    }
    if (e.track.kind !== 'audio') return;
    audio.srcObject = e.streams[0];
    audio.play().catch(() => {});
    try {
      voiceMixer(v);
      peer.src?.disconnect();
      peer.src = v.ctx.createMediaStreamSource(e.streams[0]);
      peer.gain = v.ctx.createGain();
      peer.gain.gain.value = B.voicePersonVolume(uid);
      peer.src.connect(peer.gain).connect(v.master);
    } catch (err) {
      console.warn('mélangeur indisponible : son direct', err);
      audio.muted = v.deafened;
    }
    voiceMeter(v, uid, e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (B.voice !== v) return;
    // connexion perdue : celui qui a appelé relance la négociation
    if (pc.connectionState === 'failed' && offerer) voiceOffer(v, uid, peer, true).catch(console.error);
    B.emit('voice');
  };
  if (offerer) voiceOffer(v, uid, peer).catch(console.error);
  return peer;
}

async function voiceOffer(v, uid, peer, iceRestart = false) {
  const offer = await peer.pc.createOffer({ iceRestart });
  await peer.pc.setLocalDescription(offer);
  await voiceSend(v, uid, { type: 'offer', sdp: peer.pc.localDescription.toJSON() });
}

async function voiceFlush(peer) {
  for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
}

async function voiceSignal(v, msg) {
  if (B.voice !== v || msg.to !== B.me.id || !msg.from) return;
  let peer = v.peers.get(msg.from);
  if (msg.type === 'offer') {
    if (!peer) peer = voiceConnect(v, msg.from, false);
    await peer.pc.setRemoteDescription(msg.sdp);
    // Le canal vidéo proposé : je l'accepte en envoi + réception, et j'y mets ma caméra si elle est allumée
    const tv = peer.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
    if (tv && !peer.video) {
      tv.direction = 'sendrecv';
      peer.video = tv;
      if (v.cam) await tv.sender.replaceTrack(v.cam).catch(() => {});
      v.tier = null;
      applyVideoQuality(v);
    }
    await voiceFlush(peer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await voiceSend(v, msg.from, { type: 'answer', sdp: peer.pc.localDescription.toJSON() });
  } else if (msg.type === 'answer' && peer) {
    await peer.pc.setRemoteDescription(msg.sdp);
    await voiceFlush(peer);
  } else if (msg.type === 'ice') {
    if (!peer) {
      if (!v.earlyIce.has(msg.from)) v.earlyIce.set(msg.from, []);
      v.earlyIce.get(msg.from).push(msg.candidate);
    } else if (peer.pc.remoteDescription) {
      await peer.pc.addIceCandidate(msg.candidate).catch(() => {});
    } else {
      peer.pending.push(msg.candidate);
    }
  }
}

function voiceClosePeer(v, uid) {
  const peer = v.peers.get(uid);
  if (!peer) return;
  peer.pc.close();
  peer.audio.srcObject = null;
  peer.src?.disconnect();
  peer.gain?.disconnect();
  v.peers.delete(uid);
  const m = v.meters.get(uid);
  if (m) { m.src.disconnect(); v.meters.delete(uid); }
}

// ---------------------------------------------------------------------
// Qui parle ? (anneau autour de l'avatar)
// ---------------------------------------------------------------------

function voiceMeter(v, uid, stream) {
  try {
    v.ctx ||= new AudioContext();
    const src = v.ctx.createMediaStreamSource(stream);
    const an = v.ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    v.meters.get(uid)?.src.disconnect();
    v.meters.set(uid, { src, an, buf: new Uint8Array(an.fftSize), speaking: false });
    v.timer ||= setInterval(() => voiceTick(v), 150);
  } catch (err) { console.warn('mesure du volume impossible', err); }
}

function voiceTick(v) {
  for (const [uid, m] of v.meters) {
    m.an.getByteTimeDomainData(m.buf);
    let sum = 0;
    for (const x of m.buf) sum += ((x - 128) / 128) ** 2;
    const silent = uid === B.me.id ? v.muted || v.deafened : v.people.get(uid)?.muted;
    const speaking = !silent && Math.sqrt(sum / m.buf.length) > VOICE_SPEAKING_LEVEL;
    if (speaking !== m.speaking) {
      m.speaking = speaking;
      $$(`[data-voice-uid="${uid}"]`).forEach((el) => el.classList.toggle('speaking', speaking));
    }
  }
}

B.voiceSpeaking = (uid) => Boolean(B.voice?.meters.get(uid)?.speaking);

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

/** Une personne du vocal : avatar (anneau quand elle parle) + nom + micro coupé */
function voicePersonHtml(uid, info = {}, size = 26) {
  const person = B.person(uid);
  const icons = info.deafened ? icon('headoff', 13) : info.muted ? icon('micoff', 13) : '';
  const title = (person.display_name || info.name || '') + (info.noMic ? ` · ${tr('sans micro')}` : '');
  return `<span class="voice-person" data-person="${esc(uid)}" title="${esc(title)}">
    <span class="voice-ring ${B.voiceSpeaking(uid) ? 'speaking' : ''}" data-voice-uid="${esc(uid)}">${avatar(person.display_name ? person : { id: uid, display_name: info.name }, size)}</span>
    <span class="voice-name">${esc(person.display_name || info.name || '')}</span>${icons ? `<span class="voice-state">${icons}</span>` : ''}
  </span>`;
}

/** Barre « en vocal » dans la barre latérale : visible partout tant qu'on est connecté */
B.renderVoiceBar = () => {
  const bar = $('#voice-bar');
  const v = B.voice;
  if (!bar) return;
  if (!v) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  const states = [...v.peers.values()].map((p) => p.pc.connectionState);
  const status = v.connecting ? tr('Connexion…')
    : states.some((s) => s === 'failed') ? tr('Connexion difficile avec certains membres')
      : tr('Vocal connecté');
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <a class="voice-where" href="#/p/${v.project.id}/discussion/${v.channel.id}">
      <strong class="${v.connecting ? '' : 'ok'}">${icon('volume', 14)} ${status}</strong>
      <span>#${esc(v.channel.name)} · ${esc(v.project.name)}</span>
    </a>
    <div class="voice-people">${[...v.people.entries()].map(([uid, info]) => voicePersonHtml(uid, info, 22)).join('')}</div>
    ${v.noMic ? `<div class="voice-warning">${icon('micoff', 14)} ${tr('Aucun micro : on ne vous entend pas.')}</div>` : ''}
    <div class="voice-controls">
      <button class="icon-btn ${v.muted || v.deafened ? 'off' : ''}" data-voice="mute" title="${v.muted ? tr('Réactiver le micro') : tr('Couper le micro')} · ${tr('clic droit : choisir le micro')}">${icon(v.muted || v.deafened ? 'micoff' : 'mic', 17)}</button>
      <button class="icon-btn ${v.deafened ? 'off' : ''}" data-voice="deafen" title="${v.deafened ? tr('Réactiver le son') : tr('Couper le son')} · ${tr('clic droit : sortie et volume')}">${icon(v.deafened ? 'headoff' : 'headphones', 17)}</button>
      <button class="icon-btn ${v.cam ? 'on' : ''}" data-voice="camera" title="${v.cam ? tr('Couper la caméra') : tr('Allumer la caméra')} · ${tr('clic droit : choisir la caméra')}">${icon(v.cam ? 'video' : 'videooff', 17)}</button>
      <button class="icon-btn leave" data-voice="leave" title="${tr('Quitter le vocal')}">${icon('hangup', 17)}</button>
    </div>
    <div class="voice-quota">${quotaHtml(v.people)}</div>`;
};

/** « Vocal 3/6 · Caméras 2/6 » */
function quotaHtml(people) {
  const cams = [...people.entries()].filter(([uid, i]) => (uid === B.me.id && B.voice ? Boolean(B.voice.cam) : i.cam)).length;
  return `<span title="${tr('Personnes dans le vocal')}">${icon('headphones', 12)} ${people.size}/${VOICE_MAX}</span>
    <span title="${tr('Caméras allumées')}">${icon('video', 12)} ${cams}/${VIDEO_MAX}</span>`;
}
B.voiceQuotaHtml = quotaHtml;

// Les éléments <video> sont gardés d'un affichage à l'autre (pas d'écran noir à chaque mise à jour)
const videoEls = new Map(); // uid -> <video>
function videoEl(uid, stream, mine) {
  let el = videoEls.get(uid);
  if (!el) {
    el = document.createElement('video');
    el.autoplay = true;
    el.muted = true;      // le son passe par le vocal, pas par la vidéo
    el.playsInline = true;
    if (mine) el.classList.add('mirror');
    videoEls.set(uid, el);
  }
  if (el.srcObject !== stream) el.srcObject = stream;
  el.play().catch(() => {});
  return el;
}

/** Mosaïque des caméras allumées, dans le salon où je suis en vocal */
function videoStage(v, holder) {
  const tiles = [];
  if (v.cam) tiles.push({ uid: B.me.id, stream: new MediaStream([v.cam]), mine: true });
  for (const [uid, info] of v.people) {
    const p = v.peers.get(uid);
    if (uid !== B.me.id && info.cam && p?.videoStream) tiles.push({ uid, stream: p.videoStream });
  }
  for (const uid of [...videoEls.keys()]) if (!tiles.some((t) => t.uid === uid)) { videoEls.get(uid).srcObject = null; videoEls.delete(uid); }
  if (!tiles.length) { holder.innerHTML = ''; holder.classList.add('hidden'); return; }
  holder.classList.remove('hidden');
  holder.dataset.n = tiles.length;
  holder.innerHTML = tiles.map((t) => `<div class="video-tile" data-vid="${esc(t.uid)}" data-person="${esc(t.uid)}">
    <span class="video-name">${esc(t.mine ? tr('Vous') : B.person(t.uid).display_name)}</span></div>`).join('');
  for (const t of tiles) {
    const tile = $(`.video-tile[data-vid="${CSS.escape(t.uid)}"]`, holder);
    // mon image : je la garde (aperçu) ; celle des autres
    const el = t.mine ? videoEl(t.uid, mineStream(v), true) : videoEl(t.uid, t.stream);
    tile.prepend(el);
  }
}
/** Flux de mon aperçu, gardé tant que la caméra est la même */
function mineStream(v) {
  if (v.previewFor !== v.cam) { v.preview = new MediaStream([v.cam]); v.previewFor = v.cam; }
  return v.preview;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-voice]');
  if (!b) return;
  const action = b.dataset.voice;
  if (action === 'mute') B.voiceToggleMute();
  if (action === 'deafen') B.voiceToggleDeafen();
  if (action === 'camera') B.voiceToggleCamera().catch(B.error);
  if (action === 'leave') B.voiceLeave();
});
B.on('voice', () => B.renderVoiceBar());

// ---------------------------------------------------------------------
// Clic droit : micro / casque (choix de l'appareil, volume) et volume d'une personne
// ---------------------------------------------------------------------

document.addEventListener('contextmenu', async (e) => {
  const v = B.voice;
  const cam = e.target.closest('[data-voice="camera"]');
  if (v && cam) {
    e.preventDefault();
    const list = await B.listVideoDevices().catch(() => []);
    const cur = B.voiceDevices().cam;
    const item = (id, label) => `<button class="pop-item ${id === cur ? 'on' : ''}" data-dev="${esc(id)}">${id === cur ? icon('check', 14) : '<i class="pop-space"></i>'} <span>${esc(label)}</span></button>`;
    const menu = B.popMenu(e.clientX, e.clientY, `
      <div class="pop-title">${icon('video', 15)} ${tr('Caméra')}</div>
      ${item('', tr('Par défaut (Windows)'))}
      ${list.map((d, i) => item(d.deviceId, d.label || `${tr('Caméra')} ${i + 1}`)).join('')}
      ${list.length ? '' : `<p class="pop-note">${tr('Aucune caméra détectée')}</p>`}`);
    menu.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-dev]');
      if (!b) return;
      B.closePopMenu();
      await B.voiceSwitchCamera(b.dataset.dev).catch(B.error);
    });
    return;
  }
  const btn = e.target.closest('[data-voice="mute"], [data-voice="deafen"]');
  const person = e.target.closest('.voice-person[data-person], .video-tile[data-person]');
  if (!v || (!btn && !person)) return;
  e.preventDefault();

  if (person) {
    const uid = person.dataset.person;
    if (uid === B.me.id || !v.people.has(uid)) return;
    const name = B.person(uid).display_name;
    const menu = B.popMenu(e.clientX, e.clientY, `
      <div class="pop-title">${avatar(B.person(uid), 20)} <span translate="no">${esc(name)}</span></div>
      <label class="pop-label">${tr('Volume de {name}', { name: esc(name) })}</label>
      <div class="pop-range"><input type="range" min="0" max="200" step="5" value="${Math.round(B.voicePersonVolume(uid) * 100)}" /><span></span></div>
      <button class="pop-item" data-reset>${tr('Volume normal (100 %)')}</button>`);
    const range = $('input', menu);
    const show = () => { $('.pop-range span', menu).textContent = `${range.value} %`; };
    show();
    range.oninput = () => { B.voiceSetPersonVolume(uid, Number(range.value) / 100); show(); };
    $('[data-reset]', menu).onclick = () => { range.value = 100; range.oninput(); };
    return;
  }

  const isMic = btn.dataset.voice === 'mute';
  const { mics, speakers } = await B.listAudioDevices().catch(() => ({ mics: [], speakers: [] }));
  const list = isMic ? mics : speakers;
  const cur = isMic ? B.voiceDevices().mic : B.voiceDevices().speaker;
  const item = (id, label) => `<button class="pop-item ${id === cur ? 'on' : ''}" data-dev="${esc(id)}">${id === cur ? icon('check', 14) : '<i class="pop-space"></i>'} <span>${esc(label)}</span></button>`;
  const menu = B.popMenu(e.clientX, e.clientY, `
    <div class="pop-title">${icon(isMic ? 'mic' : 'headphones', 15)} ${isMic ? tr('Micro') : tr('Haut-parleur / casque')}</div>
    ${item('', tr('Par défaut (Windows)'))}
    ${list.map((d, i) => item(d.deviceId, d.label || `${isMic ? tr('Micro') : tr('Sortie')} ${i + 1}`)).join('')}
    ${isMic && !list.length ? `<p class="pop-note">${tr('Aucun micro détecté')}</p>` : ''}
    ${isMic ? '' : `<label class="pop-label">${tr('Volume du vocal')}</label>
      <div class="pop-range"><input type="range" min="0" max="100" step="5" value="${Math.round(B.voiceOutVolume() * 100)}" /><span></span></div>`}`);
  menu.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-dev]');
    if (!b) return;
    B.closePopMenu();
    if (isMic) await B.voiceSwitchMic(b.dataset.dev).catch(B.error);
    else B.voiceSetSpeaker(b.dataset.dev);
  });
  const range = $('input[type=range]', menu);
  if (range) {
    const show = () => { $('.pop-range span', menu).textContent = `${range.value} %`; };
    show();
    range.oninput = () => { B.voiceSetOutVolume(Number(range.value) / 100); show(); };
  }
});

/**
 * Bandeau vocal en haut d'un salon : qui est dedans + Rejoindre / Quitter.
 * Quand je n'y suis pas, on « regarde » le vocal sans y entrer (présence seule).
 */
B.voiceStrip = (el, project, channel) => {
  let peek = null;
  let peekPeople = new Map();
  let busy = false;
  let alive = true;

  const inRoom = () => B.voice?.channel.id === channel.id;

  const render = () => {
    if (!alive) return;
    const people = inRoom() ? B.voice.people : peekPeople;
    const full = !inRoom() && people.size >= VOICE_MAX;
    el.innerHTML = `
      <span class="voice-strip-title">${icon('headphones', 16)} ${tr('Vocal')}</span>
      <div class="voice-people">${people.size
        ? [...people.entries()].map(([uid, info]) => voicePersonHtml(uid, info)).join('')
        : `<span class="muted small">${tr('Personne pour le moment.')}</span>`}</div>
      <span class="spacer"></span>
      ${full ? `<span class="muted small">${tr('Vocal complet ({n} personnes maximum).', { n: VOICE_MAX })}</span>` : ''}
      ${inRoom() && B.voice.noMic ? `<span class="voice-warning">${icon('micoff', 14)} ${tr('Aucun micro détecté ou micro désactivé : vous entendez les autres, mais ils ne vous entendent pas.')}</span>` : ''}
      ${people.size ? `<span class="voice-quota light">${quotaHtml(people)}</span>` : ''}
      ${inRoom()
        ? `<button class="btn small ${B.voice.cam ? 'primary' : ''}" data-voice="camera" title="${tr('clic droit : choisir la caméra')}">${icon(B.voice.cam ? 'video' : 'videooff', 15)} ${B.voice.cam ? tr('Couper la caméra') : tr('Caméra')}</button>
           <button class="btn small danger-ghost" data-voice="leave">${icon('hangup', 15)} ${tr('Quitter le vocal')}</button>`
        : `<button class="btn small primary" id="voice-join" ${full || busy ? 'disabled' : ''}>${icon('mic', 15)} ${busy ? tr('Connexion…') : tr('Rejoindre le vocal')}</button>`}
      <div class="video-stage hidden"></div>`;
    $('#voice-join', el)?.addEventListener('click', join);
    if (inRoom()) videoStage(B.voice, $('.video-stage', el));
  };

  const startPeek = async () => {
    if (peek || inRoom() || !alive) return;
    const ch = await voiceChannel(project, channel);
    if (!alive || inRoom()) { B.sb.removeChannel(ch); return; }
    peek = ch;
    ch.on('presence', { event: 'sync' }, () => { peekPeople = voicePeople(ch); render(); });
    ch.subscribe();
  };
  const stopPeek = async () => {
    if (!peek) return;
    const ch = peek;
    peek = null;
    peekPeople = new Map();
    await B.sb.removeChannel(ch).catch(() => {});
  };

  async function join() {
    busy = true;
    render();
    try {
      await stopPeek(); // un seul abonnement par vocal
      await B.voiceJoin(project, channel);
    } catch (err) {
      B.error(err);
      startPeek();
    } finally {
      busy = false;
      render();
    }
  }

  const off = B.on('voice', () => {
    if (!inRoom() && !peek && !busy) startPeek();
    render();
  });
  B.onLeave(() => { alive = false; off(); stopPeek(); });

  render();
  startPeek();
};
