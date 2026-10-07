import type { Box3D, Quat, Vec3, World } from '@frsource/box3d-wasm';

export type B3 = Box3D;
export type { Quat, Vec3, World };
export type Flavour = 'deluxe' | 'standard';

export interface Physics {
  b3: B3;
  flavour: Flavour;
  maxWorkers: number;
}

export interface LoadOptions {
  threads: boolean;
}

export const GRAVITY: Vec3 = { x: 0, y: -10, z: 0 };

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

export function createWorld(b3: B3, workerCount: number): World {
  return new b3.World({ gravity: GRAVITY, workerCount });
}

export function destroyWorld(world: World): void {
  world.destroy();
}

/** `?threads=N` wins; otherwise monteslu's rule of min(8, cores). */
export function defaultWorkerCount(
  requested: number | null,
  maxWorkers: number,
): number {
  const wanted = requested ?? Math.min(8, navigator.hardwareConcurrency || 4);
  return Math.min(maxWorkers, Math.max(1, wanted));
}
