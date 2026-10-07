import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Body, Box3D, World } from '../dist/index.js';
import {
  box,
  flavour,
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

function anchor(world: World): Body {
  return world.createBody({ type: 'static', position: { x: 0, y: 5, z: 0 } });
}

describe(`joints (${flavour})`, () => {
  it('holds a distance joint at its length and exposes the base accessors', () => {
    world = new b3.World();
    const a = anchor(world);
    const b = box(world, 0, 3, 0);
    const joint = world.createDistanceJoint(a, b, {
      length: 2,
      collideConnected: false,
    });
    expect(joint.getType()).toBe('distance');
    expect(joint.bodyA).toBe(a);
    expect(joint.bodyB).toBe(b);
    expect(a.joints.has(joint)).toBe(true);
    expect(world.joints.has(joint)).toBe(true);
    stepSeconds(world, 2);
    expect(near(joint.getCurrentLength(), 2, 0.05)).toBe(true);
    expect(near(joint.getLength(), 2)).toBe(true);
    joint.setLength(3);
    expect(near(joint.getLength(), 3)).toBe(true);
    joint.setCollideConnected(true);
    expect(joint.getCollideConnected()).toBe(true);
    joint.setConstraintTuning(30, 2);
    expect(near(joint.getConstraintTuning().hertz, 30)).toBe(true);
    joint.setForceThreshold(100);
    expect(joint.getForceThreshold()).toBe(100);
    joint.setTorqueThreshold(50);
    expect(joint.getTorqueThreshold()).toBe(50);
    expect(Number.isFinite(joint.getLinearSeparation())).toBe(true);
    expect(Number.isFinite(joint.getAngularSeparation())).toBe(true);
    expect(Number.isFinite(joint.getConstraintForce().y)).toBe(true);
    expect(Number.isFinite(joint.getConstraintTorque().y)).toBe(true);
    joint.wakeBodies();
    joint.destroy();
    expect(joint.isValid()).toBe(false);
    expect(a.joints.has(joint)).toBe(false);
    expect(world.joints.has(joint)).toBe(false);
    world.destroy();
  });

  it('round trips the local frames', () => {
    world = new b3.World();
    const joint = world.createWeldJoint(anchor(world), box(world, 0, 3, 0), {
      anchorA: { x: 1, y: 0, z: 0 },
      localFrameB: { position: { x: 0, y: 1, z: 0 } },
    });
    expect(joint.getLocalFrameA().position.x).toBe(1);
    expect(joint.getLocalFrameB().position.y).toBe(1);
    joint.setLocalFrameA({
      position: { x: 0, y: 0, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    expect(joint.getLocalFrameA().position.z).toBe(2);
    joint.setLocalFrameB({
      position: { x: 0, y: 0, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    expect(joint.getLocalFrameB().position.z).toBe(3);
    world.destroy();
  });

  it('spins a wheel with a revolute motor and reads its angle', () => {
    world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const a = anchor(world);
    const wheel = box(world, 0, 5, 0);
    const joint = world.createRevoluteJoint(a, wheel, {
      localFrameA: { position: { x: 0, y: 0, z: 0 } },
      enableMotor: true,
      motorSpeed: 2,
      maxMotorTorque: 1000,
    });
    stepTimes(world, 30);
    expect(wheel.getAngularVelocity().z).toBeGreaterThan(1);
    expect(joint.getAngle()).not.toBe(0);
    expect(joint.isMotorEnabled()).toBe(true);
    expect(near(joint.getMotorSpeed(), 2)).toBe(true);
    joint.setMotorSpeed(-2);
    expect(near(joint.getMotorSpeed(), -2)).toBe(true);
    joint.enableLimit(true);
    joint.setLimits(-0.5, 0.5);
    expect(joint.isLimitEnabled()).toBe(true);
    expect(near(joint.getLowerLimit(), -0.5)).toBe(true);
    expect(near(joint.getUpperLimit(), 0.5)).toBe(true);
    joint.enableSpring(true);
    joint.setSpringHertz(5);
    joint.setSpringDampingRatio(0.7);
    joint.setTargetAngle(0.1);
    expect(near(joint.getSpringHertz(), 5)).toBe(true);
    expect(near(joint.getTargetAngle(), 0.1)).toBe(true);
    world.destroy();
  });

  it('limits a spherical joint by cone and twist and drives a motor', () => {
    world = new b3.World();
    const a = anchor(world);
    const b = box(world, 0, 3, 0);
    const joint = world.createSphericalJoint(a, b, {
      localFrameB: { position: { x: 0, y: 2, z: 0 } },
      enableConeLimit: true,
      coneAngle: 0.3,
      enableTwistLimit: true,
      lowerTwistAngle: -0.2,
      upperTwistAngle: 0.2,
    });
    b.applyLinearImpulseToCenter({ x: 5, y: 0, z: 0 });
    stepSeconds(world, 2);
    expect(joint.getConeAngle()).toBeLessThan(0.4);
    expect(joint.isConeLimitEnabled()).toBe(true);
    expect(near(joint.getConeLimit(), 0.3)).toBe(true);
    expect(joint.isTwistLimitEnabled()).toBe(true);
    expect(near(joint.getLowerTwistLimit(), -0.2)).toBe(true);
    expect(near(joint.getUpperTwistLimit(), 0.2)).toBe(true);
    expect(Number.isFinite(joint.getTwistAngle())).toBe(true);
    joint.enableMotor(true);
    joint.setMotorVelocity({ x: 0, y: 1, z: 0 });
    joint.setMaxMotorTorque(10);
    expect(joint.getMotorVelocity().y).toBe(1);
    joint.setTargetRotation({ x: 0, y: 0, z: 0, w: 1 });
    expect(joint.getTargetRotation().w).toBe(1);
    joint.enableSpring(true);
    joint.setSpringHertz(2);
    joint.setSpringDampingRatio(0.5);
    expect(near(joint.getSpringHertz(), 2)).toBe(true);
    expect(Number.isFinite(joint.getMotorTorque().y)).toBe(true);
    world.destroy();
  });

  it('keeps a prismatic joint within its limits and reports translation', () => {
    world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const a = anchor(world);
    const b = box(world, 0, 5, 0);
    const joint = world.createPrismaticJoint(a, b, {
      enableLimit: true,
      lowerTranslation: -1,
      upperTranslation: 1,
    });
    b.applyLinearImpulseToCenter({ x: 0, y: 0, z: 20 });
    stepSeconds(world, 1);
    expect(Math.abs(joint.getTranslation())).toBeLessThan(1.1);
    expect(near(joint.getLowerLimit(), -1)).toBe(true);
    joint.enableMotor(true);
    joint.setMotorSpeed(1);
    joint.setMaxMotorForce(100);
    expect(near(joint.getMotorSpeed(), 1)).toBe(true);
    joint.enableSpring(true);
    joint.setSpringHertz(3);
    joint.setTargetTranslation(0.5);
    expect(near(joint.getTargetTranslation(), 0.5)).toBe(true);
    expect(Number.isFinite(joint.getSpeed())).toBe(true);
    world.destroy();
  });

  it('welds, motors, wheels, parallels and filters', () => {
    world = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });
    const a = anchor(world);
    const welded = box(world, 0, 5, 0);
    const weld = world.createWeldJoint(a, welded, {
      linearHertz: 0,
      angularHertz: 0,
    });
    weld.setLinearHertz(10);
    weld.setAngularDampingRatio(0.5);
    expect(near(weld.getLinearHertz(), 10)).toBe(true);
    stepSeconds(world, 1);
    expect(near(welded.getPosition().y, 5, 0.05)).toBe(true);

    const driven = box(world, 3, 5, 0);
    const motor = world.createMotorJoint(a, driven, {
      linearVelocity: { x: 0, y: 1, z: 0 },
      maxVelocityForce: 1000,
    });
    motor.setLinearVelocity({ x: 0, y: 2, z: 0 });
    expect(motor.getLinearVelocity().y).toBe(2);
    motor.setAngularVelocity({ x: 0, y: 0, z: 1 });
    expect(motor.getAngularVelocity().z).toBe(1);
    motor.setMaxSpringTorque(5);
    expect(motor.getMaxSpringTorque()).toBe(5);

    const chassis = box(world, 6, 5, 0);
    const wheelBody = box(world, 6, 4, 0);
    const wheel = world.createWheelJoint(chassis, wheelBody, {
      enableSpinMotor: true,
      spinSpeed: 3,
      maxSpinTorque: 100,
    });
    wheel.setSpinMotorSpeed(4);
    expect(near(wheel.getSpinMotorSpeed(), 4)).toBe(true);
    wheel.enableSteering(true);
    wheel.setTargetSteeringAngle(0.2);
    expect(near(wheel.getTargetSteeringAngle(), 0.2)).toBe(true);
    wheel.setSuspensionLimits(-0.1, 0.1);
    expect(near(wheel.getUpperSuspensionLimit(), 0.1)).toBe(true);

    const parallel = world.createParallelJoint(a, box(world, 9, 5, 0), {
      hertz: 2,
      dampingRatio: 1,
    });
    parallel.setMaxTorque(50);
    expect(parallel.getMaxTorque()).toBe(50);

    const filter = world.createFilterJoint(a, box(world, 12, 5, 0));
    expect(filter.getType()).toBe('filter');
    expect(world.getCounters().jointCount).toBe(5);
    world.destroy();
  });

  it('refuses a joint between bodies of different worlds', () => {
    world = new b3.World();
    const other = new b3.World();
    expect(() =>
      world.createDistanceJoint(box(world, 0, 0, 0), box(other, 0, 0, 0)),
    ).toThrow(/joint/);
    other.destroy();
    world.destroy();
  });
});
