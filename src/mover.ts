import type { Runtime } from './runtime/module.js';
import type { Shape } from './shape.js';
import { type Vec3, vec3 } from './types.js';

/** A capsule character mover, relative to the origin passed with each query. */
export interface Mover {
  center1: Vec3;
  center2: Vec3;
  radius: number;
}

/** A plane fed to solvePlanes and clipVector. */
export interface CollisionPlane {
  normal: Vec3;
  offset: number;
  /** Use Infinity (the default) for a rigid plane; lower values make the contact soft. */
  pushLimit?: number;
  /** Written by solvePlanes. */
  push?: number;
  /** Whether clipVector clips against this plane. Leave false for soft collision. Default true. */
  clipVelocity?: boolean;
}

export interface PlaneSolverResult {
  delta: Vec3;
  iterationCount: number;
}

export interface TimeOfImpactResult {
  hit: boolean;
  point: Vec3;
  normal: Vec3;
  fraction: number;
  shape: Shape | undefined;
}

const PLANE_FIELDS = 7;

export function uploadMover(rt: Runtime, mover: Mover): number {
  const { center1: a, center2: b } = mover;
  return rt.arena.uploadF32([a.x, a.y, a.z, b.x, b.y, b.z, mover.radius]);
}

/**
 * Collision planes between a mover and the world or a body. One instance per
 * runtime, overwritten by the next collideMover call.
 */
export class PlaneList {
  count = 0;
  private base = 0;
  private words = 10;

  constructor(private readonly rt: Runtime) {}

  /** @internal */
  load(count: number): this {
    this.count = count;
    if (count > 0) {
      this.base = this.rt.m._bx_Mover_Planes() >> 2;
      this.words = this.rt.m._bx_Mover_PlaneWords();
    }
    return this;
  }

  shapeAt(index: number): Shape | undefined {
    return this.rt.shapes[
      this.rt.mem.views().i32[this.base + index * this.words]
    ];
  }

  /** Outward pointing normal. */
  copyNormalTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.base + index * this.words + 1, out);
  }

  offsetAt(index: number): number {
    return this.rt.mem.views().f32[this.base + index * this.words + 4];
  }

  /** Closest point on the shape. */
  copyPointTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.base + index * this.words + 5, out);
  }

  triangleIndexAt(index: number): number {
    return this.rt.mem.views().i32[this.base + index * this.words + 8];
  }

  childIndexAt(index: number): number {
    return this.rt.mem.views().i32[this.base + index * this.words + 9];
  }

  /** Allocates; copies the planes in the shape solvePlanes takes. */
  toCollisionPlanes(
    pushLimit = Infinity,
    clipVelocity = true,
  ): CollisionPlane[] {
    const out: CollisionPlane[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push({
        normal: this.copyNormalTo(i, vec3()),
        offset: this.offsetAt(i),
        pushLimit,
        push: 0,
        clipVelocity,
      });
    }
    return out;
  }
}

function uploadPlanes(rt: Runtime, planes: readonly CollisionPlane[]): number {
  const flat = new Float32Array(planes.length * PLANE_FIELDS);
  planes.forEach((plane, i) => {
    const at = i * PLANE_FIELDS;
    flat[at] = plane.normal.x;
    flat[at + 1] = plane.normal.y;
    flat[at + 2] = plane.normal.z;
    flat[at + 3] = plane.offset;
    flat[at + 4] = plane.pushLimit ?? 3.4028234663852886e38;
    flat[at + 5] = plane.push ?? 0;
    flat[at + 6] = plane.clipVelocity === false ? 0 : 1;
  });
  return rt.arena.uploadF32(flat);
}

/**
 * Solves the mover position that satisfies the planes. Each plane's `push` is
 * updated in place.
 */
export function solvePlanes(
  rt: Runtime,
  targetDelta: Vec3,
  planes: CollisionPlane[],
): PlaneSolverResult {
  const ptr = uploadPlanes(rt, planes);
  rt.m._bx_SolvePlanes(
    targetDelta.x,
    targetDelta.y,
    targetDelta.z,
    ptr,
    planes.length,
  );
  const result = {
    delta: rt.scratchVec3(vec3(), 0),
    iterationCount: rt.scratchI(3),
  };
  const f = rt.mem.views().f32;
  planes.forEach((plane, i) => {
    plane.push = f[(ptr >> 2) + i * PLANE_FIELDS + 5];
  });
  return result;
}

/** Clips a velocity against planes that have a push and clipVelocity set. */
export function clipVector(
  rt: Runtime,
  vector: Vec3,
  planes: readonly CollisionPlane[],
  out: Vec3 = vec3(),
): Vec3 {
  const ptr = uploadPlanes(rt, planes);
  rt.m._bx_ClipVector(vector.x, vector.y, vector.z, ptr, planes.length);
  return rt.scratchVec3(out);
}
