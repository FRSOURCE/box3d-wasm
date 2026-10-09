import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`transform batch (${flavour})`, () => {
  it('reads the same transforms as per-body calls', () => {
    const world = new b3.World();
    const bodies = [
      box(world, 1, 2, 3),
      box(world, -4, 5, 6),
      box(world, 0, 9, 0),
    ];
    for (let i = 0; i < 30; i++) world.step(1 / 60, 4);
    const batch = world.createTransformBatch(bodies);
    expect(batch.read()).toBe(3);
    const data = batch.data;
    expect(data).toHaveLength(3 * batch.stride);
    bodies.forEach((body, i) => {
      const p = body.getPosition();
      const q = body.getRotation();
      expect(Array.from(data.subarray(i * 7, i * 7 + 7))).toEqual([
        p.x,
        p.y,
        p.z,
        q.x,
        q.y,
        q.z,
        q.w,
      ]);
    });
    batch.destroy();
    world.destroy();
  });

  it('teleports bodies from the buffer', () => {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const a = box(world, 0, 0, 0);
    const b = box(world, 5, 0, 0);
    const batch = world.createTransformBatch([a, b]);
    batch.data.set([10, 20, 30, 0, 0, 0, 1, -1, -2, -3, 0, 0, 0, 1]);
    expect(batch.write()).toBe(2);
    expect(a.getPosition()).toMatchObject({ x: 10, y: 20, z: 30 });
    expect(b.getPosition()).toMatchObject({ x: -1, y: -2, z: -3 });
    batch.destroy();
    world.destroy();
  });

  it('skips destroyed bodies and survives memory growth', () => {
    const world = new b3.World();
    const a = box(world, 0, 1, 0);
    const b = box(world, 2, 1, 0);
    const batch = world.createTransformBatch([a, b]);
    b.destroy();
    expect(batch.read()).toBe(1);
    const generation = (
      batch as unknown as { rt: { mem: { generation: number } } }
    ).rt.mem.generation;
    for (let i = 0; i < 2000; i++) box(world, i, 50, 0);
    const data = batch.data;
    expect(data[1]).toBeCloseTo(1);
    expect(
      (batch as unknown as { rt: { mem: { generation: number } } }).rt.mem
        .generation,
    ).toBeGreaterThanOrEqual(generation);
    batch.destroy();
    expect(() => batch.read()).toThrow(/destroyed/);
    world.destroy();
  });
});
