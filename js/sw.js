const CACHE_NAME = 'pdf-editor-v2';
const urlsToCache = [
    './',
    './index.html',
    './editor.html',
    './css/style.css',
    './js/history.js',
    './js/pdf-engine.js',
    './js/redaction-tool.js',
    './js/highlight-tool.js',
    './js/image-tool.js',
    './js/signature-tool.js',
    './js/text-tool.js',
    './js/rotate-crop-tool.js',
    './js/merge-split-tool.js',
    './js/export.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).catch(() => {
                    if (event.request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});
