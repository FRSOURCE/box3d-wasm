// Standalone collision and geometry queries on primitives, without a world:
// the engine's mass, bounds, ray and shape casts, overlap, manifold, distance
// and time-of-impact routines.
import type { Compound, HeightField, Hull, Mesh } from './geometry.js';
import { Hull as HullClass } from './geometry.js';
import type { ShapeProxy } from './proxy.js';
import type { Runtime } from './runtime/module.js';
import {
  type AABB,
  type MassData,
  mat3,
  type Quat,
  type Transform,
  type Vec3,
  vec3,
} from './types.js';

/** A shape described without a body. */
export type Primitive =
  | { type: 'sphere'; center?: Vec3; radius: number }
  | { type: 'capsule'; center1: Vec3; center2: Vec3; radius: number }
  | { type: 'hull'; hull: Hull }
  | { type: 'mesh'; mesh: Mesh; scale?: Vec3 }
  | { type: 'heightField'; heightField: HeightField }
  | { type: 'compound'; compound: Compound }
  | { type: 'triangle'; a: Vec3; b: Vec3; c: Vec3 };

export interface CastOutput {
  hit: boolean;
  normal: Vec3;
  point: Vec3;
  fraction: number;
  iterations: number;
  triangleIndex: number;
  childIndex: number;
  materialIndex: number;
}

export interface DistanceOutput {
  pointA: Vec3;
  pointB: Vec3;
  normal: Vec3;
  distance: number;
  iterations: number;
  simplexCount: number;
}

export interface ManifoldPoint {
  point: Vec3;
  /** Negative when overlapping. */
  separation: number;
  /** owner1 | index1 << 8 | owner2 << 16 | index2 << 24 */
  featurePair: number;
  triangleIndex: number;
}

export interface Manifold {
  /** Local normal in frame A. */
  normal: Vec3;
  triangleNormal: Vec3;
  triangleIndex: number;
  vertexIndices: [number, number, number];
  squaredDistance: number;
  feature: number;
  triangleFlags: number;
  points: ManifoldPoint[];
}

/** The movement of a shape over a time step, for time of impact and sweeps. */
export interface Sweep {
  localCenter: Vec3;
  c1: Vec3;
  c2: Vec3;
  q1: Quat;
  q2: Quat;
}

export type TimeOfImpactState =
  'unknown' | 'failed' | 'overlapped' | 'hit' | 'separated';

export interface TimeOfImpactOutput {
  state: TimeOfImpactState;
  point: Vec3;
  normal: Vec3;
  fraction: number;
  distance: number;
  distanceIterations: number;
  pushBackIterations: number;
  rootIterations: number;
  usedFallback: boolean;
}

export interface BoxHullOptions {
  halfExtents: Vec3;
  position?: Vec3;
  rotation?: Quat;
  /** Applied after the placement. Default 1,1,1. */
  scale?: Vec3;
}

const TOI_STATES: readonly TimeOfImpactState[] = [
  'unknown',
  'failed',
  'overlapped',
  'hit',
  'separated',
];

const IDENTITY_XF = [0, 0, 0, 0, 0, 0, 1];

/** A warm-start cache for repeated distance or collision queries on the same pair. */
export class QueryCache {
  private ptr: number;

  constructor(private readonly rt: Runtime) {
    this.ptr = rt.m._bx_Cache_Create();
  }

  /** @internal */
  get pointer(): number {
    if (this.ptr === 0) throw new Error('box3d: query cache was destroyed');
    return this.ptr;
  }

  reset(): void {
    this.rt.m._bx_Cache_Reset(this.pointer);
  }

  destroy(): void {
    if (this.ptr !== 0) this.rt.m._bx_Cache_Destroy(this.ptr);
    this.ptr = 0;
  }
}

function xfWords(xf?: Transform): number[] {
  if (!xf) return IDENTITY_XF;
  const { position: p, rotation: q } = xf;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
}

function flat(points: ArrayLike<number>): number[] {
  if (points.length % 3 !== 0 || points.length < 3 || points.length > 128 * 3) {
    throw new RangeError(
      'box3d: a shape proxy needs 1 to 128 points (flat xyz array)',
    );
  }
  return Array.from(points);
}

function primitiveWords(p: Primitive): number[] {
  switch (p.type) {
    case 'sphere': {
      const c = p.center ?? { x: 0, y: 0, z: 0 };
      return [1, c.x, c.y, c.z, p.radius];
    }
    case 'capsule':
      return [
        2,
        p.center1.x,
        p.center1.y,
        p.center1.z,
        p.center2.x,
        p.center2.y,
        p.center2.z,
        p.radius,
      ];
    case 'hull':
      if (!p.hull.alive) throw new Error('box3d: hull was released');
      return [3, p.hull.slot];
    case 'mesh': {
      if (!p.mesh.alive) throw new Error('box3d: mesh was released');
      const s = p.scale ?? { x: 1, y: 1, z: 1 };
      return [4, p.mesh.slot, s.x, s.y, s.z];
    }
    case 'heightField':
      if (!p.heightField.alive)
        throw new Error('box3d: height field was released');
      return [5, p.heightField.slot];
    case 'compound':
      if (!p.compound.alive) throw new Error('box3d: compound was released');
      return [6, p.compound.slot];
    case 'triangle':
      return [7, p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z, p.c.x, p.c.y, p.c.z];
  }
}

/** Uploads several float arrays back to back and returns their pointers. */
function upload(rt: Runtime, ...arrays: ArrayLike<number>[]): number[] {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const base = rt.arena.reserve(total * 4);
  const f = rt.mem.views().f32;
  const pointers: number[] = [];
  let at = base >> 2;
  for (const array of arrays) {
    pointers.push(at << 2);
    f.set(array, at);
    at += array.length;
  }
  return pointers;
}

function readCast(rt: Runtime): CastOutput {
  return {
    hit: rt.scratchI(0) !== 0,
    normal: rt.scratchVec3(vec3(), 1),
    point: rt.scratchVec3(vec3(), 4),
    fraction: rt.scratchF(7),
    iterations: rt.scratchI(8),
    triangleIndex: rt.scratchI(9),
    childIndex: rt.scratchI(10),
    materialIndex: rt.scratchI(11),
  };
}

function missCast(): CastOutput {
  return {
    hit: false,
    normal: vec3(),
    point: vec3(),
    fraction: 0,
    iterations: 0,
    triangleIndex: -1,
    childIndex: -1,
    materialIndex: -1,
  };
}

function sweepWords(s: Sweep): number[] {
  return [
    s.localCenter.x,
    s.localCenter.y,
    s.localCenter.z,
    s.c1.x,
    s.c1.y,
    s.c1.z,
    s.c2.x,
    s.c2.y,
    s.c2.z,
    s.q1.x,
    s.q1.y,
    s.q1.z,
    s.q1.w,
    s.q2.x,
    s.q2.y,
    s.q2.z,
    s.q2.w,
  ];
}

export class Collision {
  constructor(private readonly rt: Runtime) {}

  /** Mass properties of a sphere, capsule or hull. */
  computeMass(shape: Primitive, density = 1): MassData {
    const rt = this.rt;
    const [d] = upload(rt, primitiveWords(shape));
    if (rt.m._bx_Prim_ComputeMass(d, density) === 0) {
      throw new Error(`box3d: cannot compute the mass of a ${shape.type}`);
    }
    const out: MassData = {
      mass: rt.scratchF(0),
      center: vec3(),
      inertia: mat3(),
    };
    rt.scratchVec3(out.center, 1);
    rt.scratchVec3(out.inertia.cx, 4);
    rt.scratchVec3(out.inertia.cy, 7);
    rt.scratchVec3(out.inertia.cz, 10);
    return out;
  }

  /** Bounding box of the shape at a transform. */
  computeAABB(shape: Primitive, xf?: Transform): AABB {
    const rt = this.rt;
    const [d, x] = upload(rt, primitiveWords(shape), xfWords(xf));
    if (rt.m._bx_Prim_ComputeAABB(d, x) === 0) {
      throw new Error(`box3d: cannot compute the bounds of a ${shape.type}`);
    }
    return {
      lowerBound: rt.scratchVec3(vec3(), 0),
      upperBound: rt.scratchVec3(vec3(), 3),
    };
  }

  /** True when the ray is well formed (finite, non-NaN). */
  isValidRay(origin: Vec3, translation: Vec3, maxFraction = 1): boolean {
    const [p] = upload(this.rt, [
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      maxFraction,
    ]);
    return this.rt.m._bx_IsValidRay(p) !== 0;
  }

  /**
   * Casts a ray at a primitive in its local space. `hollow` treats a sphere as a
   * thin shell: a ray starting inside passes through and hits the far wall.
   * For a hollow sphere the engine reports `fraction` as a distance along the
   * ray, not a fraction of the translation (use `point` to be safe).
   */
  rayCast(
    shape: Primitive,
    origin: Vec3,
    translation: Vec3,
    maxFraction = 1,
    hollow = false,
  ): CastOutput {
    const rt = this.rt;
    const ray = [
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      maxFraction,
      hollow ? 1 : 0,
    ];
    const [d, r] = upload(rt, primitiveWords(shape), ray);
    return rt.m._bx_Prim_RayCast(d, r) !== 0 ? readCast(rt) : missCast();
  }

  /** Sweeps a proxy at a primitive in the primitive's local space. Initial overlap is a miss. */
  shapeCast(
    shape: Primitive,
    proxy: ShapeProxy,
    translation: Vec3,
    maxFraction = 1,
    canEncroach = false,
  ): CastOutput {
    const rt = this.rt;
    const points = flat(proxy.points);
    const input = [
      translation.x,
      translation.y,
      translation.z,
      maxFraction,
      canEncroach ? 1 : 0,
      proxy.radius ?? 0,
      ...points,
    ];
    const [d, i] = upload(rt, primitiveWords(shape), input);
    return rt.m._bx_Prim_ShapeCast(d, i, points.length / 3) !== 0
      ? readCast(rt)
      : missCast();
  }

  /** True when the proxy overlaps the primitive placed at `xf`. */
  overlap(shape: Primitive, proxy: ShapeProxy, xf?: Transform): boolean {
    const rt = this.rt;
    const points = flat(proxy.points);
    const [d, x, data] = upload(rt, primitiveWords(shape), xfWords(xf), [
      proxy.radius ?? 0,
      ...points,
    ]);
    return rt.m._bx_Prim_Overlap(d, x, data, points.length / 3) !== 0;
  }

  /** Triangles of a mesh or height field inside a local box. May include false positives. Allocates. */
  queryTriangles(
    shape: Primitive,
    lowerBound: Vec3,
    upperBound: Vec3,
  ): { vertices: Float32Array; indices: Int32Array } {
    const rt = this.rt;
    const [d, b] = upload(rt, primitiveWords(shape), [
      lowerBound.x,
      lowerBound.y,
      lowerBound.z,
      upperBound.x,
      upperBound.y,
      upperBound.z,
    ]);
    const count = rt.m._bx_Prim_QueryTriangles(d, b);
    const vertices = new Float32Array(count * 9);
    const indices = new Int32Array(count);
    if (count > 0) {
      const base = rt.m._bx_Tris_Buffer() >> 2;
      const { f32, i32 } = rt.mem.views();
      for (let t = 0; t < count; t++) {
        vertices.set(f32.subarray(base + t * 10, base + t * 10 + 9), t * 9);
        indices[t] = i32[base + t * 10 + 9];
      }
    }
    return { vertices, indices };
  }

  /** GJK closest points between two proxies; B is placed in A's frame by `transformBInA`. */
  shapeDistance(
    proxyA: ShapeProxy,
    proxyB: ShapeProxy,
    transformBInA?: Transform,
    useRadii = true,
    cache?: QueryCache,
  ): DistanceOutput {
    const rt = this.rt;
    const a = flat(proxyA.points);
    const b = flat(proxyB.points);
    const data = [
      ...xfWords(transformBInA),
      useRadii ? 1 : 0,
      proxyA.radius ?? 0,
      proxyB.radius ?? 0,
      ...a,
      ...b,
    ];
    const [p] = upload(rt, data);
    rt.m._bx_ShapeDistance(
      p,
      a.length / 3,
      b.length / 3,
      cache ? cache.pointer : 0,
    );
    return {
      pointA: rt.scratchVec3(vec3(), 0),
      pointB: rt.scratchVec3(vec3(), 3),
      normal: rt.scratchVec3(vec3(), 6),
      distance: rt.scratchF(9),
      iterations: rt.scratchI(10),
      simplexCount: rt.scratchI(11),
    };
  }

  /** Moves proxy B along `translationB` (in A's frame) until it touches proxy A. */
  shapeCastPair(
    proxyA: ShapeProxy,
    proxyB: ShapeProxy,
    translationB: Vec3,
    transformBInA?: Transform,
    maxFraction = 1,
    canEncroach = false,
  ): CastOutput {
    const rt = this.rt;
    const a = flat(proxyA.points);
    const b = flat(proxyB.points);
    const data = [
      ...xfWords(transformBInA),
      translationB.x,
      translationB.y,
      translationB.z,
      maxFraction,
      canEncroach ? 1 : 0,
      proxyA.radius ?? 0,
      proxyB.radius ?? 0,
      ...a,
      ...b,
    ];
    const [p] = upload(rt, data);
    return rt.m._bx_ShapeCastPair(p, a.length / 3, b.length / 3) !== 0
      ? readCast(rt)
      : missCast();
  }

  /** The transform of a sweep at time t in [0, 1]. */
  getSweepTransform(sweep: Sweep, time: number): Transform {
    const rt = this.rt;
    const [p] = upload(rt, sweepWords(sweep));
    rt.m._bx_GetSweepTransform(p, time);
    return {
      position: rt.scratchVec3(vec3(), 0),
      rotation: rt.scratchQuat({ x: 0, y: 0, z: 0, w: 1 }, 3),
    };
  }

  /** The first time two moving proxies touch within [0, maxFraction]. */
  timeOfImpact(
    proxyA: ShapeProxy,
    proxyB: ShapeProxy,
    sweepA: Sweep,
    sweepB: Sweep,
    maxFraction = 1,
  ): TimeOfImpactOutput {
    const rt = this.rt;
    const a = flat(proxyA.points);
    const b = flat(proxyB.points);
    const data = [
      ...sweepWords(sweepA),
      ...sweepWords(sweepB),
      maxFraction,
      proxyA.radius ?? 0,
      proxyB.radius ?? 0,
      ...a,
      ...b,
    ];
    const [p] = upload(rt, data);
    rt.m._bx_TimeOfImpact(p, a.length / 3, b.length / 3);
    return {
      state: TOI_STATES[rt.scratchI(0)] ?? 'unknown',
      point: rt.scratchVec3(vec3(), 1),
      normal: rt.scratchVec3(vec3(), 4),
      fraction: rt.scratchF(7),
      distance: rt.scratchF(8),
      distanceIterations: rt.scratchI(9),
      pushBackIterations: rt.scratchI(10),
      rootIterations: rt.scratchI(11),
      usedFallback: rt.scratchI(12) !== 0,
    };
  }

  /**
   * Contact manifold between two primitives, with B placed in A's frame by
   * `transformBInA`. Supported pairs: sphere-sphere, capsule-sphere,
   * hull-sphere, capsule-capsule, hull-capsule, hull-hull, and a triangle as A
   * against a sphere, capsule or hull (B, in A's frame already). Returns
   * undefined for other pairs.
   */
  collide(
    a: Primitive,
    b: Primitive,
    transformBInA?: Transform,
    cache?: QueryCache,
    speculative = true,
  ): Manifold | undefined {
    const rt = this.rt;
    const [da, db, x] = upload(
      rt,
      primitiveWords(a),
      primitiveWords(b),
      xfWords(transformBInA),
    );
    const count = rt.m._bx_Collide(
      da,
      db,
      x,
      cache ? cache.pointer : 0,
      speculative ? 1 : 0,
    );
    if (count < 0) return undefined;
    const base = rt.m._bx_Manifold_Buffer() >> 2;
    const { f32, i32, u32 } = rt.mem.views();
    const points: ManifoldPoint[] = [];
    for (let i = 0; i < count; i++) {
      const at = base + 14 + i * 6;
      points.push({
        point: { x: f32[at], y: f32[at + 1], z: f32[at + 2] },
        separation: f32[at + 3],
        featurePair: u32[at + 4],
        triangleIndex: i32[at + 5],
      });
    }
    return {
      normal: { x: f32[base + 1], y: f32[base + 2], z: f32[base + 3] },
      triangleNormal: { x: f32[base + 4], y: f32[base + 5], z: f32[base + 6] },
      triangleIndex: i32[base + 7],
      vertexIndices: [i32[base + 8], i32[base + 9], i32[base + 10]],
      squaredDistance: f32[base + 11],
      feature: i32[base + 12],
      triangleFlags: i32[base + 13],
      points,
    };
  }

  createCache(): QueryCache {
    return new QueryCache(this.rt);
  }

  /** A box as a reusable hull, optionally placed and scaled. */
  createBoxHull(options: BoxHullOptions): Hull {
    const h = options.halfExtents;
    const p = options.position ?? { x: 0, y: 0, z: 0 };
    const q = options.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    const s = options.scale ?? { x: 1, y: 1, z: 1 };
    const [d] = upload(this.rt, [
      h.x,
      h.y,
      h.z,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
      s.x,
      s.y,
      s.z,
    ]);
    const slot = this.rt.m._bx_CreateBoxHull(d);
    if (slot === 0)
      throw new Error('box3d: the engine could not build the box hull');
    return new HullClass(this.rt, slot);
  }

  /** Scales a box (half extents plus transform) while keeping every half width above `minHalfWidth`. */
  scaleBox(
    halfExtents: Vec3,
    xf: Transform,
    scale: Vec3,
    minHalfWidth = 0,
  ): { halfExtents: Vec3; transform: Transform } {
    const rt = this.rt;
    const [d] = upload(rt, [
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
      ...xfWords(xf),
      scale.x,
      scale.y,
      scale.z,
      minHalfWidth,
    ]);
    rt.m._bx_ScaleBox(d);
    return {
      halfExtents: rt.scratchVec3(vec3(), 0),
      transform: {
        position: rt.scratchVec3(vec3(), 3),
        rotation: rt.scratchQuat({ x: 0, y: 0, z: 0, w: 1 }, 6),
      },
    };
  }
}
