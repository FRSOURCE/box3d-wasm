import type { Body } from './body.js';
import { join64 } from './runtime/bits.js';
import type { Runtime } from './runtime/module.js';
import type { Shape } from './shape.js';
import { type Bits, type Vec3, vec3 } from './types.js';

/** The result of a closest ray cast. One instance per world, overwritten by every cast. */
export class RayHit {
  hit = false;
  readonly point: Vec3 = vec3();
  readonly normal: Vec3 = vec3();
  fraction = 0;
  shape: Shape | undefined = undefined;
  body: Body | undefined = undefined;
  /** Triangle hit; meaningful when the shape is a mesh or height field. */
  triangleIndex = 0;
  /** Child hit; meaningful when the shape is a compound. */
  childIndex = 0;
  userMaterialId: Bits = 0;

  /** @internal */
  load(rt: Runtime, shapeSlot: number): this {
    this.hit = shapeSlot !== 0;
    if (!this.hit) {
      this.shape = undefined;
      this.body = undefined;
      return this;
    }
    rt.scratchVec3(this.point, 0);
    rt.scratchVec3(this.normal, 3);
    this.fraction = rt.scratchF(6);
    this.body = rt.bodies[rt.scratchI(7)];
    this.triangleIndex = rt.scratchI(8);
    this.childIndex = rt.scratchI(9);
    this.userMaterialId = join64(rt.scratchU(10), rt.scratchU(11));
    this.shape = rt.shapes[shapeSlot];
    return this;
  }
}

/** The result of a ray cast against one shape. */
export class ShapeRayHit {
  hit = false;
  readonly point: Vec3 = vec3();
  readonly normal: Vec3 = vec3();
  fraction = 0;
  triangleIndex = 0;

  /** @internal */
  load(rt: Runtime, hit: number): this {
    this.hit = hit !== 0;
    if (!this.hit) return this;
    rt.scratchVec3(this.point, 0);
    rt.scratchVec3(this.normal, 3);
    this.fraction = rt.scratchF(6);
    this.triangleIndex = rt.scratchI(7);
    return this;
  }
}

/** How a multi-hit cast reports. */
export type CastMode = 'all' | 'closest' | 'any';

export const CAST_MODES: Record<CastMode, number> = {
  all: 0,
  closest: 1,
  any: 2,
};

/**
 * Hits of the last cast or shape cast, nearest first in 'all' mode. One
 * instance per world, overwritten by every cast; copy what you need to keep.
 * Records are read in place, so a frame allocates nothing.
 */
export class HitList {
  /** Hits in the buffer. */
  count = 0;
  private base = 0;
  private words = 13;

  constructor(private readonly rt: Runtime) {}

  /** @internal */
  load(count: number): this {
    this.count = count;
    if (count > 0) {
      this.base = this.rt.m._bx_Query_Hits() >> 2;
      this.words = this.rt.m._bx_Query_HitWords();
    }
    return this;
  }

  shapeAt(index: number): Shape | undefined {
    return this.rt.shapes[
      this.rt.mem.views().i32[this.base + index * this.words]
    ];
  }

  bodyAt(index: number): Body | undefined {
    return this.rt.bodies[
      this.rt.mem.views().i32[this.base + index * this.words + 1]
    ];
  }

  fractionAt(index: number): number {
    return this.rt.mem.views().f32[this.base + index * this.words + 8];
  }

  copyPointTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.base + index * this.words + 2, out);
  }

  copyNormalTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.base + index * this.words + 5, out);
  }

  /** Meaningful for mesh and height field shapes. */
  triangleIndexAt(index: number): number {
    return this.rt.mem.views().i32[this.base + index * this.words + 9];
  }

  /** Meaningful for compound shapes. */
  childIndexAt(index: number): number {
    return this.rt.mem.views().i32[this.base + index * this.words + 10];
  }

  userMaterialIdAt(index: number): Bits {
    const u = this.rt.mem.views().u32;
    const at = this.base + index * this.words + 11;
    return join64(u[at], u[at + 1]);
  }
}

/** Shapes found by the last overlap query. One instance per world, overwritten by the next query. */
export class ShapeList {
  count = 0;
  private base = 0;

  constructor(private readonly rt: Runtime) {}

  /** @internal */
  load(count: number): this {
    this.count = count;
    if (count > 0) this.base = this.rt.m._bx_Query_Overlaps() >> 2;
    return this;
  }

  shapeAt(index: number): Shape | undefined {
    return this.rt.shapes[this.rt.mem.views().i32[this.base + index]];
  }

  /** Allocates; for convenience and tests. */
  toArray(): Shape[] {
    const out: Shape[] = [];
    for (let i = 0; i < this.count; i++) {
      const shape = this.shapeAt(i);
      if (shape) out.push(shape);
    }
    return out;
  }
}

/** Words per contact record: 14 header words plus four points of 10. */
const CONTACT_HEADER = 14;
const CONTACT_POINT = 10;

/**
 * Touching manifolds of a body or shape, one record per manifold (mesh and
 * height field contacts can have several per shape pair). One instance per
 * runtime, overwritten by the next getContacts call.
 */
export class ContactList {
  count = 0;
  private base = 0;
  private stride = 54;

  constructor(private readonly rt: Runtime) {}

  /** @internal */
  load(count: number): this {
    this.count = count;
    if (count > 0) {
      this.base = this.rt.m._bx_Contacts_Buffer() >> 2;
      this.stride = this.rt.m._bx_Contacts_Stride();
    }
    return this;
  }

  private at(index: number, offset: number): number {
    return this.base + index * this.stride + offset;
  }

  shapeAAt(index: number): Shape | undefined {
    return this.rt.shapes[this.rt.mem.views().i32[this.at(index, 0)]];
  }

  shapeBAt(index: number): Shape | undefined {
    return this.rt.shapes[this.rt.mem.views().i32[this.at(index, 1)]];
  }

  /** Contact points in the manifold, 0 to 4. */
  pointCountAt(index: number): number {
    return this.rt.mem.views().i32[this.at(index, 2)];
  }

  /** Unit normal in world space, pointing from shape A to shape B. */
  copyNormalTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.at(index, 3), out);
  }

  /** Angular friction impulse about the normal. */
  twistImpulseAt(index: number): number {
    return this.rt.mem.views().f32[this.at(index, 6)];
  }

  copyFrictionImpulseTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.at(index, 7), out);
  }

  copyRollingImpulseTo(index: number, out: Vec3): Vec3 {
    return this.rt.readVec3(this.at(index, 10), out);
  }

  /** Manifolds in the contact this record belongs to. */
  manifoldCountAt(index: number): number {
    return this.rt.mem.views().i32[this.at(index, 13)];
  }

  copyPointTo(index: number, point: number, out: Vec3): Vec3 {
    return this.rt.readVec3(
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT),
      out,
    );
  }

  /** Negative when penetrating. */
  separationAt(index: number, point: number): number {
    return this.rt.mem.views().f32[
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 3)
    ];
  }

  normalImpulseAt(index: number, point: number): number {
    return this.rt.mem.views().f32[
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 4)
    ];
  }

  totalNormalImpulseAt(index: number, point: number): number {
    return this.rt.mem.views().f32[
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 5)
    ];
  }

  /** Relative normal velocity before the solve; only computed when hit events are enabled. */
  normalVelocityAt(index: number, point: number): number {
    return this.rt.mem.views().f32[
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 6)
    ];
  }

  persistedAt(index: number, point: number): boolean {
    return (
      this.rt.mem.views().i32[
        this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 7)
      ] !== 0
    );
  }

  triangleIndexAt(index: number, point: number): number {
    return this.rt.mem.views().i32[
      this.at(index, CONTACT_HEADER + point * CONTACT_POINT + 9)
    ];
  }
}
