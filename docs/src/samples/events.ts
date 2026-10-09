// Ported from box3d/samples/sample_events.cpp
import type {
  Body,
  PrismaticJoint,
  Quat,
  Shape,
  Vec3,
} from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  add,
  cross,
  quatFromAxisAngle,
  rotate,
  scale,
  sub,
} from '../framework/math.js';
import { wrapMesh } from './continuous-helpers.js';

const RED = 0xff0000;
const GREEN = 0x00ff00;
const BLUE = 0x0000ff;
const YELLOW = 0xffff00;
const CRIMSON = 0xdc143c;

registerSample({
  category: 'Events',
  name: 'Sensor Visit',
  create(ctx) {
    ctx.camera.setView(0, 30, 20, { x: 0, y: 5, z: 0 });
    const { scene, world } = ctx;

    // Visitor
    const visitor = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 12.5, z: 0 },
    });
    scene.box(visitor, { enableSensorEvents: true });

    // Sensor
    const sensorBody = scene.createBody({
      type: 'kinematic',
      position: { x: 0, y: 2, z: 0 },
    });
    const sensorShape = scene.box(sensorBody, {
      hx: 2,
      hy: 2,
      hz: 2,
      isSensor: true,
      enableSensorEvents: true,
    });

    return {
      step(dt) {
        ctx.stepWorld(dt);
        const events = world.getSensorBeginEvents();
        for (let i = 0; i < events.count; ++i) {
          if (events.sensorShapeAt(i) === sensorShape) {
            const body = events.visitorBodyAt(i);
            if (body) scene.destroyBody(body);
            break;
          }
        }
      },
    };
  },
});

interface HitRecord {
  point: Vec3;
  normal: Vec3;
  approachSpeed: number;
  userMaterialIdA: number | bigint;
}

registerSample({
  category: 'Events',
  name: 'Hit',
  create(ctx) {
    ctx.camera.setView(0, 30, 100, { x: 0, y: 5, z: 0 });
    const { scene, world, b3 } = ctx;
    const maxEvents = 32;

    const materialCount = 6;
    const gridMesh = b3.createGridMesh(20, 20, 8, materialCount, true);
    {
      const ground = scene.createBody({});
      const materials = Array.from({ length: materialCount }, (_, i) => ({
        userMaterialId: i + 1,
      }));
      scene.mesh(ground, wrapMesh(gridMesh), { materials });
    }

    let r = 0.75;
    let y = r;
    const l = 1.5;
    let offset = 0.05;
    const shapeCount = 22;
    let velocityScale = 0.5;
    const shapesPerBody = 3;
    const origin: Vec3 = { x: 0, y: 0, z: 0 };

    const bodySpec = { type: 'dynamic' as const, position: origin };
    let prevBody: Body | undefined;
    let body = scene.createBody(bodySpec);
    for (let i = 0; i < shapeCount; ++i) {
      scene.capsule(body, {
        center1: { x: offset, y, z: 0 },
        center2: { x: 0, y: y + l, z: -offset },
        radius: r,
        enableHitEvents: true,
        rollingResistance: 0.2,
        userMaterialId: 42,
        updateBodyMass: false,
      });

      if ((i + 1) % shapesPerBody === 0 || i === shapeCount - 1) {
        body.applyMassFromShapes();

        const center = body.getWorldCenterOfMass();
        const omega = { x: 0, y: 0, z: -1 * velocityScale };
        const v = cross(omega, sub(center, origin));
        body.setAngularVelocity(omega);
        body.setLinearVelocity(v);

        if (i < shapeCount - 1) {
          prevBody = body;
          body = scene.createBody(bodySpec);
          const anchor = { x: 0, y: y + l + r, z: 0 };
          world.createWeldJoint(prevBody, body, {
            localFrameA: { position: anchor },
            localFrameB: { position: anchor },
            angularHertz: 10,
            angularDampingRatio: 2,
          });
          velocityScale *= 0.75;
        }
      }

      y += l + 2 * r;
      r = 0.95 * r;
      offset = -offset;
    }

    const events: HitRecord[] = [];

    return {
      step(dt) {
        ctx.stepWorld(dt);
        const hits = world.getContactHitEvents();
        for (let i = 0; i < hits.count && events.length < maxEvents; ++i) {
          events.push({
            point: hits.copyPointTo(i, { x: 0, y: 0, z: 0 }),
            normal: hits.copyNormalTo(i, { x: 0, y: 0, z: 0 }),
            approachSpeed: hits.approachSpeedAt(i),
            userMaterialIdA: hits.shapeAAt(i)?.getUserMaterialId() ?? 0,
          });
        }
      },

      draw(canvas) {
        // DrawAxes at (0, 0.1, 0), length 4
        const axesOrigin = { x: 0, y: 0.1, z: 0 };
        canvas.line(axesOrigin, add(axesOrigin, scale(AXIS_X, 4)), RED);
        canvas.line(axesOrigin, add(axesOrigin, scale(AXIS_Y, 4)), GREEN);
        canvas.line(axesOrigin, add(axesOrigin, scale(AXIS_Z, 4)), BLUE);

        for (const event of events) {
          const p2 = sub(event.point, scale(event.normal, event.approachSpeed));
          canvas.point(event.point, YELLOW);
          canvas.line(event.point, p2, YELLOW);
          // TODO(api): upstream labels each hit in 3D (DrawString3D); the debug canvas only has HUD text.
          canvas.text(
            `hit ${event.approachSpeed.toFixed(1)}, ${String(event.userMaterialIdA)}`,
          );
        }
        canvas.text(`event count = ${events.length}`);
      },

      destroy() {
        gridMesh.release();
      },
    };
  },
});

registerSample({
  category: 'Events',
  name: 'Move',
  create(ctx) {
    ctx.camera.setView(0, 30, 40, { x: 0, y: 5, z: 0 });
    const { scene, world } = ctx;

    scene.groundBox(40);

    const pivot = { x: 0, y: 1, z: 0 };
    const body = scene.createBody({
      type: 'dynamic',
      position: pivot,
      name: 'big box',
    });
    const localPivot = body.getLocalPoint(pivot);
    scene.box(body, {
      hx: 0.5,
      hy: 10,
      hz: 0.5,
      offset: { x: 0, y: 10, z: 0 },
      enableHitEvents: true,
    });

    const center = body.getWorldCenterOfMass();
    const r = sub(pivot, center);
    const rr = r.x * r.x + r.y * r.y + r.z * r.z;
    if (rr > 0) {
      const v = { x: -10, y: 0, z: 0 };
      const omega = scale(cross(v, r), 1 / rr);
      body.setAngularVelocity(omega);
      body.setLinearVelocity(v);
    }

    let moveLines: string[] = [];

    return {
      step(dt) {
        ctx.stepWorld(dt);
        moveLines = [];
        const events = world.getMoveEvents();
        for (let i = 0; i < events.count; ++i) {
          const name = events.bodyAt(i)?.getName() ?? '';
          moveLines.push(
            events.fellAsleepAt(i) ? `${name} fell asleep` : `${name} moved`,
          );
        }
      },

      draw(canvas) {
        const vp = body.getLocalPointVelocity(localPivot);
        const v = body.getLinearVelocity();
        const w = body.getAngularVelocity();
        const f = (n: number): string => n.toFixed(2);
        canvas.text(
          `vp = [${f(vp.x)}, ${f(vp.y)}, ${f(vp.z)}], v = [${f(v.x)}, ${f(v.y)}, ${f(v.z)}], w = [${f(w.x)}, ${f(w.y)}, ${f(w.z)}]`,
        );
        for (const line of moveLines) canvas.text(line);
      },
    };
  },
});

// This sample shows how to break joints when the internal reaction force becomes large. Instead of polling, this uses events.
registerSample({
  category: 'Events',
  name: 'Joint',
  create(ctx) {
    ctx.camera.setView(0, 30, 40, { x: 0, y: 5, z: 0 });
    const { scene, world } = ctx;

    scene.groundBox(20);
    const ground = scene.createBody({});

    const position = { x: -12.5, y: 10, z: 0 };
    const forceThreshold = 3000;
    const torqueThreshold = 10000;

    const makeBody = (): Body => {
      const body = scene.createBody({
        type: 'dynamic',
        enableSleep: false,
        position: { ...position },
      });
      scene.box(body, { hx: 1, hy: 1, hz: 0.5, density: 1 });
      return body;
    };
    const common = {
      forceThreshold,
      torqueThreshold,
      collideConnected: true,
    };

    // distance joint
    {
      const body = makeBody();
      const length = 2;
      const pivot1 = { x: position.x, y: position.y + 1 + length, z: 0 };
      const pivot2 = { x: position.x, y: position.y + 1, z: 0 };
      world.createDistanceJoint(ground, body, {
        anchorA: ground.getLocalPoint(pivot1),
        anchorB: body.getLocalPoint(pivot2),
        length,
        ...common,
      });
    }
    position.x += 5;

    // motor joint (disabled upstream)
    position.x += 5;

    // prismatic joint
    {
      const body = makeBody();
      const pivot = { x: position.x - 1, y: position.y, z: 0 };
      world.createPrismaticJoint(ground, body, {
        anchorA: ground.getLocalPoint(pivot),
        anchorB: body.getLocalPoint(pivot),
        ...common,
      });
    }
    position.x += 5;

    // revolute joint
    {
      const body = makeBody();
      const pivot = { x: position.x - 1, y: position.y, z: 0 };
      world.createRevoluteJoint(ground, body, {
        anchorA: ground.getLocalPoint(pivot),
        anchorB: body.getLocalPoint(pivot),
        ...common,
      });
    }
    position.x += 5;

    // weld joint
    {
      const body = makeBody();
      const pivot = { x: position.x - 1, y: position.y, z: 0 };
      world.createWeldJoint(ground, body, {
        anchorA: ground.getLocalPoint(pivot),
        anchorB: body.getLocalPoint(pivot),
        angularHertz: 2,
        angularDampingRatio: 0.5,
        ...common,
      });
    }
    position.x += 5;

    // wheel joint (disabled upstream)

    return {
      step(dt) {
        ctx.stepWorld(dt);
        // Process joint events
        const events = world.getJointEvents();
        for (let i = 0; i < events.count; ++i) {
          // Destroy the joint if it is still valid
          const joint = events.jointAt(i);
          if (joint?.isValid()) joint.destroy(true);
        }
      },
    };
  },
});

registerSample({
  category: 'Events',
  name: 'Persistent Contact',
  create(ctx) {
    ctx.camera.setView(0, 30, 40, { x: 0, y: 5, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridMesh = b3.createGridMesh(20, 20, 2, 2, true);
    {
      const ground = scene.createBody({});
      scene.mesh(ground, wrapMesh(gridMesh));
    }

    const ball = scene.createBody({
      type: 'dynamic',
      position: { x: -18, y: 1, z: 0.5 },
      linearVelocity: { x: 4, y: 0, z: 0 },
    });
    scene.sphere(ball, {
      radius: 0.5,
      density: 20,
      enableContactEvents: true,
      rollingResistance: 0.01,
    });

    // The shape pair of the tracked contact; the engine reports contacts by shape pair here.
    let pair: { a: Shape; b: Shape } | undefined;
    let impulses: number[] = [];

    return {
      step(dt) {
        ctx.stepWorld(dt);

        const begin = world.getContactBeginEvents();
        if (begin.count > 0) {
          const a = begin.shapeAAt(0);
          const b = begin.shapeBAt(0);
          pair = a && b ? { a, b } : undefined;
        }

        const end = world.getContactEndEvents();
        for (let i = 0; i < end.count && pair; ++i) {
          const a = end.shapeAAt(i);
          const b = end.shapeBAt(i);
          if (
            (a === pair.a && b === pair.b) ||
            (a === pair.b && b === pair.a)
          ) {
            pair = undefined;
          }
        }
        if (pair && !(pair.a.isValid() && pair.b.isValid())) pair = undefined;
      },

      draw(canvas) {
        impulses = [];
        if (!pair) return;
        const contacts = pair.a.getContacts();
        const p1: Vec3 = { x: 0, y: 0, z: 0 };
        const normal: Vec3 = { x: 0, y: 0, z: 0 };
        let found = false;
        for (let i = 0; i < contacts.count; ++i) {
          if (contacts.shapeBAt(i) !== pair.b) continue;
          found = true;
          contacts.copyNormalTo(i, normal);
          for (let j = 0; j < contacts.pointCountAt(i); ++j) {
            contacts.copyPointTo(i, j, p1);
            const impulse = contacts.totalNormalImpulseAt(i, j);
            canvas.line(p1, add(p1, scale(normal, impulse)), CRIMSON);
            canvas.point(p1, CRIMSON);
            // TODO(api): upstream labels each point in 3D (DrawString3D); the debug canvas only has HUD text.
            impulses.push(impulse);
          }
        }
        if (!found) pair = undefined;
        for (const impulse of impulses) canvas.text(impulse.toFixed(2));
      },

      destroy() {
        gridMesh.release();
      },
    };
  },
});

registerSample({
  category: 'Events',
  name: 'Sensor Hits',
  create(ctx) {
    ctx.camera.setView(0, 30, 40, { x: 0, y: 5, z: 0 });
    const { scene, world, b3 } = ctx;

    scene.groundBox(10);

    const ground = scene.createBody({ name: 'ground' });
    scene.box(ground, {
      hx: 0.1,
      hy: 5,
      hz: 5,
      offset: { x: 10, y: 5, z: 0 },
    });

    const gridMesh = b3.createGridMesh(2, 2, 5, 0, true);
    const gridData = wrapMesh(gridMesh);
    const quarterTurnZ: Quat = quatFromAxisAngle(AXIS_Z, 0.5 * Math.PI);
    const sensor = { isSensor: true, enableSensorEvents: true };

    // Static sensor
    {
      const body = scene.createBody({
        name: 'static sensor',
        position: { x: -4, y: 6, z: 0 },
        rotation: quarterTurnZ,
      });
      scene.mesh(body, gridData, sensor);
    }

    // Kinematic sensor
    const kinematic = scene.createBody({
      name: 'kinematic sensor',
      type: 'kinematic',
      position: { x: 0, y: 6, z: 0 },
      rotation: quarterTurnZ,
      linearVelocity: { x: 0.5, y: 0, z: 0 },
    });
    scene.mesh(kinematic, gridData, sensor);

    // Dynamic sensor
    let joint: PrismaticJoint;
    {
      const position = { x: 4, y: 1, z: 0 };
      const body = scene.createBody({
        name: 'dynamic sensor',
        type: 'dynamic',
        position,
      });
      scene.capsule(body, {
        center1: { x: 0, y: 1, z: 0 },
        center2: { x: 0, y: 9, z: 0 },
        radius: 0.1,
        ...sensor,
      });

      const pivot = add(position, { x: 0, y: 6, z: 0 });
      joint = world.createPrismaticJoint(ground, body, {
        anchorA: ground.getLocalPoint(pivot),
        anchorB: body.getLocalPoint(pivot),
        enableMotor: true,
        maxMotorForce: 1000,
        motorSpeed: 0.5,
      });
    }

    const transformCapacity = 20;
    const transforms: { position: Vec3; rotation: Quat }[] = [];
    let beginCount = 0;
    let endCount = 0;
    let bullet: Body | undefined;
    let isBullet = true;

    const launch = (): void => {
      if (bullet?.alive) scene.destroyBody(bullet);
      transforms.length = 0;
      beginCount = 0;
      endCount = 0;

      bullet = scene.createBody({
        type: 'dynamic',
        position: { x: -26.7, y: 6, z: 0 },
        linearVelocity: { x: ctx.random.range(200, 300), y: 0, z: 0 },
        isBullet,
      });
      scene.sphere(bullet, {
        radius: 0.25,
        friction: 0.8,
        rollingResistance: 0.01,
        enableSensorEvents: true,
      });
    };
    launch();

    const collectTransforms = (sensorShape: Shape): void => {
      const count = Math.min(5, sensorShape.getSensorOverlaps().count);
      for (let i = 0; i < count && transforms.length < transformCapacity; ++i) {
        const sensorBody = sensorShape.body;
        transforms.push({
          position: sensorBody.getWorldCenterOfMass(),
          rotation: sensorBody.getRotation(),
        });
      }
    };

    return {
      ui(panel) {
        panel.checkbox('Bullet', isBullet, (value) => {
          isBullet = value;
        });
        panel.button('Launch', launch);
      },

      keyboard(input) {
        if (input.code === 'KeyB') launch();
      },

      step(dt) {
        const p = kinematic.getPosition();
        if (p.x > 1) kinematic.setLinearVelocity({ x: -0.5, y: 0, z: 0 });
        else if (p.x < -1) kinematic.setLinearVelocity({ x: 0.5, y: 0, z: 0 });

        const x = joint.getTranslation();
        if (x > 1) joint.setMotorSpeed(-0.5);
        else if (x < -1) joint.setMotorSpeed(0.5);

        ctx.stepWorld(dt);

        const begin = world.getSensorBeginEvents();
        const end = world.getSensorEndEvents();
        beginCount += begin.count;
        endCount += end.count;
        for (let i = 0; i < begin.count; ++i) {
          const shape = begin.sensorShapeAt(i);
          if (shape) collectTransforms(shape);
        }
      },

      draw(canvas) {
        for (const t of transforms) {
          // DrawAxes, length 0.1
          const axes: [Vec3, number][] = [
            [AXIS_X, RED],
            [AXIS_Y, GREEN],
            [AXIS_Z, BLUE],
          ];
          for (const [axis, color] of axes) {
            canvas.line(
              t.position,
              add(t.position, scale(rotate(t.rotation, axis), 0.1)),
              color,
            );
          }
        }
        canvas.text(`begin touch count = ${beginCount}`);
        canvas.text(`end touch count = ${endCount}`);
      },

      destroy() {
        gridMesh.release();
      },
    };
  },
});
