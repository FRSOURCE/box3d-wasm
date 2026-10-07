// A regression yardstick, not a test: `pnpm bench [standard|deluxe] [workers]`.
// Compare the numbers in any PR that touches the hot path.
// Self-contained on purpose: node strips types but does not rewrite .js specifiers to .ts.
import type { Body, Box3D, World } from '../dist/index.js';

async function loadBox3D(which: 'standard' | 'deluxe'): Promise<Box3D> {
  const entry =
    which === 'deluxe'
      ? await import('../dist/deluxe.js')
      : await import('../dist/standard.js');
  return entry.default();
}

function pile(world: World, count: number): Body[] {
  const ground = world.createBody({ position: { x: 0, y: -0.5, z: 0 } });
  ground.createBox({ halfExtents: { x: 40, y: 0.5, z: 40 } });
  const bodies: Body[] = [];
  for (let i = 0; i < count; i++) {
    const body = world.createBody({
      type: 'dynamic',
      position: {
        x: (i % 10) * 1.1 - 5.5,
        y: 1 + Math.floor(i / 10) * 1.1,
        z: (i % 3) * 0.05,
      },
    });
    body.createBox({ density: 1 });
    bodies.push(body);
  }
  return bodies;
}

function stepTimes(world: World, steps: number): void {
  for (let i = 0; i < steps; i++) world.step(1 / 60, 4);
}

const flavour = process.argv[2] === 'deluxe' ? 'deluxe' : 'standard';
const workerCount = Number(process.argv[3] ?? 1);
const b3 = await loadBox3D(flavour);

function measure(label: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < 10; i++) fn();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = (performance.now() - started) / iterations;
  console.log(`${label.padEnd(56)} ${ms.toFixed(3).padStart(9)} ms`);
}

console.log(
  `${b3.flavour}, workerCount ${workerCount}, engine ${b3.version.engine}`,
);
for (const count of [500, 2000]) {
  const world = new b3.World({ enableSleep: false, workerCount });
  pile(world, count);
  stepTimes(world, 60);
  const sync = new Float32Array(count * 7);
  const p = { x: 0, y: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0, w: 1 };

  measure(`${count} boxes: step`, 60, () => {
    world.step(1 / 60, 4);
  });
  measure(`${count} boxes: step + sync through move events`, 60, () => {
    world.step(1 / 60, 4);
    const moves = world.getMoveEvents();
    for (let i = 0; i < moves.count; i++) {
      moves.copyPositionTo(i, p);
      moves.copyRotationTo(i, q);
      const at = i * 7;
      sync[at] = p.x;
      sync[at + 1] = p.y;
      sync[at + 2] = p.z;
      sync[at + 3] = q.x;
      sync[at + 4] = q.y;
      sync[at + 5] = q.z;
      sync[at + 6] = q.w;
    }
  });
  measure(`${count} boxes: 1000 closest ray casts`, 20, () => {
    for (let i = 0; i < 1000; i++) {
      world.castRayClosest(
        { x: (i % 10) - 5, y: 20, z: (i % 7) - 3 },
        { x: 0, y: -40, z: 0 },
      );
    }
  });
  world.destroy();
}
const pthread = (b3.raw as { PThread?: { terminateAllThreads?: () => void } })
  .PThread;
pthread?.terminateAllThreads?.();
