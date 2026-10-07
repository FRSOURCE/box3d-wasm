import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import {
  flavour,
  loadBox3D,
  pile,
  stepTimes,
  terminateThreads,
} from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`threads (${flavour})`, () => {
  it.skipIf(flavour !== 'deluxe')('puts several workers on a step', () => {
    expect(b3.maxWorkers).toBeGreaterThan(1);
    const want = Math.min(4, b3.maxWorkers);
    const world = new b3.World({ workerCount: want });
    expect(world.getWorkerCount()).toBe(want);
    pile(world, 60);
    stepTimes(world, 30);
    expect(world.getCounters().bodyCount).toBe(61);
    world.destroy();
  });

  it('clamps a request beyond the pool to maxWorkers', () => {
    const world = new b3.World({ workerCount: 10000 });
    expect(world.getWorkerCount()).toBe(b3.maxWorkers);
    world.destroy();
    const auto = new b3.World({ workerCount: 'auto' });
    expect(auto.getWorkerCount()).toBe(b3.maxWorkers);
    auto.destroy();
  });

  it('runs single threaded when not asked for workers', () => {
    const world = new b3.World();
    expect(world.getWorkerCount()).toBe(1);
    world.destroy();
  });

  it('creates and destroys threaded worlds back to back without stalling', () => {
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      const world = new b3.World({ workerCount: 'auto' });
      pile(world, 20);
      stepTimes(world, 5);
      world.destroy();
    }
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
