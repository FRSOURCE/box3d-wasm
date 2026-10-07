// The wasm threads build. Needs SharedArrayBuffer, which browsers only expose
// on cross-origin isolated pages (COOP same-origin + COEP require-corp).
import { type Box3D, createBox3D, type ModuleOptions } from './box3d.js';
import createModule from './wasm/box3d.deluxe.js';

export type * from './api.js';

export default async function Box3DDeluxe(
  options: ModuleOptions = {},
): Promise<Box3D> {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'box3d: the deluxe build needs SharedArrayBuffer. Serve the page with Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, or load @frsource/box3d-wasm/standard.',
    );
  }
  return createBox3D(await createModule(options), 'deluxe');
}
