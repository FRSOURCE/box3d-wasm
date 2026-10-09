// Ported from box3d/samples/sample_bodies.cpp
import type {
  Body,
  BodyType,
  Mat3,
  MotionLocks,
  Vec3,
} from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import {
  add,
  AXIS_X,
  AXIS_Z,
  DEG_TO_RAD,
  normalize,
  quatFromAxisAngle,
  rotate,
  scale,
} from '../framework/math.js';
import type { DebugCanvas } from '../framework/types.js';

const TYPES: readonly BodyType[] = ['static', 'kinematic', 'dynamic'];

registerSample({
  category: 'Bodies',
  name: 'Body Type',
  create(ctx) {
    ctx.camera.setView(0, 30, 30, { x: 0, y: 1.5, z: 0 });
    const { scene } = ctx;
    let type: BodyType = 'dynamic';
    let isEnabled = true;
    const speed = 3;

    const ground = scene.groundBox(20);

    const attachment = scene.createBody({
      type: 'dynamic',
      position: { x: -2, y: 3, z: 0 },
      name: 'attach1',
    });
    scene.box(attachment, { hx: 0.5, hy: 2, hz: 0.5, density: 1 });

    const secondAttachment = scene.createBody({
      type,
      isEnabled,
      position: { x: 3, y: 3, z: 0 },
      name: 'attach2',
    });
    scene.box(secondAttachment, { hx: 0.5, hy: 2, hz: 0.5, density: 1 });

    const platform = scene.createBody({
      type,
      isEnabled,
      position: { x: -4, y: 5, z: 0 },
      name: 'platform',
    });
    // a 8 x 1 slab: the tall box rotated a quarter turn about z and pushed out along x
    scene.box(platform, {
      hx: 0.5,
      hy: 4,
      hz: 0.5,
      offset: { x: 4, y: 0, z: 0 },
      rotation: quatFromAxisAngle(AXIS_Z, 90 * DEG_TO_RAD),
      density: 2,
    });

    const pivotA = { x: -2, y: 5, z: 0 };
    ctx.world.createRevoluteJoint(attachment, platform, {
      anchorA: attachment.getLocalPoint(pivotA),
      anchorB: platform.getLocalPoint(pivotA),
      maxMotorTorque: 50,
      enableMotor: true,
    });
    const pivotB = { x: 3, y: 5, z: 0 };
    ctx.world.createRevoluteJoint(secondAttachment, platform, {
      anchorA: secondAttachment.getLocalPoint(pivotB),
      anchorB: platform.getLocalPoint(pivotB),
      maxMotorTorque: 50,
      enableMotor: true,
    });
    const anchor = { x: 0, y: 5, z: 0 };
    ctx.world.createPrismaticJoint(ground, platform, {
      anchorA: ground.getLocalPoint(anchor),
      anchorB: platform.getLocalPoint(anchor),
      maxMotorForce: 1000,
      motorSpeed: 0,
      enableMotor: true,
      lowerTranslation: -10,
      upperTranslation: 10,
      enableLimit: true,
    });

    const crate1 = scene.createBody({
      type: 'dynamic',
      position: { x: -3, y: 8, z: 0 },
      name: 'crate1',
    });
    scene.box(crate1, { hx: 0.75, hy: 0.75, hz: 0.75, density: 2 });

    const secondPayload = scene.createBody({
      type,
      isEnabled,
      position: { x: 2, y: 8, z: 0 },
      name: 'crate2',
    });
    scene.box(secondPayload, { hx: 0.75, hy: 0.75, hz: 0.75, density: 2 });

    const touching = scene.createBody({
      type,
      isEnabled,
      position: { x: 8, y: 0.2, z: 0 },
      name: 'debris',
    });
    scene.capsule(touching, {
      center1: { x: 0, y: 0, z: 0 },
      center2: { x: 1, y: 0, z: 0 },
      radius: 0.25,
      density: 2,
    });

    const floating = scene.createBody({
      type,
      isEnabled,
      position: { x: -8, y: 12, z: 0 },
      gravityScale: 0,
      name: 'floater',
    });
    scene.sphere(floating, {
      center: { x: 0, y: 0.5, z: 0 },
      radius: 0.25,
      density: 2,
    });

    const retypeable = [
      platform,
      secondAttachment,
      secondPayload,
      touching,
      floating,
    ];
    const setType = (next: BodyType): void => {
      type = next;
      for (const body of retypeable) scene.setBodyType(body, next);
      if (next === 'kinematic') {
        platform.setLinearVelocity({ x: -speed, y: 0, z: 0 });
        platform.setAngularVelocity({ x: 0, y: 0, z: 0 });
        secondAttachment.setLinearVelocity({ x: 0, y: 0, z: 0 });
        secondAttachment.setAngularVelocity({ x: 0, y: 0, z: 0 });
      }
    };

    return {
      ui(panel) {
        panel.radio(
          'Type',
          ['Static', 'Kinematic', 'Dynamic'],
          TYPES.indexOf(type),
          (index) => setType(TYPES[index] ?? 'dynamic'),
        );
        panel.checkbox('Enable', isEnabled, (value) => {
          isEnabled = value;
          for (const body of [attachment, secondPayload, floating]) {
            body.setEnabled(value);
          }
        });
      },

      step(dt) {
        // drive the kinematic platform back and forth
        if (type === 'kinematic') {
          const p = platform.getPosition();
          const v = platform.getLinearVelocity();
          if ((p.x < -14 && v.x < 0) || (p.x > 6 && v.x > 0)) {
            v.x = -v.x;
            platform.setLinearVelocity(v);
          }
        }
        ctx.stepWorld(dt);
      },
    };
  },
});

const RED = 0xff0000;
const GREEN = 0x00ff00;
const YELLOW = 0xffff00;
const CYAN = 0x00ffff;
const WHITE = 0xffffff;
const GRAY = 0x808080;
const AZURE = 0x007fff;
const PLUM = 0xdda0dd;
const ORANGE = 0xffa500;

/** Wire circles in the three axis planes, the stand-in for DrawWireSphere. */
function wireSphere(
  canvas: DebugCanvas,
  c: Vec3,
  r: number,
  color: number,
  segments = 64,
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * (i + 1)) / segments;
    const c0 = r * Math.cos(a0);
    const s0 = r * Math.sin(a0);
    const c1 = r * Math.cos(a1);
    const s1 = r * Math.sin(a1);
    canvas.line(
      { x: c.x + c0, y: c.y + s0, z: c.z },
      { x: c.x + c1, y: c.y + s1, z: c.z },
      color,
    );
    canvas.line(
      { x: c.x + c0, y: c.y, z: c.z + s0 },
      { x: c.x + c1, y: c.y, z: c.z + s1 },
      color,
    );
    canvas.line(
      { x: c.x, y: c.y + c0, z: c.z + s0 },
      { x: c.x, y: c.y + c1, z: c.z + s1 },
      color,
    );
  }
}

registerSample({
  category: 'Bodies',
  name: 'Spinning Book',
  create(ctx) {
    ctx.camera.setView(0, 30, 10, { x: 0, y: 1, z: 0 });
    const { scene } = ctx;
    scene.groundBox(10);

    const books: [Vec3, Vec3][] = [
      [
        { x: -2, y: 2, z: 0 },
        { x: 5, y: 0.01, z: 0.01 },
      ],
      [
        { x: 0, y: 2, z: 0 },
        { x: 0.01, y: 5, z: 0.01 },
      ],
      [
        { x: 2, y: 2, z: 0 },
        { x: 0.01, y: 0.01, z: -5 },
      ],
    ];
    for (const [position, angularVelocity] of books) {
      const body = scene.createBody({
        type: 'dynamic',
        position,
        angularVelocity,
        gravityScale: 0,
      });
      scene.box(body, { hx: 0.35, hy: 0.08, hz: 0.5 });
    }
    return {};
  },
});

// Dzhanibekov effect
registerSample({
  category: 'Bodies',
  name: 'Gyroscopic Torque',
  create(ctx) {
    ctx.camera.setView(0, 20, 4, { x: 0, y: 2, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
      rotation: quatFromAxisAngle(AXIS_X, -0.5 * Math.PI),
      gravityScale: 0,
    });
    scene.cylinder(body, {
      height: 0.6,
      radius: 0.15,
      yOffset: 0,
      sides: 32,
      updateBodyMass: false,
    });
    scene.box(body, { hx: 1, hy: 0.05, hz: 0.1, updateBodyMass: false });
    body.applyMassFromShapes();

    // Set the angular velocity after creating the shapes and the local center of mass is fixed.
    body.setAngularVelocity({ x: 0.01, y: 0.01, z: 10 });

    return {
      step(dt) {
        ctx.stepWorld(dt);
      },
      draw(canvas) {
        const c = body.getWorldCenterOfMass();
        canvas.text(
          `center ${c.x.toPrecision(3)} ${c.y.toPrecision(3)} ${c.z.toPrecision(3)}`,
        );
      },
    };
  },
});

// Gyroscopic Precession is compiled out upstream (#if 0), so it is not registered.

function addMat3(a: Mat3, b: Mat3): Mat3 {
  return {
    cx: add(a.cx, b.cx),
    cy: add(a.cy, b.cy),
    cz: add(a.cz, b.cz),
  };
}

/** Parallel axis term: mass * (|o|^2 I - o o^T). */
function steiner(mass: number, o: Vec3): Mat3 {
  const d = o.x * o.x + o.y * o.y + o.z * o.z;
  return {
    cx: {
      x: mass * (d - o.x * o.x),
      y: -mass * o.x * o.y,
      z: -mass * o.x * o.z,
    },
    cy: {
      x: -mass * o.y * o.x,
      y: mass * (d - o.y * o.y),
      z: -mass * o.y * o.z,
    },
    cz: {
      x: -mass * o.z * o.x,
      y: -mass * o.z * o.y,
      z: mass * (d - o.z * o.z),
    },
  };
}

registerSample({
  category: 'Bodies',
  name: 'Weeble',
  create(ctx) {
    ctx.camera.setView(45, 25, 25, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(30);

    const weeble = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 3, z: 0 },
    });
    scene.capsule(weeble, {
      center1: { x: 0, y: -1, z: 0 },
      center2: { x: 0, y: 1, z: 0 },
      radius: 1,
      rollingResistance: 0.1,
    });

    const mass = weeble.getMass();
    const offset = { x: 0, y: -1.5, z: 0 };
    // See: https://en.wikipedia.org/wiki/Parallel_axis_theorem
    const inertia = addMat3(
      weeble.getLocalRotationalInertia(),
      steiner(mass, offset),
    );
    weeble.setMassData({ mass, center: offset, inertia });

    const explosionPosition = { x: 0, y: -0.1, z: 0 };
    const explosionRadius = 8;
    let explosionMagnitude = 20000;

    return {
      ui(panel) {
        panel.button('Teleport', () => {
          weeble.setTransform(
            { x: 0, y: 5, z: 0 },
            quatFromAxisAngle(AXIS_Z, 0.95 * Math.PI),
          );
          weeble.setAwake(true);
        });
        panel.button('Explode', () => {
          ctx.world.explode({
            position: explosionPosition,
            radius: explosionRadius,
            falloff: 0.1,
            impulsePerArea: explosionMagnitude,
          });
        });
        panel.slider(
          'Magnitude',
          explosionMagnitude,
          {
            min: -100000,
            max: 100000,
            step: 1,
            format: (v) => v.toFixed(0),
          },
          (v) => {
            explosionMagnitude = v;
          },
        );
      },

      draw(canvas) {
        wireSphere(canvas, explosionPosition, explosionRadius, AZURE);

        // This shows how to get the velocity of a point on a body
        const localPoint = { x: 0, y: 2, z: 0 };
        const worldPoint = weeble.getWorldPoint(localPoint);
        const v1 = weeble.getLocalPointVelocity(localPoint);
        const v2 = weeble.getWorldPointVelocity(worldPoint);
        canvas.line(worldPoint, add(worldPoint, v1), RED);
        const o = { x: 0.05, y: 0, z: 0 };
        canvas.line(add(worldPoint, o), add(add(worldPoint, v2), o), GREEN);
      },
    };
  },
});

registerSample({
  category: 'Bodies',
  name: 'Disable',
  create(ctx) {
    ctx.camera.setView(45, 25, 10, { x: 0, y: 0, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(20);

    const count = 4;
    const linkRadius = 0.1;
    const linkLength = 5 * linkRadius;
    const links: Body[] = [];
    let parent: Body | undefined;
    for (let link = 0; link < count; link++) {
      const child = scene.createBody({
        type: parent ? 'dynamic' : 'kinematic',
        position: { x: 0, y: (count - link) * linkLength + 1, z: 0 },
      });
      scene.capsule(child, {
        center1: { x: 0, y: 0, z: 0 },
        center2: { x: 0, y: -linkLength, z: 0 },
        radius: linkRadius,
      });
      links.push(child);
      if (parent) {
        world.createWeldJoint(parent, child, {
          anchorA: { x: 0, y: -linkLength, z: 0 },
          angularHertz: 10,
          angularDampingRatio: 1,
        });
      }
      parent = child;
    }

    const ball = scene.createBody({
      type: 'dynamic',
      position: { x: 3, y: 3, z: 0 },
    });
    scene.sphere(ball, { center: { x: 0, y: 0, z: 0 }, radius: 0.5 });

    const link2 = links[2] as Body;
    return {
      ui(panel) {
        panel.checkbox('Enable Link', link2.isEnabled(), (value) =>
          link2.setEnabled(value),
        );
        panel.checkbox('Enable Ball', ball.isEnabled(), (value) =>
          ball.setEnabled(value),
        );
      },
      step(dt) {
        link2.applyLinearImpulseToCenter({ x: 0, y: 0.1, z: 0 }, true);
        ctx.stepWorld(dt);
      },
    };
  },
});

registerSample({
  category: 'Bodies',
  name: 'Cast',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, { x: 0, y: 1.5, z: 0 });
    const { scene } = ctx;

    const spinner = scene.createBody({
      type: 'kinematic',
      position: { x: 5, y: 5, z: 0 },
      angularVelocity: { x: 0.1, y: -0.1, z: 0.1 },
    });
    scene.cylinder(spinner, { height: 2, radius: 0.5, yOffset: 0, sides: 16 });

    // Upstream casts at `body` using a free-floating transform. The wasm
    // body queries use the body's own transform, so the moving cylinder is a
    // second kinematic body that is only ever queried (it never gets a velocity).
    const target = scene.createBody({
      type: 'kinematic',
      position: { x: -10, y: 2, z: 0 },
      rotation: quatFromAxisAngle(
        normalize({ x: 1, y: -2, z: 3 }),
        0.75 * Math.PI,
      ),
      color: 0x0000ff,
    });
    scene.cylinder(target, { height: 2, radius: 0.5, yOffset: 0, sides: 16 });

    let baseTranslation = target.getPosition();
    let origin0: Vec3 = { x: 0, y: 0, z: 0 };
    let tracking = false;
    const pickPoint = (m: { ray: { origin: Vec3; direction: Vec3 } }): Vec3 =>
      add(m.ray.origin, scale(normalize(m.ray.direction), 10));

    return {
      mouseDown(input) {
        if (input.button === 0 && input.shift && !input.ctrl && !input.alt) {
          origin0 = pickPoint(input);
          baseTranslation = target.getPosition();
          tracking = true;
          return true;
        }
        tracking = false;
        return false;
      },
      mouseUp(input) {
        if (input.button === 0) tracking = false;
      },
      mouseMove(input) {
        if (!tracking) return;
        const p = pickPoint(input);
        target.setTransform(
          {
            x: baseTranslation.x + p.x - origin0.x,
            y: baseTranslation.y + p.y - origin0.y,
            z: baseTranslation.z + p.z - origin0.z,
          },
          target.getRotation(),
        );
      },
      draw(canvas) {
        // ground grid axes and the 0.1 m lift of upstream's DrawAxes
        const o = { x: 0, y: 0.1, z: 0 };
        canvas.line(o, add(o, { x: 4, y: 0, z: 0 }), RED);
        canvas.line(o, add(o, { x: 0, y: 4, z: 0 }), GREEN);
        canvas.line(o, add(o, { x: 0, y: 0, z: 4 }), 0x0000ff);

        // Cast ray
        {
          const origin = { x: -9.75, y: 3, z: -4 };
          const translation = { x: 0, y: 0, z: 8 };
          const maxFraction = 1;
          const result = target.castRay(origin, translation, {}, maxFraction);
          canvas.line(
            origin,
            add(origin, scale(translation, maxFraction)),
            CYAN,
          );
          if (result.hit) {
            canvas.line(
              result.point,
              add(result.point, scale(result.normal, 0.2)),
              YELLOW,
            );
            canvas.point(result.point, YELLOW);
          }
          canvas.point(origin, GREEN);
          canvas.point(add(origin, translation), RED);
        }

        // Cast sphere
        {
          const origin = { x: -14.5, y: 2.5, z: 0.5 };
          const radius = 0.2;
          const translation = { x: 8, y: 0, z: 0 };
          const maxFraction = 1;
          const result = target.castShape(
            ctx.b3.proxy.sphere(radius),
            origin,
            translation,
            {},
            maxFraction,
            true,
          );
          let end = add(origin, scale(translation, maxFraction));
          if (result.hit) {
            end = add(origin, scale(translation, result.fraction));
            wireSphere(canvas, end, radius, GREEN, 16);
            canvas.line(
              result.point,
              add(result.point, scale(result.normal, 0.2)),
              YELLOW,
            );
          } else {
            wireSphere(canvas, end, radius, WHITE, 16);
          }
          canvas.line(
            origin,
            add(origin, scale(translation, maxFraction)),
            WHITE,
          );
          canvas.point(origin, GREEN);
          canvas.point(add(origin, scale(translation, maxFraction)), RED);
        }

        // Overlap capsule
        {
          const origin = { x: -10, y: 1, z: 0.5 };
          const c1 = { x: -0.5, y: 1, z: 0 };
          const c2 = { x: 0.5, y: 0, z: 0 };
          const overlaps = target.overlapShape(
            ctx.b3.proxy.capsule(c1, c2, 0.5),
            origin,
          );
          const color = overlaps ? GREEN : GRAY;
          wireSphere(canvas, add(origin, c1), 0.5, color, 16);
          wireSphere(canvas, add(origin, c2), 0.5, color, 16);
          canvas.line(add(origin, c1), add(origin, c2), color);
        }

        // Collide capsule
        {
          const origin = { x: -10, y: 2, z: -0.75 };
          const c1 = { x: -0.25, y: 0, z: 0 };
          const c2 = { x: 0.25, y: 1, z: 0 };
          const planes = target.collideMover(origin, {
            center1: c1,
            center2: c2,
            radius: 0.3,
          });
          const purple = 0x800080;
          wireSphere(canvas, add(origin, c1), 0.3, purple, 16);
          wireSphere(canvas, add(origin, c2), 0.3, purple, 16);
          canvas.line(add(origin, c1), add(origin, c2), purple);
          const point = { x: 0, y: 0, z: 0 };
          const normal = { x: 0, y: 0, z: 0 };
          for (let i = 0; i < planes.count; i++) {
            planes.copyPointTo(i, point);
            planes.copyNormalTo(i, normal);
            canvas.line(point, add(point, scale(normal, 0.5)), ORANGE);
            canvas.point(point, ORANGE);
          }
        }
      },
    };
  },
});

// This shows how to drive a kinematic body to reach a target
registerSample({
  category: 'Bodies',
  name: 'Kinematic',
  create(ctx) {
    ctx.camera.setView(0, 30, 10, { x: 0, y: 1.5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const amplitude = 2;
    const body = scene.createBody({
      type: 'kinematic',
      position: { x: 2 * amplitude, y: amplitude + 1, z: 0 },
    });
    scene.box(body, { hx: 0.1, hy: 1, hz: 0.2 });

    let time = 0;
    let marker: { a: Vec3; b: Vec3; p: Vec3 } | undefined;

    return {
      step(dt) {
        const hertz = ctx.settings.hertz;
        const timeStep = hertz > 0 ? 1 / hertz : 0;
        const delay = 2;

        if (timeStep > 0 && time > delay) {
          const t = time - delay;
          const point = {
            x: 2 * amplitude * Math.cos(t),
            y: amplitude * (Math.sin(2 * t) + 1) + 1,
            z: 0,
          };
          const rotation = quatFromAxisAngle(AXIS_Z, 2 * t);
          const axis = rotate(rotation, { x: 0, y: 1, z: 0 });
          marker = {
            a: add(point, scale(axis, -0.5)),
            b: add(point, scale(axis, 0.5)),
            p: point,
          };
          body.setTargetTransform(
            { position: point, rotation },
            timeStep,
            true,
          );
        }

        ctx.stepWorld(dt);
        time += timeStep;
      },
      draw(canvas) {
        if (!marker) return;
        canvas.line(marker.a, marker.b, PLUM);
        canvas.point(marker.p, PLUM);
      },
    };
  },
});

registerSample({
  category: 'Bodies',
  name: 'Lock Mixing',
  create(ctx) {
    ctx.camera.setView(45, 30, 40, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const cube = (
      name: string,
      position: Vec3,
      type: BodyType,
      motionLocks?: MotionLocks,
    ): void => {
      const body = scene.createBody({ type, name, position, motionLocks });
      scene.box(body, { hx: 1, hy: 1, hz: 1 });
    };

    cube('free', { x: 0, y: 2, z: 0 }, 'dynamic');
    cube('angular xz', { x: 2, y: 2, z: 0 }, 'dynamic', {
      angularX: true,
      angularZ: true,
    });
    cube('linear xyz', { x: -2, y: 2, z: 0 }, 'dynamic', {
      linearX: true,
      linearY: true,
      linearZ: true,
    });
    cube('full', { x: 0, y: 1, z: 2 }, 'dynamic', {
      linearX: true,
      linearY: true,
      linearZ: true,
      angularX: true,
      angularY: true,
      angularZ: true,
    });
    cube('static', { x: 0, y: 1, z: -3 }, 'static');
    return {};
  },
});

// A fully rotation locked body uses a zero inverse inertia tensor
registerSample({
  category: 'Bodies',
  name: 'Fixed Rotation',
  create(ctx) {
    ctx.camera.setView(0, 15, 10, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    // upstream leaves the first body static (default body type)
    const first = scene.createBody({ position: { x: 0, y: 0.5, z: 0 } });
    scene.capsule(first, {
      center1: { x: 0, y: 0, z: 0 },
      center2: { x: 0, y: 1, z: 0 },
      radius: 0.3,
    });

    const second = scene.createBody({
      type: 'dynamic',
      position: { x: 0.3, y: 0.5, z: 0 },
      gravityScale: 0,
      enableSleep: false,
      motionLocks: { angularX: true, angularY: true, angularZ: true },
    });
    scene.capsule(second, {
      center1: { x: 0, y: 0, z: 0 },
      center2: { x: 0, y: 1, z: 0 },
      radius: 0.2,
    });
    return {};
  },
});
