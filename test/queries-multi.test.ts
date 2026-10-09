import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`multi-hit queries (${flavour})`, () => {
  function lineOfBoxes() {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const bodies = [
      box(world, 5, 0, 0),
      box(world, 10, 0, 0),
      box(world, 15, 0, 0),
    ];
    world.step(1 / 60, 1);
    return { world, bodies };
  }

  it('collects every hit nearest first', () => {
    const { world, bodies } = lineOfBoxes();
    const hits = world.castRay({ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 });
    expect(hits.count).toBe(3);
    expect([0, 1, 2].map((i) => hits.bodyAt(i))).toEqual(bodies);
    expect(hits.fractionAt(0)).toBeLessThan(hits.fractionAt(1));
    expect(hits.copyPointTo(0, { x: 0, y: 0, z: 0 }).x).toBeCloseTo(4.5, 1);
    expect(hits.copyNormalTo(0, { x: 0, y: 0, z: 0 }).x).toBeCloseTo(-1, 3);
    world.destroy();
  });

  it('closest and any modes return one hit', () => {
    const { world, bodies } = lineOfBoxes();
    const o = { x: 0, y: 0, z: 0 };
    const t = { x: 30, y: 0, z: 0 };
    const closest = world.castRay(o, t, {}, 'closest');
    expect(closest.count).toBe(1);
    expect(closest.bodyAt(0)).toBe(bodies[0]);
    expect(world.castRay(o, t, {}, 'any').count).toBe(1);
    expect(world.castRay(o, { x: 0, y: 5, z: 0 }).count).toBe(0);
    world.destroy();
  });

  it('respects category and mask filters', () => {
    const { world } = lineOfBoxes();
    const hits = world.castRay(
      { x: 0, y: 0, z: 0 },
      { x: 30, y: 0, z: 0 },
      { maskBits: 0 },
    );
    expect(hits.count).toBe(0);
    world.destroy();
  });

  it('sweeps a sphere', () => {
    const { world, bodies } = lineOfBoxes();
    const hits = world.castShape(
      b3.proxy.sphere(0.25),
      { x: 0, y: 0.7, z: 0 },
      { x: 30, y: 0, z: 0 },
      {},
      'closest',
    );
    expect(hits.count).toBe(1);
    expect(hits.bodyAt(0)).toBe(bodies[0]);
    world.destroy();
  });

  it('overlaps an AABB and a shape', () => {
    const { world, bodies } = lineOfBoxes();
    const aabb = world
      .overlapAABB({ x: 4, y: -1, z: -1 }, { x: 11, y: 1, z: 1 })
      .toArray();
    expect(aabb.map((s) => s.body)).toEqual(
      expect.arrayContaining([bodies[0], bodies[1]]),
    );
    expect(aabb.map((s) => s.body)).not.toContain(bodies[2]);
    const near = world
      .overlapShape(b3.proxy.box({ x: 1, y: 1, z: 1 }), { x: 15, y: 0, z: 0 })
      .toArray();
    expect(near.map((s) => s.body)).toEqual([bodies[2]]);
    expect(
      world.overlapShape(b3.proxy.sphere(0.5), { x: 50, y: 0, z: 0 }).count,
    ).toBe(0);
    world.destroy();
  });

  it('rejects an empty proxy', () => {
    const world = new b3.World();
    expect(() =>
      world.overlapShape({ points: [] }, { x: 0, y: 0, z: 0 }),
    ).toThrow(RangeError);
    world.destroy();
  });
});
