import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

function floorWorld(boxOptions = {}, floorOptions = {}) {
  const world = new b3.World();
  const ground = world.createBody({ type: 'static' });
  const floor = ground.createBox({
    halfExtents: { x: 20, y: 0.5, z: 20 },
    offset: { x: 0, y: -0.5, z: 0 },
    ...floorOptions,
  });
  const body = world.createBody({
    type: 'dynamic',
    position: { x: 0, y: 0.5, z: 0 },
  });
  const shape = body.createBox({
    halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    ...boxOptions,
  });
  return { world, ground, floor, body, shape };
}

describe(`world callbacks (${flavour})`, () => {
  it('lets a friction callback replace the mix', () => {
    const { world, body } = floorWorld({ friction: 0.5, userMaterialId: 3 });
    const seen: [number, number, number, number][] = [];
    world.setCallbacks({
      friction: (a, idA, b, idB) => {
        seen.push([a, Number(idA), b, Number(idB)]);
        return 0;
      },
    });
    body.setLinearVelocity({ x: 6, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) world.step(1 / 60, 4);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((s) => s.includes(3))).toBe(true);
    // zero friction: the box keeps sliding
    expect(body.getLinearVelocity().x).toBeGreaterThan(5);
    world.destroy();
  });

  it('falls back to the default mix when the callback returns undefined', () => {
    const { world, body } = floorWorld({ friction: 0.9 }, { friction: 0.9 });
    world.setCallbacks({ friction: () => undefined });
    body.setLinearVelocity({ x: 6, y: 0, z: 0 });
    for (let i = 0; i < 90; i++) world.step(1 / 60, 4);
    expect(body.getLinearVelocity().x).toBeLessThan(1);
    world.destroy();
  });

  it('calls a restitution callback', () => {
    const { world, body } = floorWorld({ restitution: 0.1 });
    body.setTransform({ x: 0, y: 4, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    let calls = 0;
    world.setCallbacks({
      restitution: () => {
        calls += 1;
        return 0.95;
      },
    });
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      world.step(1 / 60, 4);
      if (body.getLinearVelocity().y > 2) bounced = true;
    }
    expect(calls).toBeGreaterThan(0);
    expect(bounced).toBe(true);
    world.destroy();
  });

  it('filters contacts with a custom filter', () => {
    const { world, body, shape } = floorWorld(
      { enableCustomFiltering: true },
      { enableCustomFiltering: true },
    );
    const pairs: unknown[] = [];
    world.setCallbacks({
      customFilter: (a, b) => {
        pairs.push([a, b]);
        return false;
      },
    });
    body.setTransform({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    for (let i = 0; i < 120; i++) world.step(1 / 60, 4);
    expect(pairs.length).toBeGreaterThan(0);
    expect(shape.isValid()).toBe(true);
    expect(body.getPosition().y).toBeLessThan(-1); // fell through the floor
    world.destroy();
  });

  it('can be removed again', () => {
    const { world, body } = floorWorld({ friction: 0.9 }, { friction: 0.9 });
    let calls = 0;
    world.setCallbacks({ friction: () => (calls++, 0) });
    world.setCallbacks({});
    body.setLinearVelocity({ x: 6, y: 0, z: 0 });
    for (let i = 0; i < 90; i++) world.step(1 / 60, 4);
    expect(calls).toBe(0);
    expect(body.getLinearVelocity().x).toBeLessThan(1);
    world.destroy();
  });
});
