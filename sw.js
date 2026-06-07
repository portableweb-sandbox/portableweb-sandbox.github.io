/* portableweb-sandbox — isolated bundle execution origin
   Part of the portableweb-studio experimental security setup.
   Official viewer: https://portableweb-studio.github.io/app/
   Official live site: https://portableweb.org */

const CACHE = 'pweb-sandbox-v1';
const STORE = 'bundle-files';

const SHELL = [
  '/',
  '/portal.html',
  '/install.html',
];

/* Injected into the <head> of every HTML bundle response before any bundle
   script runs. Revokes APIs that would let a bundle escape its session:
   - indexedDB  : could read/write other sessions' databases on this origin
   - serviceWorker : could register a rogue SW that shadows this one
   Workers are blocked at the CSP layer (worker-src 'none') so there is no
   worker scope left that could bypass these overrides. */
const SANDBOX_GUARD =
  '<script>(function(){'
  + 'try{Object.defineProperty(window,"indexedDB",{get:function(){return undefined},configurable:false})}catch(e){}'
  + 'try{Object.defineProperty(navigator,"serviceWorker",{get:function(){return undefined},configurable:false})}catch(e){}'
  + '})()</script>';

function injectGuard(html) {
  const m = html.match(/<head(\s[^>]*)?>/i);
  if (m) return html.slice(0, m.index + m[0].length) + SANDBOX_GUARD + html.slice(m.index + m[0].length);
  return SANDBOX_GUARD + html;
}

function openDB(sessionId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`portableweb-${sessionId}`, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFile(sessionId, filePath) {
  const db = await openDB(sessionId);
  const record = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(filePath);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record; // { data: Uint8Array, mime: string } | undefined
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  /* Bundle files: /bundle/<sessionId>/<path> — served from per-session IDB */
  const bundleMatch = url.pathname.match(/^\/bundle\/([^/]+)\/(.*)/);
  if (bundleMatch) {
    const [, sessionId, filePath] = bundleMatch;
    const path = filePath || 'index.html';

    e.respondWith((async () => {
      try {
        const record = await getFile(sessionId, path);
        if (!record) {
          return new Response(`File not found: ${path}`, {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        const isHtml = record.mime === 'text/html';
        const body = isHtml
          ? new TextEncoder().encode(injectGuard(new TextDecoder().decode(record.data)))
          : record.data;

        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': record.mime,
            'Content-Security-Policy':
              `default-src 'self' blob: data:; ` +
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'; ` +
              `style-src 'self' 'unsafe-inline'; ` +
              `img-src 'self' blob: data:; ` +
              `font-src 'self' data:; ` +
              `media-src 'self' blob: data:; ` +
              `connect-src /bundle/${sessionId}/; ` +
              `worker-src 'none'; ` +
              `form-action 'none';`,
          },
        });
      } catch (err) {
        return new Response('Sandbox error: ' + err.message, { status: 500 });
      }
    })());
    return;
  }

  /* Shell files (portal.html, install.html, /): cache-first.
     ignoreSearch so /portal.html?s=<uuid> matches the cached /portal.html entry. */
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          caches.open(CACHE).then(c =>
            c.put(new Request(url.origin + url.pathname), response.clone())
          );
        }
        return response;
      });
    })
  );
});
