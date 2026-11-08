// =====================================================================
// sw.js — service worker de la version web (installation en app, écran d'accueil sans réseau)
// Réseau d'abord : on prend toujours la dernière version publiée ; la copie locale ne sert que
// sans connexion. Seuls les fichiers du site sont gardés (jamais les données de Supabase).
// Le numéro est remplacé à la construction du site (scripts/build-web.mjs).
// =====================================================================
const CACHE = 'bivouac-0.8.14-mw868xg3';
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
