/* Music AO — Service Worker (cache-first para o shell da app) */
const CACHE = 'musicao-v7';   // subir a cada atualização, senão os visitantes continuam com a versão antiga
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/selos.css',
  './css/radio.css',
  './css/criar.css',
  './js/data.js',
  './js/audio.js',
  './js/beatfreak-cleaner.js',
  './js/app.js',
  './js/qr.js',
  './js/mapa.js',
  './js/selos.js',
  './js/radio.js',
  './js/criar.js',
  './js/vm-dados.js',
  './js/radio-dados.js',
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
