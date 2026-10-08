import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`debug draw (${flavour})`, () => {
  it('draws nothing unless asked', () => {
    const world = new b3.World();
    box(world, 0, 1, 0);
    world.step(1 / 60, 4);
    const draw = world.debugDraw();
    expect(draw.lineCount).toBe(0);
    expect(draw.pointCount).toBe(0);
    world.destroy();
  });

  it('draws bounds as box edges', () => {
    const world = new b3.World();
    box(world, 0, 1, 0);
    box(world, 3, 1, 0);
    world.step(1 / 60, 4);
    const draw = world.debugDraw({ bounds: true });
    expect(draw.lineCount).toBe(24);
    expect(draw.lines).toHaveLength(24 * 7);
    expect(Number.isFinite(draw.lines[0])).toBe(true);
    world.destroy();
  });

  it('draws joints', () => {
    const world = new b3.World();
    const a = box(world, 0, 1, 0);
    const b = box(world, 2, 1, 0);
    world.createDistanceJoint(a, b, { length: 2 });
    world.step(1 / 60, 4);
    const draw = world.debugDraw({ joints: true });
    expect(draw.lineCount + draw.pointCount).toBeGreaterThan(0);
    world.destroy();
  });

  it('draws contact points for a resting stack', () => {
    const world = new b3.World();
    const ground = world.createBody({ type: 'static' });
    ground.createBox({
      halfExtents: { x: 10, y: 0.5, z: 10 },
      offset: { x: 0, y: -0.5, z: 0 },
    });
    box(world, 0, 0.5, 0);
    for (let i = 0; i < 5; i++) world.step(1 / 60, 4);
    const draw = world.debugDraw({ contacts: true });
    expect(draw.pointCount).toBeGreaterThan(0);
    expect(draw.points).toHaveLength(draw.pointCount * 5);
    world.destroy();
  });
});
