if ("serviceWorker" in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });

    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
            const b = document.getElementById('updateAvailable');
            const waitingWorker = registration.waiting;
            b.addEventListener('click', () => {
                waitingWorker.postMessage({
                    /** @export */ action: 'skipWaiting'
                });
            });
            b.classList.remove('hidden');
        }

        registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    const b = document.getElementById('updateAvailable');
                    b.addEventListener('click', () => {
                        installingWorker.postMessage({
                            /** @export */ action: 'skipWaiting'
                        });
                    });
                    b.classList.remove('hidden');
                }
            });
        });
    });

    document.getElementById('forceRefresh')?.addEventListener('click', async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();

        if (registrations && registrations.length) {
            for (const registration of registrations) {
                await registration.unregister();
            }
        }

        if (window.caches) {
            const cacheNames = await window.caches.keys();
            await Promise.all(cacheNames.map(name => window.caches.delete(name)));
        }

        window.location.reload();
    });
} else {
    document.getElementById('forceRefresh').disabled = true;
}