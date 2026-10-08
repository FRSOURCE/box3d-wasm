// The def buffer must hand an already-unit quaternion to the engine untouched:
// renormalizing it flips low bits and breaks bit-for-bit parity with the C API.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;
beforeAll(async () => {
  b3 = await loadBox3D();
});
afterAll(() => terminateThreads(b3));

describe(`quaternion passthrough (${flavour})`, () => {
  it('keeps a body rotation bit-exact, and still repairs a non-unit one', () => {
    const world = new b3.World();
    try {
      // 0.987879^2 + 0.155228^2 is within the engine's tolerance of 1 but not exactly 1
      const q = {
        x: Math.fround(0.987879),
        y: 0,
        z: 0,
        w: Math.fround(0.155228),
      };
      const body = world.createBody({ type: 'dynamic', rotation: q });
      expect(body.getRotation()).toEqual(q);

      const scaled = world.createBody({
        type: 'dynamic',
        rotation: { x: 0, y: 0, z: 0, w: 2 },
      });
      expect(scaled.getRotation().w).toBeCloseTo(1, 6);
    } finally {
      world.destroy();
    }
  });
});
