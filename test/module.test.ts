import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`module (${flavour})`, () => {
  it('reports the flavour it was built as', () => {
    expect(b3.flavour).toBe(flavour);
    expect(b3.threaded).toBe(flavour === 'deluxe');
  });

  it('reports a worker budget that matches the pre-spawned pool', () => {
    if (flavour === 'standard') {
      expect(b3.maxWorkers).toBe(1);
      return;
    }
    const pthread = (
      b3.raw as {
        PThread?: { unusedWorkers?: unknown[]; runningWorkers?: unknown[] };
      }
    ).PThread;
    const pool =
      (pthread?.unusedWorkers?.length ?? 0) +
      (pthread?.runningWorkers?.length ?? 0);
    expect(pool).toBeGreaterThan(0);
    expect(b3.maxWorkers).toBe(Math.min(pool + 1, 32));
  });

  it('exposes the engine version and the commit it was built from', () => {
    expect(b3.version.engine).toMatch(/^\d+\.\d+\.\d+$/);
    expect(b3.version.engineSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('lets World be constructed with new', () => {
    const world = new b3.World();
    expect(world.isValid()).toBe(true);
    world.destroy();
  });
});
