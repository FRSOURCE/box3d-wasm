// Ported from box3d/samples/sample_issues.cpp
import type { Body, Mesh, Vec3 } from '@frsource/box3d-wasm';
import type { MeshData } from '../framework/builder.js';
import { registerSample } from '../framework/registry.js';
import {
  COLOR,
  drawAxes,
  drawOutline,
  type HullOutline,
  type HullResource,
  hullOutline,
  loadTempMesh,
  type TempMesh,
  wrapMesh,
} from './mesh-common.js';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

// ---- Dump Loader -------------------------------------------------------------
// Upstream #includes data/dumps/single_box/box3d_dump.inl, a recorded world
// that is compiled into the sample. That recording (one dynamic cube resting on
// a ground slab) is reproduced here by hand. TODO(api): there is no world
// recorder, so other dumps cannot be loaded.
registerSample({
  category: 'Issues',
  name: 'Dump Loader',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world } = ctx;

    world.setGravity({ x: 0, y: -10, z: 0 });

    const box = (x: number, y: number, z: number): number[] => {
      const points: number[] = [];
      for (const [sx, sy, sz] of [
        [1, 1, 1],
        [-1, 1, 1],
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, -1, -1],
        [1, -1, -1],
      ] as const) {
        points.push(sx * x, sy * y, sz * z);
      }
      return points;
    };

    const cube = scene.createBody({
      name: 'cube',
      type: 'dynamic',
      position: { x: -7.98573353e-7, y: 0.499929696, z: -9.86034479e-7 },
      rotation: {
        x: -4.03613463e-8,
        y: 0.825855613,
        z: 4.68083634e-8,
        w: 0.563881755,
      },
      linearVelocity: { x: 2.47239775e-8, y: -1.7695136e-8, z: 8.65693384e-9 },
      angularVelocity: {
        x: 1.73163173e-8,
        y: -4.2026933e-15,
        z: -4.94549042e-8,
      },
      linearDamping: 0,
      angularDamping: 0,
      enableSleep: true,
      isAwake: true,
      gravityScale: 1,
    });
    scene.hull(cube, {
      points: box(0.5, 0.5, 0.5),
      maxVertices: 8,
      density: 1000,
      isSensor: false,
      filter: { categoryBits: 1, groupIndex: 0 },
      friction: 0.600000024,
      restitution: 0,
      rollingResistance: 0,
    });

    const ground = scene.createBody({
      name: 'ground',
      type: 'static',
      position: { x: 0, y: -1, z: 0 },
      linearDamping: 0,
      angularDamping: 0,
      enableSleep: true,
      isAwake: false,
      gravityScale: 1,
    });
    scene.hull(ground, {
      points: box(15, 1, 15),
      maxVertices: 8,
      density: 1000,
      isSensor: false,
      filter: { categoryBits: 1, groupIndex: 0 },
      friction: 0.600000024,
      restitution: 0,
      rollingResistance: 0,
    });

    return {};
  },
});

// ---- Crash -------------------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 'Crash',
  create(ctx) {
    ctx.camera.setView(45, 30, 15, { x: 0, y: 2, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridMesh = b3.createGridMesh(20, 20, 2, 0, true);
    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.mesh(ground, wrapMesh(gridMesh));

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

    return {
      ui(panel) {
        panel.button('Add Joint', () => {
          world.createWeldJoint(body1, body2);
        });
      },
      destroy() {
        gridMesh.release();
      },
    };
  },
});

// ---- Multiple Prismatic --------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 'Multiple Prismatic',
  create(ctx) {
    ctx.camera.setView(0, 0, 25, { x: 0, y: 5, z: 0 });
    const { scene, world } = ctx;

    let previous: Body = scene.createBody({});
    let anchorA: Vec3 = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < 6; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 0.6 + 1.2 * i, z: 0 },
      });
      scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });

      world.createPrismaticJoint(previous, body, {
        localFrameA: { position: anchorA },
        localFrameB: { position: { x: 0, y: -0.6, z: 0 } },
        drawScale: 2,
        constraintHertz: 240,
        lowerTranslation: -6,
        upperTranslation: 6,
        enableLimit: true,
      });

      previous = body;
      anchorA = { x: 0, y: 0.6, z: 0 };
    }

    // huge mouse force
    ctx.mouseForceScale = 1000000;

    return {};
  },
});

// ---- Hull Crash ----------------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 'Hull Crash',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, ORIGIN);
    const { b3 } = ctx;

    // The first two candidate point sets of upstream are disabled (#if 0 / #else)
    // prettier-ignore
    const raw = [
      100.0, -142.292389, 130.826111,
      99.5354385, -71.3011093, 130.826111,
      99.5930862, -80.1112213, -100.0,
      100.0, -142.292389, -100.0,
      99.5930862, -80.1112213, 130.826111,
    ];
    const points = raw.map((v) => 0.01 * v);
    const count = points.length / 3;

    let hull: HullResource | undefined;
    let outline: HullOutline | undefined;
    try {
      hull = b3.createHull(points, count);
      const geometry = hull.getGeometry();
      outline = hullOutline(geometry.positions, geometry.indices);
    } catch {
      // a failed build is what this sample is about: the raw points are drawn instead
    }

    return {
      draw(canvas) {
        if (outline) {
          drawOutline(canvas, outline, COLOR.yellow);
        } else {
          for (let i = 0; i < count; i++) {
            canvas.point(
              {
                x: points[3 * i] ?? 0,
                y: points[3 * i + 1] ?? 0,
                z: points[3 * i + 2] ?? 0,
              },
              COLOR.white,
            );
          }
        }
        drawAxes(canvas, ORIGIN, 1);
      },
      destroy() {
        hull?.release();
      },
    };
  },
});

// ---- Convex Jitter -------------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 'Convex Jitter',
  create(ctx) {
    ctx.camera.setView(0, 15, 10, { x: 0, y: 2, z: 0 });
    const { scene } = ctx;

    scene.groundBox(10);

    const s = 0.01;
    // points are recorded z up; upstream swizzles them to y up
    const swizzle = (flat: number[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < flat.length; i += 3) {
        out.push(
          s * (flat[i] ?? 0),
          s * (flat[i + 2] ?? 0),
          s * (flat[i + 1] ?? 0),
        );
      }
      return out;
    };

    {
      const b = { x: -459.292877, y: 217.398331, z: 1.00115335 };
      const body = scene.createBody({
        position: { x: s * b.x, y: s * b.z + 2, z: s * b.y },
        rotation: { x: 0, y: -0.707106769, z: 0, w: 0.707106769 },
      });
      // prettier-ignore
      const points = swizzle([
        -44.8770714, -91.6598053, -1.92012548,
        -92.5001831, 51.0151291, 15.8006573,
        -91.0282211, -9.44371605, 15.6148796,
        90.2375641, 77.3870087, 15.9356089,
        -85.5353241, 91.3750992, -1.36629653,
        88.9092178, -87.2975464, -1.86754704,
        83.7932816, -89.8572235, 15.4168339,
        87.0243988, 88.9776535, -1.32423306,
        -91.6564941, -85.4949493, 15.3782759,
        -90.2922516, -87.2074127, -1.92012548,
        -87.294487, 89.9510498, 15.9215889,
        79.2338104, 89.9690781, 15.972414,
        -91.6744461, 81.0823212, -1.39959598,
        90.3452759, -76.445961, 15.4588966,
        -87.4021912, -89.2263107, 15.3677588,
        76.3258057, 92.0059967, 1.82873762,
      ]);
      scene.hull(body, { points, maxVertices: 16 });
    }

    {
      const b = { x: -402.321838, y: 157.310364, z: 16.816925 };
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: s * b.x, y: s * b.z + 2, z: s * b.y },
        rotation: { x: 0, y: -0.00152086187, z: 0, w: 0.999998868 },
      });
      // prettier-ignore
      const points = swizzle([
        29.5, 17.1488495, 0.175081104,
        29.5, -17.2990532, 0.125,
        29.4840164, -17.3057766, 24.0200863,
        29.4840164, 17.164835, 24.1781254,
        -29.134552, 17.5529804, 0.125,
        -29.134552, 17.5529804, 23.7899799,
        -29.144104, 16.9679585, 24.375,
        -29.134552, -17.2990532, 24.375,
        -29.134552, -17.2990532, 0.175081253,
        29.0720215, 17.5529785, 0.125,
        29.085907, 17.5629406, 23.8120594,
        29.1401348, -17.2990532, 24.375,
        29.1123581, 16.972229, 24.402771,
        29.3944912, 17.2543602, 24.1206398,
        -29.134552, -17.2990532, 24.075943,
        -29.134552, -16.9722252, 24.402771,
        29.1123619, -16.9722271, 24.4027729,
        29.5, 17.3429642, 24.0,
      ]);
      scene.hull(body, { points, maxVertices: 18, rollingResistance: 0.1 });
    }

    return {};
  },
});

// ---- s&box mover ---------------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 's&box mover',
  create(ctx) {
    ctx.camera.setView(45, 30, 12, ORIGIN);
    const { scene, b3 } = ctx;

    {
      const ground = scene.createBody({ position: { x: -10, y: 0, z: -10 } });
      // b3CreateGrid( 40, 40, { 0.5, 1, 0.5 }, false )
      const count = 40;
      const data = scene.heightFieldData({
        heights: new Float32Array(count * count),
        countX: count,
        countZ: count,
        scale: { x: 0.5, y: 1, z: 0.5 },
        minHeight: -256,
        maxHeight: 256,
      });
      scene.heightField(ground, data);
    }

    const platform: Mesh = b3.createPlatformMesh(
      { x: 0, y: 0.5, z: 0 },
      1,
      2,
      5,
    );
    {
      const ground = scene.createBody({});
      scene.mesh(ground, wrapMesh(platform));
    }

    {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 3.5, z: 0 },
        motionLocks: { angularX: true, angularY: true, angularZ: true },
        enableContactRecycling: false,
      });
      scene.box(body, { hx: 0.25, hy: 1, hz: 0.25 });
    }

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 1.1, z: 0 }, 3);
      },
      destroy() {
        platform.release();
      },
    };
  },
});

// ---- Capsule Mesh ----------------------------------------------------------------
registerSample({
  category: 'Issues',
  name: 'Capsule Mesh',
  create(ctx) {
    ctx.camera.setView(20, 10, 30, { x: 0, y: 2, z: 0 });
    const { scene, b3 } = ctx;

    let disposed = false;
    let building: Mesh | undefined;

    {
      const ground = scene.createBody({});
      scene.box(ground, { hx: 50, hy: 0.1, hz: 50 });
    }

    const build = (temp: TempMesh | undefined): void => {
      if (disposed) return;
      if (temp) {
        building = b3.createMesh({
          vertices: temp.vertices,
          indices: temp.indices,
          materialIndices: temp.materialIndices,
          weld: true,
          weldTolerance: 0.002,
          identifyEdges: true,
        });
      } else {
        // asset unavailable: a hollow hut stands in for the building
        building = b3.createHollowBoxMesh(
          { x: 0, y: 3, z: 0 },
          { x: 4, y: 3, z: 3 },
        );
      }
      const body = scene.createBody({ position: { x: 0, y: 0.1, z: 0 } });
      scene.mesh(body, wrapMesh(building));
    };
    void loadTempMesh('building.obj', 1, false).then(build);

    {
      // locked capsule, same setup as a player controller body
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 4, z: 10 },
        motionLocks: { angularX: true, angularY: true, angularZ: true },
        enableSleep: false,
        enableContactRecycling: false,
        color: COLOR.magenta,
      });
      scene.capsule(body, {
        center1: { x: 0, y: -0.5, z: 0 },
        center2: { x: 0, y: 0.5, z: 0 },
        radius: 0.3,
        friction: 0.3,
        customColor: COLOR.magenta,
      });
    }

    return {
      destroy() {
        disposed = true;
        building?.release();
      },
    };
  },
});

// ---- s&box Ghost Collisions ------------------------------------------------------
// Reproduces s&box rigid body character ghost collisions on a FLAT floor.
//
// The s&box player is a fixed rotation dynamic body (zero radius box hull) moved by setting
// velocity. The floor here is modeled on an s&box map area that ghosts badly: concrete slabs
// and a run of parallel chamfered beams over deep pits. Every walkable vertex is at exactly
// y = 0 - there is nothing to climb and nothing to trip on. The only mesh features are AT or
// BELOW the walkable plane: chamfer facets sloping down from beam tops, pit walls and floors,
// T-junction seams between tiles tessellated at different resolutions, and a chunk seam where
// two mesh shapes meet (separate contact pairs, like s&box world chunks).
//
// Walking back and forth still launches the body upward (60-190 inch/s at run speed). No shape
// casts, no step up, no ground snapping - any upward velocity spike is a ghost collision from
// speculative hull vs triangle contacts against below-plane geometry.

// s&box works in inches: 1 unit = 0.0254 m (40 units per meter)
const SRC = 0.0254;

// Floor layout (s&box inches)
const HALF_LENGTH_U = 256; // strip half length along x
const HALF_WIDTH_U = 64; // strip half width along z
const TILE_SIZE_U = 32; // slab tile stride

// Beam section: beams run along z, the character walks along x across them.
// Tops are 12 wide with 1.5 chamfers, pits between are 10 wide and 24 deep.
// The 16 wide hull always spans the 13 gap between flat tops.
const BEAM_PITCH_U = 22;
const BEAM_WIDTH_U = 12;
const CHAMFER_WIDTH_U = 1.5;
const CHAMFER_DROP_U = 1;
const PIT_DEPTH_U = 24;
const BEAM_COUNT = 9;
const BEAM_REGION_0 = -94; // first beam start
const BEAM_REGION_1 = 94; // last beam end

// Character (s&box player: 16 wide zero radius box hull, 72 tall, mass 500)
const BODY_HALF_WIDTH = 16 * SRC;
const BODY_HALF_HEIGHT = 36 * SRC;
const CHARACTER_MASS = 500;

const WALK_RANGE = 3.5; // turn around beyond +/- this x (meters)
const LAUNCH_THRESHOLD = 0.5; // upward m/s counted as a ghost launch (~20 inch/s)
const MARKER_CAPACITY = 64;

/** Deterministic integer hash for tile tessellation selection */
function hash(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

class FloorBuilder {
  readonly vertices: number[] = [];
  readonly indices: number[] = [];

  emitTriangle(a: Vec3, b: Vec3, c: Vec3): void {
    const base = this.vertices.length / 3;
    this.vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.indices.push(base, base + 1, base + 2);
  }

  /** Horizontal patch at height y spanning [x0,x1]x[z0,z1] (inches), normal +y */
  emitPatch(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    cell: number,
  ): void {
    if (x1 - x0 < 0.01) return;

    const countX = Math.trunc((x1 - x0) / cell + 0.99);
    const countZ = Math.trunc((z1 - z0) / cell + 0.99);

    for (let ix = 0; ix < countX; ix++) {
      for (let iz = 0; iz < countZ; iz++) {
        const cx0 = x0 + ((x1 - x0) * ix) / countX;
        const cx1 = x0 + ((x1 - x0) * (ix + 1)) / countX;
        const cz0 = z0 + ((z1 - z0) * iz) / countZ;
        const cz1 = z0 + ((z1 - z0) * (iz + 1)) / countZ;

        const a = { x: SRC * cx0, y: SRC * y, z: SRC * cz0 };
        const b = { x: SRC * cx1, y: SRC * y, z: SRC * cz0 };
        const c = { x: SRC * cx1, y: SRC * y, z: SRC * cz1 };
        const d = { x: SRC * cx0, y: SRC * y, z: SRC * cz1 };

        // Alternate the split diagonal like typical cooked map data
        if ((ix + iz) & 1) {
          this.emitTriangle(a, d, c);
          this.emitTriangle(a, c, b);
        } else {
          this.emitTriangle(a, d, b);
          this.emitTriangle(b, d, c);
        }
      }
    }
  }

  /** Sloped strip from edge (xLow, yLow) to edge (xHigh, yHigh) spanning the full z width */
  emitSlope(
    xLow: number,
    yLow: number,
    xHigh: number,
    yHigh: number,
    zCell: number,
  ): void {
    const countZ = Math.trunc((2 * HALF_WIDTH_U) / zCell + 0.99);
    for (let iz = 0; iz < countZ; iz++) {
      const z0 = -HALF_WIDTH_U + (2 * HALF_WIDTH_U * iz) / countZ;
      const z1 = -HALF_WIDTH_U + (2 * HALF_WIDTH_U * (iz + 1)) / countZ;

      const l0 = { x: SRC * xLow, y: SRC * yLow, z: SRC * z0 };
      const l1 = { x: SRC * xLow, y: SRC * yLow, z: SRC * z1 };
      const h0 = { x: SRC * xHigh, y: SRC * yHigh, z: SRC * z0 };
      const h1 = { x: SRC * xHigh, y: SRC * yHigh, z: SRC * z1 };

      this.emitTriangle(l0, l1, h1);
      this.emitTriangle(l0, h1, h0);
    }
  }

  /** Vertical wall at x from y0 (bottom) to y1 (top). facing = +1 faces +x, -1 faces -x */
  emitWall(
    x: number,
    y0: number,
    y1: number,
    facing: number,
    zCell: number,
  ): void {
    const countZ = Math.trunc((2 * HALF_WIDTH_U) / zCell + 0.99);
    for (let iz = 0; iz < countZ; iz++) {
      const z0 = -HALF_WIDTH_U + (2 * HALF_WIDTH_U * iz) / countZ;
      const z1 = -HALF_WIDTH_U + (2 * HALF_WIDTH_U * (iz + 1)) / countZ;

      const b0 = { x: SRC * x, y: SRC * y0, z: SRC * z0 };
      const b1 = { x: SRC * x, y: SRC * y0, z: SRC * z1 };
      const t0 = { x: SRC * x, y: SRC * y1, z: SRC * z0 };
      const t1 = { x: SRC * x, y: SRC * y1, z: SRC * z1 };

      if (facing > 0) {
        this.emitTriangle(b0, b1, t1);
        this.emitTriangle(b0, t1, t0);
      } else {
        this.emitTriangle(b0, t0, t1);
        this.emitTriangle(b0, t1, b1);
      }
    }
  }
}

/** Clip [a0,a1] to [c0,c1] */
function clipSpan(
  a0: number,
  a1: number,
  c0: number,
  c1: number,
): [number, number] | undefined {
  const o0 = a0 > c0 ? a0 : c0;
  const o1 = a1 < c1 ? a1 : c1;
  return o1 - o0 > 0.01 ? [o0, o1] : undefined;
}

function buildFloorChunk(
  chunk: number,
  x0U: number,
  x1U: number,
): FloorBuilder {
  const floor = new FloorBuilder();

  // --- Concrete slabs at y = 0 outside the beam region ---
  // Tiles tessellate at a hash-picked resolution so neighbors meet with T-junctions,
  // like cooked s&box map collision.
  const slabSpans: [number, number][] = [
    [-HALF_LENGTH_U, BEAM_REGION_0],
    [BEAM_REGION_1, HALF_LENGTH_U],
  ];
  for (const [from, to] of slabSpans) {
    const span = clipSpan(from, to, x0U, x1U);
    if (!span) continue;
    const [s0, s1] = span;

    for (let tx = s0; tx < s1; tx += TILE_SIZE_U) {
      const tx1 = Math.min(tx + TILE_SIZE_U, s1);
      for (let tz = -HALF_WIDTH_U; tz < HALF_WIDTH_U; tz += TILE_SIZE_U) {
        const h = hash(
          (Math.imul(Math.trunc(tx), 73856093) ^
            Math.imul(tz, 19349663) ^
            Math.imul(chunk, 2654435761 | 0)) >>>
            0,
        );
        const cells = [4, 8, 16];
        floor.emitPatch(tx, tx1, tz, tz + TILE_SIZE_U, 0, cells[h % 3] ?? 4);
      }
    }
  }

  // --- Beam section: flat tops at y = 0, chamfers dropping to pits ---
  const pitTop = -CHAMFER_DROP_U;
  const pitBottom = -PIT_DEPTH_U;

  for (let k = 0; k < BEAM_COUNT; k++) {
    const bx = BEAM_REGION_0 + BEAM_PITCH_U * k;
    const pitLeft = k > 0;
    const pitRight = k < BEAM_COUNT - 1;

    // Flat top (flush with the slab on outer sides)
    const top0 = pitLeft ? bx + CHAMFER_WIDTH_U : bx;
    const top1 = pitRight
      ? bx + BEAM_WIDTH_U - CHAMFER_WIDTH_U
      : bx + BEAM_WIDTH_U;
    const top = clipSpan(top0, top1, x0U, x1U);
    if (top) floor.emitPatch(top[0], top[1], -HALF_WIDTH_U, HALF_WIDTH_U, 0, 8);

    // Chamfers sloping below the walkable plane
    if (pitLeft && bx >= x0U && bx < x1U) {
      floor.emitSlope(bx, pitTop, bx + CHAMFER_WIDTH_U, 0, 8);
    }
    if (pitRight && bx + BEAM_WIDTH_U > x0U && bx + BEAM_WIDTH_U <= x1U) {
      floor.emitSlope(
        bx + BEAM_WIDTH_U,
        pitTop,
        bx + BEAM_WIDTH_U - CHAMFER_WIDTH_U,
        0,
        8,
      );
    }

    // Pit to the right of this beam
    if (pitRight) {
      const pitL = bx + BEAM_WIDTH_U;
      const pitR = bx + BEAM_PITCH_U;
      if (pitL >= x0U && pitL < x1U) {
        floor.emitWall(pitL, pitBottom, pitTop, 1, 16);
      }
      if (pitR > x0U && pitR <= x1U) {
        floor.emitWall(pitR, pitBottom, pitTop, -1, 16);
      }
      const pit = clipSpan(pitL, pitR, x0U, x1U);
      if (pit) {
        floor.emitPatch(
          pit[0],
          pit[1],
          -HALF_WIDTH_U,
          HALF_WIDTH_U,
          pitBottom,
          16,
        );
      }
    }
  }

  return floor;
}

registerSample({
  category: 'Issues',
  name: 's&box Ghost Collisions',
  create(ctx) {
    ctx.camera.setView(90, 25, 10, { x: 0, y: 1, z: 0 });
    const { scene, b3 } = ctx;

    const meshes: Mesh[] = [];

    // Two chunks meeting at x = 0, each its own body and mesh shape, so seam contacts live
    // in separate contact pairs like s&box world mesh chunks. A beam top straddles the seam.
    const createFloorChunk = (
      chunk: number,
      x0U: number,
      x1U: number,
    ): void => {
      const floor = buildFloorChunk(chunk, x0U, x1U);
      const mesh = b3.createMesh({
        vertices: floor.vertices,
        indices: floor.indices,
        weld: true,
        weldTolerance: 0.005, // == B3_LINEAR_SLOP, same as s&box
        identifyEdges: true,
      });
      meshes.push(mesh);
      const data: MeshData = {
        resource: mesh,
        vertices: Float32Array.from(floor.vertices),
        indices: Uint32Array.from(floor.indices),
        clockwise: false,
      };
      const body = scene.createBody({});
      scene.mesh(body, data);
    };
    createFloorChunk(0, -HALF_LENGTH_U, 0);
    createFloorChunk(1, 0, HALF_LENGTH_U);

    // Character
    const volume = 8 * BODY_HALF_WIDTH * BODY_HALF_HEIGHT * BODY_HALF_WIDTH;
    const character = scene.createBody({
      type: 'dynamic',
      position: { x: -WALK_RANGE, y: BODY_HALF_HEIGHT + 0.1, z: 0 },
      motionLocks: { angularX: true, angularY: true, angularZ: true },
      enableSleep: false,
      enableContactRecycling: false,
      gravityScale: 2.03, // s&box gravity: 800 inch/s^2
      name: 'character',
    });
    scene.box(character, {
      hx: BODY_HALF_WIDTH,
      hy: BODY_HALF_HEIGHT,
      hz: BODY_HALF_WIDTH,
      friction: 0,
      restitution: 0,
      density: CHARACTER_MASS / volume,
      enableSpeculativeContact: false,
    });

    let walkDirection = 1;
    let walkSpeed = 350 * SRC; // s&box run speed
    let launchCount = 0;
    let maxLaunchSpeed = 0;
    const launchMarkers: Vec3[] = [];
    let wasLaunched = false;

    return {
      step(dt) {
        // Drive the character with pure velocity control: keep the solver's vertical velocity,
        // set the horizontal velocity. This is how the s&box player controller moves.
        let position = character.getPosition();
        if (position.x > WALK_RANGE) walkDirection = -1;
        else if (position.x < -WALK_RANGE) walkDirection = 1;

        let velocity = character.getLinearVelocity();
        velocity.x = walkDirection * walkSpeed;
        velocity.z = 0;
        character.setLinearVelocity(velocity);

        ctx.stepWorld(dt);

        // The walkable plane is exactly y = 0, so the grounded body center never rises above
        // rest height. Any upward velocity spike while grounded is a ghost collision: there
        // is nothing to climb and nothing to bounce off.
        position = character.getPosition();
        velocity = character.getLinearVelocity();

        const grounded = position.y < BODY_HALF_HEIGHT + 0.01 + 4 * SRC;
        const launched = velocity.y > LAUNCH_THRESHOLD;

        if (grounded && launched && !wasLaunched) {
          launchCount += 1;
          maxLaunchSpeed = Math.max(maxLaunchSpeed, velocity.y);
          if (launchMarkers.length < MARKER_CAPACITY) {
            launchMarkers.push(position);
          }
        }
        wasLaunched = launched;
      },
      ui(panel) {
        panel.slider(
          'Walk Speed (inch/s)',
          walkSpeed / SRC,
          { min: 100, max: 400, format: (value) => value.toFixed(0) },
          (value) => {
            walkSpeed = value * SRC;
          },
        );
        panel.button('Reset Counters', () => {
          launchCount = 0;
          maxLaunchSpeed = 0;
          launchMarkers.length = 0;
        });
        panel.text(() => `Launches: ${launchCount}`);
      },
      draw(canvas) {
        for (const marker of launchMarkers) canvas.point(marker, COLOR.red);
        const current = character.getLinearVelocity();
        canvas.text(
          `ghost launches: ${launchCount}, worst: ${maxLaunchSpeed.toFixed(2)} m/s (${(maxLaunchSpeed / SRC).toFixed(0)} inch/s)`,
        );
        canvas.text(`vertical velocity: ${current.y.toFixed(2)} m/s`);
      },
      destroy() {
        for (const mesh of meshes) mesh.release();
      },
    };
  },
});
