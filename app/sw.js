// =====================================================================
// sw.js — service worker de la version web (installation en app, écran d'accueil sans réseau)
// Réseau d'abord : on prend toujours la dernière version publiée ; la copie locale ne sert que
// sans connexion. Fichiers du site + (depuis la v0.8.82) dernières lectures de la base, pour lire hors connexion.
// Le numéro est remplacé à la construction du site (scripts/build-web.mjs).
// =====================================================================
const CACHE = 'bivouac-0.8.88-mwy0iqsi';
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

// ---------------------------------------------------------------------
// Lecture hors connexion (v0.8.82) : les LECTURES de la base (GET …/rest/v1/…) passent par le réseau d'abord ;
// la dernière réponse reçue est gardée dans CET appareil (cache « bivouac-donnees ») et resservie seulement sans
// réseau. Rien n'est écrit hors connexion. Le cache est vidé à la déconnexion ou quand un autre compte se connecte
// (message « bivouac:offline-owner » envoyé par l'app), et limité à MAX_DATA réponses.
// ---------------------------------------------------------------------
const DATA = 'bivouac-donnees';
const MAX_DATA = 400;
const isData = (url) => /\.supabase\.co$/.test(url.hostname) && url.pathname.startsWith('/rest/v1/');
let trimming = false;
const trim = async () => {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(DATA);
    const keys = await c.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await c.delete(k);
  } finally { trimming = false; }
};
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'bivouac:offline-owner') return;
  e.waitUntil((async () => {
    const meta = await caches.open('bivouac-meta');
    const prev = await meta.match('owner').then((r) => (r ? r.text() : ''));
    if (prev !== String(d.owner || '')) {
      await caches.delete(DATA);
      await meta.put('owner', new Response(String(d.owner || '')));
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && isData(url) && !e.request.headers.has('range')) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok && res.status === 200) {
        const copy = res.clone();
        e.waitUntil(caches.open(DATA).then((c) => c.put(e.request, copy)).then(trim).catch(() => {}));
      }
      return res;
    }).catch(() => caches.open(DATA).then((c) => c.match(e.request)).then((hit) => {
      if (!hit) throw new TypeError('hors connexion');
      const h = new Headers(hit.headers);
      h.set('x-bivouac-offline', '1');
      return new Response(hit.body, { status: hit.status, headers: h });
    })));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // écritures, IA… : jamais en cache
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
      // Petite icône de la barre d'état (Android) : silhouette blanche sur fond transparent, sinon c'est un carré
      badge: 'assets/badge-96.png',
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
