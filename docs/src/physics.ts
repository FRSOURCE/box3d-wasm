import type { Box3D } from '@frsource/box3d-wasm';

export type Flavour = 'deluxe' | 'standard';

export interface Physics {
  b3: Box3D;
  flavour: Flavour;
  maxWorkers: number;
}

export interface LoadOptions {
  threads: boolean;
}

/**
 * Dynamic imports keep the two flavours in separate chunks, so a
 * single-threaded visitor never downloads the deluxe wasm and its worker.
 */
export async function loadBox3D({ threads }: LoadOptions): Promise<Physics> {
  const factory = threads
    ? (await import('@frsource/box3d-wasm')).default
    : (await import('@frsource/box3d-wasm/standard')).default;
  const b3 = await factory();
  return {
    b3,
    flavour: b3.threaded ? 'deluxe' : 'standard',
    maxWorkers: b3.maxWorkers,
  };
}

/** `?threads=N` wins; otherwise monteslu's rule of min(8, cores). */
export function defaultWorkerCount(
  requested: number | null,
  maxWorkers: number,
): number {
  const wanted = requested ?? Math.min(8, navigator.hardwareConcurrency || 4);
  return Math.min(maxWorkers, Math.max(1, wanted));
}
