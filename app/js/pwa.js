// =====================================================================
// pwa.js — petit écran et version web
//  1. Menu ☰ : sur un écran étroit (téléphone), la colonne de gauche devient un tiroir qui s'ouvre
//     avec le bouton ☰ et se referme au choix d'une page, d'un clic à côté ou avec Échap.
//  2. Web seulement : enregistre le service worker (sw.js) pour pouvoir installer BIVOUAC-TECH
//     comme une app (écran d'accueil du téléphone, ordinateur) et l'ouvrir sans réseau (écran d'accueil
//     seulement : les données restent sur Supabase).
// =====================================================================

(function () {
  const btn = $('#menu-btn');
  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    btn?.setAttribute('aria-expanded', String(open));
  };
  btn?.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
  $('#nav-scrim')?.addEventListener('click', () => setOpen(false));
  window.addEventListener('hashchange', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  // Un clic sur un lien du tiroir ferme le tiroir (même si l'adresse ne change pas)
  $('#sidebar')?.addEventListener('click', (e) => { if (e.target.closest('a[href]')) setOpen(false); });

  if (!window.BIVOUAC_WEB || !('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (secure) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  // Lecture hors connexion (v0.8.82) : le cache des données appartient au compte connecté ; un autre compte
  // (ou la déconnexion) le vide. Bandeau « Hors connexion » tant que le réseau manque.
  const owner = (id) => navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'bivouac:offline-owner', owner: id || '' })).catch(() => {});
  B.on('session', (uid) => owner(uid));
  const banner = () => {
    let b = $('#offline-banner');
    if (navigator.onLine) { b?.remove(); return; }
    if (b) return;
    b = h(`<div id="offline-banner" class="offline-banner" role="status">${icon('wifi', 15)} ${tr('Hors connexion : vous lisez la dernière version enregistrée sur cet appareil. Rien ne peut être envoyé pour l’instant.')}</div>`);
    document.body.appendChild(b);
  };
  window.addEventListener('online', banner);
  window.addEventListener('offline', banner);
  banner();
})();
