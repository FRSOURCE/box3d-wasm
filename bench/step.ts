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

const json = process.argv.includes('--json');
const results: Record<string, number> = {};

function measure(label: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < 10; i++) fn();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = (performance.now() - started) / iterations;
  results[label] = ms;
  if (!json) console.log(`${label.padEnd(56)} ${ms.toFixed(3).padStart(9)} ms`);
}

if (!json) {
  console.log(
    `${b3.flavour}, workerCount ${workerCount}, engine ${b3.version.engine}`,
  );
}
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
  const batch = world.createTransformBatch(
    world.bodies.size > 0
      ? [...world.bodies].filter((b) => b.getType() === 'dynamic')
      : [],
  );
  measure(`${count} boxes: step + bulk sync (TransformBatch.read)`, 60, () => {
    world.step(1 / 60, 4);
    batch.read();
  });
  measure(`${count} boxes: TransformBatch.read only`, 200, () => {
    batch.read();
  });
  measure(`${count} boxes: TransformBatch.write only`, 200, () => {
    batch.write();
  });
  batch.destroy();
  measure(`${count} boxes: 1000 all-hits ray casts`, 20, () => {
    for (let i = 0; i < 1000; i++) {
      world.castRay(
        { x: (i % 10) - 5, y: 20, z: (i % 7) - 3 },
        { x: 0, y: -40, z: 0 },
      );
    }
  });
  measure(`${count} boxes: 1000 AABB overlaps`, 20, () => {
    const lo = { x: -2, y: 0, z: -2 };
    const hi = { x: 2, y: 3, z: 2 };
    for (let i = 0; i < 1000; i++) world.overlapAABB(lo, hi);
  });
  measure(`${count} boxes: debug draw (bounds + contacts)`, 20, () => {
    world.debugDraw({ bounds: true, contacts: true });
  });
  world.destroy();
}

// creation and destruction: exposes anything quadratic in the body count
for (const count of [500, 2000]) {
  measure(`create + destroy ${count} bodies with a box each`, 5, () => {
    const world = new b3.World({ enableSleep: false, workerCount });
    const bodies = pile(world, count);
    for (const body of bodies) body.destroy();
    world.destroy();
  });
}

// kinematic sync: teleport many bodies from one buffer
{
  const world = new b3.World({ enableSleep: false, workerCount });
  const bodies: Body[] = [];
  for (let i = 0; i < 1000; i++) {
    const body = world.createBody({
      type: 'kinematic',
      position: { x: i % 40, y: 5, z: Math.floor(i / 40) },
    });
    body.createBox({});
    bodies.push(body);
  }
  const batch = world.createTransformBatch(bodies);
  batch.read();
  measure('1000 kinematic bodies: step + TransformBatch.write', 60, () => {
    const d = batch.data;
    for (let i = 0; i < 1000; i++) d[i * 7 + 1] += 0.001;
    batch.write();
    world.step(1 / 60, 4);
  });
  const p = { x: 0, y: 5, z: 0 };
  const q = { x: 0, y: 0, z: 0, w: 1 };
  let frame = 0;
  measure('1000 kinematic bodies: step + per-body setTransform', 60, () => {
    frame += 1;
    for (let i = 0; i < 1000; i++) {
      p.x = i % 40;
      p.y = 5 + frame * 0.001;
      p.z = Math.floor(i / 40);
      bodies[i].setTransform(p, q);
    }
    world.step(1 / 60, 4);
  });
  batch.destroy();
  world.destroy();
}

if (json) console.log(JSON.stringify({ flavour, workerCount, results }));
const pthread = (b3.raw as { PThread?: { terminateAllThreads?: () => void } })
  .PThread;
pthread?.terminateAllThreads?.();
