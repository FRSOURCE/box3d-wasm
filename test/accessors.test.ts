import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`accessors (${flavour})`, () => {
  it('world tuning round-trips', () => {
    const world = new b3.World();
    world.enableWarmStarting(false);
    expect(world.isWarmStartingEnabled()).toBe(false);
    world.enableRestitutionPropagation(true);
    expect(world.isRestitutionPropagationEnabled()).toBe(true);
    world.setRestitutionIterations(3);
    expect(world.getRestitutionIterations()).toBe(3);
    world.setContactRecycleDistance(0.02);
    expect(world.getContactRecycleDistance()).toBeCloseTo(0.02);
    world.enableSpeculative(true);
    box(world, 1, 2, 3);
    world.step(1 / 60, 4);
    const bounds = world.getBounds();
    expect(bounds.upperBound.y).toBeGreaterThan(bounds.lowerBound.y);
    expect(world.getMaxCapacity().dynamicBodies).toBeGreaterThanOrEqual(1);
    world.destroy();
  });

  it('body mass properties and extents', () => {
    const world = new b3.World();
    const body = box(world, 0, 5, 0);
    expect(body.getInverseMass()).toBeCloseTo(1 / body.getMassData().mass);
    expect(body.getLocalRotationalInertia().cx.x).toBeGreaterThan(0);
    expect(body.getWorldInverseRotationalInertia().cx.x).toBeGreaterThan(0);
    expect(body.getMinExtent()).toBeGreaterThan(0);
    expect(body.getMaxExtent().x).toBeGreaterThan(0);
    body.setLinearVelocity({ x: 2, y: 0, z: 0 });
    expect(body.getWorldPointVelocity({ x: 0, y: 5, z: 0 }).x).toBeCloseTo(2);
    expect(body.getLocalPointVelocity({ x: 0, y: 0, z: 0 }).x).toBeCloseTo(2);
    body.setSafetyFactor(0.5);
    expect(body.getSafetyFactor()).toBeCloseTo(0.5);
    body.enableContactRecycling(false);
    expect(body.isContactRecyclingEnabled()).toBe(false);
    body.enableHitEvents(true);
    const point = { x: 0, y: 0, z: 0 };
    const distance = body.getClosestPoint({ x: 0, y: 10, z: 0 }, point);
    expect(distance).toBeGreaterThan(4);
    expect(point.y).toBeCloseTo(5.5, 1);
    world.destroy();
  });

  it('shape geometry, names and queries', () => {
    const world = new b3.World();
    const body = world.createBody({ type: 'dynamic' });
    const sphere = body.createSphere({ radius: 0.75 });
    const capsule = body.createCapsule({ height: 1, radius: 0.25 });
    expect(sphere.getSphere().radius).toBeCloseTo(0.75);
    sphere.setSphere({ x: 0, y: 1, z: 0 }, 1);
    expect(sphere.getSphere()).toMatchObject({ center: { y: 1 }, radius: 1 });
    expect(capsule.getCapsule().radius).toBeCloseTo(0.25);
    capsule.setCapsule({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5);
    expect(capsule.getCapsule().center2.y).toBeCloseTo(2);
    expect(() => sphere.getCapsule()).toThrow(/not a capsule/);
    sphere.setName('ball');
    expect(sphere.getName()).toBe('ball');
    expect(capsule.getName()).toBe('');
    sphere.enablePreSolveEvents(true);
    expect(sphere.arePreSolveEventsEnabled()).toBe(true);
    const closest = sphere.getClosestPoint({ x: 0, y: 10, z: 0 });
    expect(closest.y).toBeCloseTo(2, 1);
    world.destroy();
  });

  it('joint awake state and spring force range', () => {
    const world = new b3.World();
    const a = box(world, 0, 1, 0);
    const b = box(world, 2, 1, 0);
    const joint = world.createDistanceJoint(a, b, { length: 2 });
    joint.setSpringForceRange(-5, 7);
    expect(joint.getSpringForceRange()).toEqual({ lower: -5, upper: 7 });
    expect(joint.isAwake()).toBe(true);
    world.destroy();
  });

  it('engine-wide settings', () => {
    expect(b3.maxManifoldPoints).toBeGreaterThan(0);
    expect(b3.doublePrecision).toBe(false);
    const before = b3.worldCount;
    const world = new b3.World();
    expect(b3.worldCount).toBe(before + 1);
    world.destroy();
    const stall = b3.stallThreshold;
    b3.stallThreshold = stall;
    expect(b3.stallThreshold).toBeCloseTo(stall);
    expect(b3.lengthUnitsPerMeter).toBeCloseTo(1);
    expect(() => {
      b3.lengthUnitsPerMeter = -1;
    }).toThrow(RangeError);
  });
});
