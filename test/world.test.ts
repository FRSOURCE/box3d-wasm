import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
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

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`world (${flavour})`, () => {
  it('is created from options and destroyed', () => {
    const world = new b3.World({ gravity: { x: 0, y: -9.81, z: 0 } });
    expect(world.isValid()).toBe(true);
    expect(near(world.getGravity().y, -9.81)).toBe(true);
    world.setGravity({ x: 0, y: -5, z: 0 });
    expect(near(world.getGravity().y, -5)).toBe(true);
    world.destroy();
    expect(world.isValid()).toBe(false);
    expect(() => world.step(1 / 60)).toThrow(/destroyed/);
  });

  it('keeps the engine defaults for options left out', () => {
    const world = new b3.World();
    expect(near(world.getGravity().y, -10)).toBe(true);
    expect(world.isSleepingEnabled()).toBe(true);
    expect(world.isContinuousEnabled()).toBe(true);
    expect(world.getMaximumLinearSpeed()).toBeGreaterThan(100);
    world.destroy();
  });

  it('toggles sleeping, continuous collision and the thresholds', () => {
    const world = new b3.World({ enableSleep: false });
    expect(world.isSleepingEnabled()).toBe(false);
    world.enableSleeping(true);
    expect(world.isSleepingEnabled()).toBe(true);
    world.enableContinuous(false);
    expect(world.isContinuousEnabled()).toBe(false);
    world.setMaximumLinearSpeed(12);
    expect(near(world.getMaximumLinearSpeed(), 12)).toBe(true);
    world.setRestitutionThreshold(2.5);
    expect(near(world.getRestitutionThreshold(), 2.5)).toBe(true);
    world.setHitEventThreshold(0.25);
    expect(near(world.getHitEventThreshold(), 0.25)).toBe(true);
    world.setContactTuning(60, 5, 1);
    world.destroy();
  });

  it('counts awake bodies and reports counters and a profile', () => {
    const world = new b3.World();
    ground(world);
    box(world, 0, 3, 0);
    stepTimes(world, 10);
    expect(world.getAwakeBodyCount()).toBe(1);
    const counters = world.getCounters();
    expect(counters.bodyCount).toBe(2);
    expect(counters.shapeCount).toBe(2);
    const profile = world.getProfile();
    expect(Number.isFinite(profile.step)).toBe(true);
    expect(profile.step).toBeGreaterThanOrEqual(0);
    world.destroy();
  });

  it('explodes bodies away from a point', () => {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const body = box(world, 2, 0, 0);
    world.explode({
      position: { x: 0, y: 0, z: 0 },
      radius: 5,
      impulsePerArea: 10,
    });
    expect(body.getLinearVelocity().x).toBeGreaterThan(0);
    world.destroy();
  });

  it('runs several worlds side by side', () => {
    const a = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });
    const c = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const falling = box(a, 0, 5, 0);
    const floating = box(c, 0, 5, 0);
    stepSeconds(a, 1);
    stepSeconds(c, 1);
    expect(falling.getPosition().y).toBeLessThan(4);
    expect(near(floating.getPosition().y, 5)).toBe(true);
    expect(a.getCounters().bodyCount).toBe(1);
    a.destroy();
    expect(floating.isValid()).toBe(true);
    c.destroy();
  });
});
