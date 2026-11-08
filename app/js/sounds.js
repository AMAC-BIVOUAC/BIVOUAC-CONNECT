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
      if (status === 'SUBSCRIBED') await ch.track({ at: new Date().toISOString() }).catch(() => {});
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
