import type { Runtime } from './runtime/module.js';

/** What a debug draw pass includes. Shapes are not drawn: the host renders its own geometry. */
export interface DebugDrawOptions {
  joints?: boolean;
  jointExtras?: boolean;
  bounds?: boolean;
  mass?: boolean;
  sleep?: boolean;
  contacts?: boolean;
  contactNormals?: boolean;
  contactForces?: boolean;
  contactFeatures?: boolean;
  anchorA?: boolean;
  graphColors?: boolean;
  islands?: boolean;
  /** Scale of drawn forces. Default 1. */
  forceScale?: number;
  /** Scale of drawn joints. Default 1. */
  jointScale?: number;
  /** Cull drawing to this box. Default: everything. */
  bounds3?: {
    lower: { x: number; y: number; z: number };
    upper: { x: number; y: number; z: number };
  };
}

const FLAGS: readonly (readonly [keyof DebugDrawOptions, number])[] = [
  ['joints', 1 << 0],
  ['jointExtras', 1 << 1],
  ['bounds', 1 << 2],
  ['mass', 1 << 3],
  ['sleep', 1 << 4],
  ['contacts', 1 << 6],
  ['anchorA', 1 << 7],
  ['graphColors', 1 << 8],
  ['contactFeatures', 1 << 9],
  ['contactNormals', 1 << 10],
  ['contactForces', 1 << 11],
  ['islands', 1 << 12],
];

/** Floats (and one u32 colour) per line: x1 y1 z1 x2 y2 z2 0xRRGGBB. */
export const LINE_STRIDE = 7;
/** Floats (and one u32 colour) per point: x y z size 0xRRGGBB. */
export const POINT_STRIDE = 5;

const HUGE = 1e9;

/**
 * Lines and points from the last world.debugDraw() call. One instance per
 * world, refilled by each call; the arrays are views into wasm memory, so read
 * them before the next call that can allocate.
 */
export class DebugDrawBuffers {
  lineCount = 0;
  pointCount = 0;

  constructor(private readonly rt: Runtime) {}

  /** `lineCount * LINE_STRIDE` floats. */
  get lines(): Float32Array {
    const base = this.lineCount > 0 ? this.rt.m._bx_Draw_Lines() >> 2 : 0;
    return this.rt.mem
      .views()
      .f32.subarray(base, base + this.lineCount * LINE_STRIDE);
  }

  /** The same memory as `lines`, for reading the colour word at index 6 of each record. */
  get lineWords(): Uint32Array {
    const base = this.lineCount > 0 ? this.rt.m._bx_Draw_Lines() >> 2 : 0;
    return this.rt.mem
      .views()
      .u32.subarray(base, base + this.lineCount * LINE_STRIDE);
  }

  /** `pointCount * POINT_STRIDE` floats. */
  get points(): Float32Array {
    const base = this.pointCount > 0 ? this.rt.m._bx_Draw_Points() >> 2 : 0;
    return this.rt.mem
      .views()
      .f32.subarray(base, base + this.pointCount * POINT_STRIDE);
  }

  get pointWords(): Uint32Array {
    const base = this.pointCount > 0 ? this.rt.m._bx_Draw_Points() >> 2 : 0;
    return this.rt.mem
      .views()
      .u32.subarray(base, base + this.pointCount * POINT_STRIDE);
  }

  /** @internal */
  fill(slot: number, options: DebugDrawOptions): this {
    let flags = 0;
    for (const [key, bit] of FLAGS) if (options[key]) flags |= bit;
    const b = options.bounds3;
    this.lineCount = this.rt.m._bx_World_Draw(
      slot,
      flags,
      options.forceScale ?? 1,
      options.jointScale ?? 1,
      b?.lower.x ?? -HUGE,
      b?.lower.y ?? -HUGE,
      b?.lower.z ?? -HUGE,
      b?.upper.x ?? HUGE,
      b?.upper.y ?? HUGE,
      b?.upper.z ?? HUGE,
    );
    this.pointCount = this.rt.m._bx_Draw_PointCount();
    return this;
  }
}
