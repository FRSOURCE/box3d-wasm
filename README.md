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
    <br>TypeScript declarations generated from the binding itself at build time
    <br>Tracks Box3D <code>main</code> automatically: every upstream commit is rebuilt, tested and released
    <br>Published under <a href="https://opensource.org/licenses/MIT" target="_blank">MIT</a> license</i>
  <br>
  <br>
</p>

Box3D is a 3D rigid body physics engine written by [Erin Catto](https://github.com/erincatto), the author of Box2D. All engine design and implementation credit belongs to him; this package compiles his library to wasm and adds a JavaScript binding layer.

This is a fork of [monteslu/box3d-wasm](https://github.com/monteslu/box3d-wasm) published under the `@frsource` npm scope. It is where the bindings needed by [`@frsource/babylon-box3d`](https://github.com/FRSOURCE/babylon-box3d) are added. See it in action in the [live three.js demo](https://frsource.github.io/box3d-wasm/) ([source](docs/)) with ragdolls, dominoes, a drivable buggy, terrain, a multithreaded stress test and a joint gallery. The classic scenes are adapted from [monteslu's threejs-box3d-demo](https://github.com/monteslu/threejs-box3d-demo).

## Quick start

### Installation

```bash
npm install @frsource/box3d-wasm

yarn add @frsource/box3d-wasm

pnpm add @frsource/box3d-wasm
```

### Modern JS/TypeScript

```ts
import Box3D from '@frsource/box3d-wasm';

const b3 = await Box3D();
const world = new b3.World({ gravity: { x: 0, y: -10, z: 0 } });

const ground = world.createBody({
  type: 'static',
  position: { x: 0, y: -0.5, z: 0 },
});
ground.createBox({ halfExtents: { x: 20, y: 0.5, z: 20 } });

const crate = world.createBody({
  type: 'dynamic',
  position: { x: 0, y: 5, z: 0 },
});
crate.createBox({
  halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
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

`workerCount` enables Box3D's internal multithreaded solver. It is clamped to `[1, b3.maxWorkers]` and ignored by the single threaded build.

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

| URL parameter   | effect                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `?scene=stress` | start on a scene (`playground`, `pyramid`, `ragdolls`, `dominoes`, `bridge`, `driving`, `terrain`, `compound`, `stress`, `picking`, `casts`, `joints`) |
| `?threads=0`    | force the single-threaded build                                                                                                                        |
| `?threads=4`    | threaded build with four workers (clamped to `maxWorkers`)                                                                                             |
| `?ff=600`       | fast-forward that many steps before the first frame                                                                                                    |

The threads toggle and worker slider in the bottom-left corner change the same parameters. The six classic scenes are adapted from [monteslu's threejs-box3d-demo](https://github.com/monteslu/threejs-box3d-demo); the cross-origin isolation service worker follows the approach from [pryme8's babylon-box3d demo](https://github.com/pryme8/babylon-box3d).

## API

### Conventions

- Vectors are plain `{ x, y, z }` objects and quaternions are `{ x, y, z, w }`. Transforms are `{ position, rotation }`. Values pass directly to and from three.js, Babylon.js and friends.
- Every creator takes one options object applied over the Box3D default definition, so every field is optional. Unknown keys are ignored.
- Angles are radians, lengths are meters, masses are kilograms, and `hertz` / `dampingRatio` pairs configure Box3D's soft constraints.
- `World`, `Body`, `Shape` and joint objects are tiny handles over Box3D ids. `.destroy()` removes the object from the simulation; `.delete()` frees the JS handle (see [Memory](#memory)). `.isValid()` tells whether the underlying object still exists.
- Bodies and shapes carry a numeric `userData` tag. One is auto-assigned at creation (starting at 1; 0 means untagged) and you can overwrite it with your own number. Events and ray casts report these tags, so a plain `Map<number, YourObject>` connects physics back to your scene.

### Module

```ts
const b3 = await Box3D(emscriptenOptions?);
```

| member          | description                                                           |
| --------------- | --------------------------------------------------------------------- |
| `b3.World`      | the world class, see below                                            |
| `b3.threaded`   | `true` in the deluxe (wasm threads) build                             |
| `b3.maxWorkers` | upper bound for `workerCount`                                         |
| `b3.HEAPF32` …  | the usual emscripten runtime exports (`HEAPF32`, `HEAPU8`, `HEAPU32`) |

### World

```ts
const world = new b3.World({
  gravity: { x: 0, y: -10, z: 0 },
  enableSleep: true,
  enableContinuous: true,
  workerCount: 4, // deluxe build only
});
```

| option                 | default         | description                                                |
| ---------------------- | --------------- | ---------------------------------------------------------- |
| `gravity`              | `{ 0, -10, 0 }` | world gravity vector                                       |
| `enableSleep`          | `true`          | let resting bodies fall asleep                             |
| `enableContinuous`     | `true`          | continuous collision for fast bodies against static shapes |
| `restitutionThreshold` | Box3D default   | relative speed below which restitution is ignored          |
| `hitEventThreshold`    | Box3D default   | approach speed above which hit events are reported         |
| `contactHertz`         | Box3D default   | contact stiffness                                          |
| `contactDampingRatio`  | Box3D default   | contact damping                                            |
| `contactSpeed`         | Box3D default   | maximum contact push-out speed                             |
| `maximumLinearSpeed`   | Box3D default   | speed clamp for all bodies                                 |
| `workerCount`          | `1`             | solver threads, clamped to `[1, b3.maxWorkers]`            |

| method                                                         | description                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `step(timeStep, subStepCount)`                                 | advance the simulation; `1 / 60` and `4` are good defaults                  |
| `getGravity()` / `setGravity(v)`                               | world gravity                                                               |
| `enableSleeping(flag)`                                         | toggle sleeping for the whole world                                         |
| `enableContinuous(flag)`                                       | toggle continuous collision                                                 |
| `getAwakeBodyCount()`                                          | number of bodies currently simulating                                       |
| `getWorkerCount()`                                             | solver threads in use                                                       |
| `createBody(opts)`                                             | see [Bodies](#bodies)                                                       |
| `create<Type>Joint(bodyA, bodyB, opts)`                        | see [Joints](#joints)                                                       |
| `castRayClosest(origin, translation, filter)`                  | see [Queries](#queries)                                                     |
| `explode(opts)`                                                | see [Queries](#queries)                                                     |
| `getBodyEvents()` / `getContactEvents()` / `getSensorEvents()` | see [Events](#events)                                                       |
| `getProfile()`                                                 | `{ step, pairs, collide, solve }` timings in milliseconds for the last step |
| `isValid()` / `destroy()`                                      | destroying a world frees every body, shape and joint inside it              |

### Bodies

```ts
const body = world.createBody({
  type: 'dynamic', // 'static' | 'kinematic' | 'dynamic'
  position: { x: 0, y: 5, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularDamping: 0.05,
  motionLocks: { angularX: true, angularZ: true },
  userData: 42,
});
```

| option                               | default       | description                                                            |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------- |
| `type`                               | `'static'`    | `'static'`, `'kinematic'` or `'dynamic'`                               |
| `position` / `rotation`              | identity      | initial transform                                                      |
| `linearVelocity` / `angularVelocity` | zero          | initial velocities                                                     |
| `linearDamping` / `angularDamping`   | `0`           | velocity damping                                                       |
| `gravityScale`                       | `1`           | per-body gravity multiplier                                            |
| `sleepThreshold`                     | Box3D default | speed below which the body may sleep                                   |
| `enableSleep`                        | `true`        | allow this body to sleep                                               |
| `isAwake`                            | `true`        | start awake                                                            |
| `isBullet`                           | `false`       | continuous collision against other dynamic bodies too                  |
| `isEnabled`                          | `true`        | start enabled                                                          |
| `allowFastRotation`                  | `false`       | skip the angular speed clamp                                           |
| `enableContactRecycling`             | Box3D default | reuse contact data between steps                                       |
| `motionLocks`                        | none          | `{ linearX, linearY, linearZ, angularX, angularY, angularZ }` booleans |
| `userData`                           | auto tag      | your numeric tag                                                       |
| `name`                               | `''`          | debug name                                                             |

| method                                                                                        | description                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `getPosition()` / `getRotation()` / `getTransform()`                                          | current pose                                                        |
| `setTransform(position, rotation)`                                                            | teleport; either argument may be omitted to keep the current value  |
| `setTargetTransform(transform, timeStep, wake)`                                               | move a kinematic body by velocity so it still pushes things         |
| `getLinearVelocity()` / `setLinearVelocity(v)`                                                | linear velocity                                                     |
| `getAngularVelocity()` / `setAngularVelocity(v)`                                              | angular velocity                                                    |
| `applyForce(force, worldPoint, wake)` / `applyForceToCenter(force, wake)`                     | forces for the next step                                            |
| `applyTorque(torque, wake)`                                                                   | torque for the next step                                            |
| `applyLinearImpulse(impulse, worldPoint, wake)` / `applyLinearImpulseToCenter(impulse, wake)` | instant velocity change                                             |
| `applyAngularImpulse(impulse, wake)`                                                          | instant angular velocity change                                     |
| `getMass()` / `applyMassFromShapes()`                                                         | mass is derived from shape densities; recompute after changing them |
| `getLocalCenterOfMass()` / `getWorldCenterOfMass()`                                           | center of mass                                                      |
| `getLocalPoint(worldPoint)` / `getWorldPoint(localPoint)`                                     | frame conversion                                                    |
| `getLinearDamping()` / `setLinearDamping(d)` / `getAngularDamping()` / `setAngularDamping(d)` | damping                                                             |
| `getGravityScale()` / `setGravityScale(s)`                                                    | per-body gravity                                                    |
| `isAwake()` / `setAwake(flag)` / `enableSleep(flag)`                                          | sleep state                                                         |
| `isEnabled()` / `setEnabled(flag)`                                                            | disabled bodies leave the simulation but keep their shapes          |
| `isBullet()` / `setBullet(flag)`                                                              | continuous collision against dynamic bodies                         |
| `getMotionLocks()` / `setMotionLocks(locks)`                                                  | lock axes, e.g. keep a character upright                            |
| `getType()` / `setType(type)`                                                                 | body type as a string                                               |
| `getName()` / `setName(name)` / `getUserData()` / `setUserData(tag)`                          | identification                                                      |
| `getShapeCount()` / `computeAABB()`                                                           | `{ lowerBound, upperBound }` around all shapes                      |
| `createBox(opts)` / `createSphere(opts)` / `createCapsule(opts)` / `createHull(opts)`         | see [Shapes](#shapes)                                               |
| `isValid()` / `destroy()`                                                                     | destroying a body destroys its shapes and joints                    |

### Shapes

Each creator takes one options object with the geometry plus the material and event fields below:

```ts
body.createBox({ halfExtents: { x: 1, y: 0.5, z: 2 }, friction: 0.7 });
body.createBox({ hx: 1, hy: 0.5, hz: 2, offset: { x: 0, y: 1, z: 0 } });
body.createSphere({ radius: 0.5, restitution: 0.8 });
body.createCapsule({ height: 1.2, radius: 0.3 });
body.createHull({
  points: [
    { x: -1, y: 0, z: -1 },
    { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ],
});
```

| geometry option                 | shape           | description                                            |
| ------------------------------- | --------------- | ------------------------------------------------------ |
| `halfExtents` or `hx`/`hy`/`hz` | box             | half sizes, default `0.5` each                         |
| `offset` / `rotation`           | box             | place the box away from the body origin                |
| `radius`                        | sphere, capsule | default `0.5`                                          |
| `center`                        | sphere          | sphere center in body space                            |
| `height`                        | capsule         | distance between the hemisphere centers, along local y |
| `center1` / `center2`           | capsule         | explicit hemisphere centers when `height` is not given |
| `points`                        | hull            | array of vectors; the convex hull is computed for you  |
| `maxVertices`                   | hull            | hull simplification budget, default `32`               |

| material / event option | default       | description                                                      |
| ----------------------- | ------------- | ---------------------------------------------------------------- |
| `density`               | `1000`        | mass per volume (water); `0` makes a massless shape              |
| `friction`              | Box3D default | Coulomb friction                                                 |
| `restitution`           | `0`           | bounciness                                                       |
| `rollingResistance`     | `0`           | slows rolling spheres and capsules                               |
| `tangentVelocity`       | zero          | conveyor belt surface velocity                                   |
| `userMaterialId`        | `0`           | your material id, reported nowhere yet but stored                |
| `isSensor`              | `false`       | detect overlaps without collision response                       |
| `enableSensorEvents`    | `false`       | let this shape be seen by sensors / report visitors if it is one |
| `enableContactEvents`   | `false`       | report begin / end touch events                                  |
| `enableHitEvents`       | `false`       | report impacts above `hitEventThreshold`                         |
| `invokeContactCreation` | Box3D default | create contacts immediately for static shapes                    |
| `updateBodyMass`        | `true`        | recompute the body mass after adding the shape                   |
| `filter`                | collide all   | `{ categoryBits, maskBits, groupIndex }`, see below              |
| `userData`              | auto tag      | your numeric tag                                                 |

| method                                                                             | description                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getType()`                                                                        | `'sphere'`, `'capsule'`, `'hull'`, `'mesh'`, `'heightField'` or `'compound'` |
| `getFriction()` / `setFriction(f)`                                                 | friction                                                                     |
| `getRestitution()` / `setRestitution(r)`                                           | restitution                                                                  |
| `getDensity()` / `setDensity(d, updateBodyMass)`                                   | density                                                                      |
| `isSensor()`                                                                       | sensor flag                                                                  |
| `enableSensorEvents(flag)` / `enableContactEvents(flag)` / `enableHitEvents(flag)` | event flags                                                                  |
| `getFilter()` / `setFilter(filter)`                                                | collision filter                                                             |
| `getAABB()`                                                                        | `{ lowerBound, upperBound }`                                                 |
| `rayCast(origin, translation)`                                                     | `{ hit, point, normal, fraction }` against this shape only                   |
| `getUserData()` / `setUserData(tag)`                                               | tag                                                                          |
| `isValid()` / `destroy(updateBodyMass)`                                            | remove the shape from its body                                               |

Collision filtering follows Box3D: two shapes collide when each one's `categoryBits` is in the other's `maskBits`, unless they share a non-zero `groupIndex`, in which case a positive group always collides and a negative group never does. Bits are plain numbers (up to 2^53).

### Joints

Every joint connects two bodies and is created on the world:

```ts
const hinge = world.createRevoluteJoint(chassis, wheel, {
  localFrameA: { position: { x: 1, y: 0, z: 1 } },
  localFrameB: { position: { x: 0, y: 0, z: 0 } },
  enableMotor: true,
  motorSpeed: 5,
  maxMotorTorque: 100,
});
hinge.getAngle();
hinge.setMotorSpeed(-5);
```

Common options: `localFrameA` / `localFrameB` (`{ position, rotation }` in each body's space, identity by default), `anchorA` / `anchorB` (shorthand for just the frame positions), `collideConnected` (default `false`), `forceThreshold` / `torqueThreshold` (joint event thresholds).

Common methods: `getType()`, `getLocalFrameA()` / `getLocalFrameB()`, `getCollideConnected()` / `setCollideConnected(flag)`, `getConstraintForce()` / `getConstraintTorque()`, `wakeBodies()`, `isValid()`, `destroy(wakeAttached)`.

| joint                  | creation options                                                                                                                                                                                                                                                                                                                                                          | runtime methods                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createDistanceJoint`  | `length`, `enableSpring`, `hertz`, `dampingRatio`, `lowerSpringForce`, `upperSpringForce`, `enableLimit`, `minLength`, `maxLength`, `enableMotor`, `maxMotorForce`, `motorSpeed`                                                                                                                                                                                          | `getLength` / `setLength`, `getCurrentLength`, `enableSpring`, `setSpringHertz`, `setSpringDampingRatio`, `enableLimit`, `setLengthRange`, `enableMotor`, `setMotorSpeed`, `setMaxMotorForce`                                                                                                                                                                                        |
| `createRevoluteJoint`  | `targetAngle`, `enableSpring`, `hertz`, `dampingRatio`, `enableLimit`, `lowerAngle`, `upperAngle`, `enableMotor`, `maxMotorTorque`, `motorSpeed`                                                                                                                                                                                                                          | `getAngle`, `enableSpring`, `setSpringHertz`, `setSpringDampingRatio`, `setTargetAngle`, `enableLimit`, `setLimits`, `enableMotor`, `setMotorSpeed`, `setMaxMotorTorque`, `getMotorTorque`                                                                                                                                                                                           |
| `createSphericalJoint` | `enableSpring`, `hertz`, `dampingRatio`, `targetRotation`, `enableConeLimit`, `coneAngle`, `enableTwistLimit`, `lowerTwistAngle`, `upperTwistAngle`, `enableMotor`, `maxMotorTorque`, `motorVelocity`                                                                                                                                                                     | `enableConeLimit`, `setConeLimit`, `getConeAngle`, `enableTwistLimit`, `setTwistLimits`, `getTwistAngle`, `enableSpring`, `setSpringHertz`, `setSpringDampingRatio`, `setTargetRotation`, `enableMotor`, `setMotorVelocity`, `setMaxMotorTorque`                                                                                                                                     |
| `createPrismaticJoint` | `enableSpring`, `hertz`, `dampingRatio`, `targetTranslation`, `enableLimit`, `lowerTranslation`, `upperTranslation`, `enableMotor`, `maxMotorForce`, `motorSpeed`                                                                                                                                                                                                         | `getTranslation`, `getSpeed`, `enableSpring`, `setSpringHertz`, `setSpringDampingRatio`, `setTargetTranslation`, `enableLimit`, `setLimits`, `enableMotor`, `setMotorSpeed`, `setMaxMotorForce`                                                                                                                                                                                      |
| `createWeldJoint`      | `linearHertz`, `angularHertz`, `linearDampingRatio`, `angularDampingRatio`                                                                                                                                                                                                                                                                                                | `setLinearHertz`, `setLinearDampingRatio`, `setAngularHertz`, `setAngularDampingRatio`                                                                                                                                                                                                                                                                                               |
| `createMotorJoint`     | `linearVelocity`, `maxVelocityForce`, `angularVelocity`, `maxVelocityTorque`, `linearHertz`, `linearDampingRatio`, `maxSpringForce`, `angularHertz`, `angularDampingRatio`, `maxSpringTorque`                                                                                                                                                                             | `setLinearVelocity`, `setAngularVelocity`, `setMaxVelocityForce`, `setMaxVelocityTorque`, `setLinearHertz`, `setLinearDampingRatio`, `setAngularHertz`, `setAngularDampingRatio`, `setMaxSpringForce`, `setMaxSpringTorque`                                                                                                                                                          |
| `createWheelJoint`     | `enableSuspensionSpring`, `suspensionHertz`, `suspensionDampingRatio`, `enableSuspensionLimit`, `lowerSuspensionLimit`, `upperSuspensionLimit`, `enableSpinMotor`, `maxSpinTorque`, `spinSpeed`, `enableSteering`, `steeringHertz`, `steeringDampingRatio`, `targetSteeringAngle`, `maxSteeringTorque`, `enableSteeringLimit`, `lowerSteeringLimit`, `upperSteeringLimit` | `enableSuspension`, `setSuspensionHertz`, `setSuspensionDampingRatio`, `enableSuspensionLimit`, `setSuspensionLimits`, `enableSpinMotor`, `setSpinMotorSpeed`, `setMaxSpinTorque`, `getSpinSpeed`, `enableSteering`, `setSteeringHertz`, `setSteeringDampingRatio`, `setMaxSteeringTorque`, `enableSteeringLimit`, `setSteeringLimits`, `setTargetSteeringAngle`, `getSteeringAngle` |
| `createParallelJoint`  | `hertz`, `dampingRatio`, `maxTorque`                                                                                                                                                                                                                                                                                                                                      | `setSpringHertz`, `setSpringDampingRatio`, `setMaxTorque`                                                                                                                                                                                                                                                                                                                            |
| `createFilterJoint`    | common options only                                                                                                                                                                                                                                                                                                                                                       | common methods only; disables collision between the two bodies                                                                                                                                                                                                                                                                                                                       |

### Queries

```ts
const hit = world.castRayClosest(origin, translation, { maskBits: 0xffff });
if (hit.hit) {
  hit.point; // world point
  hit.normal; // surface normal
  hit.fraction; // 0..1 along translation
  hit.shapeUserData; // tags to look your objects up with
  hit.bodyUserData;
  hit.shape.delete(); // a Shape handle; free it when done
}

world.explode({
  position: { x: 0, y: 1, z: 0 },
  radius: 3,
  falloff: 2,
  impulsePerArea: 10,
  maskBits: 0xffff, // optional, which shape categories are affected
});
```

`castRayClosest` casts from `origin` along `translation` (direction and length in one vector) and returns `{ hit: false }` or the fields above. The filter argument is optional and takes `categoryBits` / `maskBits`. `shape.rayCast(origin, translation)` does the same against a single shape and returns `{ hit, point, normal, fraction }`.

### Events

Events are collected during `step()` and read back as plain arrays afterwards. Read them every step; the next step overwrites them.

```ts
world.step(1 / 60, 4);

for (const e of world.getBodyEvents()) {
  // { userData, position, rotation, fellAsleep } for every body that moved
  meshes.get(e.userData)?.position.copy(e.position);
}

const contacts = world.getContactEvents();
contacts.begin; // [{ shapeUserDataA, shapeUserDataB }]
contacts.end; // [{ shapeUserDataA, shapeUserDataB }]  (null when the shape was destroyed)
contacts.hit; // [{ shapeUserDataA, shapeUserDataB, point, normal, approachSpeed }]

const sensors = world.getSensorEvents();
sensors.begin; // [{ sensorUserData, visitorUserData }]
sensors.end; // [{ sensorUserData, visitorUserData }]  (null when the shape was destroyed)
```

Body move events are always on. Contact begin / end events need `enableContactEvents` on at least one of the two shapes, hit events need `enableHitEvents` and an approach speed above the world's `hitEventThreshold`, and sensor events need a shape created with `isSensor: true` plus `enableSensorEvents: true` on the visitors you want it to notice.

### Memory

Objects returned by the binding are embind handles. Two different calls free two different things:

- `.destroy()` removes the world, body, shape or joint from the simulation. Destroying a world frees every object inside it; destroying a body frees its shapes and joints.
- `.delete()` frees the JS-side handle. Handles are tiny, but each one you keep is a small leak until deleted, and that includes the `shape` returned by `castRayClosest`. Handles also implement `Symbol.dispose`, so `using shape = body.createBox(...)` works where explicit resource management is available.

A handle whose object was destroyed reports `isValid() === false`; calling anything else on it is undefined behaviour, as in Box3D itself.

### TypeScript

`dist/box3d.d.ts` and `dist/box3d.deluxe.d.ts` are generated by emscripten from the embind registrations at build time, so they always match the compiled binding, and the package `exports` point at them. Parameters that take plain objects (vectors, quaternions, option bags) are typed as `any` for now.

## Development

### Building from source

Requires [emsdk](https://emscripten.org/docs/getting_started/downloads.html) (tested with 6.0.2), CMake, the Node version from `.nvmrc` and pnpm.

```bash
nvm use            # picks the Node version from .nvmrc
pnpm install       # also fetches the pinned Box3D source (the @erincatto/box3d git dependency)
pnpm build         # builds standard and deluxe flavours plus their .d.ts into dist/
pnpm dev           # three.js demo at http://localhost:5173/box3d-wasm/
pnpm test
pnpm lint          # eslint + prettier + clang-format
pnpm fix           # auto-fixes what the linters can
```

Commits follow the [Angular convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit); every push to `main` is released by [semantic-release](https://github.com/semantic-release/semantic-release) and published to npm through trusted publishing.

### Tracking Box3D

Box3D is pinned as a git dependency in `package.json` (`@erincatto/box3d`: `github:erincatto/box3d#<commit>`). Renovate opens a pull request whenever Box3D's `main` moves; CI rebuilds both flavours and runs the tests against the new commit, and a green build is merged and released automatically. A Box3D change that breaks the binding fails CI and waits for a fix in `csrc/glue.cpp`.

## Questions

Don't hesitate to ask a question directly on the [discussions board](https://github.com/FRSOURCE/box3d-wasm/discussions)!

## Changelog

Changes for every release are documented in the [release notes](https://github.com/FRSOURCE/box3d-wasm/releases) and [CHANGELOG file](https://github.com/FRSOURCE/box3d-wasm/blob/main/CHANGELOG.md).

## License

[MIT](https://opensource.org/licenses/MIT) for the wrapper and build scripts, see [LICENSE](LICENSE).

Copyright (c) 2026 Luis Montes (box3d-wasm). This fork is maintained by Jakub FRS Freisler, FRSOURCE.

Box3D itself is Copyright (c) Erin Catto and MIT licensed, see [LICENSE.box3d.txt](LICENSE.box3d.txt) and the [upstream repository](https://github.com/erincatto/box3d). If you use this package, the physics engine you are running is his work.
