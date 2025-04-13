if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });

    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
        registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        const b = document.getElementById('updateAvailable');
                        b.addEventListener('click', () => {
                            installingWorker.postMessage({
                                /** @export */ action: 'skipWaiting'
                            });
                        });
                        b.classList.remove('hidden');
                    }
                }
            });
        });
    });
}