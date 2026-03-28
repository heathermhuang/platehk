const CACHE_NAME = 'pvrm-static-v126';
const ASSETS = [
  './',
  './index.html',
  './camera.html',
  './audit.html',
  './api.html',
  './changelog.html',
  './landing.html',
  './assets/index.js',
  './assets/index.config.js',
  './assets/index.home.js',
  './assets/index.data.js',
  './assets/vendor/qrcode-generator.js',
  './assets/landing.js',
  './assets/audit.js',
  './assets/api-page.js',
  './assets/changelog.js',
  './assets/camera.js',
  './terms.html',
  './privacy.html',
  './changelog.html',
  './assets/logo.svg',
  './assets/action-icon.svg',
  './assets/action-share-icon.svg',
  './assets/search.worker.js',
  './assets/favicon.svg',
  './data/auctions.json',
  './data/all.search.meta.json',
  './data/all.preset.amount_desc.top1000.json',
  './data/all.tvrm_legacy_overlap.json',
  './data/issues.manifest.json',
  './data/preset.amount_desc.top1000.json',
  './data/tvrm_physical/issues.manifest.json',
  './data/tvrm_physical/preset.amount_desc.top1000.json',
  './data/tvrm_physical/auctions.json',
  './data/tvrm_eauction/issues.manifest.json',
  './data/tvrm_eauction/preset.amount_desc.top1000.json',
  './data/tvrm_eauction/auctions.json',
  './data/tvrm_legacy/issues.manifest.json',
  './data/tvrm_legacy/preset.amount_desc.top1000.json',
  './data/tvrm_legacy/auctions.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Best-effort precache: don't fail install if one asset is temporarily unavailable.
      const results = await Promise.allSettled(ASSETS.map((a) => cache.add(a)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn('SW precache failures:', failed);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isData =
    url.pathname.endsWith('/data/all.search.meta.json') ||
    url.pathname.endsWith('/data/all.tvrm_legacy_overlap.json') ||
    url.pathname.endsWith('/data/issues.manifest.json') ||
    url.pathname.endsWith('/data/preset.amount_desc.top1000.json') ||
    url.pathname.endsWith('/data/auctions.json') ||
    url.pathname.includes('/data/issues/') ||
    url.pathname.includes('/data/all.char1/') ||
    url.pathname.includes('/data/all.bigram/') ||
    url.pathname.includes('/data/tvrm_physical/') ||
    url.pathname.includes('/data/tvrm_eauction/') ||
    url.pathname.includes('/data/tvrm_legacy/');

  if (isData) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Avoid caching 404 HTML (common when missing JSON on static hosts).
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const isJson = ct.includes('application/json') || url.pathname.endsWith('.json');
          if (res.ok && isJson) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell: network-first to avoid stale HTML/CSS/JS after deployment.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
