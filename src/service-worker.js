const cacheName = 'v23';

contentToCache = [
    './favicon.ico',

    './index.html',

    './popup.css',
    './shared.css',
    './main.css',
    './tutorial.css',

    './worker.js',
    './main.js',
    './updater.js',
    './popups.js',
    './tutorial.js',

    './a.out.wasm',
    './a.out.js',
    './usytrace.webmanifest',

    './assets/fonts/open-sans-latin-400-normal.woff',
    './assets/fonts/open-sans-latin-400-normal.woff2',
    './assets/fonts/open-sans-latin-700-normal.woff',
    './assets/fonts/open-sans-latin-700-normal.woff2',
].map((c) => `${c}?version=${cacheName}`);

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cn => {
                    if (cn !== cacheName) {
                        return caches.delete(cn);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (!(req.url.startsWith('http:') || req.url.startsWith('https:'))) return;

    e.respondWith((async () => {
        const url = new URL(req.url);
        url.search = '';
        url.searchParams.set('version', cacheName);
        return (await caches.match(url.href)) ?? (await fetch(req));
    })());
});

self.addEventListener('message', e => {
    if (e.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});