# @frsource/box3d-wasm

[![npm version](https://img.shields.io/npm/v/@frsource/box3d-wasm.svg)](https://www.npmjs.com/package/@frsource/box3d-wasm)
[![CI](https://github.com/FRSOURCE/box3d-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/FRSOURCE/box3d-wasm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@frsource/box3d-wasm.svg)](LICENSE)

[Box3D](https://github.com/erincatto/box3d) compiled to WebAssembly, with SIMD and optional wasm threads. Works in browsers and Node.js from a single package.

This is a fork of [monteslu/box3d-wasm](https://github.com/monteslu/box3d-wasm) published under the `@frsource` npm scope. It tracks Box3D `main` automatically (see [Tracking Box3D](#tracking-box3d)), ships generated TypeScript declarations, and is where the bindings needed by [`@frsource/babylon-box3d`](https://github.com/FRSOURCE/babylon-box3d) are added.

See it in action: [live three.js demo](https://box3d.netlify.app/) ([source](https://github.com/monteslu/threejs-box3d-demo)) with ragdolls, dominoes, a drivable buggy, and more.

Box3D is a 3D rigid body physics engine written by Erin Catto, the author of Box2D. All engine design and implementation credit belongs to him. This package only compiles his library to wasm and adds a JavaScript binding layer. Box3D is MIT licensed by Erin Catto; the full upstream license ships in this package as LICENSE.box3d.txt.

## Install

```bash
npm i @frsource/box3d-wasm
```

## Quick start

```js
import Box3D from '@frsource/box3d-wasm';

const b3 = await Box3D();

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

for (let i = 0; i < 120; i++) {
  world.step(1 / 60, 4);
}

console.log(body.getPosition()); // { x: ~0, y: ~0.5, z: ~0 }
```

The same code runs in Node.js and in the browser. The default import auto-detects thread support and loads the best build. Both builds use wasm SIMD, which every modern browser and Node.js supports. The wasm file is loaded relative to the module, so bundlers that understand `new URL(..., import.meta.url)` (Vite, webpack 5, Rollup) pick it up automatically.

## Flavours

| import                          | threads | picked by the default import when                                      |
| ------------------------------- | ------- | ---------------------------------------------------------------------- |
| `@frsource/box3d-wasm/deluxe`   | yes     | SharedArrayBuffer is usable (Node.js, or a cross-origin isolated page) |
| `@frsource/box3d-wasm/standard` | no      | everything else                                                        |

`@frsource/box3d-wasm` (the default import) runs the detection above and returns whichever module fits. Import a specific flavour directly when you want to skip detection:

```js
import Box3D from '@frsource/box3d-wasm/deluxe';

const b3 = await Box3D();
const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 }, workerCount: 4 });
```

`workerCount` enables Box3D's internal multithreaded solver. It is clamped to `[1, b3.maxWorkers]`. The single threaded builds ignore it. Check `b3.threaded` at runtime to see which build you got.

### Serving requirements for threads

Wasm threads use SharedArrayBuffer. Browsers require the page to be cross-origin isolated, so serve your app with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Node.js needs no special setup; worker threads are used automatically.

## API overview

Vectors are plain objects `{ x, y, z }` and quaternions are `{ x, y, z, w }`, so values pass directly to and from libraries like three.js.

### World

```js
const world = new b3.World({
  gravity: { x: 0, y: -10, z: 0 },
  enableSleep: true,
  enableContinuous: true,
  workerCount: 4, // deluxe build only
});

world.step(1 / 60, 4); // timeStep, subStepCount
world.setGravity({ x: 0, y: -3.7, z: 0 });
world.getAwakeBodyCount();
world.castRayClosest(origin, translation, filter);
world.explode({ position, radius: 3, falloff: 2, impulsePerArea: 10 });
world.getBodyEvents(); // [{ userData, position, rotation, fellAsleep }]
world.getContactEvents(); // { begin: [...], end: [...], hit: [...] }
world.getSensorEvents(); // { begin: [...], end: [...] }
world.destroy();
```

### Bodies

```js
const body = world.createBody({
  type: 'dynamic', // 'static' | 'kinematic' | 'dynamic'
  position: { x: 0, y: 5, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularDamping: 0.05,
  motionLocks: { angularX: true, angularZ: true },
});

body.getPosition();
body.getRotation();
body.getTransform();
body.setLinearVelocity(v);
body.applyLinearImpulseToCenter(v, true);
body.applyForce(force, worldPoint, true);
body.applyTorque(t, true);
body.getMass();
body.isAwake();
body.setAwake(true);
body.destroy();
```

### Shapes

Each shape creator takes one options object with the geometry plus material fields (`density`, `friction`, `restitution`, `isSensor`, `filter`, event flags):

```js
body.createBox({ halfExtents: { x: 1, y: 0.5, z: 2 }, friction: 0.7 });
body.createSphere({ radius: 0.5, restitution: 0.8 });
body.createCapsule({ height: 1.2, radius: 0.3 });
body.createHull({ points: [{ x, y, z }, ...] });
```

### Joints

Distance, revolute, spherical, prismatic, weld, motor, wheel, parallel, and filter joints are bound:

```js
const hinge = world.createRevoluteJoint(bodyA, bodyB, {
  localFrameA: { position: { x: 0, y: 1, z: 0 } },
  enableMotor: true,
  motorSpeed: 5,
  maxMotorTorque: 100,
});
hinge.getAngle();
```

### Events and userData tags

Every body and shape gets an auto-assigned numeric `userData` tag (you can overwrite it with your own number). Event arrays reference these tags, so you can map physics events back to your scene objects with a plain `Map`.

### Memory notes

Wrapper objects returned by embind (`World`, `Body`, `Shape`, joints) are tiny handles. Call `.delete()` when you no longer need the JS handle, and `.destroy()` to remove the underlying object from the simulation. Destroying a world frees every body, shape, and joint inside it.

## The isomorphic surface (`@frsource/box3d-wasm/iso`)

For projects where the same game source also compiles to a NATIVE binary
(e.g. [scriptc-game](https://github.com/monteslu/scriptc-game)), the
`/iso` entry serves the same engine through a shared binding frontend:

```js
import Box3D from '@frsource/box3d-wasm/iso';

const b3 = await Box3D();
const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });
```

`src/frontend.ts` is the entire API personality, written against a flat
scalar contract (`src/backend.d.ts`). Here it drives the wasm build; a
native host vendors the identical file and implements the same contract
over FFI against Box3D built as a static library at the same pinned SHA.
One binding source, two worlds.

The iso surface currently covers worlds (step, gravity, explode, worker
threads), rigid bodies (create/read, velocities, impulses, teleports,
gravity scale, motion locks) and box/sphere shapes; it grows toward parity
with the embind API above, which remains the default export.

## Building from source

Requires [emsdk](https://emscripten.org/docs/getting_started/downloads.html) (tested with 6.0.2), CMake, the Node version from `.nvmrc` and pnpm.

```bash
nvm use            # picks the Node version from .nvmrc
pnpm install       # also fetches the pinned Box3D source (the @erincatto/box3d git dependency)
pnpm build         # builds standard and deluxe flavours plus their .d.ts into dist/
pnpm test
pnpm lint          # eslint + prettier + clang-format
pnpm fix           # auto-fixes what the linters can
```

Commits follow the [Angular convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit); every push to `main` is released by [semantic-release](https://github.com/semantic-release/semantic-release) and published to npm through trusted publishing.

## Tracking Box3D

Box3D is pinned as a git dependency in `package.json` (`@erincatto/box3d`: `github:erincatto/box3d#<commit>`). Renovate opens a pull request whenever Box3D's `main` moves; CI rebuilds both flavours and runs the tests against the new commit, and a green build is merged and released automatically. A Box3D change that breaks the binding fails CI and waits for a fix in `csrc/glue.cpp`.

## TypeScript

The declarations in `dist/*.d.ts` are generated by emscripten from the embind registrations at build time, so they always match the compiled binding. Parameters that take plain objects (vectors, quaternions, option bags) are typed as `any` for now.

## License

MIT for the wrapper and build scripts, see LICENSE.

Box3D itself is Copyright (c) Erin Catto and MIT licensed, see LICENSE.box3d.txt and the upstream repository at https://github.com/erincatto/box3d. If you use this package, the physics engine you are running is his work.
