import { useState, useEffect, useCallback } from 'react';

export function useSWUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onUpdateFound = (registration: ServiceWorkerRegistration) => {
      const installingWorker = registration.installing;
      if (installingWorker) {
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // A new service worker is waiting to activate
              setUpdateAvailable(true);
              setWaitingWorker(installingWorker);
            }
          }
        };
      }
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      // Check if there's already a waiting worker
      if (registration.waiting) {
        setUpdateAvailable(true);
        setWaitingWorker(registration.waiting);
      }

      registration.addEventListener('updatefound', () => onUpdateFound(registration));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}
