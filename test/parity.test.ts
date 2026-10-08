// Drift gate against the pinned Box3D headers. It fails when upstream adds,
// removes or reshapes API that the shim has not been reviewed against.
//
// To resolve a failure: wrap the symbol (or mark it `skip:` with a reason in
// parity/manifest.json), fix the hardcoded enum maps and def layouts, then
// run `pnpm parity:update` to refresh the snapshots. The `update-box3d` skill
// walks through this.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEADER_DIR,
  engineSha,
  extractConstants,
  extractDefs,
  extractEnums,
  extractFunctions,
  loadManifest,
  unmappedDefFields,
  wrappedFunctions,
} from '../scripts/parity/extract.mjs';

const manifest = loadManifest();
const functions = extractFunctions();
const wrapped = new Set(wrappedFunctions(functions));
const strict = process.env.PARITY_STRICT === '1';

describe('upstream parity', () => {
  it('pins the engine commit the manifest was generated from', () => {
    expect(
      manifest.engineSha,
      'run `pnpm parity:update` after bumping @erincatto/box3d',
    ).toBe(engineSha());
  });

  it('classifies every engine function as wrapped or explicitly skipped', () => {
    const unclassified = functions.filter(
      (f) => !wrapped.has(f) && !(f in manifest.unwrapped),
    );
    expect(unclassified, 'new upstream API with no decision').toEqual([]);
  });

  it('keeps the manifest free of stale entries', () => {
    const known = new Set(functions);
    const gone = Object.keys(manifest.unwrapped).filter((f) => !known.has(f));
    const nowWrapped = Object.keys(manifest.unwrapped).filter((f) =>
      wrapped.has(f),
    );
    expect(gone, 'listed in the manifest but removed upstream').toEqual([]);
    expect(
      nowWrapped,
      'wrapped by the shim; drop them from the manifest',
    ).toEqual([]);
  });

  it('gives every unwrapped function a skip: or todo: reason', () => {
    const bad = Object.entries(manifest.unwrapped).filter(
      ([, reason]) => !/^(skip|todo): ./.test(String(reason)),
    );
    expect(bad).toEqual([]);
  });

  it.skipIf(!strict)('has no todo entries left (PARITY_STRICT=1)', () => {
    const todo = Object.entries(manifest.unwrapped)
      .filter(([, reason]) => String(reason).startsWith('todo:'))
      .map(([name]) => name);
    expect(todo).toEqual([]);
  });

  it('maps every def struct field or records why not', () => {
    const current = unmappedDefFields();
    const unclassified: string[] = [];
    for (const [def, fields] of Object.entries(current)) {
      for (const field of fields) {
        if (!manifest.unmappedDefFields[def]?.[field])
          unclassified.push(`${def}.${field}`);
      }
    }
    expect(unclassified, 'new upstream def fields with no decision').toEqual(
      [],
    );
    const stale: string[] = [];
    for (const [def, fields] of Object.entries(manifest.unmappedDefFields)) {
      for (const field of Object.keys(fields)) {
        if (!current[def]?.includes(field)) stale.push(`${def}.${field}`);
      }
    }
    expect(stale, 'now mapped by the shim, or removed upstream').toEqual([]);
  });

  it.skipIf(!strict)('has no todo def fields left (PARITY_STRICT=1)', () => {
    const todo = Object.entries(manifest.unmappedDefFields).flatMap(
      ([def, fields]) =>
        Object.entries(fields)
          .filter(([, reason]) => reason.startsWith('todo:'))
          .map(([field]) => `${def}.${field}`),
    );
    expect(todo).toEqual([]);
  });

  it('matches the enum snapshot', () => {
    expect(extractEnums()).toEqual(manifest.enums);
  });

  it('matches the def struct snapshot (field names, types and order)', () => {
    expect(extractDefs()).toEqual(manifest.defs);
  });

  it('matches the constants snapshot', () => {
    expect(extractConstants()).toEqual(manifest.constants);
  });
});

function extractStructFields(name: string): string[] | undefined {
  const text = readFileSync(join(HEADER_DIR, 'types.h'), 'utf8').replace(
    /\/\/[^\n]*/g,
    '',
  );
  const m = new RegExp(
    `typedef struct ${name}\\s*\\{([\\s\\S]*?)\\}\\s*${name};`,
  ).exec(text);
  if (!m) return undefined;
  return m[1]
    .split(';')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => /(\w+)\s*$/.exec(f)?.[1] ?? f);
}

describe('hardcoded enum maps follow the headers', () => {
  const read = (file: string): string =>
    readFileSync(join(import.meta.dirname, '../src', file), 'utf8');

  const tsList = (source: string, name: string): string[] => {
    const m = new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(
      source,
    );
    if (!m) throw new Error(`${name} not found`);
    return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1].toLowerCase());
  };

  const headerList = (enumName: string, suffix: string): string[] =>
    (extractEnums()[enumName] as string[])
      .map((member) => member.split('=')[0].trim())
      .filter((member) => !member.endsWith('Count'))
      .map((member) =>
        member
          .replace(/^b3_/, '')
          .replace(new RegExp(`${suffix}$`, 'i'), '')
          .toLowerCase(),
      );

  const sameOrder = (ts: string[], header: string[]): void => {
    expect(ts).toHaveLength(header.length);
    ts.forEach((name, i) =>
      expect(name.startsWith(header[i]), `${name} vs ${header[i]}`).toBe(true),
    );
  };

  it('SHAPE_TYPES', () => {
    sameOrder(
      tsList(read('shape.ts'), 'SHAPE_TYPES'),
      headerList('b3ShapeType', 'Shape'),
    );
  });

  it('JOINT_TYPES', () => {
    sameOrder(
      tsList(read('joints.ts'), 'JOINT_TYPES'),
      headerList('b3JointType', 'Joint'),
    );
  });

  it('PROFILE_FIELDS follow b3Profile', () => {
    const header = (extractStructFields('b3Profile') ?? []).map((f) =>
      f.toLowerCase(),
    );
    const ts = tsList(read('world.ts'), 'PROFILE_FIELDS');
    expect(ts).toEqual(header);
  });

  it('BODY_TYPES', () => {
    sameOrder(
      tsList(read('body.ts'), 'BODY_TYPES'),
      headerList('b3BodyType', 'Body'),
    );
  });
});
