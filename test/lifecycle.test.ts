import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`lifecycle (${flavour})`, () => {
  it('throws on use after destroy', () => {
    const world = new b3.World();
    const body = box(world, 0, 0, 0);
    const shape = body.shapes[0];
    body.destroy();
    expect(body.isValid()).toBe(false);
    expect(shape.isValid()).toBe(false);
    expect(() => body.getPosition()).toThrow(/destroyed/);
    expect(() => shape.getFriction()).toThrow(/destroyed/);
    body.destroy();
    world.destroy();
    expect(() => world.createBody()).toThrow(/destroyed/);
  });

  it('destroying a body takes its shapes and joints with it', () => {
    const world = new b3.World();
    const a = box(world, 0, 0, 0);
    const b = box(world, 2, 0, 0);
    const joint = world.createDistanceJoint(a, b, { length: 2 });
    const shape = a.shapes[0];
    a.destroy();
    expect(shape.alive).toBe(false);
    expect(joint.alive).toBe(false);
    expect(joint.isValid()).toBe(false);
    expect(b.joints.size).toBe(0);
    expect(world.joints.size).toBe(0);
    expect(world.bodies.size).toBe(1);
    expect(world.getCounters().jointCount).toBe(0);
    world.destroy();
  });

  it('destroying a world invalidates everything in it', () => {
    const world = new b3.World();
    const a = box(world, 0, 0, 0);
    const b = box(world, 2, 0, 0);
    const joint = world.createRevoluteJoint(a, b);
    world.destroy();
    expect(world.isValid()).toBe(false);
    expect(a.isValid()).toBe(false);
    expect(b.isValid()).toBe(false);
    expect(a.shapes).toHaveLength(0);
    expect(joint.alive).toBe(false);
    expect(world.bodies.size).toBe(0);
  });

  it('never resurrects an old handle when its slot is reused', () => {
    const world = new b3.World();
    const old = box(world, 0, 0, 0);
    const slot = old.slot;
    old.destroy();
    const fresh = box(world, 0, 5, 0);
    expect(fresh.slot).toBe(slot);
    expect(old.isValid()).toBe(false);
    expect(fresh.isValid()).toBe(true);
    world.step(1 / 60);
    const moves = world.getMoveEvents();
    expect(moves.count).toBe(1);
    expect(moves.bodyAt(0)).toBe(fresh);
    world.destroy();
  });
});
