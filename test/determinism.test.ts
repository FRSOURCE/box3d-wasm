// A fixed scene must land on the same bits every run, in both flavours and
// at any worker count. A Box3D bump that changes results turns this red; run
// with UPDATE_FIXTURES=1 to accept the new numbers after reviewing them.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import {
  flavour,
  loadBox3D,
  pile,
  stepTimes,
  terminateThreads,
} from './helpers/load.js';

const fixture = join(import.meta.dirname, 'fixtures', 'pile.json');
const BODIES = 50;
const STEPS = 120;

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

function run(b3: Box3D, workerCount: number): Float32Array {
  const world = new b3.World({ workerCount });
  const bodies = pile(world, BODIES);
  stepTimes(world, STEPS);
  const out = new Float32Array(BODIES * 7);
  const p = { x: 0, y: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0, w: 1 };
  bodies.forEach((body, i) => {
    body.readTransform(p, q);
    out.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], i * 7);
  });
  world.destroy();
  return out;
}

describe(`determinism (${flavour})`, () => {
  it('matches the committed fixture bit for bit', () => {
    const actual = run(b3, 1);
    expect(actual.every(Number.isFinite)).toBe(true);
    if (process.env.UPDATE_FIXTURES === '1' && flavour === 'standard') {
      writeFileSync(fixture, JSON.stringify(Array.from(actual)) + '\n');
    }
    const expected = Float32Array.from(
      JSON.parse(readFileSync(fixture, 'utf8')) as number[],
    );
    expect(actual.length).toBe(expected.length);
    const differing = Array.from(actual).filter(
      (value, i) => value !== expected[i],
    ).length;
    expect(differing).toBe(0);
  });

  it('settles rather than exploding', () => {
    const actual = run(b3, 1);
    for (let i = 0; i < BODIES; i++) {
      expect(actual[i * 7 + 1]).toBeGreaterThan(0);
      expect(actual[i * 7 + 1]).toBeLessThan(10);
    }
  });

  it.skipIf(flavour !== 'deluxe')(
    'gives the same bits at every worker count',
    () => {
      const reference = run(b3, 1);
      for (const workers of [2, 4]) {
        const actual = run(b3, workers);
        const differing = Array.from(actual).filter(
          (value, i) => value !== reference[i],
        ).length;
        expect(differing, `${workers} workers`).toBe(0);
      }
    },
  );
});
