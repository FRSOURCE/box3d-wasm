// The auto-detecting entry: deluxe where wasm threads can run, standard
// everywhere else. Import @frsource/box3d-wasm/standard or /deluxe to choose.
import type { Box3D, ModuleOptions } from './box3d.js';

export type * from './api.js';
export { vec3, quat, transform, mat3 } from './types.js';

/** True when the deluxe build can load here: SharedArrayBuffer exists and the page is cross-origin isolated (or not a browser). */
export function canUseThreads(): boolean {
  if (typeof SharedArrayBuffer === 'undefined') return false;
  const isolated = (globalThis as { crossOriginIsolated?: boolean })
    .crossOriginIsolated;
  return isolated === undefined || isolated;
}

export default async function Box3D(
  options: ModuleOptions = {},
): Promise<Box3D> {
  const flavour = canUseThreads()
    ? await import('./deluxe.js')
    : await import('./standard.js');
  return flavour.default(options);
}
