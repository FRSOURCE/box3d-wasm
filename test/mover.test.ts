import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

const MOVER = {
  center1: { x: 0, y: 0.5, z: 0 },
  center2: { x: 0, y: 1.5, z: 0 },
  radius: 0.5,
};

function wallWorld() {
  const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
  const wall = world.createBody({
    type: 'static',
    position: { x: 5, y: 1, z: 0 },
  });
  wall.createBox({ halfExtents: { x: 0.5, y: 2, z: 5 } });
  world.step(1 / 60, 1);
  return { world, wall };
}

describe(`character mover (${flavour})`, () => {
  it('stops a cast at the wall', () => {
    const { world } = wallWorld();
    const origin = { x: 0, y: 0, z: 0 };
    const fraction = world.castMover(origin, MOVER, { x: 10, y: 0, z: 0 });
    // the wall face is at x = 4.5 and the capsule radius is 0.5
    expect(fraction).toBeGreaterThan(0.35);
    expect(fraction).toBeLessThan(0.45);
    expect(world.castMover(origin, MOVER, { x: -10, y: 0, z: 0 })).toBe(1);
    world.destroy();
  });

  it('gathers planes and pushes the mover out of the wall', () => {
    const { world, wall } = wallWorld();
    const origin = { x: 4.3, y: 0, z: 0 };
    const planes = world.collideMover(origin, MOVER);
    expect(planes.count).toBeGreaterThan(0);
    expect(planes.shapeAt(0)?.body).toBe(wall);
    const normal = planes.copyNormalTo(0, { x: 0, y: 0, z: 0 });
    expect(normal.x).toBeLessThan(-0.9);
    const collision = planes.toCollisionPlanes();
    const solved = b3.solvePlanes({ x: 0, y: 0, z: 0 }, collision);
    expect(solved.delta.x).toBeLessThan(-0.1);
    expect(collision[0].push).toBeGreaterThan(0);
    world.destroy();
  });

  it('clips a velocity against a plane', () => {
    const planes = [{ normal: { x: -1, y: 0, z: 0 }, offset: 0, push: 0.1 }];
    const clipped = b3.clipVector({ x: 3, y: 2, z: 0 }, planes);
    expect(clipped.x).toBeCloseTo(0, 5);
    expect(clipped.y).toBeCloseTo(2, 5);
  });

  it('body-level collide and time of impact', () => {
    const { world, wall } = wallWorld();
    const hit = wall.timeOfImpactMover({ x: 0, y: 0, z: 0 }, MOVER, {
      x: 10,
      y: 0,
      z: 0,
    });
    expect(hit.hit).toBe(true);
    expect(hit.shape?.body).toBe(wall);
    expect(hit.fraction).toBeGreaterThan(0.3);
    expect(hit.fraction).toBeLessThan(0.5);
    expect(
      wall.collideMover({ x: 4.3, y: 0, z: 0 }, MOVER).count,
    ).toBeGreaterThan(0);
    expect(wall.collideMover({ x: -20, y: 0, z: 0 }, MOVER).count).toBe(0);
    world.destroy();
  });
});
