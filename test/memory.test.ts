// Memory growth replaces the wasm buffer. Every read goes through fresh views,
// so a reader filled before growth still reads the right numbers afterwards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import {
  box,
  flavour,
  ground,
  loadBox3D,
  terminateThreads,
} from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

describe(`memory growth (${flavour})`, () => {
  it('keeps event readers and scratch reads valid after the heap grows', () => {
    const world = new b3.World();
    ground(world);
    const body = box(world, 0, 3, 0);
    world.step(1 / 60);
    const moves = world.getMoveEvents();
    expect(moves.count).toBe(1);
    const before = (b3.raw.wasmMemory as WebAssembly.Memory).buffer.byteLength;
    // 96 MB is beyond both flavours' initial memory, so this forces growth
    const ptr = b3.raw._bx_Alloc(96 * 1024 * 1024);
    expect(ptr).not.toBe(0);
    const after = (b3.raw.wasmMemory as WebAssembly.Memory).buffer.byteLength;
    expect(after).toBeGreaterThan(before);
    const p = moves.copyPositionTo(0, { x: 0, y: 0, z: 0 });
    expect(p).toEqual(body.getPosition());
    world.step(1 / 60);
    expect(world.getMoveEvents().bodyAt(0)).toBe(body);
    b3.raw._bx_Free(ptr);
    world.destroy();
  });
});
