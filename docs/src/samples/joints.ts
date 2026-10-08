// Ported from box3d/samples/sample_joint.cpp
import type {
  Body,
  DistanceJoint,
  MotionLocks,
  RevoluteJoint,
  Vec3,
} from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import type { Panel } from '../framework/types.js';
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  cross,
  DEG_TO_RAD,
  dot,
  length,
  mulQuat,
  normalize,
  PI,
  quatFromAxisAngle,
  rotate,
  scale,
} from '../framework/math.js';

const degrees = (value: number): string => value.toFixed(0);
const tenths = (value: number): string => value.toFixed(1);
const thousandths = (value: number): string => value.toFixed(3);
/** printf("%g") */
const g = (value: number): string => String(Number(value.toPrecision(6)));
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** upstream b3ComputeQuatBetweenUnitVectors: the shortest rotation taking `a` onto `b`. */
function quatBetween(a: Vec3, b: Vec3) {
  const d = dot(a, b);
  if (d > 0.99999) return { x: 0, y: 0, z: 0, w: 1 };
  if (d < -0.99999) {
    // any axis perpendicular to a
    const axis =
      Math.abs(a.x) < 0.9 ? cross(a, AXIS_X) : cross(a, { x: 0, y: 1, z: 0 });
    return quatFromAxisAngle(axis, PI);
  }
  return quatFromAxisAngle(cross(a, b), Math.acos(d));
}

const conjugate = (q: { x: number; y: number; z: number; w: number }) => ({
  x: -q.x,
  y: -q.y,
  z: -q.z,
  w: q.w,
});

registerSample({
  category: 'Joints',
  name: 'Distance Joint',
  create(ctx) {
    ctx.camera.setView(0, 0, 40, { x: 0, y: 10, z: 0 });
    const { scene, world } = ctx;
    const maxCount = 20;

    scene.groundBox(20);
    const ground = scene.createBody();

    let hertz = 5;
    let dampingRatio = 0.5;
    let jointLength = 1;
    let minLength = jointLength;
    let maxLength = jointLength;
    const tensionForce0 = 2000;
    let tensionForce = tensionForce0;
    let compressionForce = 100;
    let enableSpring = false;
    let enableLimit = false;
    let count = 0;
    const bodies: Body[] = [];
    const joints: DistanceJoint[] = [];

    const createScene = (newCount: number): void => {
      for (const joint of joints) joint.destroy(false);
      joints.length = 0;
      for (const body of bodies) scene.destroyBody(body);
      bodies.length = 0;

      count = newCount;
      const radius = 0.25;
      const yOffset = 20;
      let prev = ground;
      for (let i = 0; i < count; i++) {
        const body = scene.createBody({
          type: 'dynamic',
          angularDamping: 1,
          position: { x: jointLength * (i + 1), y: yOffset, z: 0 },
        });
        scene.sphere(body, { radius, density: 20 });
        const pivotA = { x: jointLength * i, y: yOffset, z: 0 };
        const pivotB = { x: jointLength * (i + 1), y: yOffset, z: 0 };
        joints.push(
          world.createDistanceJoint(prev, body, {
            anchorA: prev.getLocalPoint(pivotA),
            anchorB: body.getLocalPoint(pivotB),
            hertz,
            dampingRatio,
            length: jointLength,
            lowerSpringForce: -tensionForce,
            upperSpringForce: compressionForce,
            minLength,
            maxLength,
            enableSpring,
            enableLimit,
          }),
        );
        bodies.push(body);
        prev = body;
      }
    };
    createScene(1);

    const each = (fn: (joint: DistanceJoint) => void): void => {
      for (const joint of joints) {
        fn(joint);
        joint.wakeBodies();
      }
    };

    return {
      ui(panel) {
        panel.slider(
          'Length',
          jointLength,
          { min: 0.1, max: 4, format: tenths },
          (value) => {
            jointLength = value;
            each((j) => j.setLength(jointLength));
          },
        );
        panel.checkbox('Spring', enableSpring, (value) => {
          enableSpring = value;
          each((j) => j.enableSpring(value));
          ctx.refreshUI();
        });
        if (enableSpring) {
          panel.slider(
            'Tension',
            tensionForce,
            { min: 0, max: 4000, format: thousandths },
            (value) => {
              tensionForce = value;
              each((j) =>
                j.setSpringForceRange(-tensionForce, compressionForce),
              );
            },
          );
          panel.slider(
            'Compression',
            compressionForce,
            { min: 0, max: 200, format: thousandths },
            (value) => {
              compressionForce = value;
              each((j) =>
                j.setSpringForceRange(-tensionForce, compressionForce),
              );
            },
          );
          panel.slider(
            'Hertz',
            hertz,
            { min: 0, max: 15, format: tenths },
            (value) => {
              hertz = value;
              each((j) => j.setSpringHertz(value));
            },
          );
          panel.slider(
            'Damping',
            dampingRatio,
            { min: 0, max: 4, format: tenths },
            (value) => {
              dampingRatio = value;
              each((j) => j.setSpringDampingRatio(value));
            },
          );
          panel.separator();
        }

        panel.checkbox('Limit', enableLimit, (value) => {
          enableLimit = value;
          each((j) => j.enableLimit(value));
          ctx.refreshUI();
        });
        if (enableLimit) {
          panel.slider(
            'Min',
            minLength,
            { min: 0.1, max: 4, format: tenths },
            (value) => {
              minLength = value;
              each((j) => j.setLengthRange(minLength, maxLength));
            },
          );
          panel.slider(
            'Max',
            maxLength,
            { min: 0.1, max: 4, format: tenths },
            (value) => {
              maxLength = value;
              each((j) => j.setLengthRange(minLength, maxLength));
            },
          );
          panel.separator();
        }

        panel.slider(
          'Count',
          count,
          { min: 1, max: maxCount, step: 1, format: degrees },
          (value) => createScene(Math.round(value)),
        );
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Filter',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(20);

    const body1 = scene.createBody({
      type: 'dynamic',
      position: { x: 2, y: 4, z: 0 },
    });
    scene.box(body1, { hx: 0.5, hy: 0.5, hz: 0.5 });
    const body2 = scene.createBody({
      type: 'dynamic',
      position: { x: -2, y: 4, z: 0 },
    });
    scene.box(body2, { hx: 0.5, hy: 0.5, hz: 0.5 });
    world.createFilterJoint(body1, body2);
    return {};
  },
});

registerSample({
  category: 'Joints',
  name: 'Motor Joint',
  create(ctx) {
    ctx.camera.setView(0, 0, 25, { x: 0, y: 8, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });

    let transform = {
      position: { x: 0, y: 10, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };

    // the kinematic target the motor follows
    const target = scene.createBody({
      type: 'kinematic',
      position: transform.position,
    });

    let maxForce = 400000;
    let maxTorque = 500000;
    const body = scene.createBody({
      type: 'dynamic',
      position: transform.position,
    });
    scene.box(body, { hx: 1, hy: 0.25, hz: 0.25 });
    const joint = world.createMotorJoint(target, body, {
      linearHertz: 4,
      linearDampingRatio: 0.7,
      angularHertz: 4,
      angularDampingRatio: 0.7,
      maxSpringForce: maxForce,
      maxSpringTorque: maxTorque,
    });

    // spring body
    const springBody = scene.createBody({
      type: 'dynamic',
      position: { x: -2, y: 2, z: 0 },
    });
    scene.box(springBody, { hx: 0.5, hy: 0.5, hz: 0.5 });
    world.createMotorJoint(ground, springBody, {
      anchorA: { x: -1.75, y: 3.25, z: 0 },
      anchorB: { x: 0.25, y: 0.25, z: 0 },
      collideConnected: true,
      linearHertz: 7.5,
      linearDampingRatio: 0.7,
      angularHertz: 7.5,
      angularDampingRatio: 0.7,
      maxSpringForce: 200000,
      maxSpringTorque: 10000,
    });

    let speed = 0;
    let time = 0;

    return {
      ui(panel) {
        panel.slider(
          'Speed',
          speed,
          { min: -5, max: 5, format: degrees },
          (value) => {
            speed = value;
          },
        );
        panel.slider(
          'Max Force',
          maxForce,
          { min: 0, max: 1000000, format: degrees },
          (value) => {
            maxForce = value;
            joint.setMaxSpringForce(value);
          },
        );
        panel.slider(
          'Max Torque',
          maxTorque,
          { min: 0, max: 1000000, format: degrees },
          (value) => {
            maxTorque = value;
            joint.setMaxSpringTorque(value);
          },
        );
        panel.button('Apply Impulse', () => {
          body.applyLinearImpulseToCenter({ x: 100000, y: 0, z: 0 }, true);
        });
      },

      step(dt) {
        if (dt > 0) {
          time += speed * dt;
          transform = {
            position: {
              x: 6 * Math.sin(2 * time),
              y: 10 + 4 * Math.sin(1 * time),
              z: 0,
            },
            rotation: quatFromAxisAngle(AXIS_Z, 2 * time),
          };
          target.setTargetTransform(transform, dt, true);
        }
        ctx.stepWorld(dt);
      },

      draw(canvas) {
        // DrawAxes( m_transform, 1.0f )
        const { position, rotation } = transform;
        const axes: [Vec3, number][] = [
          [AXIS_X, 0xff0000],
          [AXIS_Y, 0x00ff00],
          [AXIS_Z, 0x0000ff],
        ];
        for (const [axis, color] of axes) {
          const tip = rotate(rotation, axis);
          canvas.line(
            position,
            {
              x: position.x + tip.x,
              y: position.y + tip.y,
              z: position.z + tip.z,
            },
            color,
          );
        }
        const force = length(joint.getConstraintForce());
        const torque = length(joint.getConstraintTorque());
        canvas.text(
          `force = ${force.toFixed(0).padStart(3)}, torque = ${torque.toFixed(0).padStart(3)}`,
        );
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Top Down Friction',
  create(ctx) {
    ctx.camera.setView(0, 0, 26, { x: 0, y: 10, z: 0 });
    const { scene, world } = ctx;

    const ground = scene.createBody();
    scene.box(ground, { hx: 10, hy: 0.5, hz: 4 });
    scene.box(ground, {
      hx: 0.5,
      hy: 10,
      hz: 4,
      offset: { x: -10, y: 10, z: 0 },
    });
    scene.box(ground, {
      hx: 0.5,
      hy: 10,
      hz: 4,
      offset: { x: 10, y: 10, z: 0 },
    });
    scene.box(ground, {
      hx: 10,
      hy: 0.5,
      hz: 4,
      offset: { x: 0, y: 20, z: 0 },
    });

    const n = 10;
    let x = -5;
    let y = 15;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const body = scene.createBody({
          type: 'dynamic',
          gravityScale: 0,
          position: { x, y, z: 0 },
        });
        const remainder = (n * i + j) % 4;
        if (remainder === 0) {
          scene.capsule(body, {
            center1: { x: -0.25, y: 0, z: 0 },
            center2: { x: 0.25, y: 0, z: 0 },
            radius: 0.25,
            restitution: 0.8,
          });
        } else if (remainder === 1) {
          scene.sphere(body, { radius: 0.35, restitution: 0.8 });
        } else {
          scene.box(body, { hx: 0.35, hy: 0.35, hz: 0.35, restitution: 0.8 });
        }
        world.createMotorJoint(ground, body, {
          collideConnected: true,
          maxVelocityForce: 1000,
          maxVelocityTorque: 1000,
        });
        x += 1;
      }
      x = -5;
      y -= 1;
    }

    let flash = 0;
    return {
      ui(panel) {
        panel.button('Explode', () => {
          world.explode({
            position: { x: 0, y: 10, z: 0 },
            radius: 10,
            falloff: 5,
            impulsePerArea: 10000,
          });
          flash = 20;
        });
      },
      draw(canvas) {
        // upstream draws the blast sphere for the frame it fires
        if (flash > 0) {
          flash--;
          const c = { x: 0, y: 10, z: 0 };
          const segments = 48;
          for (let k = 0; k < segments; k++) {
            const a0 = (2 * PI * k) / segments;
            const a1 = (2 * PI * (k + 1)) / segments;
            const ring = (plane: number): [Vec3, Vec3] => {
              const p = (a: number): Vec3 =>
                plane === 0
                  ? {
                      x: c.x + 10 * Math.cos(a),
                      y: c.y + 10 * Math.sin(a),
                      z: 0,
                    }
                  : plane === 1
                    ? { x: c.x + 10 * Math.cos(a), y: c.y, z: 10 * Math.sin(a) }
                    : {
                        x: c.x,
                        y: c.y + 10 * Math.cos(a),
                        z: 10 * Math.sin(a),
                      };
              return [p(a0), p(a1)];
            };
            for (const plane of [0, 1, 2]) {
              const [a, b] = ring(plane);
              canvas.line(a, b, 0xffffff);
            }
          }
        }
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Prismatic',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    let targetTranslation = 0;
    let motorSpeed = 0;
    let motorForce = 20;
    let hertz = 2;
    let dampingRatio = 0.7;
    let lowerTranslation = -1;
    let upperTranslation = 1;
    let enableSpring = true;
    let enableMotor = false;
    let enableLimit = false;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 4, z: 0 },
      gravityScale: 0,
    });
    scene.box(body, { hx: 0.5, hy: 1.5, hz: 0.25 });

    const joint = world.createPrismaticJoint(ground, body, {
      anchorA: { x: 0, y: 6.5, z: 0 },
      anchorB: { x: 0, y: 1.5, z: 0 },
      constraintHertz: 120,
      enableLimit,
      lowerTranslation,
      upperTranslation,
      enableSpring,
      hertz,
      dampingRatio,
      targetTranslation,
      enableMotor,
      maxMotorForce: motorForce,
      motorSpeed,
    });

    return {
      ui(panel) {
        panel.checkbox('Limit', enableLimit, (value) => {
          enableLimit = value;
          joint.enableLimit(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableLimit) {
          panel.slider(
            'Lower Translation',
            lowerTranslation,
            { min: -10, max: 10, format: tenths },
            (value) => {
              lowerTranslation = Math.min(value, upperTranslation);
              joint.setLimits(lowerTranslation, upperTranslation);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Upper Translation',
            upperTranslation,
            { min: -10, max: 10, format: tenths },
            (value) => {
              upperTranslation = Math.max(value, lowerTranslation);
              joint.setLimits(lowerTranslation, upperTranslation);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Motor', enableMotor, (value) => {
          enableMotor = value;
          joint.enableMotor(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableMotor) {
          panel.slider(
            'Max Force',
            motorForce,
            { min: 0, max: 100000, format: degrees },
            (value) => {
              motorForce = value;
              joint.setMaxMotorForce(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Speed',
            motorSpeed,
            { min: -10, max: 10, format: degrees },
            (value) => {
              motorSpeed = value;
              joint.setMotorSpeed(value);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Spring', enableSpring, (value) => {
          enableSpring = value;
          joint.enableSpring(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSpring) {
          panel.slider(
            'Hertz',
            hertz,
            { min: 0, max: 10, format: tenths },
            (value) => {
              hertz = value;
              joint.setSpringHertz(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Damping',
            dampingRatio,
            { min: 0, max: 2, format: tenths },
            (value) => {
              dampingRatio = value;
              joint.setSpringDampingRatio(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Translation',
            targetTranslation,
            { min: -20, max: 20, format: tenths },
            (value) => {
              targetTranslation = value;
              joint.setTargetTranslation(value);
              joint.wakeBodies();
            },
          );
        }
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Spherical',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    const targetRotation = { ...ZERO };
    const motorVelocity = { ...ZERO };
    let motorTorque = 20;
    let hertz = 2;
    let dampingRatio = 0.7;
    let coneAngleDegrees = 30;
    let lowerTwistDegrees = -35;
    let upperTwistDegrees = 35;
    let enableSpring = true;
    let enableMotor = false;
    let enableTwistLimit = false;
    let enableConeLimit = false;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 4, z: 0 },
      gravityScale: 0,
    });
    scene.box(body, { hx: 0.5, hy: 1.5, hz: 0.25, density: 100 });

    const joint = world.createSphericalJoint(ground, body, {
      drawScale: 2,
      anchorA: { x: 0, y: 6.5, z: 0 },
      anchorB: { x: 0, y: 1.5, z: 0 },
      enableConeLimit,
      coneAngle: DEG_TO_RAD * coneAngleDegrees,
      enableTwistLimit,
      lowerTwistAngle: DEG_TO_RAD * lowerTwistDegrees,
      upperTwistAngle: DEG_TO_RAD * upperTwistDegrees,
      enableSpring,
      hertz,
      dampingRatio,
      enableMotor,
      maxMotorTorque: motorTorque,
      motorVelocity,
    });

    const axisSliders = (
      panel: Panel,
      label: string,
      v: Vec3,
      apply: () => void,
    ): void => {
      for (const axis of ['x', 'y', 'z'] as const) {
        panel.slider(
          `${label} ${axis.toUpperCase()}`,
          v[axis],
          {
            min: label === 'Velocity' ? -10 : -180,
            max: label === 'Velocity' ? 10 : 180,
            format: degrees,
          },
          (value) => {
            v[axis] = value;
            apply();
            joint.wakeBodies();
          },
        );
      }
    };
    return {
      ui(panel) {
        panel.checkbox('Cone Limit', enableConeLimit, (value) => {
          enableConeLimit = value;
          joint.enableConeLimit(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableConeLimit) {
          panel.slider(
            'Cone Angle',
            coneAngleDegrees,
            { min: 0, max: 90, format: degrees },
            (value) => {
              coneAngleDegrees = value;
              joint.setConeLimit(DEG_TO_RAD * value);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Twist Limit', enableTwistLimit, (value) => {
          enableTwistLimit = value;
          joint.enableTwistLimit(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableTwistLimit) {
          const twist = (): void => {
            joint.setTwistLimits(
              DEG_TO_RAD * lowerTwistDegrees,
              DEG_TO_RAD * upperTwistDegrees,
            );
            joint.wakeBodies();
          };
          panel.slider(
            'Lower Twist',
            lowerTwistDegrees,
            { min: -180, max: 180, format: degrees },
            (value) => {
              lowerTwistDegrees = Math.min(value, upperTwistDegrees);
              twist();
            },
          );
          panel.slider(
            'Upper Twist',
            upperTwistDegrees,
            { min: -180, max: 180, format: degrees },
            (value) => {
              upperTwistDegrees = Math.max(value, lowerTwistDegrees);
              twist();
            },
          );
        }

        panel.separator();
        panel.checkbox('Motor', enableMotor, (value) => {
          enableMotor = value;
          joint.enableMotor(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableMotor) {
          panel.slider(
            'Max Torque',
            motorTorque,
            { min: 0, max: 10000, format: degrees },
            (value) => {
              motorTorque = value;
              joint.setMaxMotorTorque(value);
              joint.wakeBodies();
            },
          );
          axisSliders(panel, 'Velocity', motorVelocity, () =>
            joint.setMotorVelocity(motorVelocity),
          );
        }

        panel.separator();
        panel.checkbox('Spring', enableSpring, (value) => {
          enableSpring = value;
          joint.enableSpring(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSpring) {
          panel.slider(
            'Hertz',
            hertz,
            { min: 0, max: 10, format: tenths },
            (value) => {
              hertz = value;
              joint.setSpringHertz(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Damping',
            dampingRatio,
            { min: 0, max: 2, format: tenths },
            (value) => {
              dampingRatio = value;
              joint.setSpringDampingRatio(value);
              joint.wakeBodies();
            },
          );
          axisSliders(panel, 'Rotation', targetRotation, () => {
            const qx = quatFromAxisAngle(AXIS_X, DEG_TO_RAD * targetRotation.x);
            const qy = quatFromAxisAngle(AXIS_Y, DEG_TO_RAD * targetRotation.y);
            const qz = quatFromAxisAngle(AXIS_Z, DEG_TO_RAD * targetRotation.z);
            joint.setTargetRotation(mulQuat(qz, mulQuat(qy, qx)));
          });
        }
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Parallel Spring',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;
    let hertz = 10;
    let dampingRatio = 0.7;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    // four walls around the floor
    scene.box(ground, {
      hx: 20,
      hy: 5,
      hz: 0.1,
      offset: { x: 0, y: 5, z: -20 },
    });
    scene.box(ground, {
      hx: 20,
      hy: 5,
      hz: 0.1,
      offset: { x: 0, y: 5, z: 20 },
    });
    scene.box(ground, {
      hx: 0.1,
      hy: 5,
      hz: 20,
      offset: { x: -20, y: 5, z: 0 },
    });
    scene.box(ground, {
      hx: 0.1,
      hy: 5,
      hz: 20,
      offset: { x: 20, y: 5, z: 0 },
    });

    const rotation = quatFromAxisAngle(AXIS_X, 0.25 * PI);
    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 4, z: 0 },
      rotation,
    });
    scene.box(body, { hx: 0.5, hy: 1.5, hz: 0.25 });

    const frameA = quatBetween(AXIS_Z, AXIS_Y);
    const joint = world.createParallelJoint(ground, body, {
      localFrameA: { rotation: frameA },
      localFrameB: { rotation: mulQuat(conjugate(rotation), frameA) },
      drawScale: 2,
      collideConnected: true,
      hertz,
      dampingRatio,
    });

    return {
      ui(panel) {
        panel.slider(
          'Hertz',
          hertz,
          { min: 0, max: 5, format: tenths },
          (value) => {
            hertz = value;
            joint.setSpringHertz(value);
            joint.wakeBodies();
          },
        );
        panel.slider(
          'Damping',
          dampingRatio,
          { min: 0, max: 2, format: tenths },
          (value) => {
            dampingRatio = value;
            joint.setSpringDampingRatio(value);
            joint.wakeBodies();
          },
        );
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Revolute',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    let targetAngle = 0;
    let motorSpeed = 0;
    let motorTorque = 5000;
    let hertz = 2;
    let dampingRatio = 0.7;
    let lowerDegrees = -35;
    let upperDegrees = 35;
    let enableSpring = false;
    let enableMotor = false;
    let enableLimit = false;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 4, z: 0 },
    });
    scene.box(body, { hx: 0.5, hy: 1.5, hz: 0.25 });

    const joint = world.createRevoluteJoint(ground, body, {
      anchorA: { x: 0, y: 6.5, z: 0 },
      anchorB: { x: 0, y: 1.5, z: 0 },
      drawScale: 2,
      enableLimit,
      lowerAngle: DEG_TO_RAD * lowerDegrees,
      upperAngle: DEG_TO_RAD * upperDegrees,
      enableSpring,
      hertz,
      dampingRatio,
      enableMotor,
      maxMotorTorque: motorTorque,
      motorSpeed,
    });

    return {
      ui(panel) {
        panel.checkbox('Limit', enableLimit, (value) => {
          enableLimit = value;
          joint.enableLimit(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableLimit) {
          const limits = (): void => {
            joint.setLimits(
              DEG_TO_RAD * lowerDegrees,
              DEG_TO_RAD * upperDegrees,
            );
            joint.wakeBodies();
          };
          const lower = panel.slider(
            'Lower Angle',
            lowerDegrees,
            { min: -180, max: 180, step: 1, format: degrees },
            (value) => {
              lowerDegrees = Math.min(value, upperDegrees);
              lower.set(lowerDegrees);
              limits();
            },
          );
          const upper = panel.slider(
            'Upper Angle',
            upperDegrees,
            { min: -180, max: 180, step: 1, format: degrees },
            (value) => {
              upperDegrees = Math.max(value, lowerDegrees);
              upper.set(upperDegrees);
              limits();
            },
          );
        }

        panel.separator();
        panel.checkbox('Motor', enableMotor, (value) => {
          enableMotor = value;
          joint.enableMotor(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableMotor) {
          panel.slider(
            'Max Torque',
            motorTorque,
            { min: 0, max: 50000, step: 1, format: degrees },
            (value) => {
              motorTorque = value;
              joint.setMaxMotorTorque(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Speed',
            motorSpeed,
            { min: -10, max: 10, step: 1, format: degrees },
            (value) => {
              motorSpeed = value;
              joint.setMotorSpeed(value);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Spring', enableSpring, (value) => {
          enableSpring = value;
          joint.enableSpring(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSpring) {
          panel.slider(
            'Hertz',
            hertz,
            { min: 0, max: 10, format: tenths },
            (value) => {
              hertz = value;
              joint.setSpringHertz(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Damping',
            dampingRatio,
            { min: 0, max: 2, format: tenths },
            (value) => {
              dampingRatio = value;
              joint.setSpringDampingRatio(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Rotation',
            targetAngle,
            { min: -180, max: 180, step: 1, format: degrees },
            (value) => {
              targetAngle = value;
              joint.setTargetAngle(DEG_TO_RAD * value);
              joint.wakeBodies();
            },
          );
        }
      },

      draw(canvas) {
        const mass = body.getMassData();
        const w = body.getAngularVelocity();
        const v = body.getLinearVelocity();
        const { cx, cy, cz } = mass.inertia;
        // 0.5 * w . (I w)
        let kinetic =
          0.5 *
          (w.x * (cx.x * w.x + cy.x * w.y + cz.x * w.z) +
            w.y * (cx.y * w.x + cy.y * w.y + cz.y * w.z) +
            w.z * (cx.z * w.x + cy.z * w.y + cz.z * w.z));
        kinetic += 0.5 * mass.mass * (v.x * v.x + v.y * v.y + v.z * v.z);
        const center = body.getWorldCenterOfMass();
        const gravity = world.getGravity();
        const potential = -mass.mass * center.y * gravity.y;
        canvas.text(`kinetic energy = ${g(kinetic)}`);
        canvas.text(`potential energy = ${g(potential)}`);
        canvas.text(`total energy = ${g(kinetic + potential)}`);
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Weld',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;
    let linearHertz = 0;
    let linearDampingRatio = 0;
    let angularHertz = 2;
    let angularDampingRatio = 0.7;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 4, z: 0 },
      gravityScale: 0,
    });
    scene.box(body, { hx: 0.5, hy: 1.5, hz: 0.25 });

    const joint = world.createWeldJoint(ground, body, {
      anchorA: { x: 0, y: 6.5, z: 0 },
      anchorB: { x: 0, y: 1.5, z: 0 },
      constraintHertz: 240,
      linearHertz,
      linearDampingRatio,
      angularHertz,
      angularDampingRatio,
      drawScale: 2,
    });

    return {
      ui(panel) {
        panel.slider(
          'Linear Hertz',
          linearHertz,
          { min: 0, max: 10, format: tenths },
          (value) => {
            linearHertz = value;
            joint.setLinearHertz(value);
            joint.wakeBodies();
          },
        );
        panel.slider(
          'Linear Damping',
          linearDampingRatio,
          { min: 0, max: 2, format: tenths },
          (value) => {
            linearDampingRatio = value;
            joint.setLinearDampingRatio(value);
            joint.wakeBodies();
          },
        );
        panel.slider(
          'Angular Hertz',
          angularHertz,
          { min: 0, max: 10, format: tenths },
          (value) => {
            angularHertz = value;
            joint.setAngularHertz(value);
            joint.wakeBodies();
          },
        );
        panel.slider(
          'Angular Damping',
          angularDampingRatio,
          { min: 0, max: 2, format: tenths },
          (value) => {
            angularDampingRatio = value;
            joint.setAngularDampingRatio(value);
            joint.wakeBodies();
          },
        );
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Wheel',
  create(ctx) {
    ctx.camera.setView(25, 20, 7, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    let spinSpeed = 0;
    let maxSpinTorque = 20;
    let suspensionHertz = 2;
    let suspensionDampingRatio = 0.7;
    let lowerTranslation = -1;
    let upperTranslation = 1;
    let enableSuspension = false;
    let enableSpinMotor = false;
    let enableSuspensionLimit = false;
    let enableSteering = false;
    let steeringHertz = 1;
    let steeringDampingRatio = 0.7;
    let enableSteeringLimit = false;
    let lowerSteeringDegrees = -45;
    let upperSteeringDegrees = 45;
    const maxSteeringTorque = 20;
    let targetSteeringDegrees = 0;

    scene.groundBox(20);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
      rotation: quatBetween(AXIS_Y, AXIS_Z),
    });
    scene.cylinder(body, { height: 0.25, radius: 0.4, yOffset: 0, sides: 12 });

    const joint = world.createWheelJoint(ground, body, {
      localFrameA: {
        position: { x: 0, y: 3, z: 0 },
        rotation: quatBetween(AXIS_X, AXIS_Y),
      },
      localFrameB: {
        position: { x: 0, y: 0, z: 0 },
        rotation: quatBetween(AXIS_Z, AXIS_Y),
      },
      collideConnected: true,
      enableSuspensionLimit,
      lowerSuspensionLimit: lowerTranslation,
      upperSuspensionLimit: upperTranslation,
      enableSuspensionSpring: enableSuspension,
      suspensionHertz,
      suspensionDampingRatio,
      enableSpinMotor,
      maxSpinTorque,
      spinSpeed,
      enableSteering,
      steeringHertz,
      steeringDampingRatio,
      targetSteeringAngle: (PI / 180) * targetSteeringDegrees,
      maxSteeringTorque,
      enableSteeringLimit,
      lowerSteeringLimit: (PI / 180) * lowerSteeringDegrees,
      upperSteeringLimit: (PI / 180) * upperSteeringDegrees,
    });

    const steeringLimits = (): void => {
      joint.setSteeringLimits(
        (PI / 180) * lowerSteeringDegrees,
        (PI / 180) * upperSteeringDegrees,
      );
      joint.wakeBodies();
    };

    return {
      ui(panel) {
        panel.checkbox('Suspension Limit', enableSuspensionLimit, (value) => {
          enableSuspensionLimit = value;
          joint.enableSuspensionLimit(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSuspensionLimit) {
          panel.slider(
            'Min',
            lowerTranslation,
            { min: -10, max: 10, format: tenths },
            (value) => {
              lowerTranslation = Math.min(value, upperTranslation);
              joint.setSuspensionLimits(lowerTranslation, upperTranslation);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Max',
            upperTranslation,
            { min: -10, max: 10, format: tenths },
            (value) => {
              upperTranslation = Math.max(value, lowerTranslation);
              joint.setSuspensionLimits(lowerTranslation, upperTranslation);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Motor', enableSpinMotor, (value) => {
          enableSpinMotor = value;
          joint.enableSpinMotor(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSpinMotor) {
          panel.slider(
            'Max Torque',
            maxSpinTorque,
            { min: 0, max: 100, format: degrees },
            (value) => {
              maxSpinTorque = value;
              joint.setMaxSpinTorque(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Speed',
            spinSpeed,
            { min: -10, max: 10, format: degrees },
            (value) => {
              spinSpeed = value;
              joint.setSpinMotorSpeed(value);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Suspension Spring', enableSuspension, (value) => {
          enableSuspension = value;
          joint.enableSuspension(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSuspension) {
          panel.slider(
            'Hertz (Suspension)',
            suspensionHertz,
            { min: 0, max: 10, format: tenths },
            (value) => {
              suspensionHertz = value;
              joint.setSuspensionHertz(value);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Damping (Suspension)',
            suspensionDampingRatio,
            { min: 0, max: 2, format: tenths },
            (value) => {
              suspensionDampingRatio = value;
              joint.setSuspensionDampingRatio(value);
              joint.wakeBodies();
            },
          );
        }

        panel.separator();
        panel.checkbox('Steering', enableSteering, (value) => {
          enableSteering = value;
          joint.enableSteering(value);
          joint.wakeBodies();
          ctx.refreshUI();
        });
        if (enableSteering) {
          panel.slider(
            'Hertz (Steering)',
            steeringHertz,
            { min: 0, max: 10, format: tenths },
            (value) => {
              steeringHertz = value;
              joint.setSteeringHertz(value);
              joint.wakeBodies();
            },
          );
          // upstream applies this slider to the suspension damping (an upstream quirk)
          panel.slider(
            'Damping (Steering)',
            steeringDampingRatio,
            { min: 0, max: 2, format: tenths },
            (value) => {
              steeringDampingRatio = value;
              joint.setSuspensionDampingRatio(suspensionDampingRatio);
              joint.wakeBodies();
            },
          );
          panel.slider(
            'Degrees (Steering)',
            targetSteeringDegrees,
            { min: -90, max: 90, format: degrees },
            (value) => {
              targetSteeringDegrees = value;
              joint.setTargetSteeringAngle((value * PI) / 180);
              joint.wakeBodies();
            },
          );

          panel.separator();
          panel.checkbox('Steering Limit', enableSteeringLimit, (value) => {
            enableSteeringLimit = value;
            joint.enableSteeringLimit(value);
            joint.wakeBodies();
            ctx.refreshUI();
          });
          if (enableSteeringLimit) {
            panel.slider(
              'Min Degrees',
              lowerSteeringDegrees,
              { min: -90, max: 0, format: degrees },
              (value) => {
                lowerSteeringDegrees = value;
                steeringLimits();
              },
            );
            panel.slider(
              'Max Degrees',
              upperSteeringDegrees,
              { min: 0, max: 90, format: degrees },
              (value) => {
                upperSteeringDegrees = value;
                steeringLimits();
              },
            );
          }
        }
      },

      draw(canvas) {
        canvas.text(
          `steering degrees = ${((180 / PI) * joint.getSteeringAngle()).toFixed(1)}`,
        );
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Ball and Chain',
  create(ctx) {
    ctx.camera.setView(180, 15, 50, { x: 0, y: -20, z: 0 });
    const { scene, world } = ctx;

    const ground = scene.createBody();
    const linkRadius = 0.125;
    const linkExtent = 0.5;
    const linkCount = 32;

    let parent = ground;
    let frameA: Vec3 = { ...ZERO };
    for (let i = 0; i < linkCount; i++) {
      const child = scene.createBody({
        type: 'dynamic',
        position: { x: (1 + 2 * i) * linkExtent, y: 0, z: 0 },
      });
      scene.capsule(child, {
        center1: { x: -linkExtent, y: 0, z: 0 },
        center2: { x: linkExtent, y: 0, z: 0 },
        radius: linkRadius,
      });
      world.createSphericalJoint(parent, child, {
        anchorA: frameA,
        anchorB: { x: -linkExtent, y: 0, z: 0 },
        enableMotor: true,
        maxMotorTorque: 10,
      });
      frameA = { x: linkExtent, y: 0, z: 0 };
      parent = child;
    }

    const sphereRadius = 2;
    const ball = scene.createBody({
      type: 'dynamic',
      position: {
        x: (1 + 2 * linkCount) * linkExtent + sphereRadius - linkExtent,
        y: 0,
        z: 0,
      },
    });
    scene.sphere(ball, { radius: sphereRadius });
    world.createSphericalJoint(parent, ball, {
      anchorA: frameA,
      anchorB: { x: -sphereRadius, y: 0, z: 0 },
      enableMotor: true,
      maxMotorTorque: 10,
    });
    return {};
  },
});

registerSample({
  category: 'Joints',
  name: 'Door',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;
    const ground = scene.groundBox(20);

    const door = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 1.5, z: 0 },
      gravityScale: 2,
    });
    scene.box(door, { hx: 0.75, hy: 1.5, hz: 0.1, density: 1000 });

    let magnitude = 50000;
    let twoJoints = true;
    let constraintHertz = 120;
    let constraintDampingRatio = 0;
    // upstream leaves this uninitialised; the joints below start with limits on
    let enableLimit = true;
    let translationError1 = 0;
    let translationError2 = 0;
    let joint1: RevoluteJoint | undefined;
    let joint2: RevoluteJoint | undefined;

    const createJoints = (): void => {
      if (joint1?.isValid()) joint1.destroy(false);
      if (joint2?.isValid()) joint2.destroy(false);
      joint1 = undefined;
      joint2 = undefined;

      const axisQuat = quatBetween(AXIS_Z, AXIS_Y);
      const make = (ay: number, by: number): RevoluteJoint =>
        world.createRevoluteJoint(ground, door, {
          localFrameA: {
            position: { x: -0.75, y: ay, z: 0 },
            rotation: axisQuat,
          },
          localFrameB: {
            position: { x: -0.75, y: by, z: 0 },
            rotation: axisQuat,
          },
          constraintHertz,
          constraintDampingRatio,
          enableLimit: true,
          lowerAngle: DEG_TO_RAD * -90,
          upperAngle: DEG_TO_RAD * 90,
          enableSpring: true,
          hertz: 1,
          dampingRatio: 0.5,
          enableMotor: false,
          maxMotorTorque: 100,
          motorSpeed: 0,
          drawScale: 2,
        });
      joint1 = make(1, -1.5);
      if (twoJoints) joint2 = make(4, 1.5);
    };
    createJoints();

    const tuning = (): void => {
      joint1?.setConstraintTuning(constraintHertz, constraintDampingRatio);
      if (joint2?.isValid()) {
        joint2.setConstraintTuning(constraintHertz, constraintDampingRatio);
      }
    };

    return {
      mouseDown(input) {
        // Ctrl + left click pushes whatever is under the cursor
        if (input.button === 0 && input.ctrl && !input.shift && !input.alt) {
          const translation = scale(normalize(input.ray.direction), 1000);
          const hit = world.castRayClosest(input.ray.origin, translation);
          if (hit.hit && hit.body) {
            const impulse = scale(normalize(translation), magnitude);
            hit.body.applyLinearImpulse(impulse, { ...hit.point }, true);
          }
          return true;
        }
        return false;
      },

      ui(panel) {
        panel.button('Impulse', () => {
          const p = door.getWorldPoint({ x: 0.75, y: 0, z: 0 });
          door.applyLinearImpulse({ x: 0, y: 0, z: -magnitude }, p, true);
          translationError1 = 0;
          translationError2 = 0;
        });
        panel.slider(
          'Magnitude',
          magnitude,
          { min: 1000, max: 100000, format: degrees },
          (value) => {
            magnitude = value;
          },
        );
        panel.checkbox('Limit', enableLimit, (value) => {
          enableLimit = value;
          joint1?.enableLimit(value);
          if (joint2?.isValid()) joint2.enableLimit(value);
        });
        panel.checkbox('Two joints', twoJoints, (value) => {
          twoJoints = value;
          createJoints();
        });
        panel.slider(
          'Hertz',
          constraintHertz,
          { min: 15, max: 240, format: degrees },
          (value) => {
            constraintHertz = value;
            tuning();
          },
        );
        panel.slider(
          'Damping',
          constraintDampingRatio,
          { min: 0, max: 10, format: tenths },
          (value) => {
            constraintDampingRatio = value;
            tuning();
          },
        );
      },

      draw(canvas) {
        canvas.point(door.getWorldPoint({ x: 0.75, y: 0, z: 0 }), 0xbdb76b);
        if (joint1) {
          translationError1 = Math.max(
            translationError1,
            joint1.getLinearSeparation(),
          );
          canvas.text(`translation error 1 = ${g(translationError1)}`);
        }
        if (joint2?.isValid()) {
          translationError2 = Math.max(
            translationError2,
            joint2.getLinearSeparation(),
          );
          canvas.text(`translation error 2 = ${g(translationError2)}`);
        }
      },
    };
  },
});

// A suspension bridge
registerSample({
  category: 'Joints',
  name: 'Bridge',
  create(ctx) {
    ctx.camera.setView(0, 20, 35, { x: 0, y: 10, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(60);
    const ground = scene.createBody();

    const count = 150;
    const a = 0.125;
    const xbase = -160 * a;
    let gravityScale = 1;
    const bodies: Body[] = [];

    const connect = (bodyA: Body, bodyB: Body, pivot: Vec3): void => {
      world.createSphericalJoint(bodyA, bodyB, {
        anchorA: bodyA.getLocalPoint(pivot),
        anchorB: bodyB.getLocalPoint(pivot),
        constraintHertz: 1000,
        enableSpring: true,
        hertz: 2,
        dampingRatio: 1,
      });
    };

    let prev = ground;
    for (let i = 0; i < count; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: xbase + a * (1 + 2 * i), y: 20, z: 0 },
        linearDamping: 0.1,
        angularDamping: 0.1,
      });
      scene.box(body, { hx: a, hy: 0.125, hz: 0.5, density: 20 });
      connect(prev, body, { x: xbase + 2 * a * i, y: 20, z: -0.5 });
      connect(prev, body, { x: xbase + 2 * a * i, y: 20, z: 0.5 });
      bodies.push(body);
      prev = body;
    }
    connect(prev, ground, { x: xbase + 2 * a * count, y: 20, z: -0.5 });
    connect(prev, ground, { x: xbase + 2 * a * count, y: 20, z: 0.5 });

    return {
      ui(panel) {
        panel.slider(
          'Gravity scale',
          gravityScale,
          { min: -1, max: 1, format: tenths },
          (value) => {
            gravityScale = value;
            for (const body of bodies) body.setGravityScale(value);
          },
        );
      },
    };
  },
});

// This test ensures joints work correctly with bodies that have motion locks
registerSample({
  category: 'Joints',
  name: 'Motion Locks',
  create(ctx) {
    ctx.camera.setView(0, 30, 40, { x: 0, y: 5, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(20);
    const ground = scene.createBody();

    const locks: Required<MotionLocks> = {
      linearX: false,
      linearY: false,
      linearZ: false,
      angularX: false,
      angularY: false,
      angularZ: false,
    };
    const bodies: Body[] = [];
    const position = { x: -12.5, y: 10, z: 0 };
    const forceThreshold = 20000;
    const torqueThreshold = 10000;

    const addBody = (): Body => {
      const body = scene.createBody({
        type: 'dynamic',
        enableSleep: false,
        position: { ...position },
      });
      scene.box(body, { hx: 1, hy: 1, hz: 0.5, density: 1 });
      bodies.push(body);
      return body;
    };
    const frames = (body: Body, pivot: Vec3) => ({
      anchorA: ground.getLocalPoint(pivot),
      anchorB: body.getLocalPoint(pivot),
      forceThreshold,
      torqueThreshold,
      collideConnected: true,
    });

    // distance joint
    {
      const body = addBody();
      const length = 2;
      world.createDistanceJoint(ground, body, {
        anchorA: ground.getLocalPoint({
          x: position.x,
          y: position.y + 1 + length,
          z: 0,
        }),
        anchorB: body.getLocalPoint({
          x: position.x,
          y: position.y + 1,
          z: 0,
        }),
        length,
        forceThreshold,
        torqueThreshold,
        collideConnected: true,
      });
    }
    position.x += 5;

    // prismatic joint
    {
      const body = addBody();
      world.createPrismaticJoint(
        ground,
        body,
        frames(body, { x: position.x - 1, y: position.y, z: 0 }),
      );
    }
    position.x += 5;

    // revolute joint
    {
      const body = addBody();
      world.createRevoluteJoint(
        ground,
        body,
        frames(body, { x: position.x - 1, y: position.y, z: 0 }),
      );
    }
    position.x += 5;

    // weld joint
    {
      const body = addBody();
      world.createWeldJoint(ground, body, {
        ...frames(body, { x: position.x - 1, y: position.y, z: 0 }),
        angularHertz: 2,
        angularDampingRatio: 0.5,
      });
    }
    position.x += 5;

    const apply = (): void => {
      for (const body of bodies) {
        body.setMotionLocks(locks);
        body.setAwake(true);
      }
    };

    return {
      ui(panel) {
        const lock = (label: string, key: keyof MotionLocks): void => {
          panel.checkbox(label, locks[key], (value) => {
            locks[key] = value;
            apply();
          });
        };
        lock('Lock Linear X', 'linearX');
        lock('Lock Linear Y', 'linearY');
        lock('Lock Linear Z', 'linearZ');
        lock('Lock Angular X', 'angularX');
        lock('Lock Angular Y', 'angularY');
        lock('Lock Angular Z', 'angularZ');
        panel.text('Hold L to push the first body');
      },

      step(dt) {
        // upstream polls the key from DrawControls, once per frame
        if (ctx.isKeyDown('KeyL') && bodies[0]) {
          bodies[0].applyLinearImpulseToCenter({ x: 100, y: 0, z: 0 }, true);
        }
        ctx.stepWorld(dt);
      },
    };
  },
});

registerSample({
  category: 'Joints',
  name: 'Driving',
  create(ctx) {
    ctx.camera.setView(25, 20, 7, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    const spinSpeedStart = 30;
    let spinSpeed = spinSpeedStart;
    let maxSpinTorque = 5;
    let suspensionHertz = 4;
    let suspensionDampingRatio = 0.7;
    let lowerTranslation = -0.2;
    let upperTranslation = 0.2;
    let steeringHertz = 10;
    let steeringDampingRatio = 0.7;
    let lowerSteeringDegrees = -45;
    let upperSteeringDegrees = 45;
    let maxSteeringTorque = 5;

    // b3CreateWave( 50, 50, { 4, 2, 4 }, 0.02, 0.04 ) on a body at (-20, 0, -20)
    const ground = scene.createBody({ position: { x: -20, y: 0, z: -20 } });
    const rows = 50;
    const columns = 50;
    const omegaZ = 2 * PI * 0.02;
    const omegaX = 2 * PI * 0.04;
    const heights = new Float32Array(rows * columns);
    for (let i = 0; i < rows; i++) {
      const rowHeight = Math.sin(omegaZ * i);
      for (let j = 0; j < columns; j++) {
        heights[i * columns + j] = rowHeight * Math.sin(omegaX * j);
      }
    }
    scene.heightField(ground, {
      heights,
      countX: columns,
      countZ: rows,
      scale: { x: 4, y: 2, z: 4 },
    });

    const chassis = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 2.5, z: 0 },
    });
    scene.box(chassis, { hx: 2, hy: 0.5, hz: 1, density: 0.5 });

    // keep the vehicle upright
    world.createParallelJoint(ground, chassis, {
      localFrameA: { rotation: quatBetween(AXIS_Z, AXIS_Y) },
      localFrameB: { rotation: quatBetween(AXIS_Z, AXIS_Y) },
      drawScale: 2,
      collideConnected: true,
      hertz: 0.5,
      dampingRatio: 1,
    });

    const wheelRotation = quatBetween(AXIS_Y, AXIS_Z);
    const makeWheel = (x: number, z: number, steering: boolean) => {
      const wheel = scene.createBody({
        type: 'dynamic',
        allowFastRotation: true,
        rotation: wheelRotation,
        position: { x, y: 2, z },
      });
      scene.sphere(wheel, { radius: 0.4, density: 2, friction: 3 });
      return world.createWheelJoint(chassis, wheel, {
        localFrameA: {
          position: { x, y: -0.5, z },
          rotation: quatBetween(AXIS_X, AXIS_Y),
        },
        localFrameB: { rotation: quatBetween(AXIS_Z, AXIS_Y) },
        enableSuspensionLimit: true,
        lowerSuspensionLimit: lowerTranslation,
        upperSuspensionLimit: upperTranslation,
        enableSuspensionSpring: true,
        suspensionHertz,
        suspensionDampingRatio,
        enableSpinMotor: !steering,
        maxSpinTorque,
        enableSteering: steering,
        steeringHertz,
        steeringDampingRatio,
        targetSteeringAngle: 0,
        maxSteeringTorque,
        enableSteeringLimit: true,
        lowerSteeringLimit: (PI / 180) * lowerSteeringDegrees,
        upperSteeringLimit: (PI / 180) * upperSteeringDegrees,
      });
    };
    const frontLeft = makeWheel(1.5, 0.8, true);
    const frontRight = makeWheel(1.5, -0.8, true);
    const rearLeft = makeWheel(-1.5, 0.8, false);
    const rearRight = makeWheel(-1.5, -0.8, false);
    const all = [frontLeft, frontRight, rearLeft, rearRight];
    const front = [frontLeft, frontRight];
    const rear = [rearLeft, rearRight];

    let thirdPersonBox: ReturnType<Panel['checkbox']> | undefined;

    const followChassis = (pose: { eye: Vec3; target: Vec3 }): void => {
      const p = chassis.getPosition();
      const forward = rotate(chassis.getRotation(), { x: -1, y: 0, z: 0 });
      const flat = normalize({ x: forward.x, y: 0, z: forward.z });
      pose.target.x = p.x;
      pose.target.y = p.y + 1;
      pose.target.z = p.z;
      pose.eye.x = p.x - 9 * flat.x;
      pose.eye.y = p.y + 3.5;
      pose.eye.z = p.z - 9 * flat.z;
    };
    const toggleThirdPerson = (): void => {
      if (ctx.camera.thirdPerson) {
        ctx.camera.setThirdPerson(null);
      } else {
        ctx.camera.setThirdPerson(followChassis);
        ctx.selected = null;
      }
      thirdPersonBox?.set(ctx.camera.thirdPerson);
    };

    const wheelPairs = (
      joints: typeof all,
      fn: (j: (typeof all)[0]) => void,
    ) => {
      for (const joint of joints) fn(joint);
    };

    return {
      keyboard(input) {
        if (input.key === 't' || input.key === 'T') toggleThirdPerson();
      },

      ui(panel) {
        panel.text('Suspension');
        panel.slider(
          'Min (Suspension)',
          lowerTranslation,
          { min: -10, max: 10, format: tenths },
          (value) => {
            lowerTranslation = Math.min(value, upperTranslation);
            wheelPairs(all, (j) =>
              j.setSuspensionLimits(lowerTranslation, upperTranslation),
            );
          },
        );
        panel.slider(
          'Max (Suspension)',
          upperTranslation,
          { min: -10, max: 10, format: tenths },
          (value) => {
            upperTranslation = Math.max(value, lowerTranslation);
            wheelPairs(all, (j) =>
              j.setSuspensionLimits(lowerTranslation, upperTranslation),
            );
          },
        );
        panel.slider(
          'Hertz (Suspension)',
          suspensionHertz,
          { min: 0, max: 10, format: tenths },
          (value) => {
            suspensionHertz = value;
            wheelPairs(all, (j) => j.setSuspensionHertz(value));
          },
        );
        panel.slider(
          'Damping (Suspension)',
          suspensionDampingRatio,
          { min: 0, max: 2, format: tenths },
          (value) => {
            suspensionDampingRatio = value;
            wheelPairs(all, (j) => j.setSuspensionDampingRatio(value));
          },
        );

        panel.separator();
        panel.text('Motor');
        panel.slider(
          'Max Torque',
          maxSpinTorque,
          { min: 0, max: 100, format: degrees },
          (value) => {
            maxSpinTorque = value;
            // upstream only stores this value; applying it makes the slider useful
            wheelPairs(rear, (j) => j.setMaxSpinTorque(value));
          },
        );
        panel.slider(
          'Speed',
          spinSpeed,
          { min: 0, max: 100, format: degrees },
          (value) => {
            spinSpeed = value;
          },
        );

        panel.separator();
        panel.text('Steering');
        panel.slider(
          'Hertz (Steering)',
          steeringHertz,
          { min: 0, max: 10, format: tenths },
          (value) => {
            steeringHertz = value;
            wheelPairs(front, (j) => j.setSteeringHertz(value));
          },
        );
        panel.slider(
          'Damping (Steering)',
          steeringDampingRatio,
          { min: 0, max: 2, format: tenths },
          (value) => {
            steeringDampingRatio = value;
            wheelPairs(front, (j) => j.setSteeringDampingRatio(value));
          },
        );
        panel.slider(
          'Torque (Steering)',
          maxSteeringTorque,
          { min: 0, max: 20, format: tenths },
          (value) => {
            maxSteeringTorque = value;
            wheelPairs(front, (j) => j.setMaxSteeringTorque(value));
          },
        );
        const steeringLimits = (): void =>
          wheelPairs(front, (j) =>
            j.setSteeringLimits(
              (PI / 180) * lowerSteeringDegrees,
              (PI / 180) * upperSteeringDegrees,
            ),
          );
        panel.slider(
          'Min Deg (Steering)',
          lowerSteeringDegrees,
          { min: -90, max: 0, format: degrees },
          (value) => {
            lowerSteeringDegrees = value;
            steeringLimits();
          },
        );
        panel.slider(
          'Max Deg (Steering)',
          upperSteeringDegrees,
          { min: 0, max: 90, format: degrees },
          (value) => {
            upperSteeringDegrees = value;
            steeringLimits();
          },
        );

        panel.separator();
        thirdPersonBox = panel.checkbox(
          'Third Person (T) - W/S drive, A/D steer',
          ctx.camera.thirdPerson,
          () => toggleThirdPerson(),
        );
      },

      step(dt) {
        const throttle = { x: 0, y: 0 };
        if (ctx.camera.thirdPerson) {
          const wake = (): void => chassis.setAwake(true);
          if (ctx.isKeyDown('KeyW')) {
            throttle.x += 1;
            wake();
          }
          if (ctx.isKeyDown('KeyS')) {
            throttle.x -= 1;
            wake();
          }
          if (ctx.isKeyDown('KeyA')) {
            throttle.y += 1;
            wake();
          }
          if (ctx.isKeyDown('KeyD')) {
            throttle.y -= 1;
            wake();
          }
        }
        const maxSteeringAngle = 0.25 * PI;
        wheelPairs(front, (j) =>
          j.setTargetSteeringAngle(maxSteeringAngle * throttle.y),
        );
        wheelPairs(rear, (j) => j.setSpinMotorSpeed(-spinSpeed * throttle.x));
        ctx.stepWorld(dt);
      },

      draw(canvas) {
        const velocity = chassis.getLinearVelocity();
        const forward = rotate(chassis.getRotation(), { x: -1, y: 0, z: 0 });
        canvas.text(`speed = ${dot(velocity, forward).toFixed(1)}`);
        const pair = (a: number, b: number): string =>
          `${a.toFixed(1)}/${b.toFixed(1)}`;
        canvas.text(
          `spin speed = ${pair(rearLeft.getSpinSpeed(), rearRight.getSpinSpeed())}`,
        );
        canvas.text(
          `spin torque = ${pair(rearLeft.getSpinTorque(), rearRight.getSpinTorque())}`,
        );
        canvas.text(
          `steering degrees = ${pair((180 / PI) * frontLeft.getSteeringAngle(), (180 / PI) * frontRight.getSteeringAngle())}`,
        );
        canvas.text(
          `steering torque = ${pair(frontLeft.getSteeringTorque(), frontRight.getSteeringTorque())}`,
        );
        // DrawAxes( identity, 2 ) lifted 5 cm
        const o = { x: 0, y: 0.05, z: 0 };
        canvas.line(o, { x: 2, y: 0.05, z: 0 }, 0xff0000);
        canvas.line(o, { x: 0, y: 2.05, z: 0 }, 0x00ff00);
        canvas.line(o, { x: 0, y: 0.05, z: 2 }, 0x0000ff);
      },

      destroy() {
        ctx.camera.setThirdPerson(null);
      },
    };
  },
});

// https://www.linkedin.com/feed/update/urn:li:activity:7308603994082353153/
const GEAR_RADIUS = 1;
const GEAR_HALF_DEPTH = 0.125;
const GEAR_Z = 1.5;
const AXLE_RADIUS = 0.2;
const TOOTH_HALF_WIDTH = 0.11;
const TOOTH_HALF_HEIGHT = 0.09;
const TOOTH_RADIUS = 0.03;
const LINK_HALF_LENGTH = 0.07;
const LINK_RADIUS = 0.05;
const LINK_COUNT = 40;
const DOOR_HALF_HEIGHT = 1.5;
const DOOR_HALF_DEPTH = 1.95;
const GEAR_SIDES = 24;
const AXLE_SIDES = 12;
const ROCK_RADIUS = 0.3;

/** The Box2D stairwell silhouette, a closed loop. */
const STAIRWELL: readonly [number, number][] = [
  [-11.3, -0.2167],
  [9.3375, -0.2167],
  [9.3375, 7.1917],
  [8.8083, 7.1917],
  [8.8083, 0.3125],
  [0.3417, 0.3125],
  [0.3417, 0.8417],
  [-0.1875, 0.8417],
  [-0.1875, 1.3708],
  [-0.7167, 1.3708],
  [-0.7167, 1.9],
  [-1.2458, 1.9],
  [-1.2458, 2.4292],
  [-1.775, 2.4292],
  [-1.775, 2.9583],
  [-2.3042, 2.9583],
  [-2.3042, 3.4875],
  [-2.8333, 3.4875],
  [-2.8333, 4.0167],
  [-3.3625, 4.0167],
  [-3.3625, 4.5458],
  [-3.8917, 4.5458],
  [-3.8917, 5.075],
  [-4.4208, 5.075],
  [-4.4208, 5.6042],
  [-4.95, 5.6042],
  [-4.95, 6.1333],
  [-5.4792, 6.1333],
  [-5.4792, 6.6625],
  [-6.0083, 6.6625],
  [-6.0083, 7.1917],
  [-11.3, 7.1917],
];

/** Ear clipping triangulation of a simple polygon (stands in for upstream's earcut). */
function triangulate(points: readonly [number, number][]): number[] {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[(i + 1) % n] as [number, number];
    area += x0 * y1 - x1 * y0;
  }
  const sign = area >= 0 ? 1 : -1;
  const at = (i: number): [number, number] => points[i] as [number, number];
  const cross2 = (o: number, a: number, b: number): number =>
    (at(a)[0] - at(o)[0]) * (at(b)[1] - at(o)[1]) -
    (at(a)[1] - at(o)[1]) * (at(b)[0] - at(o)[0]);
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    sign * cross2(a, b, p) >= 0 &&
    sign * cross2(b, c, p) >= 0 &&
    sign * cross2(c, a, p) >= 0;

  const ring = Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  let guard = 0;
  while (ring.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k + ring.length - 1) % ring.length] as number;
      const b = ring[k] as number;
      const c = ring[(k + 1) % ring.length] as number;
      if (sign * cross2(a, b, c) <= 0) continue;
      const blocked = ring.some(
        (p) => p !== a && p !== b && p !== c && inside(p, a, b, c),
      );
      if (blocked) continue;
      out.push(a, b, c);
      ring.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (ring.length === 3)
    out.push(ring[0] as number, ring[1] as number, ring[2] as number);
  return out;
}

registerSample({
  category: 'Joints',
  name: 'Gear Lift',
  create(ctx) {
    ctx.camera.setView(18, 12, 17, { x: -1.5, y: 4.5, z: 0 });
    const { scene, world, b3 } = ctx;
    scene.groundBox(20);
    const ground = scene.createBody();

    createMesh();

    const cylinderPoints = (
      radius: number,
      zMin: number,
      zMax: number,
      sides: number,
    ): Float32Array => {
      const points = new Float32Array(sides * 6);
      for (let i = 0; i < sides; i++) {
        const angle = (2 * PI * i) / sides;
        const c = radius * Math.cos(angle);
        const s = radius * Math.sin(angle);
        points.set([c, s, zMin, c, s, zMax], i * 6);
      }
      return points;
    };
    const diskNear = cylinderPoints(
      GEAR_RADIUS,
      -GEAR_Z - GEAR_HALF_DEPTH,
      -GEAR_Z + GEAR_HALF_DEPTH,
      GEAR_SIDES,
    );
    const diskFar = cylinderPoints(
      GEAR_RADIUS,
      GEAR_Z - GEAR_HALF_DEPTH,
      GEAR_Z + GEAR_HALF_DEPTH,
      GEAR_SIDES,
    );
    const axle = cylinderPoints(AXLE_RADIUS, -GEAR_Z, GEAR_Z, AXLE_SIDES);

    let motorTorque = 30000;
    let motorSpeed = -0.3;
    let enableMotor = true;

    const gearPosition1 = { x: -4.25, y: 9.75, z: 0 };
    const gearPosition2 = { x: -2.25, y: 10.75, z: 0 };

    const addTeeth = (
      body: Body,
      centerRadius: number,
      zCenter: number,
    ): void => {
      const count = 16;
      const deltaAngle = (2 * PI) / count;
      const hx = TOOTH_HALF_WIDTH;
      const hz = GEAR_HALF_DEPTH;
      const baseHalf = TOOTH_HALF_HEIGHT;
      const tipHalf = TOOTH_HALF_HEIGHT - TOOTH_RADIUS;
      const local: Vec3[] = [
        { x: -hx, y: -baseHalf, z: -hz },
        { x: -hx, y: baseHalf, z: -hz },
        { x: -hx, y: baseHalf, z: hz },
        { x: -hx, y: -baseHalf, z: hz },
        { x: hx, y: -tipHalf, z: -hz },
        { x: hx, y: tipHalf, z: -hz },
        { x: hx, y: tipHalf, z: hz },
        { x: hx, y: -tipHalf, z: hz },
      ];
      for (let i = 0; i < count; i++) {
        const q = quatFromAxisAngle(AXIS_Z, i * deltaAngle);
        const center = rotate(q, { x: centerRadius, y: 0, z: 0 });
        center.z = zCenter;
        const points = local.map((p) => {
          const r = rotate(q, p);
          return {
            x: center.x + r.x,
            y: center.y + r.y,
            z: center.z + r.z,
          };
        });
        scene.hull(body, {
          points,
          maxVertices: 8,
          friction: 0.1,
          customColor: 0x808080,
        });
      }
    };

    const buildGearBody = (position: Vec3, toothCenterRadius: number): Body => {
      const body = scene.createBody({ type: 'dynamic', position });
      scene.hull(body, {
        points: diskNear,
        maxVertices: 2 * GEAR_SIDES,
        friction: 0.1,
        customColor: 0x8b4513,
      });
      scene.hull(body, {
        points: diskFar,
        maxVertices: 2 * GEAR_SIDES,
        friction: 0.1,
        customColor: 0x8b4513,
      });
      scene.hull(body, {
        points: axle,
        maxVertices: 2 * AXLE_SIDES,
        friction: 0.1,
        customColor: 0x708090,
      });
      addTeeth(body, toothCenterRadius, -GEAR_Z);
      addTeeth(body, toothCenterRadius, GEAR_Z);
      return body;
    };

    const driver = buildGearBody(
      gearPosition1,
      GEAR_RADIUS + TOOTH_HALF_HEIGHT,
    );
    const follower = buildGearBody(
      gearPosition2,
      GEAR_RADIUS + TOOTH_HALF_WIDTH,
    );

    // driver shaft, motorized
    const driverJoint = world.createRevoluteJoint(ground, driver, {
      anchorA: ground.getLocalPoint(gearPosition1),
      anchorB: { x: 0, y: 0, z: 0 },
      enableMotor,
      maxMotorTorque: motorTorque,
      motorSpeed,
    });

    // follower shaft, swept between angle limits
    world.createRevoluteJoint(ground, follower, {
      localFrameA: {
        position: ground.getLocalPoint(gearPosition2),
        rotation: quatFromAxisAngle(AXIS_Z, 0.25 * PI),
      },
      anchorB: { x: 0, y: 0, z: 0 },
      enableMotor: true,
      maxMotorTorque: 0.5,
      lowerAngle: -0.3 * PI,
      upperAngle: 0.8 * PI,
      enableLimit: true,
    });

    // one chain hangs from the follower rim at each depth and both lift the gate
    const linkAttach = {
      x: gearPosition2.x + GEAR_RADIUS + 2 * TOOTH_HALF_WIDTH + TOOTH_RADIUS,
      y: gearPosition2.y,
      z: 0,
    };
    const doorPosition = {
      x: linkAttach.x,
      y: linkAttach.y - (2 * LINK_COUNT * LINK_HALF_LENGTH + DOOR_HALF_HEIGHT),
      z: 0,
    };

    const createChain = (top: Body, attachZ: number): Body => {
      let position = {
        x: linkAttach.x,
        y: linkAttach.y - LINK_HALF_LENGTH,
        z: attachZ,
      };
      let prev = top;
      for (let i = 0; i < LINK_COUNT; i++) {
        const body = scene.createBody({
          type: 'dynamic',
          position: { ...position },
        });
        scene.capsule(body, {
          center1: { x: 0, y: -LINK_HALF_LENGTH, z: 0 },
          center2: { x: 0, y: LINK_HALF_LENGTH, z: 0 },
          radius: LINK_RADIUS,
          customColor: 0xb0c4de,
        });
        const pivot = {
          x: position.x,
          y: position.y + LINK_HALF_LENGTH,
          z: attachZ,
        };
        world.createRevoluteJoint(prev, body, {
          anchorA: prev.getLocalPoint(pivot),
          anchorB: body.getLocalPoint(pivot),
          maxMotorTorque: 0.05,
          enableMotor: true,
          drawScale: 0.2,
        });
        position = { ...position, y: position.y - 2 * LINK_HALF_LENGTH };
        prev = body;
      }
      return prev;
    };
    const nearLink = createChain(follower, -GEAR_Z);
    const farLink = createChain(follower, GEAR_Z);

    // a single gate box raised by both chains and held upright sliding along y
    {
      const door = scene.createBody({
        type: 'dynamic',
        position: doorPosition,
      });
      scene.box(door, {
        hx: 0.05,
        hy: DOOR_HALF_HEIGHT,
        hz: DOOR_HALF_DEPTH,
        density: 0.5,
        friction: 0.1,
        customColor: 0x008b8b,
      });
      const links = [nearLink, farLink];
      const depths = [-GEAR_Z, GEAR_Z];
      for (let i = 0; i < 2; i++) {
        const link = links[i] as Body;
        const depth = depths[i] as number;
        const pivot = {
          x: doorPosition.x,
          y: doorPosition.y + DOOR_HALF_HEIGHT,
          z: depth,
        };
        world.createRevoluteJoint(link, door, {
          anchorA: link.getLocalPoint(pivot),
          anchorB: { x: 0, y: DOOR_HALF_HEIGHT, z: depth },
          enableMotor: true,
          maxMotorTorque: 50,
        });
      }
      const slideAxis = quatBetween(AXIS_X, AXIS_Y);
      world.createPrismaticJoint(ground, door, {
        localFrameA: {
          position: ground.getLocalPoint(doorPosition),
          rotation: slideAxis,
        },
        localFrameB: { position: { x: 0, y: 0, z: 0 }, rotation: slideAxis },
        maxMotorForce: 200,
        enableMotor: true,
        collideConnected: true,
      });
    }

    // debris
    {
      const rock = b3.createRock(ROCK_RADIUS);
      const rockGeometry = rock.getGeometry();
      rock.release();
      const gray = [0x808080, 0xdcdcdc, 0xd3d3d3, 0x778899, 0xa9a9a9];
      let x = -5;
      for (let i = 0; i < 12; i++) {
        let y = 6.5 - 0.25 * i;
        for (let j = 0; j < 10; j++) {
          const body = scene.createBody({
            type: 'dynamic',
            position: { x, y, z: ctx.random.range(-1.65, 0.35) },
            rotation: randomQuat(ctx.random),
          });
          scene.hull(body, {
            points: rockGeometry.positions,
            maxVertices: 128,
            rollingResistance: 0.3,
            customColor: gray[Math.floor(ctx.random.range(0, 5))] ?? 0x808080,
          });
          y += 0.2;
        }
        x += 0.3;
      }
    }

    function createMesh(): void {
      // the silhouette extruded four metres along z into a triangle mesh
      const zMin = -2;
      const zMax = 2;
      const count = STAIRWELL.length;
      const vertices = new Float32Array(count * 6);
      STAIRWELL.forEach(([x, y], i) => {
        vertices.set([x, y, zMin, x, y, zMax], i * 6);
      });
      const indices: number[] = [];
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const aLo = 2 * i;
        const aHi = 2 * i + 1;
        const bLo = 2 * j;
        const bHi = 2 * j + 1;
        indices.push(aLo, bLo, bHi, aLo, bHi, aHi);
      }
      const cap = triangulate(STAIRWELL);
      const pushCap = (
        r0: number,
        r1: number,
        r2: number,
        vOffset: number,
        wantPositiveZ: boolean,
      ): void => {
        const p0 = STAIRWELL[r0] as [number, number];
        const p1 = STAIRWELL[r1] as [number, number];
        const p2 = STAIRWELL[r2] as [number, number];
        const crossZ =
          (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        const positive = crossZ > 0;
        indices.push(2 * r0 + vOffset);
        if (positive === wantPositiveZ) {
          indices.push(2 * r1 + vOffset, 2 * r2 + vOffset);
        } else {
          indices.push(2 * r2 + vOffset, 2 * r1 + vOffset);
        }
      };
      for (let k = 0; k + 3 <= cap.length; k += 3) {
        const r0 = cap[k] as number;
        const r1 = cap[k + 1] as number;
        const r2 = cap[k + 2] as number;
        pushCap(r0, r1, r2, 1, true);
        pushCap(r0, r1, r2, 0, false);
      }
      scene.mesh(
        ground,
        { vertices, indices, identifyEdges: true },
        { customColor: 0x8fbc8f },
      );

      // back wall: a 0.1 m thick box closing the far side over the full mesh extent
      let lx = Infinity;
      let ly = Infinity;
      let ux = -Infinity;
      let uy = -Infinity;
      for (const [x, y] of STAIRWELL) {
        lx = Math.min(lx, x);
        ly = Math.min(ly, y);
        ux = Math.max(ux, x);
        uy = Math.max(uy, y);
      }
      const wallHalfThick = 0.05;
      scene.box(ground, {
        hx: 0.5 * (ux - lx),
        hy: 0.5 * (uy - ly),
        hz: wallHalfThick,
        offset: {
          x: 0.5 * (lx + ux),
          y: 0.5 * (ly + uy),
          z: -zMax - wallHalfThick,
        },
        customColor: 0x8fbc8f,
      });
    }

    return {
      ui(panel) {
        panel.checkbox('Motor', enableMotor, (value) => {
          enableMotor = value;
          driverJoint.enableMotor(value);
          driverJoint.wakeBodies();
        });
        panel.slider(
          'Max Torque',
          motorTorque,
          { min: 0, max: 100000, format: degrees },
          (value) => {
            motorTorque = value;
            driverJoint.setMaxMotorTorque(value);
            driverJoint.wakeBodies();
          },
        );
        panel.slider(
          'Speed',
          motorSpeed,
          { min: -0.3, max: 0.3, format: (v) => v.toFixed(2) },
          (value) => {
            motorSpeed = value;
            driverJoint.setMotorSpeed(value);
            driverJoint.wakeBodies();
          },
        );
      },
    };
  },
});

/** upstream RandomQuat: a uniformly distributed rotation. */
function randomQuat(random: { (): number }) {
  const u1 = random();
  const u2 = random() * 2 * PI;
  const u3 = random() * 2 * PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return {
    x: a * Math.sin(u2),
    y: a * Math.cos(u2),
    z: b * Math.sin(u3),
    w: b * Math.cos(u3),
  };
}
