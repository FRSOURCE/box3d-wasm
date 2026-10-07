import { defineConfig, loadEnv } from 'vite';

// GitHub Pages cannot send these headers; the dev server and `vite preview` do,
// so the service worker path only runs on Pages. VITE_COI_HEADERS=0 turns them
// off to exercise the service worker locally.
export default defineConfig(({ mode }) => {
  const { VITE_COI_HEADERS } = loadEnv(mode, false);
  const isolationHeaders =
    VITE_COI_HEADERS === '0'
      ? {}
      : {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        };

  return {
    // project page under https://frsource.github.io/box3d-wasm/
    base: '/box3d-wasm/',
    server: { headers: isolationHeaders },
    preview: { headers: isolationHeaders },
    worker: {
      // the deluxe glue spawns itself as a module worker; IIFE workers cannot wrap it
      format: 'es',
    },
    optimizeDeps: {
      // the emscripten glue locates its .wasm and worker via import.meta.url,
      // which esbuild pre-bundling would rewrite to the deps cache
      exclude: ['@frsource/box3d-wasm'],
    },
    build: { outDir: 'dist' },
  };
});
