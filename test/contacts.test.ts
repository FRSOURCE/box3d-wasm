import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`contact data (${flavour})`, () => {
  it('lists the manifolds of a resting box', () => {
    const world = new b3.World();
    const ground = world.createBody({ type: 'static' });
    const groundShape = ground.createBox({
      halfExtents: { x: 10, y: 0.5, z: 10 },
      offset: { x: 0, y: -0.5, z: 0 },
    });
    const body = box(world, 0, 0.5, 0);
    for (let i = 0; i < 5; i++) world.step(1 / 60, 4);
    const contacts = body.getContacts();
    expect(contacts.count).toBe(1);
    expect(contacts.pointCountAt(0)).toBeGreaterThanOrEqual(1);
    const normal = contacts.copyNormalTo(0, { x: 0, y: 0, z: 0 });
    expect(Math.abs(normal.y)).toBeCloseTo(1, 2);
    const point = contacts.copyPointTo(0, 0, { x: 0, y: 0, z: 0 });
    expect(Math.abs(point.y)).toBeLessThan(0.1);
    expect(contacts.totalNormalImpulseAt(0, 0)).toBeGreaterThan(0);
    const shapes = [contacts.shapeAAt(0), contacts.shapeBAt(0)];
    expect(shapes).toContain(groundShape);
    expect(groundShape.getContacts().count).toBe(1);
    world.destroy();
  });

  it('is empty for an isolated body', () => {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const body = box(world, 0, 0, 0);
    world.step(1 / 60, 4);
    expect(body.getContacts().count).toBe(0);
    world.destroy();
  });

  it('lists the shapes inside a sensor', () => {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const sensorBody = world.createBody({ type: 'static' });
    const sensor = sensorBody.createBox({
      halfExtents: { x: 2, y: 2, z: 2 },
      isSensor: true,
      enableSensorEvents: true,
    });
    const inside = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 0, z: 0 },
    });
    const insideShape = inside.createSphere({
      radius: 0.5,
      enableSensorEvents: true,
    });
    box(world, 20, 0, 0);
    world.step(1 / 60, 4);
    world.step(1 / 60, 4);
    const overlaps = sensor.getSensorOverlaps();
    expect(overlaps.toArray()).toEqual([insideShape]);
    world.destroy();
  });
});
