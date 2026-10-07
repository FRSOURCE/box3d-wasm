import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D, World } from '../dist/index.js';
import {
  box,
  flavour,
  ground,
  loadBox3D,
  near,
  terminateThreads,
} from './helpers/load.js';

let b3: Box3D;
let world: World;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`queries (${flavour})`, () => {
  it('finds the closest shape along a ray and resolves its body', () => {
    world = new b3.World();
    const floor = ground(world);
    const near1 = box(world, 0, 2, 0);
    box(world, 0, 6, 0);
    const hit = world.castRayClosest(
      { x: 0, y: 4, z: 0 },
      { x: 0, y: -10, z: 0 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.shape).toBe(near1.shapes[0]);
    expect(hit.body).toBe(near1);
    expect(near(hit.point.y, 2.5, 1e-4)).toBe(true);
    expect(near(hit.normal.y, 1, 1e-4)).toBe(true);
    expect(near(hit.fraction, 0.15, 1e-4)).toBe(true);
    expect(Number.isInteger(hit.triangleIndex)).toBe(true);
    expect(Number.isInteger(hit.childIndex)).toBe(true);
    const down = world.castRayClosest(
      { x: 5, y: 4, z: 0 },
      { x: 0, y: -10, z: 0 },
    );
    expect(down.body).toBe(floor);
    world.destroy();
  });

  it('reports a miss and reuses the result object', () => {
    world = new b3.World();
    box(world, 0, 0, 0);
    const first = world.castRayClosest(
      { x: 0, y: 4, z: 0 },
      { x: 0, y: -10, z: 0 },
    );
    expect(first.hit).toBe(true);
    const miss = world.castRayClosest(
      { x: 50, y: 4, z: 0 },
      { x: 0, y: -10, z: 0 },
    );
    expect(miss).toBe(first);
    expect(miss.hit).toBe(false);
    expect(miss.shape).toBeUndefined();
    world.destroy();
  });

  it('honours the query mask', () => {
    world = new b3.World();
    const body = world.createBody({ position: { x: 0, y: 0, z: 0 } });
    body.createBox({ filter: { categoryBits: 2 } });
    expect(
      world.castRayClosest(
        { x: 0, y: 4, z: 0 },
        { x: 0, y: -10, z: 0 },
        { maskBits: 1 },
      ).hit,
    ).toBe(false);
    expect(
      world.castRayClosest(
        { x: 0, y: 4, z: 0 },
        { x: 0, y: -10, z: 0 },
        { maskBits: 2 },
      ).hit,
    ).toBe(true);
    world.destroy();
  });
});
