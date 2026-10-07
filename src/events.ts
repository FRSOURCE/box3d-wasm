// Readers over the shim's per-step event buffers. One instance per kind per
// world, refilled by the world's get*Events() calls, so a frame allocates
// nothing: records are read in place through the memory views.
import type { Body } from './body.js';
import type { Joint } from './joints.js';
import type { Runtime } from './runtime/module.js';
import type { Shape } from './shape.js';
import type { Vec3 } from './types.js';

export class EventReader {
  /** Records in the buffer after the last fill. */
  count = 0;
  /** f32 index of the first record; valid until the next fill or step. */
  base = 0;

  constructor(
    protected readonly rt: Runtime,
    /** Floats per record. */
    readonly stride: number,
  ) {}

  /** The current f32 view; records start at base and are stride apart. */
  get f32(): Float32Array {
    return this.rt.mem.views().f32;
  }

  /** @internal */
  load(count: number, ptr: number): this {
    this.count = count;
    this.base = ptr >> 2;
    return this;
  }

  protected slotAt(index: number, offset: number): number {
    return this.f32[this.base + index * this.stride + offset];
  }

  protected vec3At(index: number, offset: number, out: Vec3): Vec3 {
    const f = this.f32;
    const at = this.base + index * this.stride + offset;
    out.x = f[at];
    out.y = f[at + 1];
    out.z = f[at + 2];
    return out;
  }

  protected floatAt(index: number, offset: number): number {
    return this.f32[this.base + index * this.stride + offset];
  }
}

/** Bodies that moved during the last step. Sleeping bodies do not appear. */
export class MoveEvents extends EventReader {
  bodyAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 0)];
  }

  copyPositionTo(index: number, out: Vec3): Vec3 {
    return this.vec3At(index, 1, out);
  }

  copyRotationTo(
    index: number,
    out: { x: number; y: number; z: number; w: number },
  ): typeof out {
    const f = this.f32;
    const at = this.base + index * this.stride + 4;
    out.x = f[at];
    out.y = f[at + 1];
    out.z = f[at + 2];
    out.w = f[at + 3];
    return out;
  }

  fellAsleepAt(index: number): boolean {
    return this.floatAt(index, 8) !== 0;
  }
}

/** Shape pairs that started touching, with the first manifold summarised. */
export class ContactBeginEvents extends EventReader {
  shapeAAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 0)];
  }

  shapeBAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 1)];
  }

  bodyAAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 2)];
  }

  bodyBAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 3)];
  }

  /** Average contact point of the first manifold, in world space. */
  copyPointTo(index: number, out: Vec3): Vec3 {
    return this.vec3At(index, 4, out);
  }

  /** Normal pointing from shape A to shape B. */
  copyNormalTo(index: number, out: Vec3): Vec3 {
    return this.vec3At(index, 7, out);
  }

  /** Total normal impulse of the first manifold over the step. */
  totalNormalImpulseAt(index: number): number {
    return this.floatAt(index, 10);
  }

  pointCountAt(index: number): number {
    return this.floatAt(index, 11);
  }

  manifoldCountAt(index: number): number {
    return this.floatAt(index, 12);
  }
}

/** Shape pairs that stopped touching. A shape destroyed this step reads as undefined. */
export class ContactEndEvents extends EventReader {
  shapeAAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 0)];
  }

  shapeBAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 1)];
  }

  bodyAAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 2)];
  }

  bodyBAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 3)];
  }
}

/** Impacts above the world's hit event threshold. */
export class ContactHitEvents extends EventReader {
  shapeAAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 0)];
  }

  shapeBAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 1)];
  }

  bodyAAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 2)];
  }

  bodyBAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 3)];
  }

  copyPointTo(index: number, out: Vec3): Vec3 {
    return this.vec3At(index, 4, out);
  }

  /** Normal pointing from shape A to shape B. */
  copyNormalTo(index: number, out: Vec3): Vec3 {
    return this.vec3At(index, 7, out);
  }

  approachSpeedAt(index: number): number {
    return this.floatAt(index, 10);
  }
}

/** Sensor overlaps that began or ended. A shape destroyed this step reads as undefined. */
export class SensorEvents extends EventReader {
  sensorShapeAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 0)];
  }

  visitorShapeAt(index: number): Shape | undefined {
    return this.rt.shapes[this.slotAt(index, 1)];
  }

  sensorBodyAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 2)];
  }

  visitorBodyAt(index: number): Body | undefined {
    return this.rt.bodies[this.slotAt(index, 3)];
  }
}

/** Joints whose force or torque threshold was exceeded. */
export class JointEvents extends EventReader {
  jointAt(index: number): Joint | undefined {
    return this.rt.joints[this.slotAt(index, 0)];
  }
}
