/* Офлайн-режим 3D-версии: всё, что игра однажды загрузила, сохраняется на устройстве.
   Код и страница — «сначала сеть» (обновления приходят сразу), модели и библиотеки — «сначала кэш». */
const CODE = 'g3d-code-v9', DATA = 'g3d-data-v3';
const CORE = ['./', 'index.html', 'css/game.css', 'js/main.js', 'js/config.js', 'js/assets.js', 'js/world.js', 'js/character.js',
  'js/npc.js', 'js/sprite.js', 'js/camera.js', 'js/input.js', 'js/ui.js', 'js/collision.js', 'js/post.js', 'js/arena.js', 'js/weapon.js', 'js/fireland.js', 'js/boss.js', 'js/combat-ui.js', 'js/minimap.js'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CODE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k.startsWith('g3d-') && k !== CODE && k !== DATA).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = /\/(assets|vendor)\//.test(u.pathname);
  if (heavy) {
    e.respondWith(caches.open(DATA).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((n) => {
      if (n.ok) c.put(e.request, n.clone());
      return n;
    }))));
    return;
  }
  // код всегда сверяем с сервером (обходя кэш браузера на 10 минут у GitHub Pages)
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((n) => {
    if (n.ok) { const cl = n.clone(); caches.open(CODE).then((c) => c.put(e.request, cl)); }
    return n;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
