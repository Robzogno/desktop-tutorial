/* Service worker: deixa o app funcionar offline e verifica contas em segundo plano
   (onde o celular permitir — Android/Chrome com o app instalado). */
importScripts('core.js');

const CACHE = 'financas-v2';
const ARQUIVOS = [
  './', 'index.html', 'styles.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Responde do cache na hora e atualiza em segundo plano (a nova versão aparece na próxima abertura). */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const emCache = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req)
        .then((resp) => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
        .catch(() => emCache);
      return emCache || rede;
    })
  );
});

async function verificar() {
  const estado = await Core.lerEstado();
  await Core.enviarNotificacoes(self.registration, estado);
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'verificar-contas') e.waitUntil(verificar());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
