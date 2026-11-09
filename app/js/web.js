// =====================================================================
// web.js — version web (navigateur, téléphone) de BIVOUAC-TECH
//
// Dans l'app Windows, preload.js fournit `window.bivouac` (le pont vers le PC) AVANT ce fichier :
// ici on ne fait alors RIEN. Dans un navigateur, `window.bivouac` n'existe pas : on le remplace par
// des équivalents web, pour que le reste de l'app marche sans changement.
//
// Ce qui change sur le web (règles du projet, CLAUDE.md) :
//  - PAS de clé API : les clés ne quittent jamais le PC. Sur le web, les IA passent par le connecteur
//    (son abonnement Claude / ChatGPT…). listProviders() renvoie donc une liste vide.
//  - Les fichiers s'ouvrent dans le navigateur (pas de « modifier sur place » : il faut l'app Windows).
//  - Pas de mise à jour à installer : recharger la page suffit (le site est redéployé à chaque fusion).
//  - Invitation : https://<site>/#/rejoindre/K7QM-4TPX (au lieu de bivouac://rejoindre/…).
// =====================================================================

(function () {
  if (window.bivouac) { window.BIVOUAC_WEB = false; return; }
  window.BIVOUAC_WEB = true;
  document.documentElement.classList.add('is-web');

  const LT_URL = 'https://api.languagetool.org/v2/check';
  // Même liste que main.js (ASSISTANTS) : ouvrir l'IA de son abonnement avec une demande prête
  const ASSISTANTS = {
    anthropic: (q) => `https://claude.ai/new?q=${q}`,
    openai: (q) => `https://chatgpt.com/?q=${q}`,
    mistral: (q) => `https://chat.mistral.ai/chat?q=${q}`,
    perplexity: (q) => `https://www.perplexity.ai/search?q=${q}`,
    xai: (q) => `https://grok.com/?q=${q}`,
    gemini: () => 'https://gemini.google.com/app',
    deepseek: () => 'https://chat.deepseek.com/'
  };
  const NO_PREFILL = ['gemini', 'deepseek'];

  // ---------- Invitation reçue par lien : #/rejoindre/<code> (ou ?rejoindre=<code>) ----------
  function readInvite() {
    const fromHash = location.hash.match(/^#\/?rejoindre\/([A-Za-z0-9-]{8,9})/);
    const fromQuery = new URLSearchParams(location.search).get('rejoindre');
    const code = (fromHash && fromHash[1]) || fromQuery;
    if (!code) return null;
    // On efface le code de l'adresse (il est à usage unique) et on laisse l'app aller à l'accueil
    history.replaceState(null, '', location.pathname + '#/home');
    return code.toUpperCase();
  }
  let pendingInvite = readInvite();

  const NO_KEYS = 'Sur la version web, les clés API ne sont pas disponibles (elles restent sur votre PC). Branchez votre IA avec le connecteur : Paramètres → Mes IA.';
  // tr() (i18n.js) est chargé après ce fichier, mais existe au moment de l'appel
  const noKeys = () => Promise.reject(new Error(typeof tr === 'function' ? tr(NO_KEYS) : NO_KEYS));

  function open(url) {
    if (/^(https:\/\/|mailto:)/.test(url)) window.open(url, '_blank', 'noopener');
  }

  window.bivouac = {
    // IA par clé API : jamais sur le web
    listProviders: async () => [],
    setKey: noKeys,
    deleteKey: noKeys,
    listModels: async () => [],
    askAi: noKeys,
    summarize: noKeys,

    openAssistant: async (provider, prompt) => {
      const make = ASSISTANTS[provider];
      if (!make) throw new Error(`Fournisseur inconnu : ${provider}`);
      open(make(encodeURIComponent(String(prompt || '').slice(0, 1500))));
      return { target: 'web', prefilled: !NO_PREFILL.includes(provider) };
    },

    // Notification du navigateur (demandée la première fois ; seulement si l'onglet n'est pas regardé)
    notify: async (title, body) => {
      if (!('Notification' in window) || !document.hidden) return;
      if (Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
      if (Notification.permission !== 'granted') return;
      let n;
      try { n = new Notification(title, { body, icon: 'assets/icon-192.png', silent: true }); }
      catch { return; } // Certains navigateurs mobiles exposent Notification sans permettre ce constructeur.
      n.onclick = () => { window.focus(); n.close(); };
    },

    openExternal: async (url) => open(url),

    // Correcteur façon Word : appel direct à LanguageTool (si le navigateur le refuse, l'app passe
    // toute seule sur le correcteur de base, comme quand le quota est atteint)
    grammarCheck: async ({ text, lang }) => {
      const language = ['fr', 'en-US', 'auto'].includes(lang) ? lang : 'fr';
      const body = new URLSearchParams({ text: String(text || '').slice(0, 6000), language });
      if (language === 'auto') body.set('preferredVariants', 'fr,en-US');
      const res = await fetch(LT_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
      if (res.status === 429) throw new Error('Quota gratuit atteint (429)');
      if (!res.ok) throw new Error(`Correcteur indisponible (${res.status})`);
      const data = await res.json();
      return {
        matches: (data.matches || []).map((m) => ({
          offset: m.offset, length: m.length, message: m.message,
          replacements: (m.replacements || []).slice(0, 5).map((r) => ({ value: r.value })),
          rule: { id: m.rule?.id, issueType: m.rule?.issueType, category: { id: m.rule?.category?.id } }
        }))
      };
    },
    setUiLang: () => {},

    // Fichiers : ouverts (ou téléchargés) par le navigateur ; pas de modification sur place
    openFile: async ({ url }) => { open(url); return { ok: true, web: true }; },
    onFileChanged: () => {},
    readOpenedFile: async () => null,
    fileSaved: async () => {},

    // Mises à jour : rien à installer sur le web
    getUpdate: async () => ({ state: 'none', current: (window.BIVOUAC_CONFIG || {}).VERSION || '', packaged: false, web: true }),
    checkUpdate: async () => ({ state: 'none', current: (window.BIVOUAC_CONFIG || {}).VERSION || '', packaged: false, web: true }),
    installUpdate: () => location.reload(),
    onUpdate: () => {},

    // Partage d'écran : le navigateur a sa propre fenêtre de choix (écran, fenêtre, onglet, son)
    screenSources: async () => null,
    screenChoose: async () => true,
    screenAudio: async () => true,

    // Invitations
    takeInvite: async () => { const c = pendingInvite; pendingInvite = null; return c; },
    onInvite: (fn) => window.addEventListener('hashchange', () => {
      const c = readInvite();
      if (c) { pendingInvite = c; fn(); }
    })
  };
})();
