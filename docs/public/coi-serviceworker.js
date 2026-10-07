// Cross-origin isolation for a static host, so the threaded Box3D build can
// run on GitHub Pages. The threaded build needs SharedArrayBuffer, which a
// browser only exposes on a cross-origin isolated page, and a page is only
// isolated when its responses carry COOP and COEP headers. GitHub Pages
// cannot add them; a service worker can, because every response passes
// through it on the way in once it controls the page.
//
// This is the worker half only. Registration (and the one-time reload that
// puts the page under the worker's control) lives in src/coi.ts, so the page
// can wait for the outcome before it picks a wasm flavour.
//
// Adapted from pryme8's babylon-box3d demo (github.com/pryme8/babylon-box3d),
// which in turn follows gzuidhof/coi-serviceworker.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // a range request has to reach the network untouched or media seeking breaks
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 0) {
          // an opaque response has no headers to add to; rewriting it would only hide the failure
          return response;
        }
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        // same-origin assets pass under require-corp anyway; this keeps a cross-origin copy working
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch((error) => {
        console.error('coi-serviceworker:', error);
        throw error;
      }),
  );
});
