<p align="center">
  <a href="https://www.npmjs.com/package/@frsource/box3d-wasm">
    <img src="https://img.shields.io/npm/v/@frsource/box3d-wasm" alt="NPM version badge">
  </a>
  <a href="https://github.com/FRSOURCE/box3d-wasm/actions/workflows/ci.yml">
    <img src="https://github.com/FRSOURCE/box3d-wasm/actions/workflows/ci.yml/badge.svg" alt="CI status badge">
  </a>
  <a href="https://github.com/semantic-release/semantic-release">
    <img src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg" alt="semantic-release badge">
  </a>
  <a href="https://github.com/FRSOURCE/box3d-wasm/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/FRSOURCE/box3d-wasm" alt="license MIT badge">
  </a>
</p>

<h1 align="center">Box3D WASM - Erin Catto's 3D physics engine for browsers and Node.js! 🧊</h1>

<p align="center">
  <a href="#quick-start">Getting Started</a>
  ·
  <a href="#api">API</a>
  ·
  <a href="https://frsource.github.io/box3d-wasm/" target="_blank">Demo</a>
  ·
  <a href="https://github.com/FRSOURCE/box3d-wasm/issues">File an Issue</a>
  ·
  <a href="#questions">Have a question or an idea?</a>
  <br>
</p>

<p align="center">
  <br>
  <i><a href="https://github.com/erincatto/box3d">Box3D</a> compiled to WebAssembly with SIMD and optional wasm threads
    <br>One package for browsers and Node.js, auto-detecting thread support
    <br>Plain <code>{ x, y, z }</code> vectors and <code>{ x, y, z, w }</code> quaternions that drop straight into three.js or Babylon.js
    <br>Rigid bodies, boxes, spheres, capsules, convex hulls, nine joint types, ray casts, explosions and events
    <br>A typed TypeScript frontend over a flat C shim: no <code>any</code>, no allocations per frame
    <br>Tracks Box3D <code>main</code> automatically: every upstream commit is rebuilt, tested and released
    <br>Published under <a href="https://opensource.org/licenses/MIT" target="_blank">MIT</a> license</i>
  <br>
  <br>
</p>

Box3D is a 3D rigid body physics engine written by [Erin Catto](https://github.com/erincatto), the author of Box2D. All engine design and implementation credit belongs to him; this package compiles his library to wasm and adds a JavaScript binding layer.

This is a fork of [monteslu/box3d-wasm](https://github.com/monteslu/box3d-wasm) published under the `@frsource` npm scope. It is where the bindings needed by [`@frsource/babylon-box3d`](https://github.com/FRSOURCE/babylon-box3d) are added. See it in action in the [live three.js demo](https://frsource.github.io/box3d-wasm/) ([source](docs/)), a port of the upstream Box3D samples app.

## Quick start

### Installation

```bash
npm install @frsource/box3d-wasm

yarn add @frsource/box3d-wasm

pnpm add @frsource/box3d-wasm
```

### Modern JS/TypeScript

```ts
import Box3D, { vec3 } from '@frsource/box3d-wasm';

const b3 = await Box3D();
const world = new b3.World({ gravity: vec3(0, -10, 0) });

const ground = world.createBody({ type: 'static', position: vec3(0, -0.5, 0) });
ground.createBox({ halfExtents: vec3(20, 0.5, 20) });

const crate = world.createBody({ type: 'dynamic', position: vec3(0, 5, 0) });
crate.createBox({
  halfExtents: vec3(0.5, 0.5, 0.5),
  density: 1,
  friction: 0.5,
});

for (let i = 0; i < 120; i++) {
  world.step(1 / 60, 4); // timeStep in seconds, sub-step count
}

crate.getPosition(); // { x: ~0, y: ~0.5, z: ~0 }

world.destroy(); // frees every body, shape and joint in it
```

The same code runs in Node.js and in the browser. The wasm file is loaded relative to the module, so bundlers that understand `new URL(..., import.meta.url)` (Vite, webpack 5, Rollup) pick it up automatically.

Syncing a scene every frame costs no allocations: bodies that moved come back as one reader over a flat buffer.

```ts
const position = vec3();
const rotation = quat();

world.step(1 / 60, 4);
const moves = world.getMoveEvents();
for (let i = 0; i < moves.count; i++) {
  const body = moves.bodyAt(i);
  moves.copyPositionTo(i, position);
  moves.copyRotationTo(i, rotation);
  // write position and rotation into the mesh that owns `body`
}
```

### Flavours

Both builds use wasm SIMD, which every modern browser and Node.js supports. The only runtime question is threads:

| import                          | threads | picked by the default import when                                      |
| ------------------------------- | ------- | ---------------------------------------------------------------------- |
| `@frsource/box3d-wasm/deluxe`   | yes     | SharedArrayBuffer is usable (Node.js, or a cross-origin isolated page) |
| `@frsource/box3d-wasm/standard` | no      | everything else                                                        |

`@frsource/box3d-wasm` (the default import) runs the detection and returns whichever module fits. Import a flavour directly to skip detection:

```ts
import Box3D from '@frsource/box3d-wasm/deluxe';

const b3 = await Box3D();
b3.threaded; // true
const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 }, workerCount: 4 });
```

`workerCount` is the number of threads a step uses, the calling thread included. It is clamped to `[1, b3.maxWorkers]`, `'auto'` means `b3.maxWorkers`, and the single threaded build always runs on one. Worlds share one thread pool that is created on demand and never joined, so destroying and recreating worlds is cheap.

Wasm threads use SharedArrayBuffer, which browsers only expose on cross-origin isolated pages, so serve your app with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Node.js needs no special setup; worker threads are used automatically.

## Demo

[frsource.github.io/box3d-wasm](https://frsource.github.io/box3d-wasm/) is a three.js showcase built in `docs/` against this package. It runs the threaded (`deluxe`) build on GitHub Pages by registering a small service worker that adds the cross-origin isolation headers the host cannot send, and falls back to the single-threaded build when that is not possible.

Run it locally (the dev server sends the isolation headers itself, so no service worker is involved):

```bash
pnpm build                                   # the demo links the library from dist/
pnpm --filter @frsource/box3d-wasm-demo dev  # or: pnpm dev
```

| URL parameter                  | effect                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- |
| `?sample=Stacking/Box%20Stack` | start on a sample, `Category/Name` (the picker and menus keep it in sync) |
| `?threads=0`                   | force the single-threaded build                                           |
| `?threads=4`                   | threaded build with four workers (clamped to `maxWorkers`)                |
| `?ff=600`                      | fast-forward that many steps before the first frame                       |

The demo mirrors the native samples app in [`box3d/samples`](https://github.com/erincatto/box3d/tree/main/samples): a category menu, a fuzzy sample picker, a solver panel, mouse-joint grabbing, shooting, debug-draw toggles and a profile and counters drawer.

| input                       | action                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `Ctrl+O`                    | fuzzy sample picker (`[` and `]` step through the list)            |
| `P`, `O` (`Shift+O`), `R`   | pause, single step (5 steps), restart                              |
| `Tab`, `M`, `?`             | hide the UI, diagnostics drawer (profile, counters), controls help |
| `F`                         | frame the selection, or the whole world                            |
| click                       | select a body (outlined)                                           |
| `Ctrl` + drag               | grab a dynamic body with a kinematic mouse body and a motor joint  |
| `Shift` + click             | shoot a sphere (`Ctrl`: spinning cylinder, `Alt`: ragdoll stub)    |
| drag, scroll, `Alt` + mouse | orbit, zoom, pan: `Alt` with left, middle and right drags          |

The View menu toggles the debug draw layers (`world.debugDraw()`: joints, bounds, contacts, normals, forces, islands, mass, sleep, graph colours). The Solver section of the info panel edits sub-steps, hertz, workers (deluxe build), contact recycling, sleeping, warm starting and continuous collision. The threads toggle sits there too. The cross-origin isolation service worker follows the approach from [pryme8's babylon-box3d demo](https://github.com/pryme8/babylon-box3d).

### Adding a sample

Samples live in `docs/src/samples/<category>.ts`, one file per upstream `sample_<category>.cpp` (the empty files are waiting to be filled), and are loaded by `docs/src/samples/index.ts`. A sample registers itself with `registerSample` and builds its world through the context, which also creates the matching three.js meshes:

```ts
import { registerSample } from '../framework/registry.js';

registerSample({
  category: 'Stacking',
  name: 'Box Stack',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 20, z: 0 }); // yaw, pitch (deg), radius, pivot; skipped on restart
    ctx.scene.groundBox(40); // upstream AddGroundBox
    const body = ctx.scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 1, z: 0 },
    });
    ctx.scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });
    return {
      // all optional: setup, step(dt) (call ctx.stepWorld(dt)), keyboard, mouseDown/Move/Up,
      // ui(panel), draw(canvas), hasSolverControls, destroy
      ui(panel) {
        panel.slider('Speed', 1, { min: 0, max: 10 }, (value) =>
          ctx.world.setGravity({ x: 0, y: -value, z: 0 }),
        );
      },
    };
  },
});
```

`ctx.scene` records every body and shape as plain data, so rendering stays out of the sample: a `TransformBatch` copies all poses out of wasm in one call per frame. Use `scene.createBody/destroyBody/setBodyType` rather than `world.createBody` and `body.destroy()` for anything that should have a mesh, and `scene.box/sphere/capsule/hull/cylinder/mesh/heightField` for shapes. Samples must not import `three` or touch the DOM, and should import the library only as types: that is what lets `test/demo.test.ts` run every registered sample headlessly (120 steps, finite positions, every panel control triggered, restart and pause). After porting, flip the sample's status from `todo` to `ported` in `docs/parity/samples.json`, which lists every sample of the upstream app; the test fails when the list and the registry disagree.

## API

The package is a TypeScript frontend over a flat C shim; the declarations shipped in `dist/` are the complete reference. This section is the map.

### Conventions

- Vectors are plain `{ x, y, z }` objects and quaternions are `{ x, y, z, w }`. Transforms are `{ position, rotation }`. `vec3()`, `quat()`, `transform()` and `mat3()` are exported helpers; values pass directly to and from three.js, Babylon.js and friends.
- Every creator takes one options object applied over the Box3D default definition, so every field is optional and documented in the declarations.
- Angles are radians, lengths are meters, masses are kilograms, and `hertz` / `dampingRatio` pairs configure Box3D's soft constraints.
- Getters that return a vector, quaternion or struct accept an optional `out` object and return it, so a hot loop can reuse one. Without `out` they allocate.
- `World`, `Body`, `Shape` and the joint classes are handles over slots in the shim. `destroy()` removes the object from the simulation and marks the handle and everything it owns dead; a dead handle throws on use and reports `alive === false` and `isValid() === false`. There is nothing to free on the JS side.
- Events and query results refer to the handles themselves (`moves.bodyAt(i)` is the `Body` you created), so no user data map is needed.
- 64-bit filter bits and material ids accept `number | bigint`; getters return a `number` whenever the high word is zero.

### Module

```ts
const b3 = await Box3D(moduleOptions?);
```

| member            | description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| `b3.World`        | the world class: `new b3.World(options)`                                                |
| `b3.threaded`     | `true` in the deluxe (wasm threads) build                                               |
| `b3.maxWorkers`   | largest `workerCount` a world can use, the calling thread included; `1` without threads |
| `b3.flavour`      | `'standard'` or `'deluxe'`                                                              |
| `b3.version`      | `{ engine, engineSha }`: Box3D's version and the commit this build compiled             |
| `b3.raw`          | the emscripten module, for calling the shim's `_bx_*` exports directly                  |
| `canUseThreads()` | named export of the default entry: whether the deluxe build can load here               |

`moduleOptions` reach emscripten: `locateFile(path, prefix)` for custom asset URLs, `pthreadPoolSize` (deluxe) for the number of workers to pre-spawn, `print` and `printErr`.

### World

`new b3.World({ gravity, enableSleep, enableContinuous, restitutionThreshold, hitEventThreshold, contactHertz, contactDampingRatio, contactSpeed, maximumLinearSpeed, restitutionIterations, enableRestitutionPropagation, workerCount, capacity })`. `workerCount` takes a number or `'auto'` (= `b3.maxWorkers`) and is clamped to the pool.

| method                                                               | description                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `step(timeStep, subStepCount = 4)`                                   | advance the simulation; `1 / 60` and `4` are good defaults                   |
| `getGravity(out?)` / `setGravity(v)`                                 | world gravity                                                                |
| `enableSleeping(flag)` / `isSleepingEnabled()`                       | sleeping for the whole world                                                 |
| `enableContinuous(flag)` / `isContinuousEnabled()`                   | continuous collision for fast bodies                                         |
| `setMaximumLinearSpeed(v)` / `getMaximumLinearSpeed()`               | speed clamp for all bodies                                                   |
| `setContactTuning(hertz, dampingRatio, contactSpeed)`                | contact softness                                                             |
| `setRestitutionThreshold(v)` / `setHitEventThreshold(v)` (+ getters) | event and bounce thresholds                                                  |
| `getAwakeBodyCount()` / `getWorkerCount()`                           | bodies simulating; threads a step uses                                       |
| `createBody(options)`                                                | see [Bodies](#bodies)                                                        |
| `create<Type>Joint(bodyA, bodyB, options)`                           | see [Joints](#joints)                                                        |
| `castRayClosest(origin, translation, filter?)`                       | see [Queries](#queries)                                                      |
| `explode({ position, radius, falloff, impulsePerArea, maskBits })`   | radial impulse on spheres, capsules and hulls                                |
| `getMoveEvents()` and the other `get*Events()`                       | see [Events](#events)                                                        |
| `getProfile(out?)` / `getCounters(out?)`                             | the last step's timings in milliseconds (23 fields) and the world's counters |
| `bodies` / `joints`                                                  | live sets of the handles in this world                                       |
| `isValid()` / `destroy()`                                            | destroying a world frees every body, shape and joint inside it               |

### Bodies

```ts
const body = world.createBody({
  type: 'dynamic', // 'static' | 'kinematic' | 'dynamic'
  position: vec3(0, 5, 0),
  rotation: quat(),
  linearVelocity: vec3(),
  angularDamping: 0.05,
  motionLocks: { angularX: true, angularZ: true },
  name: 'crate',
});
```

Options follow `b3BodyDef`: `type`, `position`, `rotation`, `linearVelocity`, `angularVelocity`, `linearDamping`, `angularDamping`, `gravityScale`, `sleepThreshold`, `safetyFactor`, `enableSleep`, `isAwake`, `isBullet`, `isEnabled`, `allowFastRotation`, `enableContactRecycling`, `motionLocks`, `name`.

| method                                                                                            | description                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `getType()` / `setType(type)`                                                                     | static, kinematic or dynamic                                 |
| `getName()` / `setName(name)`                                                                     | debug name                                                   |
| `getPosition(out?)` / `getRotation(out?)` / `getTransform(out?)`                                  | world pose                                                   |
| `readTransform(outPosition, outRotation)`                                                         | the pose in one call, no allocation                          |
| `setTransform(position, rotation)`                                                                | teleport                                                     |
| `setTargetTransform(target, timeStep, wake?)`                                                     | move a kinematic body so it reaches the target over one step |
| `getLinearVelocity(out?)` / `setLinearVelocity(v)` and the angular pair                           | velocities                                                   |
| `applyForce(f, point, wake?)`, `applyForceToCenter`, `applyTorque`                                | forces                                                       |
| `applyLinearImpulse(i, point, wake?)`, `applyLinearImpulseToCenter`, `applyAngularImpulse`        | impulses                                                     |
| `getMass()`, `getMassData(out?)` / `setMassData(data)`, `applyMassFromShapes()`                   | mass, center and the full inertia tensor                     |
| `getLocalCenterOfMass(out?)` / `getWorldCenterOfMass(out?)`                                       | centers                                                      |
| `getLocalPoint` / `getWorldPoint` / `getLocalVector` / `getWorldVector`                           | space conversions                                            |
| `get/setLinearDamping`, `get/setAngularDamping`, `get/setGravityScale`                            | damping and gravity                                          |
| `isAwake()` / `setAwake(flag)`, `enableSleep(flag)` / `isSleepEnabled()`, `get/setSleepThreshold` | sleep                                                        |
| `isEnabled()` / `setEnabled(flag)`                                                                | a disabled body neither moves nor collides                   |
| `isBullet()` / `setBullet(flag)`, `allowFastRotation(flag)` / `isFastRotationAllowed()`           | continuous collision flags                                   |
| `setMotionLocks(partial)` / `getMotionLocks()`                                                    | lock axes; fields left out keep their value                  |
| `getShapeCount()`, `shapes`, `joints`, `computeAABB(out?)`                                        | what is attached, and the bounds                             |
| `createSphere`, `createCapsule`, `createBox`, `createHull`                                        | see [Shapes](#shapes)                                        |
| `isValid()` / `destroy()`                                                                         | destroying a body frees its shapes and joints                |

### Shapes

```ts
body.createSphere({ center: vec3(), radius: 0.5, density: 1 });
body.createCapsule({ height: 1, radius: 0.25 }); // or center1 / center2
body.createBox({
  halfExtents: vec3(0.5, 0.5, 0.5),
  offset: vec3(),
  rotation: quat(),
});
body.createHull({
  points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)],
  maxVertices: 32,
});
```

Hull points may also be a flat `Float32Array` of xyz triples. Every creator accepts the `b3ShapeDef` fields: `density`, `friction`, `restitution`, `rollingResistance`, `tangentVelocity`, `explosionScale`, `userMaterialId`, `customColor`, `filter: { categoryBits, maskBits, groupIndex }`, `isSensor`, `enableSensorEvents`, `enableContactEvents`, `enableHitEvents`, `enablePreSolveEvents`, `invokeContactCreation`, `updateBodyMass`, `enableCustomFiltering`, `enableSpeculativeContact`. Events are off by default; enable them per shape.

| method                                                                                           | description                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `body`, `getType()`                                                                              | owner and kind (`sphere`, `capsule`, `hull`, …)       |
| `get/setDensity(v, updateBodyMass?)`, `get/setFriction`, `get/setRestitution`                    | material                                              |
| `get/setRollingResistance`, `get/setTangentVelocity`, `get/setUserMaterialId`                    | surface material                                      |
| `isSensor()`, `enableSensorEvents` / `enableContactEvents` / `enableHitEvents` (+ `are*Enabled`) | event flags                                           |
| `getFilter()` / `setFilter(partial, invokeContacts?)`                                            | collision filtering, fields left out keep their value |
| `getAABB(out?)`, `computeMassData(out?)`                                                         | bounds and mass of this shape alone                   |
| `rayCast(origin, translation)`                                                                   | hit against this shape alone (reused result)          |
| `isValid()` / `destroy(updateBodyMass?)`                                                         | remove the shape from its body                        |

### Joints

```ts
const hinge = world.createRevoluteJoint(bodyA, bodyB, {
  anchorA: vec3(0, 1, 0), // shorthand for localFrameA.position
  localFrameB: { position: vec3(0, -1, 0), rotation: quat() },
  enableLimit: true,
  lowerAngle: -Math.PI / 4,
  upperAngle: Math.PI / 4,
  enableMotor: true,
  motorSpeed: 2,
  maxMotorTorque: 100,
});
hinge.setMotorSpeed(-2);
hinge.getAngle();
```

`createDistanceJoint`, `createRevoluteJoint`, `createSphericalJoint`, `createPrismaticJoint`, `createWeldJoint`, `createMotorJoint`, `createWheelJoint`, `createParallelJoint` and `createFilterJoint` each take the base options (`localFrameA`, `localFrameB`, `anchorA`, `anchorB`, `collideConnected`, `forceThreshold`, `torqueThreshold`, `constraintHertz`, `constraintDampingRatio`, `drawScale`) plus their `b3<Type>JointDef` fields, and return a class with that type's setters and getters: springs, limits, motors, targets, suspension and steering on wheels, cone and twist on spherical joints. Every joint has `bodyA`, `bodyB`, `getType()`, `wakeBodies()`, `get/setCollideConnected`, `get/setLocalFrameA/B`, `getConstraintForce(out?)`, `getConstraintTorque(out?)`, `get/setConstraintTuning`, `get/setForceThreshold`, `get/setTorqueThreshold`, `getLinearSeparation()`, `getAngularSeparation()`, `isValid()` and `destroy(wakeAttached?)`.

### Queries

```ts
const hit = world.castRayClosest(vec3(0, 10, 0), vec3(0, -20, 0), {
  maskBits: 0xffff,
});
if (hit.hit) {
  hit.point; // world point
  hit.normal; // surface normal
  hit.fraction; // along the translation
  hit.shape; // Shape
  hit.body; // Body
}

// every hit nearest first ('all'), or 'closest' / 'any'
const hits = world.castRay(origin, translation, filter, 'all');
for (let i = 0; i < hits.count; i++) (hits.bodyAt(i), hits.fractionAt(i));

// shape proxies: b3.proxy.sphere / capsule / box, or { points, radius }
world.castShape(b3.proxy.sphere(0.3), origin, translation);
world.overlapAABB(lower, upper).toArray(); // broad phase
world.overlapShape(b3.proxy.box(vec3(1, 1, 1)), origin);

// character mover: planes feed b3.solvePlanes / b3.clipVector
const mover = {
  center1: vec3(0, 0.5, 0),
  center2: vec3(0, 1.5, 0),
  radius: 0.5,
};
world.castMover(origin, mover, translation);
const planes = world.collideMover(origin, mover).toCollisionPlanes();
b3.solvePlanes(targetDelta, planes).delta;
```

Result objects belong to the world (or runtime) and are overwritten by the next query; copy what you keep. `shape.rayCast(origin, translation)` casts against one shape, `body.castRay / castShape / overlapShape / collideMover / timeOfImpactMover` against one body.

### Meshes, terrain, hulls and compounds

Immutable collision data is built once and attached to many shapes; release it when you are done and it is freed after its last shape.

```ts
const mesh = b3.createMesh({ vertices, indices, identifyEdges: true });
ground.createMesh(mesh, {
  scale: vec3(2, 1, 2),
  materials: [{ friction: 0.2 }],
});
mesh.release();

const field = b3.createHeightField({
  heights,
  countX: 65,
  countZ: 65,
  scale: vec3(1, 8, 1),
});
ground.createHeightField(field);

const cylinder = b3.createCylinder(2, 0.5); // also createCone, createRock, createHull(points), collision.createBoxHull
body.createHullData(cylinder, { position, rotation, scale });

const compound = b3.createCompound({
  spheres,
  capsules,
  hulls: [{ hull: cylinder }],
  meshes: [{ mesh }],
});
ground.createCompound(compound); // baked compounds are static only
```

`shape.getGeometry()` returns triangles for rendering a hull or mesh shape. Mesh builders: `createBoxMesh`, `createHollowBoxMesh`, `createPlatformMesh`, `createGridMesh`, `createWaveMesh`, `createTorusMesh`; terrain: `createGridHeightField`, `createWaveHeightField`.

### Standalone collision

`b3.collision` runs the engine's geometry routines on primitives without a world: `computeMass`, `computeAABB`, `rayCast`, `shapeCast`, `overlap`, `collide` (contact manifolds), `shapeDistance`, `shapeCastPair`, `timeOfImpact`, `getSweepTransform`, `queryTriangles`, plus a `QueryCache` for warm starting.

### Contacts, sensors and callbacks

```ts
const contacts = body.getContacts(); // one record per manifold
contacts.copyNormalTo(0, out);
sensorShape.getSensorOverlaps().toArray();

world.setCallbacks({
  friction: (fa, idA, fb, idB) => Math.min(fa, fb),
  customFilter: (a, b) => a.body !== b.body,
  preSolve: (a, b, point, normal) => true,
});
```

JS callbacks run inside the step, so a world with callbacks drops to one worker thread while any callback is set.

### Debug draw and bulk transforms

```ts
const draw = world.debugDraw({ joints: true, bounds: true, contacts: true });
draw.lines; // Float32Array: x1 y1 z1 x2 y2 z2 colour, `LINE_STRIDE` (7) floats per line
draw.points; // x y z size colour

const batch = world.createTransformBatch(bodies); // one wasm call for many bodies
batch.read(); // wasm -> batch.data: px py pz qx qy qz qw per body
batch.write(); // batch.data -> wasm (teleport)
```

Typed-array views into wasm memory are rebuilt when memory grows; read `batch.data` again after anything that can allocate (stepping, creating bodies).

### Events

Each `get*Events()` call fills a reader the world owns and returns it. Read it before the next step; indexes are `0 ≤ i < count`.

| reader                                            | records                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `getMoveEvents()`                                 | `bodyAt(i)`, `copyPositionTo(i, out)`, `copyRotationTo(i, out)`, `fellAsleepAt(i)`; sleeping bodies do not appear                               |
| `getContactBeginEvents()`                         | `shapeAAt`, `shapeBAt`, `bodyAAt`, `bodyBAt`, `copyPointTo`, `copyNormalTo` (A to B), `totalNormalImpulseAt`, `pointCountAt`, `manifoldCountAt` |
| `getContactEndEvents()`                           | the four handle accessors; a shape destroyed this step reads as `undefined`                                                                     |
| `getContactHitEvents()`                           | handles, `copyPointTo`, `copyNormalTo`, `approachSpeedAt`; above the world's `hitEventThreshold`                                                |
| `getSensorBeginEvents()` / `getSensorEndEvents()` | `sensorShapeAt`, `visitorShapeAt`, `sensorBodyAt`, `visitorBodyAt`                                                                              |
| `getJointEvents()`                                | `jointAt(i)`; joints past their force or torque threshold                                                                                       |

Every reader also exposes `f32`, `base` and `stride` for reading the records in place.

## Development

### Building from source

Requires [emsdk](https://emscripten.org/docs/getting_started/downloads.html) (tested with 6.0.2), CMake, the Node version from `.nvmrc` and pnpm.

```bash
nvm use            # picks the Node version from .nvmrc
pnpm install       # also fetches the pinned Box3D source (the @erincatto/box3d git dependency)
pnpm build         # both wasm flavours (csrc -> src/wasm) and the TypeScript frontend into dist/
pnpm test          # vitest, every suite against both flavours, plus the type tests
pnpm typecheck     # tsc over src, tests and bench
pnpm bench         # step, sync, query, create/destroy timings; pass deluxe 4 for threads, --json for JSON
pnpm parity:update # refresh parity/manifest.json after reviewing an engine bump
pnpm parity:strict # fail while any todo: remains in the manifest
pnpm dev           # three.js demo at http://localhost:5173/box3d-wasm/
pnpm lint          # eslint + prettier + clang-format
pnpm fix           # auto-fixes what the linters can
```

Commits follow the [Angular convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit); every push to `main` is released by [semantic-release](https://github.com/semantic-release/semantic-release) and published to npm through trusted publishing.

### Tracking Box3D

Box3D is pinned as a git dependency in `package.json` (`@erincatto/box3d`: `github:erincatto/box3d#<commit>`). Renovate opens a pull request whenever Box3D's `main` moves; CI rebuilds both flavours and runs the tests against the new commit, and a green build is merged and released automatically. A Box3D change that breaks the binding fails CI and waits for a fix in `csrc/`.

**Parity gate.** Compiling is not enough to know the binding still covers the engine, so `test/parity.test.ts` compares the pinned headers with `parity/manifest.json`: every `B3_API` function must be wrapped by the shim or listed with a `skip:` reason, every `*Def` struct field must be mapped or recorded, and enum, struct and constant snapshots must match. The hardcoded enum maps (`SHAPE_TYPES`, `JOINT_TYPES`, `BODY_TYPES`) and the profile layout are checked against the headers too. New upstream API therefore turns CI red (and blocks the automerge) until it is wrapped or consciously skipped. `pnpm parity:strict` additionally fails while any `todo:` reason remains. A weekly workflow (`upstream-drift`) runs the gate against Box3D's latest commit and opens an issue listing what changed.

To update the engine, use the `update-box3d` skill (`.claude/skills/update-box3d`), or follow it by hand: bump the pin, run the gate, wrap or skip each new symbol, fix the enum maps and layouts, run `pnpm parity:update`, then build, test and bench.

### Performance notes

`pnpm bench` reports step, bulk sync, query, create/destroy and kinematic sync timings (`--json` for machine output). The default build is `-O3` with SIMD and no LTO. `LTO_FLAGS=-flto pnpm build` trades about 24% more wasm for roughly 2-5% faster stepping and 15-20% faster overlap queries. Hot paths (`castRayClosest`, filters, motion locks, event readers, `TransformBatch`) allocate nothing per call.

## Questions

Don't hesitate to ask a question directly on the [discussions board](https://github.com/FRSOURCE/box3d-wasm/discussions)!

## Changelog

Changes for every release are documented in the [release notes](https://github.com/FRSOURCE/box3d-wasm/releases) and [CHANGELOG file](https://github.com/FRSOURCE/box3d-wasm/blob/main/CHANGELOG.md).

## License

[MIT](https://opensource.org/licenses/MIT) for the wrapper and build scripts, see [LICENSE](LICENSE).

Copyright (c) 2026 Luis Montes (box3d-wasm). This fork is maintained by Jakub FRS Freisler, FRSOURCE.

Box3D itself is Copyright (c) Erin Catto and MIT licensed, see [LICENSE.box3d.txt](LICENSE.box3d.txt) and the [upstream repository](https://github.com/erincatto/box3d). If you use this package, the physics engine you are running is his work.
