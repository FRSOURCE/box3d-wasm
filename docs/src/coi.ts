export type IsolationState = 'isolated' | 'single';

const RELOAD_FLAG = 'coi-reloaded';
const FALLBACK_MS = 3000;

/**
 * Resolves once the page is in its final isolation state, so the caller can
 * pick a wasm flavour exactly once. When a service worker can isolate the page
 * it reloads once and this promise never settles (the document is gone); a
 * stuck registration resolves `'single'` after a timeout instead of a blank page.
 */
export function ensureCrossOriginIsolation(
  wantThreads: boolean,
): Promise<IsolationState> {
  if (!wantThreads) return Promise.resolve('single');
  if (crossOriginIsolated) return Promise.resolve('isolated');
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    return Promise.resolve('single');
  }
  const reloaded = readReloadFlag();
  if (reloaded === null) return Promise.resolve('single');
  if (reloaded) {
    // the reload already happened and did not isolate: never loop
    sessionStorage.removeItem(RELOAD_FLAG);
    return Promise.resolve('single');
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('single'), FALLBACK_MS);
    const url = `${import.meta.env.BASE_URL}coi-serviceworker.js`;
    navigator.serviceWorker
      .register(url)
      .then((registration) => {
        if (registration.active && !navigator.serviceWorker.controller) {
          reloadOnce();
          return;
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'activated' && !crossOriginIsolated) {
              reloadOnce();
            }
          });
        });
      })
      .catch(() => {
        clearTimeout(timer);
        resolve('single');
      });
  });
}

/** `null` when sessionStorage is unusable, which makes the reload guard impossible. */
function readReloadFlag(): boolean | null {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return null;
  }
}

function reloadOnce(): void {
  sessionStorage.setItem(RELOAD_FLAG, '1');
  location.reload();
}
