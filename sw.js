const V='dr-2eb442fec3',CORE=['./','index.html','g.26cf1ab474.js','s.5d4bb6c9b2.css','manifest.webmanifest','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k.indexOf('dr-')===0).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.endsWith('version.json'))return;
 if(u.pathname.indexOf('/a/')>=0){e.respondWith(caches.open('dr-assets').then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n}))));return}
 e.respondWith(fetch(e.request).then(n=>{if(n.ok){const cl=n.clone();caches.open(V).then(c=>c.put(e.request,cl))}return n}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});
