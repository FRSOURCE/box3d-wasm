// Falling Ragdolls (the upstream determinism sample) hashes every bone once the
// world sleeps; two headless runs must produce the same sleep step and hash.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createHeadlessSession,
  nonFiniteBodies,
} from '../docs/src/framework/headless.js';
import { findSample } from '../docs/src/framework/registry.js';
import '../docs/src/samples/index.js';
import type { Box3D } from '../dist/index.js';
import { loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;
beforeAll(async () => {
  b3 = await loadBox3D();
});
afterAll(() => terminateThreads(b3));

function run(): string {
  const def = findSample('Determinism/Falling Ragdolls');
  if (!def) throw new Error('Falling Ragdolls is not registered');
  const session = createHeadlessSession(b3);
  try {
    const { runner, canvas } = session;
    runner.load(def);
    for (let i = 0; i < 500; i++) {
      runner.tick();
      canvas.reset();
      runner.draw(canvas);
      if (canvas.lines.length > 0) break;
    }
    expect(nonFiniteBodies(runner)).toEqual([]);
    return canvas.lines[0] ?? '';
  } finally {
    session.runner.unload();
  }
}

describe('Falling Ragdolls determinism', () => {
  it('reaches sleep and hashes identically on two runs', () => {
    const first = run();
    expect(first).toMatch(/^sleep step = \d+, hash = 0x[0-9A-F]{8}$/);
    expect(run()).toBe(first);
  });

  it('matches the golden of upstream test_determinism.c (float build)', () => {
    expect(run()).toBe('sleep step = 274, hash = 0x773AB8ED');
  });
});
