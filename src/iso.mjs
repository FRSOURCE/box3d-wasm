/* The isomorphic entry: the shared frontend over the wasm backend, with
 * the same flavour auto-detection as entry.mjs. This is the import a page
 * (or Node) uses when its game source is shared with a native host:
 *
 *     import Box3D from 'box3d-wasm/iso';
 *     const b3 = await Box3D();
 *     const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });
 *
 * A native host satisfies the same import with the identical frontend
 * file over its own backend, which is the whole point. */

import { init } from './backend.js';
import { B3 } from './frontend.js';

export * from './frontend.js';

export default async (options) => {
  const canThread =
    typeof SharedArrayBuffer !== 'undefined' &&
    (typeof globalThis.crossOriginIsolated === 'undefined' ||
      globalThis.crossOriginIsolated);

  const flavour = canThread
    ? await import('./box3d.deluxe.mjs')
    : await import('./box3d.mjs');
  const module = await flavour.default(options);
  init(module);
  const b3 = new B3();
  b3.threaded = canThread;
  b3.maxWorkers = canThread ? (module.maxWorkers ?? 8) : 1;
  return b3;
};
