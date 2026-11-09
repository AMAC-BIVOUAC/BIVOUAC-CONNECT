// =====================================================================
// Sons de l'application — fabriqués par l'app (Web Audio), aucun fichier ni licence.
// Réglages propres à CE poste (Paramètres → Sons) : activé / désactivé par type, et volume.
//   notif    : une notification arrive (mention, demande d'IA, réponse…)
//   presence : un coéquipier se connecte / se déconnecte de l'application
//   voice    : quelqu'un (ou moi) entre / sort d'un vocal
// =====================================================================

const SOUND_DEFAULTS = { notif: true, presence: true, voice: true, volume: 0.5 };

B.soundPrefs = () => ({ ...SOUND_DEFAULTS, ...(store.get('sounds') || {}) });
B.setSoundPrefs = (patch) => store.set('sounds', { ...B.soundPrefs(), ...patch });

/** Les sons : une suite de notes [fréquence en Hz, début en s, durée en s] */
const SOUNDS = {
  notif: { cat: 'notif', notes: [[659.25, 0, 0.16], [880, 0.11, 0.26]] },             // mi → la
  online: { cat: 'presence', notes: [[523.25, 0, 0.12], [783.99, 0.09, 0.2]] },        // do → sol, montant
  offline: { cat: 'presence', notes: [[783.99, 0, 0.12], [523.25, 0.09, 0.2]] },       // sol → do, descendant
  voiceIn: { cat: 'voice', notes: [[440, 0, 0.1], [554.37, 0.07, 0.1], [659.25, 0.14, 0.2]] },   // accord qui monte
  voiceOut: { cat: 'voice', notes: [[659.25, 0, 0.1], [554.37, 0.07, 0.1], [440, 0.14, 0.2]] }   // accord qui descend
};

let audioCtx = null;
const lastPlayed = new Map(); // évite les rafales (ex. plusieurs connexions en même temps)

/**
 * Joue un son si son type est activé dans Paramètres.
 * force : jouer même si désactivé (bouton « Tester »).
 */
B.playSound = (name, { force = false } = {}) => {
  const s = SOUNDS[name];
  if (!s) return;
  const prefs = B.soundPrefs();
  if (!force && !prefs[s.cat]) return;
  // Statut « Occupé » : ni son de notification, ni son de connexion (le vocal garde les siens)
  if (!force && s.cat !== 'voice' && B.myStatus?.().state === 'busy') return;
  const vol = Math.max(0, Math.min(1, Number(prefs.volume)));
  if (!vol) return;
  const now = Date.now();
  if (!force && now - (lastPlayed.get(name) || 0) < 600) return;
  lastPlayed.set(name, now);
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const out = audioCtx.createGain();
    out.gain.value = 0.22 * vol;
    out.connect(audioCtx.destination);
    // même haut-parleur que le vocal si l'utilisateur en a choisi un
    const sink = store.get('voice:speaker', '');
    if (sink && audioCtx.setSinkId) audioCtx.setSinkId(sink).catch(() => {});
    const t0 = audioCtx.currentTime + 0.01;
    for (const [freq, start, dur] of s.notes) {
      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, t0 + start);
      env.gain.exponentialRampToValueAtTime(1, t0 + start + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(env).connect(out);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
    (B.soundLog ||= []).push(name); // pour les tests
  } catch (err) {
    console.warn('Son impossible', err);
  }
};

// ---------------------------------------------------------------------
// Présence dans l'application : qui de mes coéquipiers est connecté.
// Un canal Realtime PRIVÉ par projet, `online:<project_id>` (règles RLS : migration 014),
// présence seulement (aucun message). Sert au point vert de l'onglet Équipe et aux sons.
// ---------------------------------------------------------------------

B.online = new Set();        // identifiants des personnes connectées (hors moi), tous projets confondus
const onlineChannels = new Map(); // projectId -> canal

function onlineRecompute() {
  const now = new Set();
  for (const ch of onlineChannels.values()) {
    for (const uid of Object.keys(ch.presenceState())) if (uid !== B.me?.id) now.add(uid);
  }
  const before = B.online;
  B.online = now;
  // Pas de son pendant le premier remplissage (à l'ouverture de l'app)
  if (B.onlineReady) {
    if ([...now].some((u) => !before.has(u))) B.playSound('online');
    else if ([...before].some((u) => !now.has(u))) B.playSound('offline');
  }
  B.emit('online');
}

/** Rejoint la présence de chacun de mes projets (appelé après chaque chargement des projets) */
B.syncOnline = async () => {
  if (!B.me) return;
  const ids = new Set((B.projects || []).map((p) => p.id));
  for (const [pid, ch] of onlineChannels) {
    if (!ids.has(pid)) { onlineChannels.delete(pid); B.sb.removeChannel(ch).catch(() => {}); }
  }
  try { await B.sb.realtime.setAuth(); } catch { /* jeton déjà transmis */ }
  for (const pid of ids) {
    if (onlineChannels.has(pid)) continue;
    const ch = B.sb.channel(`online:${pid}`, { config: { private: true, presence: { key: B.me.id } } });
    onlineChannels.set(pid, ch);
    ch.on('presence', { event: 'sync' }, onlineRecompute);
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track(onlineState(pid)).catch(() => {});
    });
  }
  // On laisse quelques secondes aux canaux pour se remplir avant d'activer les sons
  if (!B.onlineReadyTimer) B.onlineReadyTimer = setTimeout(() => { B.onlineReady = true; }, 5000);
};

/** Quitte la présence (fermeture, changement de langue) : les autres me voient partir tout de suite */
B.leaveOnline = () => {
  for (const ch of onlineChannels.values()) { ch.untrack().catch(() => {}); B.sb.removeChannel(ch).catch(() => {}); }
  onlineChannels.clear();
};
window.addEventListener('beforeunload', () => B.leaveOnline());

B.isOnline = (uid) => uid === B.me?.id || B.online.has(uid);

// ---------------------------------------------------------------------
// Mon statut (09/11) : Disponible / Occupé / Absent + un message libre facultatif (« En réunion jusqu'à 15 h »).
// Réglage de CE poste (store 'status'), publié dans la présence de mes projets : rien en base.
// Occupé = ne pas déranger : pas de son de notification ni de notification Windows (les bandeaux restent).
// ---------------------------------------------------------------------

const STATUS_STATES = ['free', 'busy', 'away'];
B.statusLabel = (state) => ({ free: tr('Disponible'), busy: tr('Occupé'), away: tr('Absent') }[state] || tr('Disponible'));
B.myStatus = () => {
  const s = store.get('status') || {};
  return { state: STATUS_STATES.includes(s.state) ? s.state : 'free', text: String(s.text || '').slice(0, 80) };
};
B.setMyStatus = (patch) => {
  store.set('status', { ...B.myStatus(), ...patch });
  for (const [pid, ch] of onlineChannels) ch.track(onlineState(pid)).catch(() => {});
  B.emit('status');
};

/** Le statut d'une personne connectée ({ state, text }), null si hors ligne */
B.statusOf = (uid) => {
  if (uid === B.me?.id) return B.myStatus();
  if (!B.online.has(uid)) return null;
  for (const ch of onlineChannels.values()) {
    const st = (ch.presenceState()[uid] || []).map((m) => m.status).find(Boolean);
    if (st) return { state: STATUS_STATES.includes(st.state) ? st.state : 'free', text: String(st.text || '').slice(0, 80) };
  }
  return { state: 'free', text: '' };
};
/** Classe de la pastille : '' (disponible), 'busy', 'away' ou 'off' (hors ligne) */
B.presenceClass = (uid) => {
  const st = B.statusOf(uid);
  return !st ? 'off' : st.state === 'free' ? '' : st.state;
};
/** « Occupé · En réunion jusqu'à 15 h » ; « Hors ligne » */
B.statusText = (uid) => {
  const st = B.statusOf(uid);
  if (!st) return tr('Hors ligne');
  return st.text ? `${B.statusLabel(st.state)} · ${st.text}` : B.statusLabel(st.state);
};
/** Met à jour toutes les pastilles [data-online] d'une zone */
B.paintPresence = (root = document) => $$('[data-online]', root).forEach((d) => {
  d.className = `presence ${B.presenceClass(d.dataset.online)}`;
  d.title = B.statusText(d.dataset.online);
});

/** Notification Windows / navigateur, sauf en statut « Occupé » */
B.pcNotify = (title, body, silent) => (B.myStatus().state === 'busy' ? Promise.resolve() : window.bivouac.notify(title, body, silent));

/** Menu du statut (clic sur ma carte en bas de la colonne) */
B.openStatusMenu = (x, y) => {
  const cur = B.myStatus();
  const item = (state) => `<button class="pop-item ${state === cur.state ? 'on' : ''}" data-status="${state}">
    <span class="presence ${state === 'free' ? '' : state}"></span> <span>${B.statusLabel(state)}</span>
    ${state === 'busy' ? `<small class="pop-hint">${tr('sans son ni notification')}</small>` : ''}</button>`;
  const menu = B.popMenu(x, y, `
    <div class="pop-title">${tr('Mon statut')}</div>
    ${STATUS_STATES.map(item).join('')}
    <label class="pop-label">${tr('Message (facultatif)')}</label>
    <form class="pop-status-text"><input maxlength="80" placeholder="${esc(tr('Ex. : En réunion jusqu\'à 15 h'))}" value="${esc(cur.text)}" />
      <button class="btn small primary" type="submit">${tr('OK')}</button></form>
    ${cur.text ? `<button class="pop-item" data-status-clear>${icon('x', 14)} <span>${tr('Effacer le message')}</span></button>` : ''}`);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (b) { B.setMyStatus({ state: b.dataset.status, text: $('input', menu).value.trim() }); B.closePopMenu(); }
    if (e.target.closest('[data-status-clear]')) { B.setMyStatus({ text: '' }); B.closePopMenu(); }
  });
  $('form', menu).addEventListener('submit', (e) => {
    e.preventDefault();
    B.setMyStatus({ text: $('input', menu).value.trim() });
    B.closePopMenu();
  });
};

// ---------------------------------------------------------------------
// Qui est en vocal, façon Discord (09/11) : ma présence dans le projet dit aussi dans quel salon vocal
// je suis (et micro coupé / son coupé / caméra). Tout membre connecté le voit, sans rejoindre le vocal.
// Rien en base : c'est la même présence privée online:<projet> (migration 014).
// ---------------------------------------------------------------------

/** Ce que je publie dans la présence d'un projet */
function onlineState(pid) {
  const v = B.voice;
  const inVoice = v && v.project.id === pid && !v.connecting;
  return {
    at: new Date().toISOString(),
    status: B.myStatus(),
    voice: inVoice ? { channel: v.channel.id, muted: Boolean(v.muted || v.deafened || v.noMic), deafened: Boolean(v.deafened), cam: Boolean(v.cam), screen: Boolean(v.screen) } : null
  };
}

// Je rejoins / quitte un vocal, coupe mon micro… : je mets ma présence à jour dans mes projets
let lastVoiceKey = '';
B.on('voice', debounce(() => {
  const v = B.voice;
  const key = v && !v.connecting ? `${v.project.id}|${v.channel.id}|${v.muted}|${v.deafened}|${v.noMic}|${Boolean(v.cam)}|${Boolean(v.screen)}` : '';
  if (key === lastVoiceKey) return;
  lastVoiceKey = key;
  for (const [pid, ch] of onlineChannels) ch.track(onlineState(pid)).catch(() => {});
}, 250));

/** Les personnes dans le salon vocal d'un projet (moi compris), d'après la présence : [{ id, muted, deafened, cam }] */
B.voiceIn = (pid, channelId) => {
  const ch = onlineChannels.get(pid);
  if (!ch) return [];
  const out = [];
  for (const [uid, metas] of Object.entries(ch.presenceState())) {
    const voice = (metas || []).map((m) => m.voice).find((x) => x && x.channel === channelId);
    if (voice) out.push({ id: uid, ...voice });
  }
  return out.sort((a, b) => B.person(a.id).display_name.localeCompare(B.person(b.id).display_name, B.locale()));
};

/** Dans quel salon vocal est cette personne (dans ce projet, ou dans n'importe lequel) ? */
B.voiceWhere = (uid, pid = null) => {
  for (const [p, ch] of onlineChannels) {
    if (pid && p !== pid) continue;
    const voice = (ch.presenceState()[uid] || []).map((m) => m.voice).find(Boolean);
    if (voice) return { project: p, ...voice };
  }
  return null;
};
