// The emscripten module wrapped for the frontend: memory views that survive
// growth, the scratch and def buffers, an upload arena, and the slot
// registries that map event records back to the objects that own them.
import type { Body } from '../body.js';
import type { Joint } from '../joints.js';
import type { PlaneList } from '../mover.js';
import type { ContactList, ShapeList } from '../queries.js';
import type { Shape } from '../shape.js';
import type { Quat, Vec3 } from '../types.js';
import type { MainModule } from '../wasm/box3d.standard.js';

export type WasmModule = MainModule;
export type Flavour = 'standard' | 'deluxe';

/**
 * Typed views over wasm memory. The buffer is replaced when memory grows, in
 * the deluxe build possibly from a worker thread during a step, so every read
 * goes through views(), which costs one identity compare.
 */
export class Mem {
  f32: Float32Array;
  i32: Int32Array;
  u32: Uint32Array;
  u8: Uint8Array;
  /** Bumps every time wasm memory grows and the views are rebuilt. */
  generation = 0;
  private buffer: ArrayBufferLike;

  constructor(private readonly memory: WebAssembly.Memory) {
    this.buffer = memory.buffer;
    this.f32 = new Float32Array(this.buffer);
    this.i32 = new Int32Array(this.buffer);
    this.u32 = new Uint32Array(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
  }

  views(): this {
    const buffer = this.memory.buffer;
    if (buffer !== this.buffer) {
      this.buffer = buffer;
      this.generation += 1;
      this.f32 = new Float32Array(buffer);
      this.i32 = new Int32Array(buffer);
      this.u32 = new Uint32Array(buffer);
      this.u8 = new Uint8Array(buffer);
    }
    return this;
  }
}

/** One grow-only wasm allocation reused for every bulk upload (hull points, strings). */
export class Arena {
  private ptr = 0;
  private bytes = 0;

  constructor(
    private readonly m: WasmModule,
    private readonly mem: Mem,
  ) {}

  reserve(bytes: number): number {
    if (bytes > this.bytes) {
      if (this.ptr !== 0) this.m._bx_Free(this.ptr);
      this.bytes = Math.max(bytes, this.bytes * 2, 65536);
      this.ptr = this.m._bx_Alloc(this.bytes);
    }
    return this.ptr;
  }

  uploadF32(values: ArrayLike<number>): number {
    const ptr = this.reserve(values.length * 4);
    this.mem.views().f32.set(values, ptr >> 2);
    return ptr;
  }

  uploadString(text: string): number {
    const bytes = this.m.lengthBytesUTF8(text) + 1;
    const ptr = this.reserve(bytes);
    this.mem.views();
    this.m.stringToUTF8(text, ptr, bytes);
    return ptr;
  }
}

export class Runtime {
  readonly mem: Mem;
  readonly arena: Arena;
  /** f32 index of the scratch buffer */
  readonly scratch: number;
  /** f32 index of the def buffer */
  readonly def: number;
  readonly bodies: (Body | undefined)[] = [];
  readonly shapes: (Shape | undefined)[] = [];
  readonly joints: (Joint | undefined)[] = [];
  /** @internal lazily created shared reader for getContacts */
  contacts: ContactList | undefined;
  /** @internal lazily created shared reader for mover planes */
  planes: PlaneList | undefined;
  /** @internal lazily created shared reader for sensor overlaps */
  sensorOverlaps: ShapeList | undefined;

  constructor(
    readonly m: WasmModule,
    readonly flavour: Flavour,
  ) {
    this.mem = new Mem(m.wasmMemory as WebAssembly.Memory);
    this.arena = new Arena(m, this.mem);
    this.scratch = m._bx_Scratch() >> 2;
    this.def = m._bx_DefBuffer() >> 2;
  }

  readVec3(at: number, out: Vec3): Vec3 {
    const f = this.mem.views().f32;
    out.x = f[at];
    out.y = f[at + 1];
    out.z = f[at + 2];
    return out;
  }

  readQuat(at: number, out: Quat): Quat {
    const f = this.mem.views().f32;
    out.x = f[at];
    out.y = f[at + 1];
    out.z = f[at + 2];
    out.w = f[at + 3];
    return out;
  }

  scratchVec3(out: Vec3, offset = 0): Vec3 {
    return this.readVec3(this.scratch + offset, out);
  }

  scratchQuat(out: Quat, offset = 0): Quat {
    return this.readQuat(this.scratch + offset, out);
  }

  scratchF(index: number): number {
    return this.mem.views().f32[this.scratch + index];
  }

  scratchI(index: number): number {
    return this.mem.views().i32[this.scratch + index];
  }

  scratchU(index: number): number {
    return this.mem.views().u32[this.scratch + index];
  }

  defF(index: number, value: number | undefined): void {
    if (value !== undefined) this.mem.views().f32[this.def + index] = value;
  }

  defI(index: number, value: number | undefined): void {
    if (value !== undefined) this.mem.views().i32[this.def + index] = value;
  }

  defU(index: number, value: number | undefined): void {
    if (value !== undefined) this.mem.views().u32[this.def + index] = value;
  }

  defVec3(index: number, value: Vec3 | undefined): void {
    if (value === undefined) return;
    const f = this.mem.views().f32;
    const at = this.def + index;
    f[at] = value.x;
    f[at + 1] = value.y;
    f[at + 2] = value.z;
  }

  defQuat(index: number, value: Quat | undefined): void {
    if (value === undefined) return;
    const f = this.mem.views().f32;
    const at = this.def + index;
    f[at] = value.x;
    f[at + 1] = value.y;
    f[at + 2] = value.z;
    f[at + 3] = value.w;
  }

  defFlag(index: number, bit: number, value: boolean | undefined): void {
    if (value === undefined) return;
    const u = this.mem.views().u32;
    const at = this.def + index;
    u[at] = value ? u[at] | (1 << bit) : u[at] & ~(1 << bit);
  }

  string(ptr: number): string {
    this.mem.views();
    return this.m.UTF8ToString(ptr);
  }
}
