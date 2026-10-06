import assert from 'node:assert/strict';
import { test } from 'node:test';

// The isomorphic surface: shared frontend over the wasm backend. This file
// intentionally mirrors scriptc-game's native spike (spike/box3d-native.ts)
// scenario: the two suites passing is the cross-world parity check.
import Box3D from '../dist/iso.mjs';
import EmbindBox3D from '../dist/box3d.mjs';

const b3 = await Box3D();

test('iso surface reports build capabilities', () => {
  assert.equal(typeof b3.threaded, 'boolean');
  assert.ok(b3.maxWorkers >= 1);
});

test('box falls, settles, and answers an impulse (native spike twin)', () => {
  const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });

  const ground = world.createBody({
    type: 'static',
    position: { x: 0, y: -0.5, z: 0 },
  });
  ground.createBox({ halfExtents: { x: 20, y: 0.5, z: 20 } });

  const body = world.createBody({
    type: 'dynamic',
    position: { x: 0, y: 5, z: 0 },
  });
  body.createBox({
    halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    density: 1,
    friction: 0.5,
  });

  for (let i = 0; i < 120; i++) world.step(1 / 60, 4);

  const p = body.getPosition();
  assert.ok(p.y > 0.4 && p.y < 0.6, `settled y=${p.y}`);
  assert.ok(Math.abs(p.x) < 0.01 && Math.abs(p.z) < 0.01);

  body.applyLinearImpulseToCenter({ x: 3, y: 0, z: 0 }, true);
  for (let i = 0; i < 60; i++) world.step(1 / 60, 4);
  assert.ok(body.getPosition().x > 0.2, 'impulse moved the body');

  world.destroy();
});

test('iso and embind agree on the same scenario', async () => {
  const em = await EmbindBox3D();

  function run(api) {
    const world = new api.World({ gravity: { x: 0, y: -10, z: 0 } });
    const ground = world.createBody({
      type: 'static',
      position: { x: 0, y: -0.5, z: 0 },
    });
    ground.createBox({ halfExtents: { x: 20, y: 0.5, z: 20 } });
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0.1, y: 4, z: -0.2 },
    });
    body.createBox({
      halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
      density: 1,
      friction: 0.5,
    });
    for (let i = 0; i < 180; i++) world.step(1 / 60, 4);
    const p = body.getPosition();
    world.destroy();
    return p;
  }

  const a = run(b3);
  const b = run(em);
  // Same engine, same wasm instance family: these should agree tightly.
  assert.ok(Math.abs(a.x - b.x) < 1e-4, `x: ${a.x} vs ${b.x}`);
  assert.ok(Math.abs(a.y - b.y) < 1e-4, `y: ${a.y} vs ${b.y}`);
  assert.ok(Math.abs(a.z - b.z) < 1e-4, `z: ${a.z} vs ${b.z}`);
});
