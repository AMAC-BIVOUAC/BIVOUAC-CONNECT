// =====================================================================
// sw.js — service worker de la version web (installation en app, écran d'accueil sans réseau)
// Réseau d'abord : on prend toujours la dernière version publiée ; la copie locale ne sert que
// sans connexion. Seuls les fichiers du site sont gardés (jamais les données de Supabase).
// Le numéro est remplacé à la construction du site (scripts/build-web.mjs).
// =====================================================================
const CACHE = 'bivouac-0.8.44-mwt1be2g';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase, IA… : jamais en cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
  );
});

// ---------------------------------------------------------------------
// Notifications « app fermée » (Web Push, 23/11) : envoyées par la fonction Supabase « push ».
// Rien ne s'affiche si l'app est déjà ouverte et regardée (elle prévient elle-même).
// Un clic ouvre l'app au bon endroit (adresse interne #/… seulement).
// ---------------------------------------------------------------------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return undefined;
    return self.registration.showNotification(d.title || 'BIVOUAC-TECH', {
      body: d.body || '',
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      silent: !!d.silent,
      vibrate: Array.isArray(d.vibrate) ? d.vibrate : [120, 60, 120],
      data: { link: typeof d.link === 'string' && /^#\/[\w\-/]*$/.test(d.link) ? d.link : '#/home' }
    });
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(`./${e.notification.data?.link || '#/home'}`, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ type: 'bivouac:open', link: e.notification.data?.link || '#/home' }); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
