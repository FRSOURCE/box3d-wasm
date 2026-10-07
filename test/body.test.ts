import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D, World } from '../dist/index.js';
import {
  box,
  flavour,
  ground,
  loadBox3D,
  near,
  stepSeconds,
  stepTimes,
  terminateThreads,
} from './helpers/load.js';

let b3: Box3D;
let world: World;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`body (${flavour})`, () => {
  it('falls onto static ground, settles and sleeps', () => {
    world = new b3.World();
    ground(world);
    const body = box(world, 0, 5, 0);
    expect(near(body.getMass(), 1)).toBe(true);
    stepSeconds(world, 4);
    expect(near(body.getPosition().y, 0.5, 0.01)).toBe(true);
    expect(body.isAwake()).toBe(false);
    world.destroy();
  });

  it('round trips type, name and the transform', () => {
    world = new b3.World();
    const body = world.createBody({
      type: 'kinematic',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0.7071068, z: 0, w: 0.7071068 },
      name: 'probe',
    });
    expect(body.getType()).toBe('kinematic');
    expect(body.getName()).toBe('probe');
    body.setName('renamed');
    expect(body.getName()).toBe('renamed');
    body.setType('dynamic');
    expect(body.getType()).toBe('dynamic');
    const p = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0, w: 1 };
    body.readTransform(p, q);
    expect(p).toEqual({ x: 1, y: 2, z: 3 });
    expect(near(q.y, 0.7071068)).toBe(true);
    body.setTransform({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    expect(body.getTransform().position.x).toBe(-1);
    expect(body.getRotation().w).toBe(1);
    world.destroy();
  });

  it('moves a kinematic body toward a target transform and by velocity', () => {
    world = new b3.World();
    const body = world.createBody({
      type: 'kinematic',
      position: { x: 0, y: 1, z: 0 },
    });
    body.createBox();
    body.setTargetTransform(
      { position: { x: 1, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      1 / 60,
    );
    world.step(1 / 60);
    expect(near(body.getPosition().x, 1, 1e-4)).toBe(true);
    body.setLinearVelocity({ x: 0, y: 0, z: 2 });
    stepSeconds(world, 1);
    expect(near(body.getPosition().z, 2, 0.05)).toBe(true);
    expect(near(body.getPosition().y, 1, 1e-4)).toBe(true);
    world.destroy();
  });

  it('applies impulses, forces and torques', () => {
    world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const body = box(world, 0, 0, 0);
    body.applyLinearImpulseToCenter({ x: 3, y: 0, z: 0 });
    expect(near(body.getLinearVelocity().x, 3)).toBe(true);
    body.setLinearVelocity({ x: 0, y: 0, z: 0 });
    body.applyAngularImpulse({ x: 0, y: 1, z: 0 });
    expect(body.getAngularVelocity().y).toBeGreaterThan(0);
    body.setAngularVelocity({ x: 0, y: 0, z: 0 });
    body.applyForceToCenter({ x: 60, y: 0, z: 0 });
    world.step(1 / 60);
    expect(body.getLinearVelocity().x).toBeGreaterThan(0.5);
    body.applyTorque({ x: 0, y: 0, z: 10 });
    world.step(1 / 60);
    expect(body.getAngularVelocity().z).toBeGreaterThan(0);
    body.applyForce({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    body.applyLinearImpulse({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    world.destroy();
  });

  it('reads and overrides mass data', () => {
    world = new b3.World();
    const body = box(world, 0, 0, 0);
    const data = body.getMassData();
    expect(near(data.mass, 1)).toBe(true);
    expect(near(data.inertia.cx.x, 1 / 6, 1e-4)).toBe(true);
    data.mass = 4;
    data.center = { x: 0.1, y: 0, z: 0 };
    body.setMassData(data);
    expect(near(body.getMass(), 4)).toBe(true);
    expect(near(body.getLocalCenterOfMass().x, 0.1)).toBe(true);
    expect(near(body.getWorldCenterOfMass().x, 0.1)).toBe(true);
    body.applyMassFromShapes();
    expect(near(body.getMass(), 1)).toBe(true);
    world.destroy();
  });

  it('converts points and vectors between local and world space', () => {
    world = new b3.World();
    const body = world.createBody({ position: { x: 10, y: 0, z: 0 } });
    expect(body.getLocalPoint({ x: 12, y: 0, z: 0 }).x).toBe(2);
    expect(body.getWorldPoint({ x: 2, y: 0, z: 0 }).x).toBe(12);
    expect(body.getLocalVector({ x: 0, y: 1, z: 0 }).y).toBe(1);
    expect(body.getWorldVector({ x: 0, y: 0, z: 1 }).z).toBe(1);
    world.destroy();
  });

  it('round trips damping, gravity scale, sleep, enable, bullet and fast rotation', () => {
    world = new b3.World();
    const body = box(world, 0, 0, 0);
    body.setLinearDamping(0.5);
    expect(near(body.getLinearDamping(), 0.5)).toBe(true);
    body.setAngularDamping(0.25);
    expect(near(body.getAngularDamping(), 0.25)).toBe(true);
    body.setGravityScale(0);
    expect(body.getGravityScale()).toBe(0);
    body.enableSleep(false);
    expect(body.isSleepEnabled()).toBe(false);
    body.setSleepThreshold(0.2);
    expect(near(body.getSleepThreshold(), 0.2)).toBe(true);
    body.setAwake(false);
    expect(body.isAwake()).toBe(false);
    body.setAwake(true);
    expect(body.isAwake()).toBe(true);
    body.setEnabled(false);
    expect(body.isEnabled()).toBe(false);
    body.setEnabled(true);
    expect(body.isEnabled()).toBe(true);
    body.setBullet(true);
    expect(body.isBullet()).toBe(true);
    body.allowFastRotation(true);
    expect(body.isFastRotationAllowed()).toBe(true);
    world.destroy();
  });

  it('merges partial motion locks and keeps a locked body in place', () => {
    world = new b3.World();
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
      motionLocks: { angularX: true },
    });
    body.createBox();
    body.setMotionLocks({ linearY: true });
    expect(body.getMotionLocks()).toEqual({
      linearX: false,
      linearY: true,
      linearZ: false,
      angularX: true,
      angularY: false,
      angularZ: false,
    });
    stepTimes(world, 30);
    expect(body.getPosition().y).toBe(5);
    world.destroy();
  });

  it('reports shape count and bounds', () => {
    world = new b3.World();
    const body = box(world, 1, 2, 3);
    body.createSphere({ center: { x: 2, y: 0, z: 0 }, radius: 1 });
    expect(body.getShapeCount()).toBe(2);
    expect(body.shapes).toHaveLength(2);
    const aabb = body.computeAABB();
    // the engine fattens bounds by its AABB margin
    expect(near(aabb.lowerBound.x, 0.5, 0.15)).toBe(true);
    expect(near(aabb.upperBound.x, 4, 0.15)).toBe(true);
    world.destroy();
  });
});
