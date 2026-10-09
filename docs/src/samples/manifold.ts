// Ported from box3d/samples/sample_manifold.cpp
//
// Drag the cyan/green shape with the left mouse button (it moves in a plane
// facing the camera), Shift+left rotates it. Alt+drag orbits the camera.
// Upstream's 3D text labels (separation, feature pair, triangle vertex
// numbers) go to the HUD instead, one line per manifold point.
import type {
  Box3D,
  Manifold,
  Primitive,
  QueryCache,
  Transform,
  Vec3,
} from '@frsource/box3d-wasm';
import {
  AXIS_Y,
  AXIS_Z,
  add,
  cross,
  normalize,
  mulQuat,
  quatFromAxisAngle,
  rotate,
  scale,
  sub,
} from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import type {
  DebugCanvas,
  MouseInput,
  Panel,
  SampleContext,
} from '../framework/types.js';
import {
  Color,
  IDENTITY,
  ZERO,
  drawArrow,
  drawAxes,
  drawCorners,
  drawTriangle,
  drawWireCapsule,
  drawWireSphere,
  boxCorners,
  copy,
  f2,
  g,
  hex,
  invMulTransforms,
  normalizeQuat,
  transformPoint,
  v3,
} from './collision-helpers.js';

type BoxHull = ReturnType<Box3D['collision']['createBoxHull']>;

const MANUAL_FEATURES = ['auto', 'faceA', 'faceB', 'edgePair'] as const;

interface ManifoldSpec {
  name: string;
  view: [number, number, number, Vec3];
  transformA: Transform;
  transformB: Transform;
  /** A triangle (in A's frame) collided with a convex B: the manifold is then in B's frame. */
  triangle?: [Vec3, Vec3, Vec3];
  /** Creates the shapes; `hulls` is released with the sample. */
  build(b3: Box3D, hulls: BoxHull[]): ManifoldShapes;
}

interface ManifoldShapes {
  /** Primitive for A (unused for triangle samples) and B. */
  a?: Primitive;
  b: Primitive;
  drawA?(canvas: DebugCanvas, xf: Transform): void;
  drawB(canvas: DebugCanvas, xf: Transform): void;
  /** Extra drawing (axes). */
  extra?(canvas: DebugCanvas, a: Transform, b: Transform): void;
}

function defineManifold(spec: ManifoldSpec): void {
  registerSample({
    category: 'Manifold',
    name: spec.name,
    create(ctx: SampleContext) {
      ctx.camera.setView(...spec.view);
      const { b3 } = ctx;
      const hulls: BoxHull[] = [];
      const shapes = spec.build(b3, hulls);
      const xfA: Transform = {
        position: copy(spec.transformA.position),
        rotation: { ...spec.transformA.rotation },
      };
      const xfB: Transform = {
        position: copy(spec.transformB.position),
        rotation: { ...spec.transformB.rotation },
      };
      const triangle = spec.triangle;

      let cache: QueryCache | undefined;
      let useCache = false;
      let manualFeature = 0;
      let manifold: Manifold | undefined;

      let baseTranslation: Vec3 = { ...ZERO };
      let baseQuaternion = { ...IDENTITY.rotation };
      let origin: Vec3 = { ...ZERO };
      let baseX = 0;
      let baseY = 0;
      let tracking = false;
      let rotating = false;

      const collide = (): Manifold | undefined => {
        let queryCache: QueryCache | undefined;
        if (useCache) {
          cache ??= b3.collision.createCache();
          queryCache = cache;
        }
        if (triangle) {
          // convert the triangle into B's frame (b3Collide*Triangle works in the convex shape's frame)
          const xf = invMulTransforms(xfB, xfA);
          const [p0, p1, p2] = triangle.map((p) => transformPoint(xf, p));
          if (!p0 || !p1 || !p2) return undefined;
          return b3.collision.collide(
            { type: 'triangle', a: p0, b: p1, c: p2 },
            shapes.b,
            undefined,
            queryCache,
          );
        }
        if (!shapes.a) return undefined;
        return b3.collision.collide(
          shapes.a,
          shapes.b,
          invMulTransforms(xfA, xfB),
          queryCache,
        );
      };

      return {
        hasSolverControls: false,

        ui(panel: Panel) {
          panel.checkbox('Use cache', useCache, (value) => {
            useCache = value;
            ctx.refreshUI();
          });
          if (useCache) {
            // TODO(api): the SAT cache's manual feature (b3_manualFaceAxisA/B, b3_manualEdgePairAxis) is not exposed by QueryCache.
            panel.radio('', MANUAL_FEATURES, manualFeature, (index) => {
              manualFeature = index;
            });
          }
        },

        mouseDown(input: MouseInput) {
          if (input.button !== 0 || input.alt) return false;
          if (input.shift) {
            baseX = input.x;
            baseY = input.y;
            baseQuaternion = { ...xfB.rotation };
            rotating = true;
          } else {
            origin = add(input.ray.origin, scale(input.ray.direction, 10));
            baseTranslation = copy(xfB.position);
            tracking = true;
          }
          return true;
        },

        mouseUp() {
          tracking = false;
          rotating = false;
        },

        mouseMove(input: MouseInput) {
          if (tracking) {
            const p = add(input.ray.origin, scale(input.ray.direction, 10));
            xfB.position = add(baseTranslation, sub(p, origin));
          }
          if (rotating) {
            const qx = quatFromAxisAngle(AXIS_Y, 0.01 * (input.x - baseX));
            const qz = quatFromAxisAngle(AXIS_Z, 0.01 * (input.y - baseY));
            xfB.rotation = normalizeQuat(
              mulQuat(baseQuaternion, mulQuat(qx, qz)),
            );
          }
        },

        draw(canvas) {
          manifold = collide();

          canvas.text(`origin: ${g(origin.x)} ${g(origin.y)} ${g(origin.z)}`);
          canvas.text(`count = ${manifold?.points.length ?? 0}`);
          if (triangle) {
            canvas.text(`feature = ${manifold?.feature ?? 0}`);
          }

          drawAxes(canvas, IDENTITY, 1);

          if (triangle) {
            drawTriangle(
              canvas,
              xfA,
              triangle[0],
              triangle[1],
              triangle[2],
              Color.cyan,
            );
            const p1 = transformPoint(xfA, triangle[0]);
            const p2 = transformPoint(xfA, triangle[1]);
            const p3 = transformPoint(xfA, triangle[2]);
            const normal = normalize(cross(sub(p2, p1), sub(p3, p1)));
            const center = add(p1, scale(add(sub(p2, p1), sub(p3, p1)), 1 / 3));
            drawArrow(
              canvas,
              center,
              add(center, scale(normal, 0.5)),
              Color.mediumPurple,
            );
          } else {
            shapes.drawA?.(canvas, xfA);
          }
          shapes.drawB(canvas, xfB);
          shapes.extra?.(canvas, xfA, xfB);

          if (!manifold || manifold.points.length === 0) return;

          // the manifold lives in B's frame for triangle samples, in A's otherwise
          const frame = triangle ? xfB : xfA;
          const length = 0.5;
          const normal = rotate(frame.rotation, manifold.normal);
          manifold.points.forEach((mp, i) => {
            const point = transformPoint(frame, mp.point);
            canvas.line(point, add(point, scale(normal, length)), Color.white);
            canvas.point(point, mp.separation > 0 ? Color.white : Color.yellow);
            const sep = triangle
              ? f2(100 * mp.separation)
              : mp.separation.toFixed(3);
            const pair = mp.featurePair;
            canvas.text(
              `  [${i}] sep ${sep}  ${hex(pair & 0xff)}:${hex((pair >>> 8) & 0xff)} ${hex((pair >>> 16) & 0xff)}:${hex(pair >>> 24)}`,
            );
          });
        },

        destroy() {
          cache?.destroy();
          for (const hull of hulls) hull.release();
        },
      };
    },
  });
}

const y = (angle: number): ReturnType<typeof quatFromAxisAngle> =>
  quatFromAxisAngle(AXIS_Y, angle);

const at = (x: number, yy: number, z: number): Transform => ({
  position: v3(x, yy, z),
  rotation: { ...IDENTITY.rotation },
});

const DEFAULT_VIEW: [number, number, number, Vec3] = [35, 30, 50, v3(0, 5, 0)];

function sphereDraw(center: Vec3, radius: number, color: number) {
  return (canvas: DebugCanvas, xf: Transform): void =>
    drawWireSphere(canvas, xf, center, radius, color);
}

function capsuleDraw(c1: Vec3, c2: Vec3, radius: number, color: number) {
  return (canvas: DebugCanvas, xf: Transform): void =>
    drawWireCapsule(canvas, xf, c1, c2, radius, color);
}

function boxDraw(half: Vec3, color: number, offset: Vec3 = ZERO) {
  return (canvas: DebugCanvas, xf: Transform): void =>
    drawCorners(canvas, boxCorners(half, offset), color, xf);
}

// --- Sphere vs Sphere --------------------------------------------------------

defineManifold({
  name: 'Sphere vs Sphere',
  view: DEFAULT_VIEW,
  transformA: {
    position: v3(3.5, 0.5, 0),
    rotation: y(0.5 * Math.PI),
  },
  transformB: at(0, 1.5, 3.5),
  build() {
    const sphere = { center: v3(0.5, 0, -0.25), radius: 2 };
    const prim: Primitive = { type: 'sphere', ...sphere };
    return {
      a: prim,
      b: prim,
      drawA: sphereDraw(sphere.center, sphere.radius, Color.green),
      drawB: sphereDraw(sphere.center, sphere.radius, Color.cyan),
    };
  },
});

// --- Capsule vs Sphere -------------------------------------------------------

defineManifold({
  name: 'Capsule vs Sphere',
  view: DEFAULT_VIEW,
  transformA: at(0, 0, 0),
  transformB: at(-4, 0, 0),
  build() {
    const c1 = v3(-2, 0, 0);
    const c2 = v3(2, 0, 0);
    return {
      a: { type: 'capsule', center1: c1, center2: c2, radius: 1 },
      b: { type: 'sphere', center: ZERO, radius: 2 },
      drawA: capsuleDraw(c1, c2, 1, Color.cyan),
      drawB: sphereDraw(ZERO, 2, Color.green),
    };
  },
});

// --- Hull vs Sphere ----------------------------------------------------------

defineManifold({
  name: 'Hull vs Sphere',
  view: DEFAULT_VIEW,
  transformA: at(0, 0, 0),
  transformB: at(1.5, 0, 0),
  build(b3, hulls) {
    const hull = b3.collision.createBoxHull({ halfExtents: v3(2, 0.5, 0.5) });
    hulls.push(hull);
    return {
      a: { type: 'hull', hull },
      b: { type: 'sphere', center: ZERO, radius: 1 },
      drawA: boxDraw(v3(2, 0.5, 0.5), Color.cyan),
      drawB: sphereDraw(ZERO, 1, Color.green),
    };
  },
});

// --- Triangle vs Sphere ------------------------------------------------------

defineManifold({
  name: 'Triangle vs Sphere',
  view: [0, 30, 10, v3(0, 0, 0)],
  transformA: at(0, 0, 0),
  transformB: at(2, 0.5, 1),
  triangle: [v3(0, 0, 0), v3(4, 0, 4), v3(4, 0, 0)],
  build() {
    return {
      b: { type: 'sphere', center: ZERO, radius: 0.25 },
      drawB: sphereDraw(ZERO, 0.25, Color.green),
    };
  },
});

// --- Capsule vs Capsule ------------------------------------------------------

defineManifold({
  name: 'Capsule vs Capsule',
  view: DEFAULT_VIEW,
  transformA: at(1, 1, 0),
  transformB: at(-4, 1, 0),
  build() {
    const c1 = v3(-2, 0, 0);
    const c2 = v3(2, 0, 0);
    const prim: Primitive = {
      type: 'capsule',
      center1: c1,
      center2: c2,
      radius: 1,
    };
    return {
      a: prim,
      b: prim,
      drawA: capsuleDraw(c1, c2, 1, Color.green),
      drawB: capsuleDraw(c1, c2, 1, Color.cyan),
    };
  },
});

// --- Capsule vs Hull ---------------------------------------------------------

defineManifold({
  name: 'Capsule vs Hull',
  view: [0, 30, 5, v3(0, 0, 0)],
  transformA: at(0, 0, 0),
  // upstream starts B at a captured pose that exposed a bug
  transformB: {
    position: v3(1.58523774, 0.729615569, 0.451690674),
    rotation: {
      x: -0.00256555085,
      y: -0.0201825816,
      z: 0.126076236,
      w: 0.991811991,
    },
  },
  build(b3, hulls) {
    const hull = b3.collision.createBoxHull({ halfExtents: v3(1, 0.5, 0.5) });
    hulls.push(hull);
    const c1 = v3(-1, 0, 0);
    const c2 = v3(1, 0, 0);
    return {
      a: { type: 'hull', hull },
      b: { type: 'capsule', center1: c1, center2: c2, radius: 0.5 },
      drawA: boxDraw(v3(1, 0.5, 0.5), Color.cyan),
      drawB: capsuleDraw(c1, c2, 0.5, Color.green),
    };
  },
});

// --- Triangle vs Capsule -----------------------------------------------------

defineManifold({
  name: 'Triangle vs Capsule',
  view: [0, 30, 10, v3(0, 0, 0)],
  transformA: at(0, 0, 0),
  transformB: {
    position: v3(-0.5, 0.123778239, -0.5),
    rotation: {
      x: -0.15755935,
      y: 0.294042289,
      z: 0.821513653,
      w: -0.462417006,
    },
  },
  triangle: [v3(-4, 0, -4), v3(-4, 0, 0), v3(0, 0, 0)],
  build() {
    const c1 = v3(0, -0.2, 0);
    const c2 = v3(0, 0.2, 0);
    return {
      b: { type: 'capsule', center1: c1, center2: c2, radius: 0.05 },
      drawB: capsuleDraw(c1, c2, 0.05, Color.green),
      extra: (canvas, _a, b) => drawAxes(canvas, b, 0.1),
    };
  },
});

// --- Hull vs Hull ------------------------------------------------------------

defineManifold({
  name: 'Hull vs Hull',
  view: [0, 15, 4, v3(0, 0, 0)],
  transformA: at(0, 0, 0),
  transformB: at(0, 0, 0),
  build(b3, hulls) {
    const halfA = v3(0.5, 1, 1);
    const offsetA = v3(1, 0.5, 0);
    const hullA = b3.collision.createBoxHull({
      halfExtents: halfA,
      position: offsetA,
    });
    const hullB = b3.collision.createBoxHull({
      halfExtents: v3(0.5, 0.5, 0.5),
    });
    hulls.push(hullA, hullB);
    return {
      a: { type: 'hull', hull: hullA },
      b: { type: 'hull', hull: hullB },
      drawA: boxDraw(halfA, Color.green, offsetA),
      drawB: boxDraw(v3(0.5, 0.5, 0.5), Color.cyan),
    };
  },
});

// --- Triangle vs Hull --------------------------------------------------------

const SRC = 0.0254;

defineManifold({
  name: 'Triangle vs Hull',
  view: [0, 30, 3, v3(0, 0, 0)],
  transformA: at(0, 0, 0),
  transformB: at(-2.16650009, 0.912535489, 0),
  triangle: [
    v3(-1.82879996, -0.0253999997, -0.609600008),
    v3(-1.82879996, -0.0253999997, -0.406399995),
    v3(-1.79069996, 0, -0.406399995),
  ],
  build(b3, hulls) {
    const half = v3(16 * SRC, 36 * SRC, 16 * SRC);
    const hull = b3.collision.createBoxHull({ halfExtents: half });
    hulls.push(hull);
    return {
      b: { type: 'hull', hull },
      drawB: boxDraw(half, Color.green),
      extra: (canvas, _a, b) => drawAxes(canvas, b, 0.1),
    };
  },
});
