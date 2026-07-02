// sw.js — Service Worker do S30 Cosmic Companion
// Cacheia todo o shell do app na instalação; serve offline depois.
// Muda CACHE_NAME pra forçar atualização quando deploy novo.

const CACHE_NAME = 's30-companion-v1';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/atlas.js',
  './js/astro-events.js',
  './js/catalog.js',
  './js/constellation-data.js',
  './js/db.js',
  './js/exif.js',
  './js/locations.js',
  './js/moon.js',
  './js/reference-catalog.js',
  './js/sky-season.js',
  './js/ui.js',
  './js/upload.js',
  './js/wiki.js',
  // fontes do Google — cacheia na primeira visita
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // IndexedDB e APIs externas (Wikipedia) passam direto — só cacheia o shell
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // cacheia fontes e outros recursos estáticos dinamicamente
        if (response.ok && (e.request.url.includes('fonts.g') || e.request.url.includes('fonts.gstatic'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // offline e não está no cache — retorna index.html (SPA fallback)
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
