import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D, World } from '../dist/index.js';
import {
  box,
  flavour,
  ground,
  loadBox3D,
  near,
  stepSeconds,
  terminateThreads,
} from './helpers/load.js';

let b3: Box3D;
let world: World;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`shape (${flavour})`, () => {
  it('creates every convex kind and names its type', () => {
    world = new b3.World();
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
    });
    expect(body.createSphere({ radius: 0.3 }).getType()).toBe('sphere');
    expect(body.createCapsule({ height: 1, radius: 0.25 }).getType()).toBe(
      'capsule',
    );
    expect(
      body
        .createBox({ hx: 0.5, hy: 0.25, hz: 0.5, offset: { x: 1, y: 0, z: 0 } })
        .getType(),
    ).toBe('hull');
    const hull = body.createHull({
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
    });
    expect(hull.getType()).toBe('hull');
    expect(hull.body).toBe(body);
    const flat = body.createHull({
      points: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]),
    });
    expect(flat.isValid()).toBe(true);
    expect(body.shapes).toHaveLength(5);
    world.destroy();
  });

  it('refuses a hull that cannot be built', () => {
    world = new b3.World();
    const body = world.createBody();
    expect(() =>
      body.createHull({
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
      }),
    ).toThrow(/hull/);
    world.destroy();
  });

  it('bounces with restitution', () => {
    world = new b3.World();
    ground(world);
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 3, z: 0 },
    });
    body.createSphere({ radius: 0.5, restitution: 0.9 });
    let bounced = false;
    let falling = true;
    for (let i = 0; i < 240 && !bounced; i++) {
      world.step(1 / 60);
      const vy = body.getLinearVelocity().y;
      if (falling && vy > 0.5) bounced = true;
      if (vy < 0) falling = true;
    }
    expect(bounced).toBe(true);
    world.destroy();
  });

  it('round trips material, density and the surface material', () => {
    world = new b3.World();
    const shape = box(world, 0, 0, 0).shapes[0];
    shape.setFriction(0.2);
    expect(near(shape.getFriction(), 0.2)).toBe(true);
    shape.setRestitution(0.4);
    expect(near(shape.getRestitution(), 0.4)).toBe(true);
    shape.setDensity(2);
    expect(near(shape.getDensity(), 2)).toBe(true);
    expect(near(shape.body.getMass(), 2)).toBe(true);
    shape.setRollingResistance(0.1);
    expect(near(shape.getRollingResistance(), 0.1)).toBe(true);
    shape.setTangentVelocity({ x: 1, y: 0, z: 0 });
    expect(shape.getTangentVelocity().x).toBe(1);
    shape.setUserMaterialId(7);
    expect(shape.getUserMaterialId()).toBe(7);
    shape.setUserMaterialId(0x1_0000_0000_0005n);
    expect(shape.getUserMaterialId()).toBe(0x1_0000_0000_0005n);
    world.destroy();
  });

  it('round trips 64-bit filter bits and merges partial filters', () => {
    world = new b3.World();
    const shape = box(world, 0, 0, 0).shapes[0];
    const initial = shape.getFilter();
    expect(initial.maskBits).toBe(0xffffffffffffffffn);
    shape.setFilter({ categoryBits: 0x4, groupIndex: -3 });
    const filter = shape.getFilter();
    expect(filter.categoryBits).toBe(4);
    expect(filter.maskBits).toBe(0xffffffffffffffffn);
    expect(filter.groupIndex).toBe(-3);
    shape.setFilter({ maskBits: 2 ** 40 });
    expect(shape.getFilter().maskBits).toBe(2n ** 40n);
    world.destroy();
  });

  it('lets a masked body fall through the ground', () => {
    world = new b3.World();
    ground(world).shapes[0].setFilter({ categoryBits: 1, maskBits: 1 });
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
    });
    body.createBox({ filter: { categoryBits: 2, maskBits: 2 } });
    stepSeconds(world, 2);
    expect(body.getPosition().y).toBeLessThan(-2);
    world.destroy();
  });

  it('reports sensor and event flags', () => {
    world = new b3.World();
    const body = world.createBody();
    const sensor = body.createBox({ isSensor: true, enableSensorEvents: true });
    expect(sensor.isSensor()).toBe(true);
    expect(sensor.areSensorEventsEnabled()).toBe(true);
    const solid = body.createBox();
    expect(solid.areContactEventsEnabled()).toBe(false);
    solid.enableContactEvents(true);
    expect(solid.areContactEventsEnabled()).toBe(true);
    solid.enableHitEvents(true);
    expect(solid.areHitEventsEnabled()).toBe(true);
    solid.enableSensorEvents(true);
    expect(solid.areSensorEventsEnabled()).toBe(true);
    world.destroy();
  });

  it('computes bounds and mass, and casts a ray against itself', () => {
    world = new b3.World();
    const shape = world
      .createBody({ position: { x: 0, y: 1, z: 0 } })
      .createSphere({ radius: 0.5, density: 1 });
    const aabb = shape.getAABB();
    expect(near(aabb.lowerBound.y, 0.5, 0.15)).toBe(true);
    expect(near(aabb.upperBound.y, 1.5, 0.15)).toBe(true);
    expect(
      near(shape.computeMassData().mass, (4 / 3) * Math.PI * 0.125, 1e-4),
    ).toBe(true);
    const hit = shape.rayCast({ x: 0, y: 5, z: 0 }, { x: 0, y: -10, z: 0 });
    expect(hit.hit).toBe(true);
    expect(near(hit.point.y, 1.5, 1e-4)).toBe(true);
    expect(near(hit.normal.y, 1)).toBe(true);
    expect(
      shape.rayCast({ x: 5, y: 5, z: 0 }, { x: 0, y: -10, z: 0 }).hit,
    ).toBe(false);
    world.destroy();
  });

  it('destroys a shape and updates the body', () => {
    world = new b3.World();
    const body = box(world, 0, 0, 0);
    const extra = body.createBox({ density: 1, offset: { x: 2, y: 0, z: 0 } });
    expect(near(body.getMass(), 2)).toBe(true);
    extra.destroy();
    expect(extra.isValid()).toBe(false);
    expect(body.shapes).toHaveLength(1);
    expect(body.getShapeCount()).toBe(1);
    expect(near(body.getMass(), 1)).toBe(true);
    expect(() => extra.getFriction()).toThrow(/destroyed/);
    world.destroy();
  });
});
