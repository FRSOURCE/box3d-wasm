// Ported from box3d/samples/sample_collision.cpp
//
// Upstream's cast callbacks (closest, any, multiple, sorted) become the
// world's multi-hit casts, filtered the same way (initial overlap, ignored
// shapes). Solid debug shapes are drawn as wireframes.
import type {
  Body,
  HitList,
  Quat,
  Shape,
  ShapeProxy,
  Transform,
  Vec3,
} from '@frsource/box3d-wasm';
import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  DEG_TO_RAD,
  add,
  clamp,
  dot,
  length,
  mulQuat,
  normalize,
  quatFromAxisAngle,
  rotate,
  scale,
  sub,
} from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import type { DebugCanvas, MouseInput } from '../framework/types.js';
import { createTorus, createWave, meshDataOf } from './collision-scene.js';
import {
  Color,
  IDENTITY,
  ZERO,
  boxCorners,
  copy,
  drawAxes,
  drawCorners,
  drawGroundGrid,
  drawTriangle,
  drawWireCapsule,
  drawWireSphere,
  f1,
  fade,
  flatten,
  g,
  invMulTransforms,
  lerp,
  normalizeQuat,
  transformPoint,
  v3,
} from './collision-helpers.js';

const xf = (position: Vec3, rotation: Quat = IDENTITY.rotation): Transform => ({
  position,
  rotation: { ...rotation },
});

const at = (position: Vec3): Transform => xf(position);

interface Hit {
  point: Vec3;
  normal: Vec3;
  fraction: number;
  shape: Shape | undefined;
  material: number;
  triangle: number;
}

/** Copies the hits that pass `accept` (nearest first), at most `max`. */
function collectHits(
  list: HitList,
  accept: (hit: Hit) => boolean,
  max: number,
): Hit[] {
  const out: Hit[] = [];
  for (let i = 0; i < list.count && out.length < max; i++) {
    const hit: Hit = {
      point: list.copyPointTo(i, v3(0, 0, 0)),
      normal: list.copyNormalTo(i, v3(0, 0, 0)),
      fraction: list.fractionAt(i),
      shape: list.shapeAt(i),
      material: Number(list.userMaterialIdAt(i)),
      triangle: list.triangleIndexAt(i),
    };
    if (accept(hit)) out.push(hit);
  }
  return out;
}

const axisAngle = (axis: Vec3, angle: number): Quat =>
  quatFromAxisAngle(axis, angle);

function drawShapeCorners(
  canvas: DebugCanvas,
  corners: readonly Vec3[],
  offset: Vec3,
  color: number,
): void {
  drawCorners(canvas, corners, color, xf(offset));
}

function drawOriginAxes(canvas: DebugCanvas): void {
  canvas.line(ZERO, v3(0.4, 0, 0), Color.red);
  canvas.line(ZERO, v3(0, 0.4, 0), Color.green);
  canvas.line(ZERO, v3(0, 0, 0.4), Color.blue);
}

// ---------------------------------------------------------------------------
// Ray Curtain
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Ray Curtain',
  create(ctx) {
    ctx.camera.setView(45, 30, 20, ZERO);
    const { scene, world, b3 } = ctx;

    const torus = createTorus(b3);
    const angularVelocity = v3(0.8, 0.4, 0.8);

    const sphereBody = scene.createBody({
      type: 'kinematic',
      position: v3(-6, 3, 0),
      angularVelocity,
    });
    scene.sphere(sphereBody, { radius: 0.9 });

    const capsuleBody = scene.createBody({
      type: 'kinematic',
      position: v3(-2, 3, 0),
      angularVelocity,
    });
    scene.capsule(capsuleBody, {
      center1: v3(-0.5, 0, 0),
      center2: v3(0.5, 0, 0),
      radius: 0.8,
    });

    const hullBody = scene.createBody({
      type: 'kinematic',
      position: v3(2, 3, 0),
      angularVelocity,
    });
    scene.box(hullBody, { hx: 0.6, hy: 0.6, hz: 0.6 });

    const meshBody = scene.createBody({
      type: 'kinematic',
      position: v3(6, 3, 0),
      angularVelocity,
    });
    scene.mesh(meshBody, torus.data);

    const absSpeed = 0.015;
    let offset = 2;
    let speed = -absSpeed;

    return {
      step(dt) {
        ctx.stepWorld(dt);
        // upstream advances the curtain once per rendered frame
        if (offset > 2) speed = -absSpeed;
        else if (offset < -2) speed = absSpeed;
        offset += speed;
      },

      draw(canvas) {
        drawGroundGrid(canvas, 10);
        drawOriginAxes(canvas);

        const translation = v3(0, -8, 0);
        for (let i = 0; i <= 160; i++) {
          const x = -8 + 0.1 * i;
          const rayOrigin = v3(x, 8, offset);
          const rayEnd = add(rayOrigin, translation);

          const result = world.castRayClosest(rayOrigin, translation);
          if (result.hit) {
            canvas.line(
              result.point,
              add(result.point, scale(result.normal, 0.5)),
              Color.green,
            );
          }

          canvas.point(rayOrigin, Color.green);
          canvas.point(rayEnd, Color.red);
          canvas.line(rayOrigin, rayEnd, Color.yellow);
        }
      },

      destroy() {
        torus.mesh.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Cast World
// ---------------------------------------------------------------------------

const CAST_ANY = 0;
const CAST_CLOSEST = 1;
const CAST_MULTIPLE = 2;
const CAST_SORTED = 3;

const CAST_RAY = 0;
const CAST_SPHERE = 1;
const CAST_CAPSULE = 2;
const CAST_BOX = 3;

const MAX_BODIES = 64;
const IGNORE_BASE = 0x7;

registerSample({
  category: 'Collision',
  name: 'Cast World',
  create(ctx) {
    ctx.camera.setView(45, 30, 20, ZERO);
    const { scene, world, b3, random } = ctx;

    const torus = createTorus(b3);
    const heightField = createWave(
      scene,
      10,
      10,
      v3(0.5, 0.5, 0.5),
      0.03,
      0.09,
      false,
    );

    const bodies: (Body | undefined)[] = new Array<Body | undefined>(
      MAX_BODIES,
    ).fill(undefined);
    const ignored = new Set<Shape>();
    let bodyIndex = 0;

    let mode = CAST_CLOSEST;
    let castType = CAST_RAY;
    let castRadius = 0.5;
    let initialOverlap = false;

    let origin = v3(-20, 10, 0);
    let translation = v3(20, 10, 0);

    const randomVec = (lo: number, hi: number): Vec3 =>
      v3(random.range(lo, hi), random.range(lo, hi), random.range(lo, hi));

    type ShapeKind = 'sphere' | 'capsule' | 'hull' | 'mesh' | 'height';

    const createShapes = (kind: ShapeKind, count: number): void => {
      for (let i = 0; i < count; i++) {
        const previous = bodies[bodyIndex];
        if (previous) {
          scene.destroyBody(previous);
          bodies[bodyIndex] = undefined;
        }

        let type: 'static' | 'kinematic' | 'dynamic';
        if (bodyIndex % 3 === 0) type = 'kinematic';
        else if (bodyIndex % 2 === 0) type = 'dynamic';
        else type = 'static';
        // height fields only collide as static shapes
        if (kind === 'height') type = 'static';

        const position = randomVec(-20, 20);
        const axis = normalize(randomVec(-1, 1));
        const angle = random.range(-Math.PI, Math.PI);
        const body = scene.createBody({
          type,
          position,
          rotation: axisAngle(axis, angle),
          gravityScale: 0,
        });

        let shape: Shape;
        switch (kind) {
          case 'sphere':
            shape = scene.sphere(body, { radius: 0.9, userMaterialId: 11 });
            break;
          case 'capsule':
            shape = scene.capsule(body, {
              center1: v3(-0.5, 0, 0),
              center2: v3(0.5, 0, 0),
              radius: 0.8,
              userMaterialId: 22,
            });
            break;
          case 'hull':
            shape = scene.box(body, {
              hx: 0.6,
              hy: 0.6,
              hz: 0.6,
              userMaterialId: 33,
            });
            break;
          case 'mesh':
            shape = scene.mesh(body, torus.data, {
              scale: v3(4, 3, -2),
              userMaterialId: 44,
            });
            break;
          case 'height':
            shape = scene.heightField(body, heightField, {
              userMaterialId: 55,
              materials: [
                { userMaterialId: 111 },
                { userMaterialId: 222 },
                { userMaterialId: 333 },
              ],
            });
            break;
        }

        if ((bodyIndex & IGNORE_BASE) === IGNORE_BASE) ignored.add(shape);
        bodies[bodyIndex] = body;
        bodyIndex = (bodyIndex + 1) % MAX_BODIES;
      }
    };

    const destroyBody = (): void => {
      for (let i = 0; i < MAX_BODIES; i++) {
        const body = bodies[i];
        if (body) {
          scene.destroyBody(body);
          bodies[i] = undefined;
          return;
        }
      }
    };

    const shapeProxy = (): { proxy?: ShapeProxy; corners?: Vec3[] } => {
      switch (castType) {
        case CAST_SPHERE:
          return { proxy: b3.proxy.sphere(castRadius) };
        case CAST_CAPSULE:
          return { proxy: b3.proxy.capsule(ZERO, v3(0, 1, 0), castRadius) };
        case CAST_BOX: {
          const half = v3(castRadius, 0.5 * castRadius, 0.25 * castRadius);
          const corners = boxCorners(half);
          return { proxy: { points: flatten(corners) }, corners };
        }
        default:
          return {};
      }
    };

    const drawCastShape = (
      canvas: DebugCanvas,
      position: Vec3,
      color: number,
      corners?: Vec3[],
    ): void => {
      const transform = at(position);
      if (castType === CAST_SPHERE) {
        drawWireSphere(canvas, transform, ZERO, castRadius, color);
      } else if (castType === CAST_CAPSULE) {
        drawWireCapsule(
          canvas,
          transform,
          ZERO,
          v3(0, 1, 0),
          castRadius,
          color,
        );
      } else if (castType === CAST_BOX && corners) {
        drawShapeCorners(canvas, corners, position, color);
      }
    };

    return {
      ui(panel) {
        panel.combo(
          'Cast Type',
          ['Ray', 'Sphere', 'Capsule', 'Box'],
          castType,
          (index) => {
            castType = index;
            ctx.refreshUI();
          },
        );
        if (castType !== CAST_RAY && castType !== CAST_BOX) {
          panel.slider(
            'Radius',
            castRadius,
            { min: 0.1, max: 2, format: f1 },
            (value) => {
              castRadius = value;
            },
          );
        }
        panel.combo(
          'Mode',
          ['Any', 'Closest', 'Multiple', 'Sorted'],
          mode,
          (index) => {
            mode = index;
          },
        );
        panel.checkbox('Initial Overlap', initialOverlap, (value) => {
          initialOverlap = value;
        });
        panel.button('Spheres', () => createShapes('sphere', 10));
        panel.button('Capsules', () => createShapes('capsule', 10));
        panel.button('Hulls', () => createShapes('hull', 10));
        panel.button('Meshes', () => createShapes('mesh', 1));
        panel.button('Height Field', () => createShapes('height', 1));
        panel.button('Destroy Shape', destroyBody);
      },

      mouseDown(input: MouseInput) {
        if (input.button === 0 && input.ctrl && !input.shift && !input.alt) {
          origin = copy(input.ray.origin);
          translation = scale(input.ray.direction, 100);
          return true;
        }
        return false;
      },

      draw(canvas) {
        const { proxy, corners } = shapeProxy();

        const list =
          castType === CAST_RAY
            ? world.castRay(origin, translation, {}, 'all')
            : world.castShape(
                proxy ?? b3.proxy.sphere(castRadius),
                origin,
                translation,
                {},
                'all',
              );

        const maxHits = mode === CAST_MULTIPLE || mode === CAST_SORTED ? 3 : 1;
        const hits = collectHits(
          list,
          (hit) =>
            (initialOverlap || hit.fraction !== 0) &&
            !(hit.shape && ignored.has(hit.shape)),
          maxHits,
        );

        const colors = [Color.red, Color.green, Color.blue];
        const end = add(origin, translation);
        canvas.line(origin, end, Color.aqua);

        if (hits.length > 0) {
          hits.forEach((hit, i) => {
            const color = colors[i] ?? Color.white;
            const head = add(hit.point, scale(hit.normal, 0.5));
            canvas.point(hit.point, color);
            const position = add(origin, scale(translation, hit.fraction));
            if (castType === CAST_RAY) {
              canvas.line(hit.point, head, color);
            } else {
              canvas.line(hit.point, head, Color.orange);
              drawCastShape(canvas, position, color, corners);
            }
          });
        } else {
          drawCastShape(canvas, end, Color.gray, corners);
        }

        canvas.point(origin, Color.green);

        canvas.text('Ctrl + left mouse to cast through cursor');
        canvas.text('Shapes drawn in yellow boxes are ignored by the ray');

        // outline the bodies the cast ignores
        for (let i = 0; i < MAX_BODIES; i++) {
          const body = bodies[i];
          if ((i & IGNORE_BASE) === IGNORE_BASE && body?.alive) {
            canvas.aabb(body.computeAABB(), Color.yellow);
          }
        }

        switch (mode) {
          case CAST_ANY:
            canvas.text('Cast mode: any - check for obstruction - unsorted');
            break;
          case CAST_CLOSEST:
            canvas.text(
              'Cast mode: closest - find closest shape along the cast',
            );
            break;
          case CAST_MULTIPLE:
            canvas.text(
              'Cast mode: multiple - gather multiple shapes - unsorted',
            );
            break;
          case CAST_SORTED:
            canvas.text(
              'Cast mode: sorted - gather multiple shapes sorted by closeness',
            );
            break;
        }

        for (const hit of hits) {
          canvas.text(`material = ${hit.material}, triangle = ${hit.triangle}`);
        }

        drawGroundGrid(canvas, 10);
        drawAxes(canvas, IDENTITY, 1);
      },

      destroy() {
        torus.mesh.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Mesh Scale
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Mesh Scale',
  create(ctx) {
    ctx.camera.setView(45, 30, 20, ZERO);
    const { scene, world, b3 } = ctx;

    const box = b3.createBoxMesh(ZERO, v3(0.5, 0.5, 0.5), true);
    const boxData = meshDataOf(box);
    let meshScale = v3(1, 1, 1);
    let start = v3(-2, 0, 0);
    let sphereCast = true;

    // the scale of an engine mesh shape is fixed at creation, so changes rebuild the body
    let meshBody: Body | undefined;
    const buildMesh = (): void => {
      if (meshBody) scene.destroyBody(meshBody);
      meshBody = scene.createBody();
      // tiny scale components are invalid; a slider at 0 would otherwise throw
      const safe = (s: number): number =>
        Math.abs(s) < 0.01 ? (s < 0 ? -0.01 : 0.01) : s;
      scene.mesh(meshBody, boxData, {
        scale: v3(safe(meshScale.x), safe(meshScale.y), safe(meshScale.z)),
      });
    };
    buildMesh();

    return {
      hasSolverControls: false,

      ui(panel) {
        const scaleSlider = (
          label: string,
          get: () => number,
          set: (value: number) => void,
        ): void => {
          panel.slider(
            label,
            get(),
            { min: -2, max: 2, format: f1 },
            (value) => {
              set(value);
              buildMesh();
            },
          );
        };
        scaleSlider(
          'Scale X',
          () => meshScale.x,
          (value) => {
            meshScale = { ...meshScale, x: value };
          },
        );
        scaleSlider(
          'Scale Y',
          () => meshScale.y,
          (value) => {
            meshScale = { ...meshScale, y: value };
          },
        );
        scaleSlider(
          'Scale Z',
          () => meshScale.z,
          (value) => {
            meshScale = { ...meshScale, z: value };
          },
        );
        panel.slider(
          'Start Y',
          start.y,
          { min: -2, max: 2, format: f1 },
          (value) => {
            start = { ...start, y: value };
          },
        );
        panel.slider(
          'Start Z',
          start.z,
          { min: -2, max: 2, format: f1 },
          (value) => {
            start = { ...start, z: value };
          },
        );
        panel.checkbox('sphere Cast', sphereCast, (value) => {
          sphereCast = value;
        });
      },

      draw(canvas) {
        const rayOrigin = start;
        const rayTranslation = v3(4, 0, 0);

        canvas.point(rayOrigin, Color.green);
        canvas.point(add(rayOrigin, rayTranslation), Color.red);
        canvas.line(rayOrigin, add(rayOrigin, rayTranslation), Color.white);

        if (sphereCast) {
          const radius = 0.25;
          const hits = collectHits(
            world.castShape(
              b3.proxy.sphere(radius),
              start,
              rayTranslation,
              {},
              'all',
            ),
            (hit) => hit.fraction !== 0,
            1,
          );
          const hit = hits[0];
          if (hit) {
            // upstream draws the swept sphere relative to the origin, not the start
            drawWireSphere(
              canvas,
              at(scale(rayTranslation, hit.fraction)),
              ZERO,
              radius,
              Color.yellow,
            );
            canvas.line(
              hit.point,
              add(hit.point, scale(hit.normal, 0.5)),
              Color.green,
            );
            canvas.point(hit.point, Color.yellow);
          } else {
            drawWireSphere(
              canvas,
              at(rayTranslation),
              ZERO,
              radius,
              Color.gray,
            );
          }
        } else {
          const result = world.castRayClosest(rayOrigin, rayTranslation);
          if (result.hit) {
            canvas.line(
              result.point,
              add(result.point, scale(result.normal, 0.5)),
              Color.green,
            );
            canvas.point(result.point, Color.yellow);
          }
        }
      },

      destroy() {
        box.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Shape Cast
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Shape Cast',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { scene, world, b3 } = ctx;

    const torus = createTorus(b3);

    for (let index = 0; index < 3; index++) {
      const sphereBody = scene.createBody({
        position: v3(-6, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_X, 0.5 * Math.PI),
      });
      scene.sphere(sphereBody, { radius: 0.9 });

      const capsuleBody = scene.createBody({
        position: v3(-2, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_Z, 0.25 * Math.PI),
      });
      scene.capsule(capsuleBody, {
        center1: v3(-0.5, 0, 0),
        center2: v3(0.5, 0, 0),
        radius: 0.7,
      });

      const hullBody = scene.createBody({
        position: v3(2, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_Z, 0.25 * Math.PI),
      });
      scene.box(hullBody, { hx: 0.6, hy: 0.6, hz: 0.6 });

      const meshBody = scene.createBody({
        position: v3(6, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_X, 0.5 * Math.PI),
      });
      scene.mesh(meshBody, torus.data);
      // todo upstream: add height field
    }

    let baseX = 0;
    let baseY = 0;
    let castOffset = v3(0, 0, 0);
    let trackingX = false;
    let trackingY = false;
    let initialOverlap = false;

    const first = (proxy: ShapeProxy, translation: Vec3) =>
      collectHits(
        world.castShape(proxy, ZERO, translation, {}, 'all'),
        (hit) => initialOverlap || hit.fraction !== 0,
        1,
      )[0];

    return {
      hasSolverControls: false,

      ui(panel) {
        panel.checkbox('Initial Overlap', initialOverlap, (value) => {
          initialOverlap = value;
        });
      },

      mouseDown(input: MouseInput) {
        if (input.button !== 0) return false;
        if (input.shift && !input.ctrl && !input.alt) {
          trackingX = true;
          baseX = input.x;
          return true;
        }
        if (input.ctrl && !input.shift && !input.alt) {
          trackingY = true;
          baseY = input.y;
          return true;
        }
        return false;
      },

      mouseUp(input: MouseInput) {
        if (input.button === 0) {
          trackingX = false;
          trackingY = false;
        }
      },

      mouseMove(input: MouseInput) {
        if (trackingX)
          castOffset = { ...castOffset, z: 0.05 * (baseX - input.x) };
        if (trackingY)
          castOffset = { ...castOffset, y: 0.05 * (baseY - input.y) };
      },

      draw(canvas) {
        const translation = v3(0, 0, 10);

        for (let castIndex = 0; castIndex < 4; castIndex++) {
          const x = -6 + 4 * castIndex;

          // sphere
          {
            const radius = 0.3;
            const center = add(v3(x, 3, -5), castOffset);
            const hit = first(b3.proxy.sphere(radius, center), translation);
            drawWireSphere(canvas, IDENTITY, center, radius, Color.green);
            if (hit) {
              drawWireSphere(
                canvas,
                at(scale(translation, hit.fraction)),
                center,
                radius,
                Color.red,
              );
              canvas.point(hit.point, Color.red);
              canvas.line(
                hit.point,
                add(hit.point, scale(hit.normal, 0.2)),
                Color.yellow,
              );
            } else {
              drawWireSphere(
                canvas,
                at(translation),
                center,
                radius,
                Color.gray,
              );
            }
          }

          // capsule
          {
            const offset = add(v3(x, 5, -5), castOffset);
            const c1 = add(v3(-0.2, -0.2, -0.2), offset);
            const c2 = add(v3(0.2, 0.2, 0.2), offset);
            const radius = 0.2;
            const hit = first(b3.proxy.capsule(c1, c2, radius), translation);
            drawWireCapsule(canvas, IDENTITY, c1, c2, radius, Color.green);
            if (hit) {
              drawWireCapsule(
                canvas,
                at(scale(translation, hit.fraction)),
                c1,
                c2,
                radius,
                Color.red,
              );
              canvas.point(hit.point, Color.red);
              canvas.line(
                hit.point,
                add(hit.point, scale(hit.normal, 0.2)),
                Color.yellow,
              );
            } else {
              drawWireCapsule(
                canvas,
                at(translation),
                c1,
                c2,
                radius,
                Color.gray,
              );
            }
          }

          // hull
          {
            const offset = add(v3(x, 7, -5), castOffset);
            const qx = axisAngle(AXIS_X, 0.25 * Math.PI);
            const qy = axisAngle(AXIS_Y, 0.25 * Math.PI);
            const qz = axisAngle(AXIS_Z, 0.25 * Math.PI);
            const q = mulQuat(qx, mulQuat(qy, qz));
            const corners = boxCorners(v3(0.3, 0.3, 0.3), offset, q);
            const hit = first({ points: flatten(corners) }, translation);
            drawShapeCorners(canvas, corners, ZERO, Color.green);
            if (hit) {
              drawShapeCorners(
                canvas,
                corners,
                scale(translation, hit.fraction),
                Color.red,
              );
              canvas.point(hit.point, Color.red);
              canvas.line(
                hit.point,
                add(hit.point, scale(hit.normal, 0.2)),
                Color.yellow,
              );
            } else {
              drawShapeCorners(canvas, corners, translation, Color.gray);
            }
          }
        }

        canvas.text('Shift + LMB and drag to shift start position');

        drawGroundGrid(canvas, 10);
        drawAxes(canvas, IDENTITY, 1);
      },

      destroy() {
        torus.mesh.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Overlap World
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Overlap World',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { scene, world, b3 } = ctx;

    world.setGravity(ZERO);

    const torus = createTorus(b3);
    const heightField = createWave(
      scene,
      10,
      10,
      v3(0.2, 0.2, 0.2),
      0.03,
      0.09,
      false,
    );

    const types = ['static', 'kinematic', 'dynamic'] as const;
    for (let index = 0; index < 3; index++) {
      const type = types[index] ?? 'static';

      const sphereBody = scene.createBody({
        type,
        position: v3(-6, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_X, 0.5 * Math.PI),
      });
      scene.sphere(sphereBody, { radius: 0.8 });

      const capsuleBody = scene.createBody({
        type,
        position: v3(-3, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_Z, 0.25 * Math.PI),
      });
      scene.capsule(capsuleBody, {
        center1: v3(-0.5, 0, 0),
        center2: v3(0.5, 0, 0),
        radius: 0.5,
      });

      const hullBody = scene.createBody({
        type,
        position: v3(0, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_Z, 0.25 * Math.PI),
      });
      scene.box(hullBody, { hx: 0.6, hy: 0.6, hz: 0.6 });

      const meshBody = scene.createBody({
        type,
        position: v3(3, 3 + 2 * index, 0),
        rotation: axisAngle(AXIS_X, 0.5 * Math.PI),
      });
      scene.mesh(meshBody, torus.data, { scale: v3(-0.5, 1.5, -1) });

      // height fields only on static bodies
      const heightBody = scene.createBody({
        type: 'static',
        position: v3(5, 2 + 2 * index, 0),
        rotation: axisAngle(AXIS_X, -0.5 * Math.PI),
      });
      scene.heightField(heightBody, heightField);
    }

    let baseX = 0;
    let castOffset = 0;
    let tracking = false;

    const overlaps = (proxy: ShapeProxy): boolean =>
      world.overlapShape(proxy, ZERO).count > 0;

    return {
      mouseDown(input: MouseInput) {
        if (input.button === 0 && input.shift && !input.ctrl && !input.alt) {
          tracking = true;
          baseX = input.x;
          return true;
        }
        return false;
      },

      mouseUp(input: MouseInput) {
        if (input.button === 0) tracking = false;
      },

      mouseMove(input: MouseInput) {
        if (tracking) castOffset = 0.05 * (baseX - input.x);
      },

      draw(canvas) {
        for (let i = 0; i < 5; i++) {
          const x = -6 + 3 * i;

          const center = v3(x, 3, -5 + castOffset);
          const sphereColor = overlaps(b3.proxy.sphere(0.3, center))
            ? Color.red
            : Color.green;
          drawWireSphere(canvas, IDENTITY, center, 0.3, sphereColor);

          const offset = v3(x, 5, -5 + castOffset);
          const c1 = add(v3(-0.2, -0.2, -0.2), offset);
          const c2 = add(v3(0.2, 0.2, 0.2), offset);
          const capsuleColor = overlaps(b3.proxy.capsule(c1, c2, 0.2))
            ? Color.red
            : Color.green;
          drawWireCapsule(canvas, IDENTITY, c1, c2, 0.2, capsuleColor);

          const corners = boxCorners(
            v3(0.3, 0.3, 0.3),
            v3(x, 7, -5 + castOffset),
          );
          const hullColor = overlaps({ points: flatten(corners) })
            ? Color.red
            : Color.green;
          drawShapeCorners(canvas, corners, ZERO, hullColor);
        }

        canvas.text('Shift + LMB and drag to move shapes');

        drawGroundGrid(canvas, 10);
        drawOriginAxes(canvas);
      },

      destroy() {
        torus.mesh.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Long Ray Cast
// ---------------------------------------------------------------------------

const SHAPE_COUNT = 5;
const TRAIL_COUNT = 180;

registerSample({
  category: 'Collision',
  name: 'Long Ray Cast',
  create(ctx) {
    ctx.camera.setView(-35, 22, 34, v3(0, 1, 0));
    const { scene, world, b3 } = ctx;

    world.setGravity(ZERO);

    const rock = b3.createRock(1);
    const wave = b3.createWaveMesh(8, 8, 0.5, 0.25, 0.2, 0.2);
    const hfCount = 9;
    const hfScale = v3(0.5, 0.5, 0.5);
    const heightField = createWave(
      scene,
      hfCount,
      hfCount,
      hfScale,
      0.08,
      0.16,
      false,
    );

    // aim each ray at a point above its shape so the cone sweeps the hit across the surface
    const spacing = 5;
    const aimHeight = 2.5;
    const targets: Vec3[] = [];
    for (let i = 0; i < SHAPE_COUNT; i++) {
      targets.push(v3((i - 2) * spacing, aimHeight, 0));
    }
    const target = (i: number): Vec3 => targets[i] ?? ZERO;

    const place = (x: number): Body =>
      scene.createBody({ type: 'static', position: v3(x, 0, 0) });

    scene.sphere(place(target(0).x), { radius: 1 });
    scene.capsule(place(target(1).x), {
      center1: v3(-1, 0, 0),
      center2: v3(1, 0, 0),
      radius: 0.7,
    });
    scene.hull(place(target(2).x), {
      points: rock.getGeometry().positions,
      maxVertices: 128,
    });
    scene.mesh(place(target(3).x), meshDataOf(wave));
    {
      // the height field grows from a corner, so offset the body to center the patch under the ray
      const extentX = hfScale.x * (hfCount - 1);
      const extentZ = hfScale.z * (hfCount - 1);
      const body = scene.createBody({
        type: 'static',
        position: v3(target(4).x - 0.5 * extentX, 0, -0.5 * extentZ),
      });
      scene.heightField(body, heightField);
    }

    const trail: Vec3[][] = Array.from({ length: SHAPE_COUNT }, () => []);
    const trailNext = new Array<number>(SHAPE_COUNT).fill(0);
    const trailCount = new Array<number>(SHAPE_COUNT).fill(0);
    const failRate = new Array<number>(SHAPE_COUNT).fill(0);

    let rayLengthKilometers = 1;
    let coneAngle = 5;
    let phase = 0;

    interface Cast {
      point: Vec3;
      normal: Vec3;
      hit: boolean;
    }

    // a ray through the aim point along a cone direction, starting `distance` above it
    const castAlong = (
      aim: Vec3,
      coneDir: Vec3,
      distance: number,
      reach: number,
    ): Cast => {
      const rayOrigin = add(aim, scale(coneDir, distance));
      const translation = scale(coneDir, -(distance + reach));
      const result = world.castRayClosest(rayOrigin, translation);
      return result.hit
        ? { hit: true, point: copy(result.point), normal: copy(result.normal) }
        : { hit: false, point: ZERO, normal: ZERO };
    };

    type Segment = { a: Vec3; b: Vec3; color: number };
    type Dot = { p: Vec3; color: number };
    let lines: Segment[] = [];
    let dots: Dot[] = [];

    return {
      ui(panel) {
        // log slider: the value is the exponent so the range reads 1 to 10000 km
        panel.slider(
          'Ray Length',
          Math.log10(rayLengthKilometers),
          {
            min: 0,
            max: 4,
            format: (value) => `${Math.round(10 ** value)} km`,
          },
          (value) => {
            rayLengthKilometers = 10 ** value;
          },
        );
        panel.slider(
          'Cone Angle',
          coneAngle,
          { min: 0, max: 12, format: (value) => `${value.toFixed(1)} deg` },
          (value) => {
            coneAngle = value;
          },
        );
      },

      step(dt) {
        ctx.stepWorld(dt);

        // advance the cone so it completes one loop per trail buffer
        phase += (2 * Math.PI) / TRAIL_COUNT;
        if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

        // unit direction precessing on a small cone about the up axis
        const halfAngle = coneAngle * DEG_TO_RAD;
        const tilted = rotate(axisAngle(AXIS_X, halfAngle), AXIS_Y);
        const coneDir = rotate(axisAngle(AXIS_Y, phase), tilted);

        const reach = 5;
        const farDistance = 1000 * rayLengthKilometers;

        lines = [];
        dots = [];

        for (let i = 0; i < SHAPE_COUNT; i++) {
          const aim = target(i);
          // the short ray is near enough to be accurate, so it is the ground truth
          const truth = castAlong(aim, coneDir, 50, reach);
          const cast = castAlong(aim, coneDir, farDistance, reach);

          let fail = 0;

          if (cast.hit) {
            // colour the hit by how far it drifts from the ground truth
            const error = truth.hit ? length(sub(cast.point, truth.point)) : 0;
            const color = error < 0.05 ? Color.green : Color.orange;

            const buffer = trail[i];
            const next = trailNext[i] ?? 0;
            if (buffer) buffer[next] = cast.point;
            trailNext[i] = (next + 1) % TRAIL_COUNT;
            if ((trailCount[i] ?? 0) < TRAIL_COUNT) {
              trailCount[i] = (trailCount[i] ?? 0) + 1;
            }

            lines.push({
              a: add(cast.point, scale(coneDir, 3)),
              b: cast.point,
              color: Color.aqua,
            });
            lines.push({
              a: cast.point,
              b: add(cast.point, scale(cast.normal, 1.5)),
              color: Color.yellow,
            });
            dots.push({ p: cast.point, color });
          } else if (truth.hit) {
            // accuracy failure: the line does hit, but single precision lost it at distance
            fail = 1;
            lines.push({
              a: add(truth.point, scale(coneDir, 2)),
              b: add(truth.point, scale(coneDir, -2)),
              color: Color.red,
            });
            dots.push({ p: truth.point, color: Color.red });
          } else {
            // geometric miss: the cone tilted the ray off the shape
            lines.push({
              a: add(aim, scale(coneDir, 2)),
              b: add(aim, scale(coneDir, -4)),
              color: fade(Color.gray, 0.4),
            });
          }

          failRate[i] = 0.95 * (failRate[i] ?? 0) + 0.05 * fail;

          // fade the trail from oldest to newest so the loop reads as a path
          const count = trailCount[i] ?? 0;
          const start =
            ((trailNext[i] ?? 0) - count + TRAIL_COUNT) % TRAIL_COUNT;
          for (let j = 0; j < count; j++) {
            const p = trail[i]?.[(start + j) % TRAIL_COUNT];
            if (p) dots.push({ p, color: fade(Color.green, (j + 1) / count) });
          }
        }
      },

      draw(canvas) {
        for (const l of lines) canvas.line(l.a, l.b, l.color);
        for (const d of dots) canvas.point(d.p, d.color);

        const pct = (i: number): string =>
          (100 * (failRate[i] ?? 0)).toFixed(0);
        canvas.text('Long ray casts');
        canvas.text(
          `Origin ${rayLengthKilometers.toFixed(0)} km. Green: accurate, Orange: drifting, Red: miss.`,
        );
        canvas.text(
          `Failures: sphere ${pct(0)}%  capsule ${pct(1)}%  hull ${pct(2)}%  mesh ${pct(3)}%  hf ${pct(4)}%`,
        );
      },

      destroy() {
        rock.release();
        wave.release();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Initial Overlap
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Initial Overlap',
  create(ctx) {
    ctx.camera.setView(-140, 10, 10, ZERO);
    const { scene, world, b3 } = ctx;

    const body = scene.createBody({
      position: ZERO,
      rotation: axisAngle(AXIS_Z, 10 * DEG_TO_RAD),
    });
    scene.mesh(
      body,
      {
        vertices: [
          -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5,
        ],
        indices: [0, 1, 2, 2, 3, 0],
        medianSplit: false,
      },
      { scale: v3(4, 4, 4) },
    );

    let initialOverlap = true;

    return {
      hasSolverControls: false,

      ui(panel) {
        panel.checkbox('initial overlap', initialOverlap, (value) => {
          initialOverlap = value;
        });
      },

      draw(canvas) {
        const offset = v3(-2.1, -0.8, 0.95);
        const c1 = offset;
        const c2 = add(offset, v3(0, 1, 0));
        const radius = 0.25;

        // zero length cast
        const translation = v3(0, 0, 0);
        const hit = collectHits(
          world.castShape(
            b3.proxy.capsule(c1, c2, radius),
            ZERO,
            translation,
            {},
            'all',
          ),
          (h) => initialOverlap || h.fraction !== 0,
          1,
        )[0];

        drawWireCapsule(canvas, IDENTITY, c1, c2, radius, Color.green);

        const fraction = hit ? hit.fraction : 1;
        drawWireCapsule(
          canvas,
          at(scale(translation, fraction)),
          c1,
          c2,
          radius,
          hit ? Color.red : Color.green,
        );

        if (hit) {
          canvas.line(
            hit.point,
            add(hit.point, scale(hit.normal, 0.5)),
            Color.aliceBlue,
          );
          canvas.point(hit.point, Color.aliceBlue);
        }

        drawAxes(canvas, IDENTITY, 1);
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Shape Cast Debug
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Shape Cast Debug',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { b3 } = ctx;

    // captured from a failing cast
    const s = 0.01;
    const sv = (x: number, y: number, z: number): Vec3 =>
      v3(s * x, s * y, s * z);
    const triangle: [Vec3, Vec3, Vec3] = [
      sv(0, 0, 0),
      sv(0, -6400, 0),
      sv(6400, 0, 22.609375),
    ];
    const capsule = {
      center1: sv(43616.2109375, -100213, 132631.8125),
      center2: sv(342231.96875, 359711.6875, 132631.8125),
      radius: s * 1,
    };
    const transform = xf(sv(-115200, -19200, -202755));
    const translation = sv(0.008614914, 0, 72267.1171875);

    return {
      hasSolverControls: false,

      draw(canvas) {
        drawGroundGrid(canvas, 10);
        drawAxes(canvas, IDENTITY, 1);

        const output = b3.collision.shapeCastPair(
          { points: flatten(triangle) },
          b3.proxy.capsule(capsule.center1, capsule.center2, capsule.radius),
          translation,
          transform,
          0.970617533,
          false,
        );

        drawTriangle(
          canvas,
          IDENTITY,
          triangle[0],
          triangle[1],
          triangle[2],
          Color.cyan,
        );
        drawWireCapsule(
          canvas,
          transform,
          capsule.center1,
          capsule.center2,
          capsule.radius,
          Color.green,
        );

        if (output.hit) {
          // final position with overlap resolution
          const end = add(
            transform.position,
            scale(translation, output.fraction),
          );
          drawWireCapsule(
            canvas,
            xf(end, transform.rotation),
            capsule.center1,
            capsule.center2,
            capsule.radius,
            Color.red,
          );
        }

        const end = add(transform.position, translation);
        drawWireCapsule(
          canvas,
          xf(end, transform.rotation),
          capsule.center1,
          capsule.center2,
          capsule.radius,
          Color.gray,
        );
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Distance Debug
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Distance Debug',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { b3 } = ctx;

    const halfA = v3(40, 1, 40);
    const halfB = v3(0.5, 10, 0.5);
    const offsetB = v3(0, 10, 0);
    const cornersA = boxCorners(halfA);
    const cornersB = boxCorners(halfB, offsetB);

    const transformA = xf(ZERO);
    const transformB = xf(v3(-1.64657831e-6, 1.00989532471, 0), {
      x: 0,
      y: 0,
      z: 0.004947796,
      w: 0.999987781,
    });

    let simplexCount = 0;
    let simplexIndex = 0;

    return {
      hasSolverControls: false,

      ui(panel) {
        // TODO(api): the GJK simplex history (b3Simplex per iteration) is not exposed, so the index only labels the count.
        panel.slider(
          'simplex index',
          simplexIndex,
          { min: 0, max: Math.max(simplexCount - 1, 1), step: 1 },
          (value) => {
            simplexIndex = Math.round(value);
          },
        );
      },

      draw(canvas) {
        const output = b3.collision.shapeDistance(
          { points: flatten(cornersA) },
          { points: flatten(cornersB) },
          invMulTransforms(transformA, transformB),
          false,
        );
        simplexCount = output.simplexCount;

        drawGroundGrid(canvas, 10);
        drawAxes(canvas, IDENTITY, 1);

        drawCorners(canvas, cornersA, Color.green, transformA);
        drawCorners(canvas, cornersB, Color.cyan, transformB);

        const pA = transformPoint(transformA, output.pointA);
        const pB = transformPoint(transformA, output.pointB);
        canvas.point(pA, Color.white);
        canvas.point(pB, Color.white);
        const normal = rotate(transformA.rotation, output.normal);
        canvas.line(pA, add(pA, normal), Color.white);

        canvas.text(
          `distance = ${g(output.distance)}, normal = ${g(normal.x)}, ${g(normal.y)}, ${g(normal.z)}`,
        );
        canvas.text(
          `simplex count = ${simplexCount}, iterations = ${output.iterations}`,
        );
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Shape Distance
// ---------------------------------------------------------------------------

const SHAPE_TYPES = ['point', 'segment', 'triangle', 'box'] as const;
const E_POINT = 0;
const E_SEGMENT = 1;
const E_TRIANGLE = 2;
const E_BOX = 3;

registerSample({
  category: 'Collision',
  name: 'Shape Distance',
  create(ctx) {
    ctx.camera.setView(-45, 10, 5, ZERO);
    const { b3 } = ctx;

    const point = v3(0, 0, 0);
    const segment: [Vec3, Vec3] = [v3(-0.5, 0, 0), v3(0.5, 0, 0)];
    const triangle: [Vec3, Vec3, Vec3] = [
      v3(-1.5, 0, 0),
      v3(1.5, 0, 0),
      v3(0, 0, 2),
    ];
    const boxCornerList = boxCorners(v3(0.125, 0.25, 0.5));

    const transformA = xf(ZERO);
    const transformB = xf(v3(0, 1, 0));

    const cache = b3.collision.createCache();
    let typeA = E_TRIANGLE;
    let typeB = E_BOX;
    let radiusA = 0;
    let radiusB = 0;

    let dragStart = v3(0, 0, 0);
    let basePosition = v3(0, 0, 0);
    let baseQuat: Quat = { x: 0, y: 0, z: 1, w: 0 };
    let rotateStart = 0;
    let dragging = false;
    let rotating = false;
    let showIndices = false;
    let useCache = false;
    let drawSimplex = false;
    let simplexCount = 0;
    let simplexIndex = 0;

    const proxyOf = (type: number, radius: number): ShapeProxy => {
      switch (type) {
        case E_POINT:
          return { points: flatten([point]), radius };
        case E_SEGMENT:
          return { points: flatten(segment), radius };
        case E_TRIANGLE:
          return { points: flatten(triangle) };
        default:
          return { points: flatten(boxCornerList) };
      }
    };

    const drawShape = (
      canvas: DebugCanvas,
      type: number,
      transform: Transform,
      radius: number,
      color: number,
    ): void => {
      switch (type) {
        case E_POINT:
          if (radius > 0)
            drawWireSphere(canvas, transform, point, radius, color);
          else canvas.point(transformPoint(transform, point), color);
          break;
        case E_SEGMENT:
          if (radius > 0) {
            drawWireCapsule(
              canvas,
              transform,
              segment[0],
              segment[1],
              radius,
              color,
            );
          } else {
            canvas.line(
              transformPoint(transform, segment[0]),
              transformPoint(transform, segment[1]),
              color,
            );
          }
          break;
        case E_TRIANGLE:
          drawTriangle(
            canvas,
            transform,
            triangle[0],
            triangle[1],
            triangle[2],
            color,
          );
          break;
        default:
          drawCorners(canvas, boxCornerList, color, transform);
      }
    };

    // the plane through the origin facing the picking ray
    const planePoint = (input: MouseInput): Vec3 => {
      const d = input.ray.direction;
      const c = input.ray.origin;
      return sub(c, scale(d, dot(c, d)));
    };

    return {
      hasSolverControls: false,

      ui(panel) {
        panel.combo('shape A', SHAPE_TYPES, typeA, (index) => {
          typeA = index;
          ctx.refreshUI();
        });
        if (typeA === E_POINT || typeA === E_SEGMENT) {
          panel.slider(
            'radius A',
            radiusA,
            { min: 0, max: 0.5, format: (v) => v.toFixed(2) },
            (value) => {
              radiusA = value;
            },
          );
        }
        panel.combo('shape B', SHAPE_TYPES, typeB, (index) => {
          typeB = index;
          ctx.refreshUI();
        });
        if (typeB === E_POINT || typeB === E_SEGMENT) {
          panel.slider(
            'radius B',
            radiusB,
            { min: 0, max: 0.5, format: (v) => v.toFixed(2) },
            (value) => {
              radiusB = value;
            },
          );
        }

        panel.separator();
        panel.checkbox('show indices', showIndices, (value) => {
          showIndices = value;
        });
        panel.checkbox('use cache', useCache, (value) => {
          useCache = value;
        });

        panel.separator();
        // TODO(api): simplex vertices (b3Simplex) are not exposed; 'draw simplex' shows the witness segment only.
        panel.checkbox('draw simplex', drawSimplex, (value) => {
          drawSimplex = value;
          simplexIndex = 0;
          ctx.refreshUI();
        });
        if (drawSimplex && simplexCount > 0) {
          panel.slider(
            'index',
            simplexIndex,
            { min: 0, max: Math.max(simplexCount - 1, 1), step: 1 },
            (value) => {
              simplexIndex = clamp(Math.round(value), 0, simplexCount - 1);
            },
          );
        }
      },

      mouseDown(input: MouseInput) {
        if (input.button !== 0 || input.alt) return false;
        if (!input.shift && !input.ctrl && !rotating) {
          dragging = true;
          dragStart = planePoint(input);
          basePosition = copy(transformB.position);
          return true;
        }
        if (input.shift && !input.ctrl && !dragging) {
          rotating = true;
          rotateStart = input.x;
          baseQuat = { ...transformB.rotation };
          return true;
        }
        return false;
      },

      mouseUp(input: MouseInput) {
        if (input.button === 0) {
          dragging = false;
          rotating = false;
        }
      },

      mouseMove(input: MouseInput) {
        if (dragging) {
          const p = planePoint(input);
          transformB.position = add(basePosition, sub(p, dragStart));
        } else if (rotating && ctx.camera.viewportWidth > 0) {
          const dx = (input.x - rotateStart) / ctx.camera.viewportWidth;
          const angle = clamp(2 * dx, -Math.PI, Math.PI);
          // upstream's GetForward points from the target toward the eye
          const view = ctx.camera.getViewDirection();
          const axis = v3(-view.x, -view.y, -view.z);
          transformB.rotation = normalizeQuat(
            mulQuat(axisAngle(axis, angle), baseQuat),
          );
        }
      },

      draw(canvas) {
        drawAxes(canvas, IDENTITY, 0.5);

        const proxyA = proxyOf(typeA, radiusA);
        const proxyB = proxyOf(typeB, radiusB);

        if (!useCache) cache.reset();
        const output = b3.collision.shapeDistance(
          proxyA,
          proxyB,
          invMulTransforms(transformA, transformB),
          radiusA > 0 || radiusB > 0,
          useCache ? cache : undefined,
        );
        simplexCount = output.simplexCount;

        drawShape(canvas, typeA, IDENTITY, radiusA, Color.cyan);
        drawShape(canvas, typeB, transformB, radiusB, Color.bisque);

        const pA = transformPoint(transformA, output.pointA);
        const pB = transformPoint(transformA, output.pointB);
        if (drawSimplex) {
          canvas.line(pA, pB, Color.white);
          canvas.point(pA, Color.lightGreen);
          canvas.point(pB, Color.lightBlue);
        } else {
          canvas.line(pA, pB, Color.dimGray);
          canvas.point(pA, Color.lightGreen);
          canvas.point(pB, Color.lightBlue);
          const normal = rotate(transformA.rotation, output.normal);
          canvas.line(pA, add(pA, scale(normal, 0.5)), Color.yellow);
        }

        if (showIndices) {
          // upstream labels each proxy vertex in 3D; the HUD lists them instead
          const list = (
            name: string,
            proxy: ShapeProxy,
            t: Transform,
          ): string => {
            const parts: string[] = [];
            for (let i = 0; i < proxy.points.length / 3; i++) {
              const p = transformPoint(
                t,
                v3(
                  proxy.points[3 * i] ?? 0,
                  proxy.points[3 * i + 1] ?? 0,
                  proxy.points[3 * i + 2] ?? 0,
                ),
              );
              parts.push(
                `${i}:(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`,
              );
            }
            return `${name} ${parts.join(' ')}`;
          };
          canvas.text(list('A', proxyA, transformA));
          canvas.text(list('B', proxyB, transformB));
        }

        canvas.text('mouse button 1: drag');
        canvas.text('mouse button 1 + shift: rotate');
        canvas.text(
          `distance = ${output.distance.toFixed(4)}, iterations = ${output.iterations}`,
        );
      },

      destroy() {
        cache.destroy();
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Time of Impact
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Time of Impact',
  create(ctx) {
    ctx.camera.setView(-90, 0, 10, ZERO);
    const { b3 } = ctx;

    const boxHalf = v3(0.02, 0.2, 0.04);
    const boxCornerList = boxCorners(boxHalf);
    const capsule = { c1: v3(0, -0.2, 0), c2: v3(0, 0.2, 0), radius: 0.02 };
    const triangle: [Vec3, Vec3, Vec3] = [
      v3(-4, 0, -4),
      v3(-4, 0, -8),
      v3(-8, 0, -8),
    ];

    const E_CAPSULE_T = 1;
    const E_TRIANGLE_T = 2;
    // upstream labels these 'point', 'segment', 'triangle', 'box' although the enum is box, capsule, triangle
    const labels = ['box', 'capsule', 'triangle'] as const;

    let typeA = E_TRIANGLE_T;
    let typeB = E_CAPSULE_T;

    const sweepA = {
      localCenter: v3(0, 0, 0),
      c1: v3(0, 0, 0),
      c2: v3(0, 0, 0),
      q1: { x: 0, y: 0, z: 0, w: 1 },
      q2: { x: 0, y: 0, z: 0, w: 1 },
    };
    const sweepB = {
      localCenter: v3(0, 0, 0),
      c1: v3(-4.0651207, 0.101333618, -7.87591267),
      c2: v3(-4.15895557, 0.0356027633, -7.69682646),
      q1: { x: -0.860495985, y: -0.272824734, z: 0.0724888667, w: 0.424097389 },
      q2: { x: -0.604184389, y: -0.424355596, z: 0.0457959622, w: 0.672894001 },
    };

    const proxyOf = (type: number) => {
      switch (type) {
        case E_CAPSULE_T:
          return b3.proxy.capsule(capsule.c1, capsule.c2, capsule.radius);
        case E_TRIANGLE_T:
          return { points: flatten(triangle) };
        default:
          return { points: flatten(boxCornerList) };
      }
    };

    const drawShape = (
      canvas: DebugCanvas,
      type: number,
      transform: Transform,
      color: number,
    ): void => {
      switch (type) {
        case E_CAPSULE_T: {
          drawWireCapsule(
            canvas,
            transform,
            capsule.c1,
            capsule.c2,
            capsule.radius,
            color,
          );
          const center = lerp(capsule.c1, capsule.c2, 0.5);
          drawAxes(
            canvas,
            xf(transformPoint(transform, center), transform.rotation),
            0.025,
          );
          break;
        }
        case E_TRIANGLE_T:
          drawTriangle(
            canvas,
            transform,
            triangle[0],
            triangle[1],
            triangle[2],
            color,
          );
          break;
        default:
          drawCorners(canvas, boxCornerList, color, transform);
      }
    };

    return {
      hasSolverControls: false,

      ui(panel) {
        panel.combo('shape A', labels, typeA, (index) => {
          typeA = index;
        });
        panel.combo('shape B', labels, typeB, (index) => {
          typeB = index;
        });
      },

      draw(canvas) {
        drawAxes(canvas, IDENTITY, 0.5);

        const output = b3.collision.timeOfImpact(
          proxyOf(typeA),
          proxyOf(typeB),
          sweepA,
          sweepB,
          1,
        );

        drawShape(canvas, typeA, IDENTITY, Color.cyan);

        const transform1 = b3.collision.getSweepTransform(sweepB, 0);
        const transform2 = b3.collision.getSweepTransform(sweepB, 1);

        // qr = inv(q1) * q2
        const qr = mulQuat(
          { x: -sweepB.q1.x, y: -sweepB.q1.y, z: -sweepB.q1.z, w: sweepB.q1.w },
          sweepB.q2,
        );
        const angle = 2 * Math.atan2(Math.hypot(qr.x, qr.y, qr.z), qr.w);
        canvas.text(`angle = ${g((180 * angle) / Math.PI)}`);

        drawShape(canvas, typeB, transform1, Color.lightGreen);
        drawShape(canvas, typeB, transform2, Color.lightCoral);

        if (output.fraction < 1) {
          const hit = b3.collision.getSweepTransform(sweepB, output.fraction);
          drawShape(canvas, typeB, hit, Color.lightCyan);
        }

        if (output.state === 'hit' || output.state === 'failed') {
          const p = output.point;
          canvas.line(p, add(p, scale(output.normal, 0.5)), Color.dimGray);
          canvas.point(p, Color.lightGreen);
        }

        switch (output.state) {
          case 'unknown':
            canvas.text('unknown');
            break;
          case 'failed':
            canvas.text('failed');
            break;
          case 'overlapped':
            canvas.text('overlapped');
            break;
          case 'hit':
            canvas.text(`hit ${g(output.fraction)}`);
            break;
          case 'separated':
            canvas.text('separated');
            break;
        }

        canvas.text(
          `iterations / push / root = ${output.distanceIterations} / ${output.pushBackIterations} / ${output.rootIterations}`,
        );
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Capsule Cast Ray
// ---------------------------------------------------------------------------

registerSample({
  category: 'Collision',
  name: 'Capsule Cast Ray',
  create(ctx) {
    ctx.camera.setView(120, 30, 20, v3(0, 1.5, 0));
    const { scene } = ctx;

    const body = scene.createBody({ type: 'kinematic' });
    scene.capsule(body, {
      center1: v3(0, 0, 0),
      center2: v3(0, 1, 0),
      radius: 0.5,
    });

    return {
      draw(canvas) {
        drawGroundGrid(canvas, 10);
        drawOriginAxes(canvas);

        const origin = v3(-1, 0.5, 0);
        const translation = v3(2, 0, 0);
        const result = body.castRay(origin, translation, {}, 1);

        const rayEnd = add(origin, translation);
        canvas.line(origin, rayEnd, Color.gray);
        canvas.point(origin, Color.green);
        canvas.point(rayEnd, Color.red);

        if (result.hit) canvas.point(result.point, Color.orange);
      },
    };
  },
});
