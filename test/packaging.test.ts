// The build a consumer installs: pack the tarball, install it into a scratch
// project, import every entry in a child Node process, and type-check a
// consumer file against the shipped declarations under two module
// resolution modes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { flavour } from './helpers/load.js';

const root = join(import.meta.dirname, '..');
let dir: string;

const consumer = `
import Box3D, { canUseThreads, vec3 } from '@frsource/box3d-wasm';
import standard from '@frsource/box3d-wasm/standard';
import deluxe from '@frsource/box3d-wasm/deluxe';
import type { Body, World, RayHit } from '@frsource/box3d-wasm';

export async function main(): Promise<number> {
  const b3 = await (canUseThreads() ? deluxe() : standard());
  const auto = await Box3D();
  const world: World = new b3.World({ gravity: vec3(0, -10, 0) });
  const body: Body = world.createBody({ type: 'dynamic', position: vec3(0, 2, 0) });
  body.createBox({ density: 1 });
  world.step(1 / 60, 4);
  const hit: RayHit = world.castRayClosest(vec3(0, 5, 0), vec3(0, -10, 0));
  const y = body.getPosition().y + (hit.hit ? 1 : 0) + auto.maxWorkers;
  world.destroy();
  return y;
}
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'box3d-wasm-pack-'));
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], {
    cwd: root,
    stdio: 'pipe',
  });
  const tarball = readdirSync(dir).find((name) => name.endsWith('.tgz'));
  expect(tarball).toBeDefined();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
  );
  execFileSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${tarball}`],
    { cwd: dir, stdio: 'pipe' },
  );
  writeFileSync(join(dir, 'consumer.ts'), consumer);
}, 120_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(flavour !== 'standard')('packaged build', () => {
  it('ships every entry and runs in a fresh Node process', () => {
    const script = `
      const standard = (await import('@frsource/box3d-wasm/standard')).default;
      const deluxe = (await import('@frsource/box3d-wasm/deluxe')).default;
      const auto = (await import('@frsource/box3d-wasm')).default;
      const results = [];
      for (const load of [standard, deluxe, auto]) {
        const b3 = await load();
        const world = new b3.World();
        const body = world.createBody({ type: 'dynamic', position: { x: 0, y: 2, z: 0 } });
        body.createBox();
        world.step(1 / 60, 4);
        results.push([b3.flavour, body.getPosition().y < 2]);
        world.destroy();
        b3.raw.PThread?.terminateAllThreads?.();
      }
      console.log(JSON.stringify(results));
    `;
    // emscripten's worker threads inherit execArgv, where --input-type is refused; run a file instead
    writeFileSync(join(dir, 'run.mjs'), script);
    const output = execFileSync('node', ['run.mjs'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(JSON.parse(output.trim())).toEqual([
      ['standard', true],
      ['deluxe', true],
      ['deluxe', true],
    ]);
  });

  it.each(['bundler', 'nodenext'])(
    'type-checks a consumer with moduleResolution %s',
    (resolution) => {
      const tsconfig = {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          target: 'es2022',
          module: resolution === 'bundler' ? 'esnext' : 'nodenext',
          moduleResolution: resolution,
          lib: ['es2022', 'dom'],
        },
        files: ['consumer.ts'],
      };
      writeFileSync(
        join(dir, `tsconfig.${resolution}.json`),
        JSON.stringify(tsconfig),
      );
      const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
      const result = execFileSync(
        'node',
        [tsc, '-p', `tsconfig.${resolution}.json`],
        { cwd: dir, encoding: 'utf8' },
      );
      expect(result).toBe('');
    },
  );
});
