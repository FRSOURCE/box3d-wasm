// Ported from box3d/samples/sample_geometry.cpp
//
// These samples draw hulls and capsules rather than simulating bodies, so the
// world stays empty and every frame redraws the hull outlines (feature edges)
// through the debug canvas, the stand-in for upstream's DrawHull.
import type { Quat, Vec3 } from '@frsource/box3d-wasm';
import { mulQuat, quatFromAxisAngle } from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import {
  COLOR,
  drawAxes,
  drawCapsule,
  drawOutline,
  fmtG,
  type HullOutline,
  type HullResource,
  hullOutline,
  UpstreamRandom,
} from './mesh-common.js';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const WORLD_ORIGIN: Vec3 = ZERO;

const formatTenths = (value: number): string => value.toFixed(1);
const formatDegrees = (value: number): string => value.toFixed(0);

/** b3SafeScale */
const safeScale = (s: Vec3): Vec3 => {
  const fix = (v: number): number =>
    Math.abs(v) < 0.01 ? (v < 0 ? -0.01 : 0.01) : v;
  return { x: fix(s.x), y: fix(s.y), z: fix(s.z) };
};

const outlineOf = (hull: HullResource): HullOutline => {
  const geometry = hull.getGeometry();
  return hullOutline(geometry.positions, geometry.indices);
};

// ---- Box Hull ----------------------------------------------------------------
registerSample({
  category: 'Geometry',
  name: 'Box Hull',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, WORLD_ORIGIN);
    const { b3 } = ctx;

    const halfWidths = { x: 1, y: 0.5, z: 0.25 };
    const postScale = { x: 1, y: 1, z: 1 };
    const rotation = { x: 0, y: 0, z: 0 };
    const translation = { x: 0, y: 0, z: 0 };
    let transformQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
    let hull: HullResource | undefined;
    let box: HullResource | undefined;
    let hullLines: HullOutline | undefined;
    let boxLines: HullOutline | undefined;

    const updateRotation = (): void => {
      const rad = Math.PI / 180;
      const qx = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, rad * rotation.x);
      const qy = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, rad * rotation.y);
      const qz = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, rad * rotation.z);
      transformQ = mulQuat(qz, mulQuat(qy, qx));
    };

    const createHulls = (): void => {
      hull?.release();
      box?.release();
      hull = undefined;
      box = undefined;
      hullLines = undefined;
      boxLines = undefined;

      const scale = safeScale(postScale);
      const h = halfWidths;
      const q = transformQ;
      const rotate = (p: Vec3): Vec3 => {
        // transform point: rotate then translate
        const t = {
          x: q.y * p.z - q.z * p.y + q.w * p.x,
          y: q.z * p.x - q.x * p.z + q.w * p.y,
          z: q.x * p.y - q.y * p.x + q.w * p.z,
        };
        return {
          x: p.x + 2 * (q.y * t.z - q.z * t.y) + translation.x,
          y: p.y + 2 * (q.z * t.x - q.x * t.z) + translation.y,
          z: p.z + 2 * (q.x * t.y - q.y * t.x) + translation.z,
        };
      };
      const points: number[] = [];
      for (const [sx, sy, sz] of [
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, 1],
        [1, -1, -1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, 1],
        [-1, -1, -1],
      ] as const) {
        const p = rotate({ x: sx * h.x, y: sy * h.y, z: sz * h.z });
        points.push(scale.x * p.x, scale.y * p.y, scale.z * p.z);
      }
      try {
        hull = b3.createHull(points, 8);
        hullLines = outlineOf(hull);
      } catch {
        // degenerate sliders (a flattened scale) can fail hull creation, as upstream
      }
      try {
        box = b3.collision.createBoxHull({
          halfExtents: halfWidths,
          position: translation,
          rotation: transformQ,
          scale: postScale,
        });
        boxLines = outlineOf(box);
      } catch {
        // see above
      }
    };

    updateRotation();
    createHulls();

    return {
      hasSolverControls: false,
      ui(panel) {
        const vec = (
          name: string,
          target: Vec3,
          min: number,
          max: number,
          format: (value: number) => string,
          after: () => void,
        ): void => {
          for (const axis of ['x', 'y', 'z'] as const) {
            panel.slider(
              `${name} ${axis}`,
              target[axis],
              { min, max, format },
              (value) => {
                target[axis] = value;
                after();
                createHulls();
              },
            );
          }
        };
        vec('h', halfWidths, 0.1, 2, formatTenths, () => undefined);
        vec('c', translation, -2, 2, formatTenths, () => undefined);
        vec('r', rotation, -180, 180, formatDegrees, updateRotation);
        vec('s', postScale, -2, 2, formatTenths, () => undefined);
        panel.button('Refresh', createHulls);
      },
      draw(canvas) {
        if (hullLines) drawOutline(canvas, hullLines, COLOR.yellow);
        if (boxLines) drawOutline(canvas, boxLines, COLOR.cyan);
        drawAxes(canvas, ZERO, 1);
      },
      destroy() {
        hull?.release();
        box?.release();
      },
    };
  },
});

// ---- Hull ----------------------------------------------------------------------
registerSample({
  category: 'Geometry',
  name: 'Hull',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, WORLD_ORIGIN);
    const { b3 } = ctx;

    // this fails because it generates too many edges
    // prettier-ignore
    const raw = [
      -3.9866004, 75.4595108, 28.3783073, -13.1079493, 73.080368, 28.296587,
      -18.6611958, 72.0040894, 16.9292431, 4.82537603, 79.2908554, 22.2369995,
      -12.7315464, 79.2187576, 2.94275379, -21.806488, 78.7758865, 0.985544085,
      -27.7619209, 73.3481522, 11.9647141, -22.3994541, 72.2203826, 21.4116211,
      -25.3797474, 76.7417755, 27.9124985, -22.7552319, 77.0559006, 29.4733639,
      -6.81736374, 78.3484726, 36.8649979, 3.62397718, 85.5270843, 29.2077713,
      7.90363788, 84.121231, 18.2612896, -12.3809223, 84.5280533, -0.43230924,
      5.83599472, 95.2908325, 4.4423275, -22.5541401, 89.9094467, -4.87791252,
      -43.9060402, 78.5287094, 1.32877088, -42.6015129, 76.7829742, 7.67437983,
      -25.735527, 78.1218796, 27.908411, -23.5183544, 77.6326675, 29.1178799,
      2.0977366, 100.430191, 34.3929482, 1.09743047, 103.952553, 35.5656395,
      8.50175952, 96.0529861, 8.73674774, 2.52570295, 103.303696, 32.2314339,
      -20.099781, 89.4923248, -4.15468454, 2.8092947, 123.516098, -1.12693477,
      -43.9318161, 79.1106186, 1.39006138, -23.358511, 90.9599686, -4.25683546,
      2.10804915, 123.603645, -1.38435471, -44.1329117, 78.7192383, 1.54941654,
      -42.4365158, 77.725357, 8.14835929, -43.204792, 77.5811691, 7.14319515,
      -44.17416, 78.7810363, 2.50146222, -32.8975143, 99.1221771, 7.55588436,
      -0.624746263, 110.070351, 32.7381058, 0.00431228895, 109.14341, 33.6411133,
      -0.58865279, 122.980537, 16.6554794, 2.18539238, 124.324593, -0.620266676,
      -1.02177501, 123.881721, 16.8230057, 1.9842999, 124.571777, -0.321986318,
      1.86570692, 124.365791, -0.599836588, -43.591507, 78.1373291, 6.1135149,
      -43.8235397, 79.2239074, 3.48619604, -43.591507, 78.50811, 5.54555655,
      1.21086729, 124.49453, 1.07543683, -1.86223853, 124.195847, 15.6257992,
      -1.46520972, 124.355492, 16.9864483, 1.654302, 124.612976, 0.621887207,
    ];
    const points = raw.map((v) => 0.01 * v);

    let hull: HullResource | undefined;
    let outline: HullOutline | undefined;
    try {
      hull = b3.createHull(points, 16);
      outline = outlineOf(hull);
    } catch {
      // upstream's hull builder fails on this point cloud as well
    }

    return {
      draw(canvas) {
        if (outline) drawOutline(canvas, outline, COLOR.yellow);
        drawAxes(canvas, ZERO, 1);
      },
      destroy() {
        hull?.release();
      },
    };
  },
});

// ---- Hull Reduction -----------------------------------------------------------
registerSample({
  category: 'Geometry',
  name: 'Hull Reduction',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, WORLD_ORIGIN);
    const { b3 } = ctx;

    const capacity = 128;
    let type: 'box' | 'sphere' = 'sphere';
    let count = 16;
    let points = new Float32Array(capacity * 3);
    let hull: HullResource | undefined;
    let outline: HullOutline | undefined;

    const generatePoints = (): void => {
      const random = new UpstreamRandom(42);
      points = new Float32Array(capacity * 3);
      if (type === 'box') {
        const lower = { x: -2, y: -2, z: -2 };
        const upper = { x: 2, y: 2, z: 2 };
        const a = 0.001;
        const noiseLo = { x: -a, y: -a, z: -a };
        const noiseHi = { x: a, y: a, z: a };
        for (let i = 0; i < capacity; i++) {
          const p = random.vec3(lower, upper);
          const f = random.vec3(noiseLo, noiseHi);
          points.set(
            [
              Math.min(1, Math.max(-1, p.x)) + f.x,
              Math.min(1, Math.max(-1, p.y)) + f.y,
              Math.min(1, Math.max(-1, p.z)) + f.z,
            ],
            3 * i,
          );
        }
      } else {
        for (let i = 0; i < capacity; i++) {
          const p = random.unitVector();
          points.set([p.x, p.y, p.z], 3 * i);
        }
      }
    };

    const generateHull = (): void => {
      hull?.release();
      hull = undefined;
      outline = undefined;
      try {
        hull = b3.createHull(points, count);
        outline = outlineOf(hull);
      } catch {
        // the engine rejected the cloud
      }
    };

    generatePoints();
    generateHull();

    return {
      hasSolverControls: false,
      ui(panel) {
        panel.radio(
          'Type',
          ['Box', 'Sphere'],
          type === 'box' ? 0 : 1,
          (index) => {
            type = index === 0 ? 'box' : 'sphere';
            generatePoints();
            generateHull();
          },
        );
        panel.slider(
          'count',
          count,
          { min: 4, max: capacity, step: 1 },
          (value) => {
            count = Math.round(value);
            generateHull();
          },
        );
      },
      draw(canvas) {
        if (outline) {
          drawOutline(canvas, outline, COLOR.yellow);
          canvas.text(
            `v/f/e = ${outline.vertexCount}/${outline.faceCount}/${outline.edgeCount}`,
          );
        }
        drawAxes(canvas, ZERO, 1);
      },
      destroy() {
        hull?.release();
      },
    };
  },
});

// ---- Hull Transform -----------------------------------------------------------
registerSample({
  category: 'Geometry',
  name: 'Hull Transform',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, WORLD_ORIGIN);
    const { b3 } = ctx;

    const original = b3.createCylinder(1, 0.5, 0, 9);
    const originalOutline = outlineOf(original);
    const scale = { x: 1, y: 1, z: 1 };
    const angles = { x: 0, y: 0, z: 0 };
    const offset = { x: 0, y: 0, z: 0 };
    let hull: HullResource | undefined;
    let hullOutlineLines: HullOutline | undefined;
    let volumes: { original: number; hull: number } = { original: 0, hull: 0 };

    const volumeOf = (h: HullResource): number => {
      try {
        return b3.collision.computeMass({ type: 'hull', hull: h }, 1).mass;
      } catch {
        return 0;
      }
    };

    const updateHull = (): void => {
      hull?.release();
      hull = undefined;
      hullOutlineLines = undefined;
      const rad = Math.PI / 180;
      const qx = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, angles.x * rad);
      const qy = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, angles.y * rad);
      const qz = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, angles.z * rad);
      const rotation = mulQuat(qz, mulQuat(qy, qx));
      try {
        hull = original.transformed({
          position: offset,
          rotation,
          scale,
        });
        hullOutlineLines = outlineOf(hull);
        volumes = { original: volumes.original, hull: volumeOf(hull) };
      } catch {
        // a scale component of zero cannot be built
      }
    };

    volumes.original = volumeOf(original);
    updateHull();

    return {
      hasSolverControls: false,
      ui(panel) {
        const slider = (
          label: string,
          target: Vec3,
          axis: 'x' | 'y' | 'z',
          min: number,
          max: number,
          format: (value: number) => string,
        ): void => {
          panel.slider(label, target[axis], { min, max, format }, (value) => {
            target[axis] = value;
            updateHull();
          });
        };
        slider('sx', scale, 'x', -2, 2, formatTenths);
        slider('sy', scale, 'y', -2, 2, formatTenths);
        slider('sz', scale, 'z', -2, 2, formatTenths);
        slider('rx', angles, 'x', -180, 180, formatDegrees);
        slider('ry', angles, 'y', -180, 180, formatDegrees);
        slider('rz', angles, 'z', -180, 180, formatDegrees);
        slider('px', offset, 'x', -1, 1, formatTenths);
        slider('py', offset, 'y', -1, 1, formatTenths);
        slider('pz', offset, 'z', -1, 1, formatTenths);
      },
      draw(canvas) {
        drawOutline(canvas, originalOutline, COLOR.green, {
          x: -2,
          y: 0,
          z: 0,
        });
        if (hullOutlineLines) {
          drawOutline(canvas, hullOutlineLines, COLOR.yellow, {
            x: 2,
            y: 0,
            z: 0,
          });
        }
        drawAxes(canvas, ZERO, 1);

        // area, volume and inner radius come from the hull's triangles (the engine's
        // b3HullData fields are not exposed): the inner radius is measured from the centroid
        canvas.text(
          `hull 1: area = ${fmtG(originalOutline.surfaceArea)}, volume = ${fmtG(volumes.original)}, radius = ${fmtG(originalOutline.innerRadius)}`,
        );
        if (hullOutlineLines) {
          canvas.text(
            `hull 2: area = ${fmtG(hullOutlineLines.surfaceArea)}, volume = ${fmtG(volumes.hull)}, radius = ${fmtG(hullOutlineLines.innerRadius)}`,
          );
        }
      },
      destroy() {
        original.release();
        hull?.release();
      },
    };
  },
});

// ---- Capsule Mass ----------------------------------------------------------------
registerSample({
  category: 'Geometry',
  name: 'Capsule Mass',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, WORLD_ORIGIN);
    const { b3 } = ctx;

    const radius = 1;
    const length = 2;
    const maxSides = 6;
    let sides = 6;
    const capsule = {
      center1: { x: -0.5 * length, y: 0, z: 0 },
      center2: { x: 0.5 * length, y: 0, z: 0 },
      radius,
    };
    const box = b3.collision.createBoxHull({
      halfExtents: { x: radius + 0.5 * length, y: radius, z: radius },
    });
    const boxOutline = outlineOf(box);
    let hull: HullResource | undefined;
    let hullLines: HullOutline | undefined;

    const createCapsuleHull = (n: number): void => {
      hull?.release();
      hull = undefined;
      hullLines = undefined;
      if (n > maxSides) return;

      const count = 2 * n * n;
      const d = Math.PI / (n - 1);
      const points = new Float32Array(count * 3);
      let index = 0;
      let angle1 = -0.5 * Math.PI;
      for (let i = 0; i < n; i++) {
        const s1 = Math.sin(angle1);
        const c1 = Math.cos(angle1);
        let angle2 = -0.5 * Math.PI;
        for (let j = 0; j < n; j++) {
          points[3 * index] = 1 + radius * c1;
          points[3 * index + 1] = radius * s1 * Math.cos(angle2);
          points[3 * index + 2] = radius * s1 * Math.sin(angle2);
          angle2 += d;
          index += 1;
        }
        angle1 += d;
      }
      angle1 = 0.5 * Math.PI;
      for (let i = 0; i < n; i++) {
        const s1 = Math.sin(angle1);
        const c1 = Math.cos(angle1);
        let angle2 = -0.5 * Math.PI;
        for (let j = 0; j < n; j++) {
          points[3 * index] = -1 + radius * c1;
          points[3 * index + 1] = radius * s1 * Math.cos(angle2);
          points[3 * index + 2] = radius * s1 * Math.sin(angle2);
          angle2 += d;
          index += 1;
        }
        angle1 += d;
      }

      try {
        // the engine caps hulls at 128 vertices; the point count is clamped to that
        hull = b3.createHull(points, Math.min(128, count));
        hullLines = outlineOf(hull);
      } catch {
        // upstream asserts on this case; here the hull is simply not drawn
      }
    };
    createCapsuleHull(sides);

    return {
      hasSolverControls: false,
      ui(panel) {
        panel.slider(
          'sides',
          sides,
          { min: 3, max: maxSides, step: 1 },
          (value) => {
            sides = Math.round(value);
            createCapsuleHull(sides);
          },
        );
      },
      draw(canvas) {
        drawCapsule(
          canvas,
          capsule.center1,
          capsule.center2,
          radius,
          COLOR.aqua,
        );
        drawOutline(canvas, boxOutline, COLOR.blueViolet);
        if (hullLines) drawOutline(canvas, hullLines, COLOR.yellow);
        drawAxes(canvas, ZERO, 1);

        if (hull) {
          const lower = b3.collision.computeMass({ type: 'hull', hull }, 1);
          const mid = b3.collision.computeMass(
            { type: 'capsule', ...capsule },
            1,
          );
          const upper = b3.collision.computeMass(
            { type: 'hull', hull: box },
            1,
          );
          canvas.text(`mass hull:    ${fmtG(lower.mass)}`);
          canvas.text(`mass capsule: ${fmtG(mid.mass)}`);
          canvas.text(`mass box:     ${fmtG(upper.mass)}`);
          canvas.text('');
          canvas.text(`Ixx hull:    ${fmtG(lower.inertia.cx.x)}`);
          canvas.text(`Ixx capsule: ${fmtG(mid.inertia.cx.x)}`);
          canvas.text(`Ixx box:     ${fmtG(upper.inertia.cx.x)}`);
          canvas.text('');
          canvas.text(`Iyy hull:    ${fmtG(lower.inertia.cy.y)}`);
          canvas.text(`Iyy capsule: ${fmtG(mid.inertia.cy.y)}`);
          canvas.text(`Iyy box:     ${fmtG(upper.inertia.cy.y)}`);
          canvas.text('');
          canvas.text(`Izz hull:    ${fmtG(lower.inertia.cz.z)}`);
          canvas.text(`Izz capsule: ${fmtG(mid.inertia.cz.z)}`);
          canvas.text(`Izz box:     ${fmtG(upper.inertia.cz.z)}`);
        }
      },
      destroy() {
        hull?.release();
        box.release();
      },
    };
  },
});
