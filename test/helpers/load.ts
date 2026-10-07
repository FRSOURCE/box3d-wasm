// Loads the built package for the flavour the vitest project runs under.
import type { Box3D, Body, World } from '../../dist/index.js';

export type Flavour = 'standard' | 'deluxe';

export const flavour: Flavour =
  process.env.BOX3D_FLAVOUR === 'deluxe' ? 'deluxe' : 'standard';

export async function loadBox3D(which: Flavour = flavour): Promise<Box3D> {
  const entry =
    which === 'deluxe'
      ? await import('../../dist/deluxe.js')
      : await import('../../dist/standard.js');
  return entry.default();
}

/** emscripten keeps the pool alive; vitest will not exit while it is up. */
export function terminateThreads(b3: Box3D): void {
  const pthread = (b3.raw as { PThread?: { terminateAllThreads?: () => void } })
    .PThread;
  pthread?.terminateAllThreads?.();
}

export const DT = 1 / 60;
export const SUBSTEPS = 4;

export function stepSeconds(world: World, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) world.step(DT, SUBSTEPS);
}

export function stepTimes(world: World, steps: number): void {
  for (let i = 0; i < steps; i++) world.step(DT, SUBSTEPS);
}

export function ground(world: World, halfWidth = 20): Body {
  const body = world.createBody({
    type: 'static',
    position: { x: 0, y: -0.5, z: 0 },
  });
  body.createBox({ halfExtents: { x: halfWidth, y: 0.5, z: halfWidth } });
  return body;
}

export function box(
  world: World,
  x: number,
  y: number,
  z: number,
  half = 0.5,
): Body {
  const body = world.createBody({ type: 'dynamic', position: { x, y, z } });
  body.createBox({ halfExtents: { x: half, y: half, z: half }, density: 1 });
  return body;
}

/** A grid of boxes that settles into a pile with several islands. */
export function pile(world: World, count: number): Body[] {
  ground(world, 40);
  const bodies: Body[] = [];
  for (let i = 0; i < count; i++) {
    bodies.push(
      box(
        world,
        (i % 10) * 1.1 - 5.5,
        1 + Math.floor(i / 10) * 1.1,
        (i % 3) * 0.05,
      ),
    );
  }
  return bodies;
}

export function near(
  actual: number,
  expected: number,
  tolerance = 1e-5,
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
