const cacheName = 'v17';

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
]

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil(
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
    if (!(e.request.url.startsWith('http:') || e.request.url.startsWith('https:'))) return;

    e.respondWith((async () => {
        const r = await caches.match(e.request);
        if (r) return r;
        const response = await fetch(e.request, {cache: "no-cache"});
        const cache = await caches.open(cacheName);
        cache.put(e.request, response.clone());
        return response;
    })());
});

self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
