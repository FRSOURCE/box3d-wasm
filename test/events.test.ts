import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Body, Box3D, World } from '../dist/index.js';
import {
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

function dropBox(world: World, y: number, events = true): Body {
  const body = world.createBody({
    type: 'dynamic',
    position: { x: 0, y, z: 0 },
  });
  body.createBox({
    enableContactEvents: events,
    enableHitEvents: events,
    density: 1,
  });
  return body;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

describe(`events (${flavour})`, () => {
  it('reports moved bodies with their transform and sleep transition', () => {
    world = new b3.World();
    ground(world);
    const body = dropBox(world, 2);
    world.step(1 / 60);
    const moves = world.getMoveEvents();
    expect(moves.count).toBe(1);
    expect(moves.bodyAt(0)).toBe(body);
    const p = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0, w: 1 };
    moves.copyPositionTo(0, p);
    moves.copyRotationTo(0, q);
    expect(p).toEqual(body.getPosition());
    expect(q.w).toBe(1);
    expect(moves.fellAsleepAt(0)).toBe(false);
    let slept = false;
    for (let i = 0; i < 600 && !slept; i++) {
      world.step(1 / 60);
      const events = world.getMoveEvents();
      for (let j = 0; j < events.count; j++) slept ||= events.fellAsleepAt(j);
    }
    expect(slept).toBe(true);
    world.step(1 / 60);
    expect(world.getMoveEvents().count).toBe(0);
    world.destroy();
  });

  it('reports contact begin with point, normal and impulse, then contact end', () => {
    world = new b3.World();
    const floor = ground(world);
    const body = dropBox(world, 1);
    let begin = world.getContactBeginEvents();
    for (let i = 0; i < 120 && begin.count === 0; i++) {
      world.step(1 / 60);
      begin = world.getContactBeginEvents();
    }
    expect(begin.count).toBe(1);
    const shapes = [begin.shapeAAt(0), begin.shapeBAt(0)];
    expect(shapes).toContain(body.shapes[0]);
    expect(shapes).toContain(floor.shapes[0]);
    expect([begin.bodyAAt(0), begin.bodyBAt(0)]).toContain(body);
    const point = begin.copyPointTo(0, { x: 0, y: 0, z: 0 });
    const normal = begin.copyNormalTo(0, { x: 0, y: 0, z: 0 });
    expect(near(point.y, 0, 0.05)).toBe(true);
    expect(near(Math.abs(normal.y), 1, 1e-3)).toBe(true);
    expect(begin.pointCountAt(0)).toBeGreaterThan(0);
    expect(begin.manifoldCountAt(0)).toBe(1);
    stepTimes(world, 5);
    expect(world.getContactBeginEvents().count).toBe(0);
    body.setTransform({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    world.step(1 / 60);
    const end = world.getContactEndEvents();
    expect(end.count).toBe(1);
    expect([end.shapeAAt(0), end.shapeBAt(0)]).toContain(body.shapes[0]);
    expect([end.bodyAAt(0), end.bodyBAt(0)]).toContain(floor);
    world.destroy();
  });

  it('reads an end event for a destroyed shape as undefined', () => {
    world = new b3.World();
    ground(world);
    const body = dropBox(world, 0.6);
    stepTimes(world, 30);
    body.destroy();
    // the engine reports the end during the step after the shape went
    world.step(1 / 60);
    const end = world.getContactEndEvents();
    expect(end.count).toBe(1);
    expect(end.shapeAAt(0) === undefined || end.shapeBAt(0) === undefined).toBe(
      true,
    );
    expect([end.bodyAAt(0), end.bodyBAt(0)]).toContain(undefined);
    world.destroy();
  });

  it('reports hit events above the threshold with approach speed', () => {
    world = new b3.World({ hitEventThreshold: 0.5 });
    ground(world);
    dropBox(world, 3);
    let hits = world.getContactHitEvents();
    for (let i = 0; i < 120 && hits.count === 0; i++) {
      world.step(1 / 60);
      hits = world.getContactHitEvents();
    }
    expect(hits.count).toBe(1);
    expect(hits.approachSpeedAt(0)).toBeGreaterThan(0.5);
    const normal = hits.copyNormalTo(0, { x: 0, y: 0, z: 0 });
    expect(near(Math.abs(normal.y), 1, 1e-3)).toBe(true);
    expect(hits.copyPointTo(0, { x: 0, y: 0, z: 0 }).y).toBeLessThan(0.1);
    world.destroy();
  });

  it('reports sensor begin and end events', () => {
    world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const trigger = world.createBody({ position: { x: 0, y: 0, z: 0 } });
    const sensor = trigger.createBox({
      isSensor: true,
      enableSensorEvents: true,
      halfExtents: { x: 1, y: 1, z: 1 },
    });
    const visitor = world.createBody({
      type: 'dynamic',
      position: { x: 5, y: 0, z: 0 },
      linearVelocity: { x: -20, y: 0, z: 0 },
    });
    visitor.createSphere({ radius: 0.25, enableSensorEvents: true });
    let began = 0;
    let ended = 0;
    for (let i = 0; i < 120; i++) {
      world.step(1 / 60);
      const begin = world.getSensorBeginEvents();
      if (begin.count > 0) {
        began += begin.count;
        expect(begin.sensorShapeAt(0)).toBe(sensor);
        expect(begin.visitorBodyAt(0)).toBe(visitor);
      }
      ended += world.getSensorEndEvents().count;
    }
    expect(began).toBe(1);
    expect(ended).toBe(1);
    world.destroy();
  });

  it('reports joints that cross their thresholds', () => {
    world = new b3.World();
    const a = world.createBody({ position: { x: 0, y: 5, z: 0 } });
    const b = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 3, z: 0 },
    });
    b.createBox({ density: 100 });
    const joint = world.createDistanceJoint(a, b, {
      length: 2,
      forceThreshold: 1,
    });
    stepSeconds(world, 0.5);
    const events = world.getJointEvents();
    expect(events.count).toBe(1);
    expect(events.jointAt(0)).toBe(joint);
    world.destroy();
  });

  it('matches a known begin-touch record', () => {
    world = new b3.World();
    ground(world);
    const body = dropBox(world, 0.75);
    let begin = world.getContactBeginEvents();
    for (let i = 0; i < 60 && begin.count === 0; i++) {
      world.step(1 / 60);
      begin = world.getContactBeginEvents();
    }
    const point = begin.copyPointTo(0, { x: 0, y: 0, z: 0 });
    const normal = begin.copyNormalTo(0, { x: 0, y: 0, z: 0 });
    const record = {
      bodyIsA: begin.bodyAAt(0) === body,
      point: { x: round(point.x), y: round(point.y), z: round(point.z) },
      normal: {
        x: round(normal.x),
        y: round(Math.abs(normal.y)),
        z: round(normal.z),
      },
      pointCount: begin.pointCountAt(0),
      manifoldCount: begin.manifoldCountAt(0),
    };
    expect(record).toMatchInlineSnapshot(`
      {
        "bodyIsA": false,
        "manifoldCount": 1,
        "normal": {
          "x": 0,
          "y": 1,
          "z": 0,
        },
        "point": {
          "x": -0,
          "y": 0.005,
          "z": 0,
        },
        "pointCount": 4,
      }
    `);
    world.destroy();
  });
});
