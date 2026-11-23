// =====================================================================
// push.js — notifications « app fermée » et réglages de notifications (23/11, Apo ; migration 035)
//
//  • Mes réglages (partout où je suis connecté) : messages privés oui / non, son, vibreur → table notify_prefs.
//  • Mon niveau par projet (onglet Équipe) : 'all' (tous les messages, par défaut), 'mentions' (moi et @tous),
//    'me' (seulement quand on me cite), 'mute' (rien) → table project_notify. Vaut pour l'app ouverte ET fermée.
//  • Cet appareil (web, web app installée, app Android) : abonnement Web Push → save_push_subscription.
//    Windows (Electron) n'en a pas besoin : l'app reste près de l'horloge (Tray) et prévient elle-même.
//  • Après chaque envoi (message, message privé, notification de la cloche), l'app de l'auteur signale l'envoi à la
//    fonction Supabase « push » (B.sendPush), qui prévient les bonnes personnes selon leurs réglages.
// =====================================================================

B.NOTIFY_LEVELS = () => [
  ['all', tr('Tous les messages'), tr('chaque nouveau message des salons et de l\'Atelier')],
  ['mentions', tr('Mentions'), tr('quand on me cite ou qu\'on cite toute l\'équipe (@tous)')],
  ['me', tr('Seulement moi'), tr('seulement quand on me cite (@mon-pseudo)')],
  ['mute', tr('Muet'), tr('aucune notification pour ce projet')]
];

const NS = { prefs: { dm: true, sound: true, vibrate: true }, levels: new Map() };
B.notifySettings = NS;

/** Lit mes réglages (au démarrage) ; si les tables n'existent pas encore, garde les valeurs par défaut */
B.loadNotifySettings = async () => {
  if (!B.me) return;
  const [p, l] = await Promise.all([
    B.sb.from('notify_prefs').select('dm, sound, vibrate').eq('user_id', B.me.id).maybeSingle(),
    B.sb.from('project_notify').select('project_id, level').eq('user_id', B.me.id)
  ]).catch(() => [{}, {}]);
  if (p?.data) NS.prefs = { ...NS.prefs, ...p.data };
  NS.levels = new Map((l?.data || []).map((r) => [r.project_id, r.level]));
};

B.saveNotifyPrefs = async (patch) => {
  NS.prefs = { ...NS.prefs, ...patch };
  const { error } = await B.sb.from('notify_prefs')
    .upsert({ user_id: B.me.id, ...NS.prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
};

B.projectNotifyLevel = (projectId) => NS.levels.get(projectId) || 'all';
B.setProjectNotifyLevel = async (projectId, level) => {
  const { error } = await B.sb.from('project_notify')
    .upsert({ user_id: B.me.id, project_id: projectId, level, updated_at: new Date().toISOString() }, { onConflict: 'user_id,project_id' });
  if (error) throw error;
  NS.levels.set(projectId, level);
};

/** Un message de salon me concerne-t-il, selon mon niveau pour ce projet ? (app ouverte) */
B.levelWants = (projectId, text) => {
  const level = B.projectNotifyLevel(projectId);
  if (level === 'mute') return false;
  if (level === 'all') return true;
  const t = String(text || '');
  const cites = (h) => h && new RegExp(`(^|[^\\w@])@${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'iu').test(t);
  if (cites(B.me?.handle)) return true;
  return level === 'mentions' && ['tous', 'all', 'everyone', 'equipe', 'équipe'].some(cites);
};

/** Signale un envoi à la fonction « push » (sans attendre, sans erreur visible) */
B.sendPush = (kind, id) => {
  if (!id || !B.me || !B.sb.functions?.invoke) return;
  B.sb.functions.invoke('push', { body: { kind, id } }).catch(() => {});
};

// ---------- Cet appareil (Web Push) ----------

const PUSH_URL = () => `${(window.BIVOUAC_CONFIG || {}).SUPABASE_URL}/functions/v1/push`;
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
/** Nom lisible de l'appareil, pour s'y retrouver (« Android · app », « Windows · Chrome »…) */
const deviceLabel = () => {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const how = B.isAndroidApp?.() ? 'app' : matchMedia('(display-mode: standalone)').matches ? 'web app' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'navigateur';
  return [os, how].filter(Boolean).join(' · ');
};

B.pushSupported = () => !!(window.BIVOUAC_WEB && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** 'unsupported' | 'denied' | 'on' | 'off' */
B.pushStatus = async () => {
  if (!B.pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSub().catch(() => null);
  B.pushActive = !!(sub && Notification.permission === 'granted');
  return B.pushActive ? 'on' : 'off';
};

async function saveSub(sub) {
  const j = sub.toJSON();
  const { error } = await B.sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: deviceLabel() });
  if (error) throw error;
}

/** Active les notifications app fermée sur cet appareil (demande l'autorisation du navigateur) */
B.enablePush = async () => {
  if (!B.pushSupported()) throw new Error(tr("Ce navigateur ne sait pas recevoir de notifications quand l'app est fermée."));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(tr('Notifications refusées : autorisez-les dans les réglages du navigateur (cadenas à gauche de l\'adresse), puis réessayez.'));
  const { publicKey } = await fetch(PUSH_URL()).then((r) => r.json()).catch(() => ({}));
  if (!publicKey) throw new Error(tr("Les notifications ne sont pas encore prêtes côté serveur. Réessayez un peu plus tard."));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await saveSub(sub);
  B.pushActive = true;
  store.set('push:asked', true);
};

/** Coupe les notifications app fermée sur cet appareil */
B.disablePush = async () => {
  const sub = await currentSub().catch(() => null);
  if (!sub) return;
  await B.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
  B.pushActive = false;
};

/** Au démarrage : cet appareil reste rattaché à la personne connectée (changement de compte compris) */
B.refreshPush = async () => {
  if (!B.pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSub().catch(() => null);
  B.pushActive = !!sub;
  if (sub) await saveSub(sub).catch(() => {});
};

/** Avant de se déconnecter : cet appareil ne reçoit plus rien pour ce compte */
B.forgetPushDevice = async () => {
  const sub = B.pushSupported() ? await currentSub().catch(() => null) : null;
  if (sub) await B.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => {}, () => {});
};

/** Proposé une fois (téléphone ou web app installée) : recevoir les notifications quand l'app est fermée */
B.offerPush = async () => {
  if (store.get('push:asked') || (await B.pushStatus()) !== 'off') return;
  if (!B.isPhone?.() && !matchMedia('(display-mode: standalone)').matches && !B.isAndroidApp?.()) return;
  store.set('push:asked', true);
  B.toast(tr("Être prévenu des messages même quand l'app est fermée ?"), {
    timeout: 20000,
    actions: [[tr('Activer'), 'primary', () => B.enablePush().then(() => B.toast(tr('Notifications activées sur cet appareil.'), { type: 'success' }), (e) => B.toast(esc(e.message), { type: 'error', timeout: 9000 }))],
      [tr('Plus tard'), '', () => {}]]
  });
};

// Clic sur une notification alors que l'app est déjà ouverte : le service worker demande d'aller au bon endroit
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const link = e.data?.type === 'bivouac:open' && e.data.link;
    if (typeof link === 'string' && /^#\/[\w\-/]*$/.test(link)) location.hash = link;
  });
}
