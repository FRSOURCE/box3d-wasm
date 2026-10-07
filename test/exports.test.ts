// The frontend is only correct if every export it calls exists, and every
// export the shim offers is described. This pins the three together: the
// compiled module, the generated declaration and the TypeScript sources.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import * as layouts from '../src/runtime/layouts.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

const root = join(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'wasm' ? [] : walk(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function exportsOf(text: string): Set<string> {
  return new Set(text.match(/_bx_\w+/g) ?? []);
}

let b3: Box3D;
let moduleExports: Set<string>;

beforeAll(async () => {
  b3 = await loadBox3D();
  moduleExports = new Set(
    Object.keys(b3.raw).filter((key) => key.startsWith('_bx_')),
  );
});

afterAll(() => terminateThreads(b3));

describe(`exports (${flavour})`, () => {
  it('declares every compiled export and nothing else', () => {
    const declared = exportsOf(
      readFileSync(join(root, 'src/wasm', `box3d.${flavour}.d.ts`), 'utf8'),
    );
    expect([...moduleExports].sort()).toEqual([...declared].sort());
    expect(moduleExports.size).toBeGreaterThan(200);
  });

  it('only calls exports that exist', () => {
    const referenced = new Set<string>();
    for (const file of walk(join(root, 'src'))) {
      for (const name of exportsOf(readFileSync(file, 'utf8')))
        referenced.add(name);
    }
    const missing = [...referenced].filter((name) => !moduleExports.has(name));
    expect(missing).toEqual([]);
  });

  it('agrees with the shim on the def buffer layouts', () => {
    const m = b3.raw;
    expect(layouts.WorldDef.WORDS).toBe(m._bx_Layout_WorldDefWords());
    expect(layouts.BodyDef.WORDS).toBe(m._bx_Layout_BodyDefWords());
    expect(layouts.ShapeDef.WORDS).toBe(m._bx_Layout_ShapeDefWords());
    expect(layouts.JointDef.WORDS).toBe(m._bx_Layout_JointDefWords());
    expect(layouts.DistanceJointDef.WORDS).toBe(
      m._bx_Layout_DistanceJointDefWords(),
    );
    expect(layouts.RevoluteJointDef.WORDS).toBe(
      m._bx_Layout_RevoluteJointDefWords(),
    );
    expect(layouts.SphericalJointDef.WORDS).toBe(
      m._bx_Layout_SphericalJointDefWords(),
    );
    expect(layouts.PrismaticJointDef.WORDS).toBe(
      m._bx_Layout_PrismaticJointDefWords(),
    );
    expect(layouts.WeldJointDef.WORDS).toBe(m._bx_Layout_WeldJointDefWords());
    expect(layouts.MotorJointDef.WORDS).toBe(m._bx_Layout_MotorJointDefWords());
    expect(layouts.WheelJointDef.WORDS).toBe(m._bx_Layout_WheelJointDefWords());
    expect(layouts.ParallelJointDef.WORDS).toBe(
      m._bx_Layout_ParallelJointDefWords(),
    );
  });

  it('agrees with the shim on the event record strides', () => {
    const m = b3.raw;
    expect(layouts.Stride.MOVE).toBe(m._bx_Stride_Move());
    expect(layouts.Stride.CONTACT_BEGIN).toBe(m._bx_Stride_ContactBegin());
    expect(layouts.Stride.CONTACT_END).toBe(m._bx_Stride_ContactEnd());
    expect(layouts.Stride.CONTACT_HIT).toBe(m._bx_Stride_ContactHit());
    expect(layouts.Stride.SENSOR).toBe(m._bx_Stride_Sensor());
    expect(layouts.Stride.JOINT_EVENT).toBe(m._bx_Stride_JointEvent());
  });

  it('ships the same exports in both flavours', () => {
    const other = flavour === 'deluxe' ? 'standard' : 'deluxe';
    const declared = exportsOf(
      readFileSync(join(root, 'src/wasm', `box3d.${other}.d.ts`), 'utf8'),
    );
    expect([...declared].sort()).toEqual([...moduleExports].sort());
  });
});
