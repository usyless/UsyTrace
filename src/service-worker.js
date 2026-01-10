const cacheName = 'v76';

const contentToCache = [
    './favicon.ico',
    './favicon.svg',

    './',
    './index.html',
    './main.min.css',
    './main.min.js',

    './usytrace.js',
    './usytrace.wasm',
    './usytrace.webmanifest',

    './assets/fonts/open-sans-latin-400-normal.woff2',
    './assets/fonts/open-sans-latin-700-normal.woff2',
].map((c) => `${c}?version=${cacheName}`);

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        await Promise.allSettled(contentToCache.map(url => cache.add(url)));
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.allSettled(
            cacheNames
                .filter(cn => cn !== cacheName)
                .map(cn => caches.delete(cn))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (!(req.url.startsWith('http:') || req.url.startsWith('https:'))) return;

    e.respondWith((async () => {
        return (await caches.match(req, {ignoreSearch: true})) ?? (await fetch(req));
    })());
});

self.addEventListener('message', e => {
    if (e.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});