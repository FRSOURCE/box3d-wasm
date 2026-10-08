// Headless smoke tests for the docs/ demo: every registered sample is built on
// a bare SampleRunner (no three.js, no DOM), stepped and checked, and the
// upstream sample list in docs/parity/samples.json is held in sync with both the
// registry and the native samples app.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createHeadlessSession,
  nonFiniteBodies,
  runSample,
  type HeadlessSession,
} from '../docs/src/framework/headless.js';
import {
  filterSamples,
  findSample,
  getSamples,
  sampleKey,
} from '../docs/src/framework/registry.js';
import '../docs/src/samples/index.js';
import type { Box3D } from '../dist/index.js';
import { loadBox3D, terminateThreads } from './helpers/load.js';

const FRAMES = 120;

interface ParityEntry {
  category: string;
  name: string;
  source: string;
  status: string;
}

const parity = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../docs/parity/samples.json'),
    'utf8',
  ),
) as { samples: ParityEntry[] };

const upstreamDir = join(import.meta.dirname, '../../box3d/samples');

let b3: Box3D;
beforeAll(async () => {
  b3 = await loadBox3D();
});
afterAll(() => terminateThreads(b3));

describe('demo samples', () => {
  it('registers a sample for every ported entry in the parity list', () => {
    expect(getSamples().length).toBeGreaterThan(0);
    const registered = new Set(getSamples().map(sampleKey));
    const ported = parity.samples
      .filter((s) => s.status === 'ported')
      .map((s) => `${s.category}/${s.name}`);
    expect(
      ported.filter((key) => !registered.has(key)),
      'marked ported but not registered',
    ).toEqual([]);
    expect(
      [...registered].filter((key) => !ported.includes(key)),
      'registered but not marked ported in docs/parity/samples.json',
    ).toEqual([]);
  });

  it.each(getSamples().map((def) => [sampleKey(def), def] as const))(
    '%s steps %i frames without throwing and stays finite',
    (_key, def) => {
      const session = createHeadlessSession(b3);
      try {
        runSample(session, def, FRAMES);
        expect(session.runner.stepCount).toBe(FRAMES);
        expect(nonFiniteBodies(session.runner)).toEqual([]);
        expect(
          session.runner.world?.getAwakeBodyCount(),
        ).toBeGreaterThanOrEqual(0);
      } finally {
        session.runner.unload();
      }
    },
  );

  it.each(getSamples().map((def) => [sampleKey(def), def] as const))(
    '%s survives its controls, a restart and pause/step',
    (_key, def) => {
      const session = createHeadlessSession(b3);
      try {
        session.runner.load(def);
        triggerEveryControl(session);
        for (let i = 0; i < 30; i++) session.runner.tick();
        session.runner.restart();
        session.runner.playback.pause = true;
        const before = session.runner.stepCount;
        session.runner.tick();
        expect(session.runner.stepCount).toBe(before);
        session.runner.playback.singleStep = 2;
        session.runner.tick();
        session.runner.tick();
        session.runner.tick();
        expect(session.runner.stepCount).toBe(before + 2);
        expect(nonFiniteBodies(session.runner)).toEqual([]);
      } finally {
        session.runner.unload();
      }
    },
  );

  it('grabs a body with the mouse joint and shoots bullets', () => {
    const def = findSample('Stacking/Box Stack');
    if (!def) throw new Error('Box Stack is not registered');
    const session = createHeadlessSession(b3);
    try {
      const { runner } = session;
      runner.load(def);
      for (let i = 0; i < 30; i++) runner.tick();

      // straight down the z axis at the second cube from the bottom
      const ray = {
        origin: { x: 0, y: 2.25, z: 20 },
        direction: { x: 0, y: 0, z: -1 },
      };
      const input = {
        button: 0,
        shift: false,
        ctrl: true,
        alt: false,
        x: 0,
        y: 0,
        ray,
      };
      runner.mouseDown(input);
      expect(runner.interaction?.grabbing).toBe(true);
      expect(runner.selected).not.toBeNull();
      runner.mouseMove({
        ...input,
        ray: { ...ray, origin: { ...ray.origin, x: 3 } },
      });
      for (let i = 0; i < 30; i++) runner.tick();
      runner.mouseUp(input);
      expect(runner.interaction?.grabbing).toBe(false);

      const bodies = runner.scene?.bodyCount ?? 0;
      runner.mouseDown({ ...input, ctrl: false, shift: true });
      runner.mouseDown({ ...input, ctrl: true, shift: true });
      runner.mouseDown({ ...input, ctrl: false, alt: true, shift: true }); // a 12-bone ragdoll
      expect(runner.scene?.bodyCount).toBe(bodies + 14);
      for (let i = 0; i < 10; i++) runner.tick();
      expect(nonFiniteBodies(runner)).toEqual([]);

      // from far above, straight down: whatever is on top of the pile
      runner.clickSelect({
        origin: { x: 0, y: 500, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
      });
      expect(runner.selected).not.toBeNull();
      runner.clickSelect({
        origin: { x: 0, y: 500, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      });
      expect(runner.selected).toBeNull();
    } finally {
      session.runner.unload();
    }
  });

  it('applies the solver settings to the world', () => {
    const def = findSample('Stacking/Pyramid2D');
    if (!def) throw new Error('Pyramid2D is not registered');
    const session = createHeadlessSession(b3);
    try {
      const { runner } = session;
      runner.load(def);
      Object.assign(runner.settings, {
        enableSleep: false,
        enableWarmStarting: false,
        enableContinuous: false,
        subStepCount: 8,
        hertz: 120,
      });
      runner.tick();
      expect(runner.world?.isSleepingEnabled()).toBe(false);
      expect(runner.world?.isWarmStartingEnabled()).toBe(false);
      expect(runner.world?.isContinuousEnabled()).toBe(false);
      expect(runner.history.count).toBe(1);
      expect(runner.profile.step).toBeGreaterThanOrEqual(0);
    } finally {
      session.runner.unload();
    }
  });
});

describe('sample registry', () => {
  it('fuzzy-filters by category and name', () => {
    expect(filterSamples('boxstack').map(sampleKey)[0]).toBe(
      'Stacking/Box Stack',
    );
    expect(filterSamples('revolute').map(sampleKey)).toContain(
      'Joints/Revolute',
    );
    expect(filterSamples('zzzz')).toEqual([]);
    expect(filterSamples('').length).toBe(getSamples().length);
  });
});

describe('upstream parity list', () => {
  it('uses only ported, todo and skip:<reason> statuses', () => {
    for (const entry of parity.samples) {
      expect(entry.status, `${entry.category}/${entry.name}`).toMatch(
        /^(ported|todo|skip:.+)$/,
      );
    }
  });

  it('has no duplicate entries', () => {
    const keys = parity.samples.map((s) => `${s.category}/${s.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The native samples app lives next to this repo in the dev checkout; CI
  // checkouts without it still run the checks above.
  it.skipIf(!existsSync(upstreamDir))(
    'lists every sample the native samples app registers',
    () => {
      const upstream = new Set<string>();
      for (const file of readdirSync(upstreamDir)) {
        if (!/^sample_.*\.cpp$/.test(file)) continue;
        const text = readFileSync(join(upstreamDir, file), 'utf8');
        for (const m of text.matchAll(
          /Register(?:Sample|Replay)\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
        )) {
          upstream.add(`${m[1]}/${m[2]}`);
        }
      }
      expect(upstream.size).toBeGreaterThan(100);
      const listed = new Set(
        parity.samples.map((s) => `${s.category}/${s.name}`),
      );
      expect(
        [...upstream].filter((key) => !listed.has(key)),
        'upstream samples missing from docs/parity/samples.json',
      ).toEqual([]);
      expect([...listed].filter((key) => !upstream.has(key))).toEqual([]);
    },
  );
});

/** Pokes every widget the sample put in its panel, re-reading the panel after each change. */
function triggerEveryControl(session: HeadlessSession): void {
  const seen = new Set<string>();
  for (let pass = 0; pass < 4; pass++) {
    for (const control of [...session.panel.controls]) {
      const key = `${control.kind}:${control.label}:${pass}`;
      if (seen.has(key) || control.kind === 'text') continue;
      seen.add(key);
      control.trigger();
    }
  }
}
