// Ported from box3d/samples/sample_character.cpp
//
// The kinematic Mover and the Rigid Body character run on the third-person
// camera: T toggles it, then WASD moves, Space jumps and Shift sprints while
// the mouse (pointer locked) looks around and the wheel zooms.
// Procedural stand-ins: upstream's building.obj and voxel_mesh_*.obj (125 to
// 175 KB each) are replaced by a hollow box and generated voxel terrain; the
// small test_map01 and stairs meshes are the real upstream data.
import type {
  Body,
  Box3D,
  World,
  Mat3,
  Shape,
  Transform,
  Vec3,
} from '@frsource/box3d-wasm';
import type { SceneBuilder } from '../framework/builder.js';
import {
  AXIS_Y,
  AXIS_Z,
  DEG_TO_RAD,
  add,
  clamp,
  cross,
  dot,
  length,
  orbitEye,
  quatFromAxisAngle,
  scale,
  sub,
} from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import type {
  Control,
  DebugCanvas,
  FollowPose,
  MouseInput,
  SampleContext,
} from '../framework/types.js';
import { STAIRS_OBJ, TEST_MAP_OBJ } from './character-assets.js';
import { createObjMesh, createWave, parseObj } from './collision-scene.js';
import {
  Color,
  DebugRecorder,
  FLT_MAX,
  ZERO,
  boxCorners,
  copy,
  drawArrow,
  drawGroundGrid,
  drawWireCapsule,
  flatten,
  isNormalized,
  lengthSquared,
  negate,
  v3,
} from './collision-helpers.js';

type MoverCapsule = Parameters<World['castMover']>[1];
type CollisionPlane = Parameters<Box3D['solvePlanes']>[1][number];

const LEVEL_MATERIALS = [
  { friction: 0.6, restitution: 0, userMaterialId: 0 },
  { friction: 0.6, restitution: 1, userMaterialId: 1 },
  { friction: 0.1, restitution: 0, userMaterialId: 2 },
];

const xfAt = (position: Vec3): Transform => ({
  position,
  rotation: { x: 0, y: 0, z: 0, w: 1 },
});

/** The horizontal view directions upstream derives from the camera: forward is `-GetForward()`, right is `GetRight()`. */
function viewAxes(ctx: SampleContext): { forward: Vec3; right: Vec3 } {
  const view = ctx.camera.getViewDirection();
  const forward = v3(view.x, 0, view.z);
  const rightRaw = v3(-view.z, 0, view.x);
  const rightLength = length(rightRaw);
  return {
    forward,
    right: rightLength > 1e-6 ? scale(rightRaw, 1 / rightLength) : v3(1, 0, 0),
  };
}

// ---------------------------------------------------------------------------
// CapsulePlane
// ---------------------------------------------------------------------------

registerSample({
  category: 'Character',
  name: 'CapsulePlane',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { scene, world, b3 } = ctx;

    const transform: Transform = xfAt(v3(0, 1, 0.4));
    const capsule: MoverCapsule = {
      center1: v3(0, -0.5, 0),
      center2: v3(0, 0.5, 0),
      radius: 0.25,
    };

    const body = scene.createBody({ position: v3(0, 1, 1) });
    scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });

    let baseTranslation = v3(0, 0, 0);
    let origin = v3(0, 0, 0);
    let tracking = false;
    let planes: CollisionPlane[] = [];

    const solve = (): void => {
      const result = b3.solvePlanes(ZERO, planes);
      transform.position = add(transform.position, result.delta);
    };

    return {
      ui(panel) {
        panel.button('Solve', solve);
      },

      mouseDown(input: MouseInput) {
        if (input.button !== 0 || input.alt) return false;
        origin = add(input.ray.origin, scale(input.ray.direction, 10));
        baseTranslation = copy(transform.position);
        tracking = true;
        return true;
      },

      mouseUp() {
        tracking = false;
      },

      mouseMove(input: MouseInput) {
        if (!tracking) return;
        const p = add(input.ray.origin, scale(input.ray.direction, 10));
        transform.position = add(baseTranslation, sub(p, origin));
      },

      draw(canvas) {
        drawGroundGrid(canvas, 10);
        canvas.line(ZERO, v3(2, 0, 0), Color.red);
        canvas.line(ZERO, v3(0, 2, 0), Color.green);
        canvas.line(ZERO, v3(0, 0, 2), Color.blue);

        drawWireCapsule(
          canvas,
          transform,
          capsule.center1,
          capsule.center2,
          capsule.radius,
          Color.green,
        );

        // gather up to three planes, like the result callback
        const list = world.collideMover(transform.position, capsule);
        planes = [];
        for (let i = 0; i < list.count && planes.length < 3; i++) {
          planes.push({
            normal: list.copyNormalTo(i, v3(0, 0, 0)),
            offset: list.offsetAt(i),
            pushLimit: FLT_MAX,
            push: 0,
            clipVelocity: true,
          });
        }

        for (const plane of planes) {
          const p1 = add(
            transform.position,
            scale(plane.normal, plane.offset - capsule.radius),
          );
          const p2 = add(p1, scale(plane.normal, 0.1));
          canvas.point(p1, Color.yellow);
          canvas.line(p1, p2, Color.yellow);
        }
      },
    };
  },
});

// ---------------------------------------------------------------------------
// MoverOverlap
// ---------------------------------------------------------------------------

registerSample({
  category: 'Character',
  name: 'MoverOverlap',
  create(ctx) {
    ctx.camera.setView(120, 25, 10, v3(0, 1, 0));
    const { scene, world, b3 } = ctx;

    const capsule: MoverCapsule = {
      center1: v3(0, -0.5, 0),
      center2: v3(0, 0.5, 0),
      radius: 0.35,
    };
    const transform: Transform = xfAt(v3(0, 3.5, 0));

    // static sphere
    scene.sphere(scene.createBody({ position: v3(-3, 1, 0) }), { radius: 0.6 });
    // static capsule
    scene.capsule(scene.createBody({ position: v3(0, 1, 0) }), {
      center1: v3(0, 0, -0.7),
      center2: v3(0, 0, 0.7),
      radius: 0.4,
    });
    // static box hull
    scene.box(scene.createBody({ position: v3(3, 1, 0) }), {
      hx: 0.6,
      hy: 0.6,
      hz: 0.6,
    });

    const planeCapacity = 32;
    let baseTranslation = v3(0, 0, 0);
    let origin = v3(0, 0, 0);
    let tracking = false;
    let planeCount = 0;
    let zeroNormalCount = 0;

    return {
      ui(panel) {
        panel.text(() => `planes: ${planeCount}`);
        panel.text(() => `degenerate normals: ${zeroNormalCount}`);
      },

      mouseDown(input: MouseInput) {
        if (input.button !== 0 || input.alt) return false;
        origin = add(input.ray.origin, scale(input.ray.direction, 10));
        baseTranslation = copy(transform.position);
        tracking = true;
        return true;
      },

      mouseUp() {
        tracking = false;
      },

      mouseMove(input: MouseInput) {
        if (!tracking) return;
        const p = add(input.ray.origin, scale(input.ray.direction, 10));
        transform.position = add(baseTranslation, sub(p, origin));
      },

      draw(canvas) {
        drawGroundGrid(canvas, 12);

        // the mover capsule is relative to the query origin
        const list = world.collideMover(transform.position, capsule);
        planeCount = Math.min(list.count, planeCapacity);
        zeroNormalCount = 0;

        // mover at the queried position
        drawWireCapsule(
          canvas,
          transform,
          capsule.center1,
          capsule.center2,
          capsule.radius,
          Color.yellow,
        );

        // one arrow per returned plane; a degenerate normal is drawn red
        const solverPlanes: CollisionPlane[] = [];
        for (let i = 0; i < planeCount; i++) {
          const normal = list.copyNormalTo(i, v3(0, 0, 0));
          const valid = isNormalized(normal);
          const color = valid ? Color.limeGreen : Color.red;
          const rp = add(transform.position, list.copyPointTo(i, v3(0, 0, 0)));
          canvas.point(rp, color);
          drawArrow(canvas, rp, add(rp, scale(normal, 0.5)), color);
          if (!valid) zeroNormalCount += 1;
          solverPlanes.push({
            normal,
            offset: list.offsetAt(i),
            pushLimit: FLT_MAX,
            push: 0,
            clipVelocity: true,
          });
        }

        // solve the planes and show the pushed-out capsule pose
        const solved = b3.solvePlanes(ZERO, solverPlanes);
        drawWireCapsule(
          canvas,
          xfAt(add(transform.position, solved.delta)),
          capsule.center1,
          capsule.center2,
          capsule.radius,
          Color.cyan,
        );

        canvas.text(
          'drag the capsule with the left mouse to push it into the shapes',
        );
        canvas.text(
          'yellow = queried pose, cyan = solved push-out, lime = valid plane normals',
        );
        canvas.text(
          `planes: ${planeCount}   degenerate normals: ${zeroNormalCount}`,
        );
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Shared level pieces
// ---------------------------------------------------------------------------

function addLevel(scene: SceneBuilder): { levelBody: Body } {
  const levelData = createObjMesh(scene, parseObj(TEST_MAP_OBJ));
  const levelBody = scene.createBody();
  scene.mesh(levelBody, levelData, { materials: LEVEL_MATERIALS });

  const stairsData = createObjMesh(scene, parseObj(STAIRS_OBJ), false);
  const stairsBody = scene.createBody({ position: v3(-10, 0, 0) });
  scene.mesh(stairsBody, stairsData, { scale: v3(0.75, 0.75, -1.5) });

  const heightField = createWave(scene, 50, 50, v3(1, 1, 1), 0.02, 0.04, true);
  const heightBody = scene.createBody({ position: v3(20, 0, 0) });
  scene.heightField(heightBody, heightField, { materials: LEVEL_MATERIALS });
  return { levelBody };
}

/** Third person on and off, keeping the panel checkbox in step when T flips it. */
function createThirdPersonToggle(
  ctx: SampleContext,
  follow: (pose: FollowPose) => void,
): { toggle(): void; bind(checkbox: Control<boolean>): void } {
  let checkbox: Control<boolean> | undefined;
  return {
    toggle() {
      if (ctx.camera.thirdPerson) {
        ctx.camera.setThirdPerson(null);
      } else {
        ctx.camera.setThirdPerson(follow);
        ctx.selected = null;
      }
      checkbox?.set(ctx.camera.thirdPerson);
    },
    bind(control) {
      checkbox = control;
    },
  };
}

// ---------------------------------------------------------------------------
// Mover
// ---------------------------------------------------------------------------

interface MoverShapeData {
  maxPush: number;
  clipVelocity: boolean;
}

const MOVER_JUMP_SPEED = 5;
const MOVER_MAX_SPEED = 6;
const MOVER_MIN_SPEED = 0.01;
const MOVER_STOP_SPEED = 1;
const MOVER_ACCELERATE = 30;
const MOVER_FRICTION = 4;
const MOVER_GRAVITY = 15;
const MOVER_PLANE_CAPACITY = 8;

/** The shape categories the sample uses: allies are 2, the ignored box is 4. */
const CATEGORY_DEFAULT = 1;
const CATEGORY_ALLY = 2;
const CATEGORY_IGNORED = 4;

const mulMV = (m: Mat3, v: Vec3): Vec3 =>
  add(add(scale(m.cx, v.x), scale(m.cy, v.y)), scale(m.cz, v.z));

registerSample({
  category: 'Character',
  name: 'Mover',
  create(ctx) {
    const moverPosition = v3(7.5, 0.75, 9);
    ctx.camera.setView(120, 30, 5, moverPosition);
    const { scene, world, b3 } = ctx;

    const { levelBody } = addLevel(scene);

    // extra obstacles on the level body
    scene.box(levelBody, {
      hx: 1,
      hy: 1,
      hz: 1,
      offset: v3(4, 1, 14),
    });
    scene.box(levelBody, {
      hx: 1,
      hy: 1,
      hz: 1,
      offset: v3(4, 1, 13.95),
    });
    scene.box(levelBody, {
      hx: 1,
      hy: 1,
      hz: 1,
      offset: v3(5.8, 1, 13.7),
      rotation: quatFromAxisAngle(AXIS_Y, 0.1 * Math.PI),
    });

    const torus = b3.createTorusMesh(10, 12, 2, 1);
    {
      const geometry = torus.getGeometry();
      const body = scene.createBody({
        position: v3(-10, 1, -8),
        rotation: quatFromAxisAngle(AXIS_Y, 0.5 * Math.PI),
      });
      scene.mesh(
        body,
        {
          resource: torus,
          vertices: geometry.positions,
          indices: geometry.indices,
          clockwise: false,
        },
        { scale: v3(-0.75, 1.5, 0.5) },
      );
    }

    // per shape mover data (upstream keeps it in the shape's user data)
    const shapeData = new Map<Shape, MoverShapeData>();
    const capsuleShape = {
      center1: v3(0, -0.5, 0),
      center2: v3(0, 0.5, 0),
      radius: 0.3,
    };

    // enemy: the mover is pushed out fully and slides along it
    const enemy = scene.createBody({
      position: v3(0, 1.4, 6),
      color: Color.mediumVioletRed,
    });
    shapeData.set(
      scene.capsule(enemy, {
        ...capsuleShape,
        customColor: Color.mediumVioletRed,
      }),
      { maxPush: 1, clipVelocity: true },
    );

    // friendly: soft collision, the mover barely pushes
    const friendly = scene.createBody({
      position: v3(0, 1.4, 5),
      color: Color.limeGreen,
    });
    shapeData.set(
      scene.capsule(friendly, {
        ...capsuleShape,
        filter: { categoryBits: CATEGORY_ALLY, maskBits: 0xffffffff },
        customColor: Color.limeGreen,
      }),
      { maxPush: 0.01, clipVelocity: false },
    );

    scene.sphere(scene.createBody({ type: 'dynamic', position: v3(7, 5, 0) }), {
      radius: 0.5,
    });

    // a shape the mover ignores
    const ignoreShape = scene.box(
      scene.createBody({ position: v3(7, 2, -3), color: Color.floralWhite }),
      {
        hx: 0.5,
        hy: 0.25,
        hz: 0.5,
        customColor: Color.floralWhite,
        filter: { categoryBits: CATEGORY_IGNORED },
      },
    );

    // a heavy door on a spring loaded hinge
    {
      const ground = scene.createBody();
      const position = v3(-2, 1.6, 0);
      const door = scene.createBody({
        type: 'dynamic',
        position,
        gravityScale: 2,
      });
      scene.box(door, { hx: 0.75, hy: 1.5, hz: 0.1, density: 1000 });
      const axisQuat = quatFromAxisAngle(v3(-1, 0, 0), 0.5 * Math.PI);
      const offset = v3(-0.75, 0, 0);
      world.createRevoluteJoint(ground, door, {
        localFrameA: { position: add(position, offset), rotation: axisQuat },
        localFrameB: { position: offset, rotation: axisQuat },
        enableLimit: true,
        lowerAngle: DEG_TO_RAD * -90,
        upperAngle: DEG_TO_RAD * 90,
        enableSpring: true,
        hertz: 1,
        dampingRatio: 0.5,
        enableMotor: false,
        maxMotorTorque: 100,
        drawScale: 2,
      });
    }

    // --- the character mover ---
    const mover = {
      position: copy(moverPosition),
      velocity: v3(0, 0, 0),
      capsule: capsuleShape as MoverCapsule,
      pogoVelocity: 0,
      onGround: false,
      sprint: false,
      planeCount: 0,
      totalIterations: 0,
    };
    const recorder = new DebugRecorder();
    let clipVelocity = true;

    const follow = (pose: FollowPose): void => {
      pose.target = copy(mover.position);
      pose.eye = orbitEye(
        mover.position,
        pose.yawDegrees,
        pose.pitchDegrees,
        pose.radius,
      );
    };

    const toggler = createThirdPersonToggle(ctx, follow);

    const solveMove = (
      timeStep: number,
      forward: Vec3,
      right: Vec3,
      throttle: { x: number; y: number },
    ): void => {
      const m = mover;

      // friction
      const speed = length(m.velocity);
      if (speed < MOVER_MIN_SPEED) {
        m.velocity.x = 0;
        m.velocity.y = 0;
      } else {
        // linear damping above stopSpeed and fixed reduction below stopSpeed
        const control = speed < MOVER_STOP_SPEED ? MOVER_STOP_SPEED : speed;
        const drop = control * MOVER_FRICTION * timeStep;
        const newSpeed = Math.max(0, speed - drop);
        m.velocity = scale(m.velocity, newSpeed / speed);
      }

      const maxSpeed = m.sprint ? 1.5 * MOVER_MAX_SPEED : MOVER_MAX_SPEED;

      const desiredVelocity = add(
        scale(forward, maxSpeed * throttle.x),
        scale(right, maxSpeed * throttle.y),
      );
      const rawSpeed = length(desiredVelocity);
      const desiredDirection =
        rawSpeed > 0 ? scale(desiredVelocity, 1 / rawSpeed) : ZERO;
      const desiredSpeed = Math.min(rawSpeed, maxSpeed);

      if (m.onGround) m.velocity.y = 0;

      // accelerate
      const currentSpeed = dot(m.velocity, desiredDirection);
      const addSpeed = desiredSpeed - currentSpeed;
      if (addSpeed > 0) {
        let accelSpeed = MOVER_ACCELERATE * maxSpeed * timeStep;
        if (accelSpeed > addSpeed) accelSpeed = addSpeed;
        m.velocity = add(m.velocity, scale(desiredDirection, accelSpeed));
      }

      m.velocity.y -= MOVER_GRAVITY * timeStep;

      // pogo spring
      const pogoRestLength = 3 * m.capsule.radius;
      const rayLength = pogoRestLength + m.capsule.radius;
      const rayOrigin = add(m.position, m.capsule.center1);
      const rayTranslation = scale(AXIS_Y, -rayLength);
      // skip the team: category 1, mask ~2
      const rayResult = world.castRayClosest(rayOrigin, rayTranslation, {
        categoryBits: CATEGORY_DEFAULT,
        maskBits: ~CATEGORY_ALLY >>> 0,
      });

      if (!rayResult.hit) {
        m.onGround = false;
        m.pogoVelocity = 0;
        recorder.line(rayOrigin, add(rayOrigin, rayTranslation), Color.gray);
      } else {
        m.onGround = true;
        const pogoCurrentLength = rayResult.fraction * rayLength;

        const zeta = 0.7;
        const hertz = 4;
        const omega = 2 * Math.PI * hertz;
        const omegaH = omega * timeStep;

        m.pogoVelocity =
          (m.pogoVelocity -
            omega * omegaH * (pogoCurrentLength - pogoRestLength)) /
          (1 + 2 * zeta * omegaH + omegaH * omegaH);
        recorder.line(rayOrigin, copy(rayResult.point), Color.green);
      }

      const startPosition = copy(m.position);
      const target = add(
        add(m.position, scale(m.velocity, timeStep)),
        scale(AXIS_Y, timeStep * m.pogoVelocity),
      );

      // the mover collides with allies, the cast ignores them (and the ignored box)
      const moverFilter = {
        categoryBits: CATEGORY_DEFAULT,
        maskBits: 0xffffffff,
      };
      const castFilter = {
        categoryBits: CATEGORY_DEFAULT,
        maskBits: ~(CATEGORY_ALLY | CATEGORY_IGNORED) >>> 0,
      };

      m.totalIterations = 0;
      const tolerance = 0.01;
      let planes: CollisionPlane[] = [];
      let planeShapes: Shape[] = [];
      let planePoints: Vec3[] = [];

      for (let iteration = 0; iteration < 5; iteration++) {
        planes = [];
        planeShapes = [];
        planePoints = [];

        const list = world.collideMover(m.position, m.capsule, moverFilter);
        for (
          let i = 0;
          i < list.count && planes.length < MOVER_PLANE_CAPACITY;
          i++
        ) {
          const shape = list.shapeAt(i);
          if (!shape || shape === ignoreShape) continue;
          const data = shapeData.get(shape);
          planes.push({
            normal: list.copyNormalTo(i, v3(0, 0, 0)),
            offset: list.offsetAt(i),
            pushLimit: data ? data.maxPush : FLT_MAX,
            push: 0,
            clipVelocity: data ? data.clipVelocity : true,
          });
          planeShapes.push(shape);
          planePoints.push(add(m.position, list.copyPointTo(i, v3(0, 0, 0))));
        }
        m.planeCount = planes.length;

        const targetDelta = sub(target, m.position);
        const result = b3.solvePlanes(targetDelta, planes);
        m.totalIterations += result.iterationCount;

        let delta = result.delta;
        const fraction = world.castMover(
          m.position,
          m.capsule,
          delta,
          castFilter,
        );
        delta = scale(delta, fraction);
        m.position = add(m.position, delta);

        if (lengthSquared(delta) < tolerance * tolerance) break;
      }

      // push dynamic bodies the mover touches
      planes.forEach((plane, i) => {
        const shape = planeShapes[i];
        const point = planePoints[i];
        if (!shape || !point) return;
        const body = shape.body;
        if (body.getType() !== 'dynamic') return;

        const normal = negate(plane.normal);

        const invMassA = 0;
        const invMassB = body.getInverseMass();
        const invIB = body.getWorldInverseRotationalInertia();

        const pB = body.getWorldCenterOfMass();
        const rB = sub(point, pB);

        const rnB = cross(rB, normal);
        const kNormal = invMassA + invMassB + dot(rnB, mulMV(invIB, rnB));
        const normalMass = kNormal > 0 ? 1 / kNormal : 0;

        const vB = body.getLinearVelocity();
        const omegaB = body.getAngularVelocity();
        const vrB = add(vB, cross(omegaB, rB));
        const vn = dot(sub(vrB, m.velocity), normal);
        const impulse = Math.max(-normalMass * vn, 0);

        const P = scale(normal, impulse);
        m.velocity = sub(m.velocity, scale(P, invMassA));

        body.applyLinearImpulse(P, point, true);
      });

      if (clipVelocity) {
        // the clipper avoids picking up velocity from depenetration
        m.velocity = b3.clipVector(m.velocity, planes);
      } else if (timeStep > 0) {
        // the position delta is more holistic and intuitive in some cases
        m.velocity = scale(sub(m.position, startPosition), 1 / timeStep);
      }

      // overlay: planes
      for (const plane of planes) {
        const p1 = add(
          m.position,
          scale(plane.normal, plane.offset - m.capsule.radius),
        );
        recorder.point(p1, Color.yellow);
        recorder.line(p1, add(p1, scale(plane.normal, 0.1)), Color.yellow);
      }
    };

    const moverStep = (): void => {
      const m = mover;
      recorder.clear();

      const throttle = { x: 0, y: 0 };
      const { forward, right } = viewAxes(ctx);

      if (ctx.camera.thirdPerson) {
        if (ctx.isKeyDown('KeyW')) throttle.x += 1;
        if (ctx.isKeyDown('KeyS')) throttle.x -= 1;
        if (ctx.isKeyDown('KeyA')) throttle.y -= 1;
        if (ctx.isKeyDown('KeyD')) throttle.y += 1;

        if (ctx.isKeyDown('Space') && m.onGround) {
          m.velocity.y = MOVER_JUMP_SPEED;
          m.onGround = false;
        }

        m.sprint = m.onGround ? ctx.isKeyDown('ShiftLeft') : false;
      }

      const hertz = ctx.settings.hertz;
      const timeStep = hertz > 0 ? 1 / hertz : 0;
      solveMove(timeStep, forward, right, throttle);
    };

    return {
      ui(panel) {
        toggler.bind(
          panel.checkbox('Third Person (T)', ctx.camera.thirdPerson, () =>
            toggler.toggle(),
          ),
        );
        panel.checkbox('Clip Velocity', clipVelocity, (value) => {
          clipVelocity = value;
        });
      },

      keyboard(input) {
        if (input.code === 'KeyT') toggler.toggle();
      },

      step(dt) {
        moverStep();
        ctx.stepWorld(dt);
      },

      draw(canvas) {
        drawAxesAt(canvas);

        recorder.replay(canvas);
        drawWireCapsule(
          canvas,
          xfAt(mover.position),
          mover.capsule.center1,
          mover.capsule.center2,
          mover.capsule.radius,
          Color.blue,
        );
        canvas.line(
          mover.position,
          add(mover.position, mover.velocity),
          Color.purple,
        );

        canvas.text(`third person (T) = ${ctx.camera.thirdPerson ? 1 : 0}`);
      },

      destroy() {
        ctx.camera.setThirdPerson(null);
        torus.release();
      },
    };
  },
});

/** upstream: DrawAxes at z = 0.02, size 2. */
function drawAxesAt(canvas: DebugCanvas): void {
  const o = v3(0, 0, 0.02);
  canvas.line(o, add(o, v3(2, 0, 0)), Color.red);
  canvas.line(o, add(o, v3(0, 2, 0)), Color.green);
  canvas.line(o, add(o, v3(0, 0, 2)), Color.blue);
}

// ---------------------------------------------------------------------------
// Rigid Body
// ---------------------------------------------------------------------------

// s&box unit conversion: 1 unit = 1 inch = 0.0254 m (40 units per meter)
const SRC = 0.0254;

const WALK_SPEED = 230 * SRC;
const RUN_SPEED = 350 * SRC;
const JUMP_SPEED = 300 * SRC;
const MAX_SLOPE_ANGLE = 45;
const CHARACTER_GRAVITY = 15;
const CHARACTER_MASS = 500;
const JUMP_COOLDOWN_TIME = 0.2;

const STEP_UP_HEIGHT = 18 * SRC;
const STEP_DOWN_HEIGHT = 18 * SRC;
const SKIN = 0.095 * SRC;
const BRAKE_POWER = 0.2;
const SURFACE_FRICTION = 0.6;
const AIR_FRICTION = 0.1;

// radius = 16, height = 72 in s&box units
const BODY_RADIUS = 16 * SRC;
const TOTAL_HEIGHT = 72 * SRC;
const FEET_HEIGHT = TOTAL_HEIGHT * 0.5;

interface TraceResult {
  endPosition: Vec3;
  normal: Vec3;
  hitPoint: Vec3;
  fraction: number;
  hit: boolean;
  startedSolid: boolean;
}

/** Procedural voxel terrain: columns of square cells, outward facing triangles. */
function voxelTerrain(
  cells: number,
  cell: number,
  phase: number,
  zSign: number,
): { vertices: Float32Array; indices: Uint32Array } {
  const vertices: number[] = [];
  const indices: number[] = [];
  const heightOf = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= cells || j >= cells) return 0;
    const h = Math.sin(0.5 * i + phase) + Math.cos(0.4 * j - phase) + 1;
    return Math.max(1, Math.round(2 * h)) * 0.5;
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, outward: Vec3): void => {
    const n = cross(sub(b, a), sub(c, a));
    const order = dot(n, outward) >= 0 ? [a, b, c, d] : [a, d, c, b];
    const base = vertices.length / 3;
    for (const p of order) vertices.push(p.x, p.y, p.z);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x0 = i * cell;
      const x1 = x0 + cell;
      const z0 = zSign * j * cell;
      const z1 = z0 + zSign * cell;
      const h = heightOf(i, j);
      quad(v3(x0, h, z0), v3(x0, h, z1), v3(x1, h, z1), v3(x1, h, z0), AXIS_Y);
      const walls: [number, number, Vec3, Vec3, Vec3][] = [
        // neighbour cell, outward direction, edge start and end at ground level
        [i + 1, j, v3(1, 0, 0), v3(x1, 0, z0), v3(x1, 0, z1)],
        [i - 1, j, v3(-1, 0, 0), v3(x0, 0, z0), v3(x0, 0, z1)],
        [i, j + 1, v3(0, 0, zSign), v3(x0, 0, z1), v3(x1, 0, z1)],
        [i, j - 1, v3(0, 0, -zSign), v3(x0, 0, z0), v3(x1, 0, z0)],
      ];
      for (const [ni, nj, outward, p, q] of walls) {
        const lo = heightOf(ni, nj);
        if (h > lo) {
          quad(
            v3(p.x, lo, p.z),
            v3(p.x, h, p.z),
            v3(q.x, h, q.z),
            v3(q.x, lo, q.z),
            outward,
          );
        }
      }
    }
  }
  return {
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
  };
}

registerSample({
  category: 'Character',
  name: 'Rigid Body',
  create(ctx) {
    const startPosition = v3(7.5, 2, 9);
    ctx.camera.setView(120, 30, 5, startPosition);
    const { scene, world, b3 } = ctx;

    // --- level ---
    addLevel(scene);

    // high-poly building stand-in
    const building = b3.createHollowBoxMesh(v3(0, 3, 0), v3(4, 3, 4));
    {
      const geometry = building.getGeometry();
      scene.mesh(scene.createBody({ position: v3(-5, 0, -10) }), {
        resource: building,
        vertices: geometry.positions,
        indices: geometry.indices,
        clockwise: false,
      });
    }

    // dense voxel terrain stand-ins
    const voxel = (
      x: number,
      z: number,
      phase: number,
      zSign: number,
    ): void => {
      const terrain = voxelTerrain(12, 1, phase, zSign);
      scene.mesh(
        scene.createBody({ position: v3(x, 0, z) }),
        scene.meshData({
          vertices: terrain.vertices,
          indices: terrain.indices,
          weld: true,
          weldTolerance: 0.002,
          identifyEdges: true,
        }),
      );
    };
    voxel(10, -10, 0, -1);
    voxel(10, 10, 2, 1);

    // hull obstacles on top of the mesh level
    const hullFriction = 0.6;
    const hullBox = (
      position: Vec3,
      half: Vec3,
      color: number,
      angleZ = 0,
    ): void => {
      const body = scene.createBody({
        position,
        rotation: quatFromAxisAngle(AXIS_Z, angleZ),
      });
      scene.box(body, {
        halfExtents: half,
        friction: hullFriction,
        customColor: color,
      });
    };

    // ramp (tilted box)
    hullBox(v3(6, 1, 4), v3(3, 0.15, 1.5), Color.oliveDrab, -20 * DEG_TO_RAD);
    // steep ramp (too steep to stand on)
    hullBox(
      v3(6, 2, -4),
      v3(2.5, 0.15, 1.5),
      Color.indianRed,
      -50 * DEG_TO_RAD,
    );
    // elevated platforms with gaps
    for (let i = 0; i < 3; i++) {
      hullBox(v3(-4 + 3.5 * i, 1.2, -5), v3(1.2, 0.15, 1.2), Color.slateGray);
    }
    // step-height test (increasing lip heights)
    for (let i = 0; i < 5; i++) {
      const lipHeight = 0.05 + 0.08 * i;
      hullBox(
        v3(-8, lipHeight, -1 + 2 * i),
        v3(1, lipHeight, 0.6),
        Color.cornflowerBlue,
      );
    }
    // wall
    hullBox(v3(0, 1.5, 10), v3(4, 1.5, 0.2), Color.darkSlateGray);

    // dynamic boxes to push around
    for (let i = 0; i < 3; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: v3(3 + 1.5 * i, 0.5, 0),
        color: Color.gold,
      });
      scene.box(body, {
        hx: 0.4,
        hy: 0.4,
        hz: 0.4,
        friction: hullFriction,
        customColor: Color.gold,
      });
    }

    // dynamic sphere
    scene.sphere(
      scene.createBody({
        type: 'dynamic',
        position: v3(-3, 1, 0),
        color: Color.orange,
      }),
      { radius: 0.5, friction: hullFriction, customColor: Color.orange },
    );

    // --- the character ---
    const body = scene.createBody({
      type: 'dynamic',
      position: startPosition,
      motionLocks: { angularX: true, angularY: true, angularZ: true },
      enableSleep: false,
      enableContactRecycling: false,
      name: 'character',
      gravityScale: CHARACTER_GRAVITY / 10,
    });

    // feet box (lower half): dynamic friction for braking and sliding
    const feetHalf = v3(
      BODY_RADIUS * 0.5,
      FEET_HEIGHT * 0.5,
      BODY_RADIUS * 0.5,
    );
    const feetVolume = 8 * feetHalf.x * feetHalf.y * feetHalf.z;
    const feetBox = scene.box(body, {
      halfExtents: feetHalf,
      offset: v3(0, -TOTAL_HEIGHT * 0.5 + feetHalf.y, 0),
      friction: 0,
      restitution: 0,
      customColor: Color.limeGreen,
      density: (CHARACTER_MASS * 0.4) / feetVolume,
    });
    const ownShapes = new Set<Shape>([feetBox]);

    // body capsule (upper half): zero friction so it slides on walls
    {
      const capsuleRadius = BODY_RADIUS * 0.707;
      const capsuleBottom =
        -TOTAL_HEIGHT * 0.5 + FEET_HEIGHT * 0.5 + capsuleRadius;
      const capsuleTop = TOTAL_HEIGHT * 0.5 - capsuleRadius;
      if (capsuleTop > capsuleBottom) {
        const h = capsuleTop - capsuleBottom;
        const r = capsuleRadius;
        const capsuleVolume = Math.PI * r * r * (h + (4 * r) / 3);
        ownShapes.add(
          scene.capsule(body, {
            center1: v3(0, capsuleBottom, 0),
            center2: v3(0, capsuleTop, 0),
            radius: capsuleRadius,
            friction: 0,
            restitution: 0,
            customColor: Color.cornflowerBlue,
            density: (CHARACTER_MASS * 0.6) / capsuleVolume,
          }),
        );
      }
    }

    // state
    let groundNormal = v3(0, 1, 0);
    let groundVelocity = v3(0, 0, 0);
    let jumpCooldown = 0;
    let onGround = false;
    let sprint = false;
    let didStep = false;
    let stepPosition = v3(0, 0, 0);
    let lastWishVelocity = v3(0, 0, 0);
    let massCenterWorld = copy(startPosition);
    let showDebug = true;
    const recorder = new DebugRecorder();

    // box shape cast like s&box's TraceBody
    const traceBody = (
      from: Vec3,
      to: Vec3,
      radiusScale = 1,
      heightScale = 1,
    ): TraceResult => {
      const result: TraceResult = {
        endPosition: copy(to),
        normal: v3(0, 1, 0),
        hitPoint: copy(to),
        fraction: 1,
        hit: false,
        startedSolid: false,
      };

      const translation = sub(to, from);
      if (length(translation) < 1e-6) return result;

      // the box bottom sits at `from`
      const halfW = BODY_RADIUS * 0.5 * radiusScale;
      const halfH = TOTAL_HEIGHT * heightScale * 0.5;
      const centerY = TOTAL_HEIGHT * heightScale * 0.5;
      const corners = boxCorners(v3(halfW, halfH, halfW), v3(0, centerY, 0));

      const hits = world.castShape(
        { points: flatten(corners) },
        from,
        translation,
        {},
        'all',
      );

      let closest: { fraction: number; normal: Vec3; point: Vec3 } | undefined;
      for (let i = 0; i < hits.count; i++) {
        const shape = hits.shapeAt(i);
        if (shape && ownShapes.has(shape)) continue;
        const fraction = hits.fractionAt(i);
        if (fraction === 0) {
          result.startedSolid = true;
          continue;
        }
        if (!closest || fraction < closest.fraction) {
          closest = {
            fraction,
            normal: hits.copyNormalTo(i, v3(0, 0, 0)),
            point: hits.copyPointTo(i, v3(0, 0, 0)),
          };
        }
      }

      if (closest) {
        result.hit = true;
        result.fraction = closest.fraction;
        result.normal = closest.normal;
        result.hitPoint = closest.point;
        result.endPosition = add(from, scale(translation, closest.fraction));
      }
      return result;
    };

    const isStandableSurface = (normal: Vec3): boolean =>
      dot(normal, AXIS_Y) >= Math.cos(MAX_SLOPE_ANGLE * DEG_TO_RAD);

    const feetPosition = (): Vec3 => {
      const pos = body.getPosition();
      return v3(pos.x, pos.y - TOTAL_HEIGHT * 0.5, pos.z);
    };

    const updateGround = (ground: boolean, normal: Vec3): void => {
      onGround = ground;
      groundNormal = normal;
      if (!ground) groundVelocity = v3(0, 0, 0);
    };

    // s&box style box cast with radius shrinking
    const categorizeGround = (): void => {
      const feet = feetPosition();
      const from = v3(feet.x, feet.y + 4 * SRC, feet.z);
      const to = v3(feet.x, feet.y - 2 * SRC, feet.z);

      let radiusScale = 1;
      let tr = traceBody(from, to, radiusScale, 0.5);

      // shrink the radius if started solid or hit a non-standable surface
      while (tr.startedSolid || (tr.hit && !isStandableSurface(tr.normal))) {
        radiusScale -= 0.1;
        if (radiusScale < 0.7) {
          updateGround(false, v3(0, 1, 0));
          recorder.line(from, to, Color.red);
          return;
        }
        tr = traceBody(from, to, radiusScale, 0.5);
      }

      if (
        !tr.startedSolid &&
        tr.hit &&
        isStandableSurface(tr.normal) &&
        jumpCooldown <= 0
      ) {
        updateGround(true, tr.normal);
        recorder.line(from, tr.hitPoint, Color.green);
        recorder.point(tr.hitPoint, Color.green);
      } else {
        updateGround(false, v3(0, 1, 0));
        recorder.line(from, to, Color.gray);
      }
    };

    // snap the character to the surface when on ground
    const reground = (stepSize: number): void => {
      if (!onGround) return;

      const pos = body.getPosition();
      const from = v3(pos.x, pos.y + 0.05, pos.z);
      const to = v3(pos.x, pos.y - stepSize, pos.z);

      let radiusScale = 1;
      let tr = traceBody(from, to, radiusScale, 0.5);

      while (tr.startedSolid) {
        radiusScale -= 0.1;
        if (radiusScale < 0.7) return;
        tr = traceBody(from, to, radiusScale, 0.5);
      }

      if (tr.hit) {
        const targetPos = v3(
          tr.endPosition.x,
          tr.endPosition.y + 0.01,
          tr.endPosition.z,
        );
        const deltaY = targetPos.y - pos.y;

        body.setTransform(targetPos, body.getRotation());

        // if we moved upward, kill vertical velocity to prevent bouncing
        if (deltaY > 0.01) {
          const vel = body.getLinearVelocity();
          vel.y = 0;
          body.setLinearVelocity(vel);
        }

        recorder.line(from, tr.endPosition, Color.cyan);
      }
    };

    // 4-phase trace based step up
    const tryStep = (maxStepHeight: number): boolean => {
      const pos = body.getPosition();
      const vel = body.getLinearVelocity();

      if (!onGround) return false;

      const hVel = v3(vel.x, 0, vel.z);
      const hSpeed = length(hVel);
      if (hSpeed < 0.01) return false;
      const moveDir = v3(hVel.x / hSpeed, 0, hVel.z / hSpeed);

      // phase 1, forward: trace the body forward in the velocity direction
      const forwardDist = hSpeed * (1 / 60) + BODY_RADIUS;
      const forwardFrom = sub(pos, scale(moveDir, SKIN));
      const forwardTo = add(pos, scale(moveDir, forwardDist));

      let radiusScale = 1;
      let trForward = traceBody(forwardFrom, forwardTo, radiusScale);

      while (trForward.startedSolid) {
        radiusScale -= 0.1;
        if (radiusScale < 0.6) {
          recorder.line(forwardFrom, forwardTo, Color.red);
          return false;
        }
        trForward = traceBody(forwardFrom, forwardTo, radiusScale);
      }

      // no obstacle ahead, no step needed
      if (!trForward.hit) return false;

      recorder.line(forwardFrom, trForward.endPosition, Color.yellow);

      const hitPos = trForward.endPosition;

      // phase 2, up: trace straight up from the hit position
      const upFrom = hitPos;
      const upTo = v3(hitPos.x, hitPos.y + maxStepHeight, hitPos.z);
      const trUp = traceBody(upFrom, upTo, radiusScale);

      if (trUp.startedSolid) {
        recorder.line(upFrom, upTo, Color.red);
        return false;
      }

      const topPos = trUp.hit ? trUp.endPosition : upTo;
      const upDistance = topPos.y - upFrom.y;
      if (upDistance < 0.005) {
        // too tight to step up
        recorder.line(upFrom, topPos, Color.red);
        return false;
      }

      recorder.line(upFrom, topPos, Color.yellow);

      // phase 3, across: from the top position, trace in the move direction
      const acrossDist =
        forwardDist * (1 - trForward.fraction) + BODY_RADIUS * 0.5;
      const acrossFrom = topPos;
      const acrossTo = add(topPos, scale(moveDir, acrossDist));
      const trAcross = traceBody(acrossFrom, acrossTo, radiusScale);

      if (trAcross.startedSolid) {
        recorder.line(acrossFrom, acrossTo, Color.red);
        return false;
      }

      const acrossPos = trAcross.hit ? trAcross.endPosition : acrossTo;
      recorder.line(acrossFrom, acrossPos, Color.yellow);

      // phase 4, down: from the across position, trace straight down
      const downFrom = acrossPos;
      const downTo = v3(acrossPos.x, acrossPos.y - maxStepHeight, acrossPos.z);
      const trDown = traceBody(downFrom, downTo, radiusScale);

      if (!trDown.hit) {
        recorder.line(downFrom, downTo, Color.red);
        return false;
      }

      if (!isStandableSurface(trDown.normal)) {
        recorder.line(downFrom, trDown.endPosition, Color.red);
        return false;
      }

      // check that we actually stepped up (not just laterally)
      const stepHeight = trDown.endPosition.y - pos.y;
      if (stepHeight < 0.01) return false;

      recorder.line(downFrom, trDown.endPosition, Color.yellow);
      recorder.point(trDown.endPosition, Color.yellow);

      // teleport the body to the step position
      const stepPos = v3(
        trDown.endPosition.x,
        trDown.endPosition.y + 0.01,
        trDown.endPosition.z,
      );
      body.setTransform(stepPos, body.getRotation());

      // kill vertical velocity, scale horizontal by 0.9
      const newVel = body.getLinearVelocity();
      newVel.x *= 0.9;
      newVel.y = 0;
      newVel.z *= 0.9;
      body.setLinearVelocity(newVel);

      stepPosition = stepPos;
      return true;
    };

    const restoreStep = (): void => {
      if (!didStep) return;
      // after physics, restore to the step position to prevent double velocity
      body.setTransform(stepPosition, body.getRotation());
      didStep = false;
    };

    const addClamped = (
      current: Vec3,
      addend: Vec3,
      maxAddLength: number,
    ): Vec3 => {
      const addLen = length(addend);
      let a = addend;
      if (addLen > maxAddLength && addLen > 0) {
        a = scale(addend, maxAddLength / addLen);
      }
      return add(current, a);
    };

    // s&box formula for the mass center
    const updateMassCenter = (wishSpeed: number): void => {
      const massData = body.getMassData();
      const halfHeight = TOTAL_HEIGHT * 0.5;
      if (onGround) {
        const centerOffset = clamp(wishSpeed, 0, halfHeight);
        massData.center = v3(0, centerOffset - halfHeight, 0);
      } else {
        massData.center = v3(0, 0, 0);
      }
      body.setMassData(massData);
    };
    updateMassCenter(0);

    // set friction, gravity and damping per s&box
    const updateBody = (wishVelocity: Vec3): void => {
      const wishLen = length(wishVelocity);
      const vel = body.getLinearVelocity();
      const velLen = length(vel);

      // feet friction: brakes when wish < 5 units/s or wish < vel * 0.9
      let feetFriction = 0;
      if (onGround) {
        const wantsBrakes = wishLen < 5 * SRC || wishLen < velLen * 0.9;
        if (wantsBrakes) {
          feetFriction = 1 + 100 * BRAKE_POWER * SURFACE_FRICTION;
        }
      }
      feetBox.setFriction(feetFriction);

      updateMassCenter(wishLen);

      // s&box disables gravity when stationary on stable ground
      let wantsGravity = false;
      if (!onGround) wantsGravity = true;
      if (velLen > 1 * SRC) wantsGravity = true;
      if (length(groundVelocity) > 1 * SRC) wantsGravity = true;
      body.setGravityScale(wantsGravity ? CHARACTER_GRAVITY / 10 : 0);

      // brakes when wish < 1 unit/s and groundVel < 1 unit/s
      const wantsDamping =
        onGround && wishLen < 1 * SRC && length(groundVelocity) < 1 * SRC;
      body.setLinearDamping(wantsDamping ? 10 * BRAKE_POWER : AIR_FRICTION);
    };

    // s&box's MoveMode.Walk velocity model
    const addVelocity = (wishVelocity: Vec3): void => {
      // walk mode strips the vertical component
      const wish = v3(wishVelocity.x, 0, wishVelocity.z);
      const wishLen = length(wish);
      if (wishLen < 0.001) return;

      const groundFrictionFactor = 0.25 + SURFACE_FRICTION * 10;
      const vel = body.getLinearVelocity();
      const savedY = vel.y;

      let velocity = sub(vel, groundVelocity);
      const speed = length(velocity);
      const maxSpeed = Math.max(wishLen, speed);

      if (onGround) {
        const amount = 1 * groundFrictionFactor;
        velocity = addClamped(velocity, scale(wish, amount), wishLen * amount);
      } else {
        const amount = 0.05;
        velocity = addClamped(velocity, scale(wish, amount), wishLen);
      }

      // cap at max speed
      const newSpeed = length(velocity);
      if (newSpeed > maxSpeed && newSpeed > 0) {
        velocity = scale(velocity, maxSpeed / newSpeed);
      }

      velocity = add(velocity, groundVelocity);
      if (onGround) velocity.y = savedY;

      body.setLinearVelocity(velocity);
    };

    const preStep = (
      timeStep: number,
      forward: Vec3,
      right: Vec3,
      throttle: { x: number; y: number },
    ): void => {
      if (jumpCooldown > 0) jumpCooldown -= timeStep;

      // wish velocity from input
      const maxSpeed = sprint ? RUN_SPEED : WALK_SPEED;
      let wishVelocity = add(
        scale(forward, maxSpeed * throttle.x),
        scale(right, maxSpeed * throttle.y),
      );
      const wishSpeed = length(wishVelocity);
      if (wishSpeed > maxSpeed) {
        wishVelocity = scale(wishVelocity, maxSpeed / wishSpeed);
      }
      lastWishVelocity = wishVelocity;

      updateBody(wishVelocity);
      addVelocity(wishVelocity);
      didStep = tryStep(STEP_UP_HEIGHT);

      massCenterWorld = body.getWorldCenterOfMass();
    };

    const postStep = (): void => {
      restoreStep();
      reground(STEP_DOWN_HEIGHT);
      categorizeGround();
    };

    const jump = (): void => {
      if (onGround && jumpCooldown <= 0) {
        const velocity = body.getLinearVelocity();
        velocity.y = JUMP_SPEED;
        body.setLinearVelocity(velocity);
        onGround = false;
        jumpCooldown = JUMP_COOLDOWN_TIME;
      }
    };

    // --- camera ---
    const follow = (pose: FollowPose): void => {
      const charPos = body.getPosition();
      pose.target = copy(charPos);
      let eye = orbitEye(
        charPos,
        pose.yawDegrees,
        pose.pitchDegrees,
        pose.radius,
      );

      // keep the eye from clipping through geometry: cast from the character
      // toward the eye and, on a hit, shorten the boom for this frame only
      const cameraRadius = 0.15;
      const translation = sub(eye, charPos);
      const desiredDist = length(translation);
      if (desiredDist > 0.01) {
        const rayResult = world.castRayClosest(charPos, translation);
        if (rayResult.hit) {
          let clampedDist = rayResult.fraction * desiredDist - cameraRadius;
          if (clampedDist < 0.1) clampedDist = 0.1;
          eye = orbitEye(
            charPos,
            pose.yawDegrees,
            pose.pitchDegrees,
            Math.min(pose.radius, clampedDist),
          );
        }
      }
      pose.eye = eye;
    };

    const toggler = createThirdPersonToggle(ctx, follow);

    // third person from the start, like upstream
    ctx.camera.setThirdPerson(follow);

    return {
      ui(panel) {
        toggler.bind(
          panel.checkbox('Third Person (T)', ctx.camera.thirdPerson, () =>
            toggler.toggle(),
          ),
        );
        panel.checkbox('Debug (V)', showDebug, (value) => {
          showDebug = value;
        });
        panel.separator();
        panel.text(() => `Ground: ${onGround ? 'YES' : 'NO'}`);
        panel.text(() => {
          const vel = body.getLinearVelocity();
          return `Speed: ${Math.hypot(vel.x, vel.z).toFixed(2)} m/s`;
        });
        panel.text(
          () => `Vertical: ${body.getLinearVelocity().y.toFixed(2)} m/s`,
        );
        panel.text(
          () =>
            `Mass center offset: ${(massCenterWorld.y - body.getPosition().y).toFixed(2)}`,
        );
      },

      keyboard(input) {
        if (input.code === 'KeyT') toggler.toggle();
        if (input.code === 'KeyV') showDebug = !showDebug;
      },

      step(dt) {
        recorder.clear();

        // read input
        const throttle = { x: 0, y: 0 };
        const view = viewAxes(ctx);
        let forward = view.forward;
        const forwardLen = length(forward);
        if (forwardLen > 0.001) forward = scale(forward, 1 / forwardLen);

        if (ctx.camera.thirdPerson) {
          if (ctx.isKeyDown('KeyW')) throttle.x += 1;
          if (ctx.isKeyDown('KeyS')) throttle.x -= 1;
          if (ctx.isKeyDown('KeyA')) throttle.y -= 1;
          if (ctx.isKeyDown('KeyD')) throttle.y += 1;
          if (ctx.isKeyDown('Space')) jump();
          sprint = onGround && ctx.isKeyDown('ShiftLeft');
        }

        // pre-step: manipulate velocity before physics
        preStep(dt, forward, view.right, throttle);

        ctx.stepWorld(dt);

        // post-step: re-categorize ground and apply corrections
        postStep();
      },

      draw(canvas) {
        drawAxesAt(canvas);

        recorder.replay(canvas);

        const pos = body.getPosition();
        const vel = body.getLinearVelocity();

        if (showDebug) {
          // velocity (purple), wish velocity (orange), mass center, ground normal
          canvas.line(pos, add(pos, vel), Color.purple);
          canvas.line(pos, add(pos, lastWishVelocity), Color.orange);
          canvas.point(massCenterWorld, Color.yellow);
          if (onGround) {
            const bottom = v3(pos.x, pos.y - TOTAL_HEIGHT * 0.5, pos.z);
            canvas.line(
              bottom,
              add(bottom, scale(groundNormal, 0.3)),
              Color.green,
            );
          }
        }

        const speed = Math.hypot(vel.x, vel.z);
        canvas.text('Rigid Body Character (s&box-style)');
        canvas.text(
          `position: ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}`,
        );
        canvas.text(
          `velocity: ${vel.x.toFixed(2)} ${vel.y.toFixed(2)} ${vel.z.toFixed(2)} (horizontal: ${speed.toFixed(2)})`,
        );
        canvas.text(
          `on ground: ${onGround ? 'yes' : 'no'} | sprint: ${sprint ? 'yes' : 'no'}`,
        );
        canvas.text('WASD=move Space=jump Shift=sprint T=camera V=debug');
      },

      destroy() {
        ctx.camera.setThirdPerson(null);
        building.release();
      },
    };
  },
});
