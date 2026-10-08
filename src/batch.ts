import type { Body } from './body.js';
import type { Runtime } from './runtime/module.js';

/** Floats per body record: position xyz, rotation xyzw. */
export const TRANSFORM_STRIDE = 7;

/**
 * Reads or writes the transforms of many bodies with one wasm call, into a
 * buffer that lives in wasm memory. This is the sync path for a renderer or a
 * physics-engine plugin: no per-body JS to wasm call and no allocation per frame.
 *
 * Record i belongs to bodies[i]: [px, py, pz, qx, qy, qz, qw]. A body that has
 * been destroyed since the batch was built keeps its previous record.
 */
export class TransformBatch {
  readonly stride = TRANSFORM_STRIDE;
  private slotsPtr = 0;
  private dataPtr = 0;
  private capacity = 0;
  private size = 0;
  private freed = false;
  private view: Float32Array | undefined;
  private viewGeneration = -1;

  constructor(
    private readonly rt: Runtime,
    bodies: readonly Body[] = [],
  ) {
    this.setBodies(bodies);
  }

  /** Number of bodies in the batch. */
  get count(): number {
    return this.size;
  }

  /** Replaces the bodies. Existing records are cleared. */
  setBodies(bodies: readonly Body[]): void {
    this.assertLive();
    if (bodies.length > this.capacity) this.grow(bodies.length);
    const { mem } = this.rt;
    const i32 = mem.views().i32;
    const f32 = mem.f32;
    const base = this.slotsPtr >> 2;
    const dataBase = this.dataPtr >> 2;
    for (let i = 0; i < bodies.length; i++) {
      i32[base + i] = bodies[i].slot;
      const r = dataBase + i * TRANSFORM_STRIDE;
      f32.fill(0, r, r + TRANSFORM_STRIDE);
      f32[r + 6] = 1;
    }
    this.size = bodies.length;
  }

  /**
   * Records as a Float32Array of count * stride floats. The view is rebuilt
   * when wasm memory grows, so read it again after any call that can allocate
   * (stepping, creating bodies or shapes); do not hold it across them.
   */
  get data(): Float32Array {
    this.assertLive();
    const { mem } = this.rt;
    mem.views();
    if (this.view === undefined || this.viewGeneration !== mem.generation) {
      this.view = mem.f32.subarray(
        this.dataPtr >> 2,
        (this.dataPtr >> 2) + this.size * TRANSFORM_STRIDE,
      );
      this.viewGeneration = mem.generation;
    }
    return this.view;
  }

  /** Copies the current body transforms into data. Returns how many bodies were live. */
  read(): number {
    this.assertLive();
    return this.rt.m._bx_Bodies_GetTransforms(
      this.slotsPtr,
      this.size,
      this.dataPtr,
    );
  }

  /** Teleports every body to its record in data. Returns how many bodies were live. */
  write(): number {
    this.assertLive();
    return this.rt.m._bx_Bodies_SetTransforms(
      this.slotsPtr,
      this.size,
      this.dataPtr,
    );
  }

  /** Frees the wasm buffers. The batch cannot be used afterwards. */
  destroy(): void {
    if (this.freed) return;
    this.freed = true;
    this.view = undefined;
    if (this.slotsPtr !== 0) this.rt.m._bx_Free(this.slotsPtr);
    if (this.dataPtr !== 0) this.rt.m._bx_Free(this.dataPtr);
    this.slotsPtr = 0;
    this.dataPtr = 0;
  }

  private grow(capacity: number): void {
    const { m } = this.rt;
    if (this.slotsPtr !== 0) m._bx_Free(this.slotsPtr);
    if (this.dataPtr !== 0) m._bx_Free(this.dataPtr);
    this.capacity = Math.max(capacity, this.capacity * 2, 16);
    this.slotsPtr = m._bx_Alloc(this.capacity * 4);
    this.dataPtr = m._bx_Alloc(this.capacity * TRANSFORM_STRIDE * 4);
    this.view = undefined;
  }

  private assertLive(): void {
    if (this.freed) throw new Error('box3d: transform batch was destroyed');
  }
}
