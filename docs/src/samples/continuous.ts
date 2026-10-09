// Ported from box3d/samples/sample_continuous.cpp
import type { Body, Mesh } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import { AXIS_X, DEG_TO_RAD, quatFromAxisAngle } from '../framework/math.js';
import { createMeshDrop, wrapMesh } from './continuous-helpers.js';

registerSample({
  category: 'Continuous',
  name: 'Thin Wall',
  create(ctx) {
    ctx.camera.setView(45, 30, 30, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;

    scene.groundBox(40);

    const wall = scene.createBody({
      position: { x: 0, y: 10, z: 0 },
      rotation: quatFromAxisAngle(AXIS_X, 90 * DEG_TO_RAD),
    });
    scene.box(wall, { hx: 10, hy: 0.1, hz: 10 });

    const rollingResistance = 0.1;

    const sphere = scene.createBody({
      type: 'dynamic',
      position: { x: -5, y: 10, z: 20 },
      linearVelocity: { x: 0, y: 0, z: -180 },
      angularVelocity: { x: 20, y: 0, z: 0 },
    });
    scene.sphere(sphere, { radius: 0.1, rollingResistance });

    const capsule = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 10, z: 20 },
      linearVelocity: { x: 0, y: 0, z: -180 },
      angularVelocity: { x: 20, y: -5, z: 0 },
    });
    scene.capsule(capsule, {
      center1: { x: -0.3, y: 0, z: 0 },
      center2: { x: 0.3, y: 0, z: 0 },
      radius: 0.1,
      rollingResistance,
    });

    const box = scene.createBody({
      type: 'dynamic',
      position: { x: 5, y: 10, z: 20 },
      linearVelocity: { x: 0, y: 0, z: -180 },
      angularVelocity: { x: 20, y: 5, z: 0 },
    });
    scene.box(box, { hx: 0.4, hy: 0.1, hz: 0.1, rollingResistance });

    return {};
  },
});

registerSample({
  category: 'Continuous',
  name: 'Bounce House',
  create(ctx) {
    ctx.camera.setView(45, 45, 50, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;

    scene.groundBox(10);

    const walls = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(walls, {
      hx: 0.1,
      hy: 5,
      hz: 10,
      offset: { x: 10, y: 5, z: 0 },
    });
    scene.box(walls, {
      hx: 0.1,
      hy: 5,
      hz: 10,
      offset: { x: -10, y: 5, z: 0 },
    });
    scene.box(walls, {
      hx: 10,
      hy: 5,
      hz: 0.1,
      offset: { x: 0, y: 5, z: -10 },
    });
    scene.box(walls, {
      hx: 10,
      hy: 5,
      hz: 0.1,
      offset: { x: 0, y: 5, z: 10 },
    });

    const ball = scene.createBody({
      type: 'dynamic',
      gravityScale: 0,
      position: { x: -8, y: 4, z: 0 },
      linearVelocity: { x: 120, y: 0, z: 120 },
    });
    scene.sphere(ball, { radius: 0.5, friction: 0, restitution: 1 });

    return {};
  },
});

registerSample({
  category: 'Continuous',
  name: 'Spinning Stick',
  create(ctx) {
    ctx.camera.setView(45, 25, 20, { x: 0, y: 2, z: 0 });
    const { scene, random } = ctx;

    scene.groundBox(10);

    const wall = scene.createBody({ position: { x: 0, y: 0.5, z: 0 } });
    scene.box(wall, { hx: 0.125, hy: 0.5, hz: 10 });

    const stick = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 20, z: 0.5 },
      linearVelocity: { x: 0, y: -100, z: 0 },
      angularVelocity: {
        x: random.range(-50, 50),
        y: random.range(-50, 50),
        z: random.range(-50, 50),
      },
    });
    scene.box(stick, { hx: 2, hy: 0.1, hz: 0.1, rollingResistance: 0.1 });

    return {};
  },
});

// This tests bullets and chain reactions
registerSample({
  category: 'Continuous',
  name: 'Bullet vs Stack',
  create(ctx) {
    ctx.camera.setView(15, 20, 30, { x: 0, y: 2, z: 0 });
    const { scene } = ctx;

    scene.groundBox(50);

    const wall = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(wall, {
      hx: 0.1,
      hy: 5,
      hz: 10,
      offset: { x: -1, y: 5, z: 0 },
    });

    for (let row = 0; row < 10; ++row) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 0.5 + 1.1 * row, z: 0 },
      });
      scene.box(body, {});
    }

    let bullet: Body | undefined;
    const launch = (): void => {
      if (bullet?.alive) scene.destroyBody(bullet);
      bullet = scene.createBody({
        type: 'dynamic',
        isBullet: true,
        position: { x: 20.5, y: 5.5, z: 0 },
        linearVelocity: { x: -500, y: 0, z: 0 },
      });
      // upstream: shapeDef.density *= 10 on the default density (1000 kg/m^3)
      scene.sphere(bullet, { radius: 0.25, density: 10000 });
    };

    return {
      keyboard(input) {
        if (input.key.toLowerCase() === 'l') launch();
      },
      ui(panel) {
        panel.button('Launch', launch);
      },
    };
  },
});

registerSample({
  category: 'Continuous',
  name: 'Needle Mesh',
  create(ctx) {
    ctx.camera.setView(45, 25, 4, { x: 0, y: 1.2, z: 0 });
    const { scene } = ctx;

    const slices = 8;
    const createNeedle = (
      height: number,
      radius: number,
      center: { x: number; y: number; z: number },
    ) => {
      const vertexCount = slices + 1;
      const vertices = new Float32Array(3 * vertexCount);
      vertices.set([center.x, height + center.y, center.z], 0);
      let alpha = 0;
      const deltaAlpha = (2 * Math.PI) / slices;
      for (let index = 1; index < vertexCount; ++index) {
        vertices.set(
          [
            radius * Math.cos(alpha) + center.x,
            center.y,
            radius * Math.sin(alpha) + center.z,
          ],
          3 * index,
        );
        alpha += deltaAlpha;
      }

      const indices = new Uint32Array(3 * slices);
      let index1 = vertexCount - 1;
      for (let index = 0; index < slices; ++index) {
        const index2 = index + 1;
        indices.set([0, index2, index1], 3 * index);
        index1 = index2;
      }
      return scene.meshData({ vertices, indices, medianSplit: true });
    };

    const ground = scene.createBody({});
    scene.mesh(ground, createNeedle(0.99, 0.1, { x: 0.2, y: 0, z: 0.2 }));
    scene.mesh(ground, createNeedle(1.01, 0.1, { x: 0.2, y: 0, z: -0.2 }));
    scene.mesh(ground, createNeedle(0.98, 0.1, { x: -0.2, y: 0, z: -0.2 }));
    scene.mesh(ground, createNeedle(1.02, 0.1, { x: -0.2, y: 0, z: 0.2 }));

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
      linearVelocity: { x: 0, y: -10, z: 0 },
    });
    scene.box(body, { hx: 0.3, hy: 0.01, hz: 0.3 });

    return {};
  },
});

type DropShape = 'box' | 'capsule' | 'cylinder' | 'sphere';
const DROP_SHAPES: readonly DropShape[] = [
  'box',
  'capsule',
  'cylinder',
  'sphere',
];

registerSample({
  category: 'Continuous',
  name: 'Mesh Drop',
  create(ctx) {
    ctx.camera.setView(0, 30, 20, { x: 0, y: 0, z: 0 });
    // TODO(api): upstream also sets the contact force draw scale to 0.1 here (GetGuiDraw()->forceScale).
    const { scene, world, b3, random } = ctx;

    const gridCount = 32;

    let groundAmplitude = 0.5;
    let ground: Body | undefined;
    let groundMesh: Mesh | undefined;
    let shapeType = 0;
    let runCount = 0;
    let failure = false;
    let autoGenerate = false;
    let steps = 0;
    let bodies: (Body | undefined)[] = [];
    const indexOf = new Map<Body, [number, number]>();
    let pickRay:
      | {
          origin: { x: number; y: number; z: number };
          direction: { x: number; y: number; z: number };
        }
      | undefined;
    let pickText = '';
    let failureText = '';

    const currentType = (): DropShape => DROP_SHAPES[shapeType] ?? 'box';

    const createGround = (): void => {
      if (ground?.alive) scene.destroyBody(ground);
      groundMesh?.release();

      ground = scene.createBody({});

      const cellCount = 40;
      const cellWidth = 1;
      groundMesh = b3.createWaveMesh(
        cellCount,
        cellCount,
        cellWidth,
        groundAmplitude,
        0.1,
        0.2,
      );
      const filter = { categoryBits: 1 };
      scene.mesh(ground, wrapMesh(groundMesh), { filter });

      const extent = 0.5 * cellCount * cellWidth;
      const halfHeight = 1;
      scene.box(ground, {
        hx: extent,
        hy: halfHeight,
        hz: 0.1,
        offset: { x: 0, y: halfHeight, z: -extent },
        filter,
      });
      scene.box(ground, {
        hx: extent,
        hy: halfHeight,
        hz: 0.1,
        offset: { x: 0, y: halfHeight, z: extent },
        filter,
      });
      scene.box(ground, {
        hx: 0.1,
        hy: halfHeight,
        hz: extent,
        offset: { x: -extent, y: halfHeight, z: 0 },
        filter,
      });
      scene.box(ground, {
        hx: 0.1,
        hy: halfHeight,
        hz: extent,
        offset: { x: extent, y: halfHeight, z: 0 },
        filter,
      });
    };

    const generate = (): void => {
      for (const body of bodies) {
        if (body?.alive) scene.destroyBody(body);
      }
      bodies = [];
      indexOf.clear();

      const type = currentType();
      // Don't allow shapes to collide with each other. This makes isolating failures easier.
      const shapeOptions = {
        rollingResistance: type === 'capsule' ? 0.4 : 0.1,
        filter: { categoryBits: 2, maskBits: 1 },
      };

      runCount += 1;
      steps = 0;

      for (let i = 0; i < gridCount; ++i) {
        for (let j = 0; j < gridCount; ++j) {
          const body = scene.createBody({
            type: 'dynamic',
            position: {
              x: 0.5 * (i - 0.5 * gridCount),
              y: 5,
              z: 0.5 * (j - 0.5 * gridCount),
            },
            linearVelocity: {
              x: random.range(-1, 1),
              y: random.range(-1, 1),
              z: random.range(-1, 1),
            },
            angularVelocity: {
              x: random.range(-5, 5),
              y: random.range(-5, 5),
              z: random.range(-5, 5),
            },
          });
          if (type === 'box') {
            scene.box(body, { hx: 0.02, hy: 0.2, hz: 0.04, ...shapeOptions });
          } else if (type === 'capsule') {
            scene.capsule(body, {
              center1: { x: 0, y: -0.2, z: 0 },
              center2: { x: 0, y: 0.2, z: 0 },
              radius: 0.05,
              ...shapeOptions,
            });
          } else if (type === 'cylinder') {
            scene.cylinder(body, {
              height: 0.4,
              radius: 0.05,
              yOffset: 0,
              sides: 6,
              ...shapeOptions,
            });
          } else {
            scene.sphere(body, { radius: 0.05, ...shapeOptions });
          }
          indexOf.set(body, [i, j]);
          bodies.push(body);
        }
      }
    };

    createGround();
    generate();

    return {
      ui(panel) {
        panel.combo(
          'Type',
          ['box', 'capsule', 'cylinder', 'sphere'],
          shapeType,
          (index) => {
            shapeType = index;
            steps = 0;
            generate();
          },
        );
        panel.slider(
          'Amplitude',
          groundAmplitude,
          { min: 0, max: 1, format: (value) => value.toFixed(3) },
          (value) => {
            groundAmplitude = value;
            createGround();
            generate();
          },
        );
        panel.button('Generate', generate);
        panel.button('Auto Generate', () => {
          autoGenerate = !autoGenerate;
          steps = 0;
        });
      },

      mouseMove(input) {
        pickRay = input.ray;
      },

      step(dt) {
        ctx.stepWorld(dt);
        steps += 1;

        pickText = '';
        if (pickRay) {
          const translation = {
            x: 1000 * pickRay.direction.x,
            y: 1000 * pickRay.direction.y,
            z: 1000 * pickRay.direction.z,
          };
          const hit = world.castRayClosest(pickRay.origin, translation);
          if (hit.hit && hit.body) {
            const pair = indexOf.get(hit.body);
            if (pair) pickText = `indices: (${pair[0]}, ${pair[1]})`;
          }
        }

        for (let i = 0; i < bodies.length && !failure; ++i) {
          const body = bodies[i];
          if (!body?.alive) continue;
          const massCenter = body.getWorldCenterOfMass();
          if (massCenter.y < -2) {
            const pair = indexOf.get(body) ?? [0, 0];
            failureText = `failed: index1: ${pair[0]} - index2: ${pair[1]} fell through`;
            // TODO(api): upstream pauses the sample here (m_context->pause = true); the context has no pause hook.
            failure = true;
            autoGenerate = false;
          }
        }

        if (autoGenerate) {
          if (world.getMoveEvents().count === 0) generate();

          // Many steps
          const n = 20;
          for (let i = 0; i < n; ++i) {
            world.step(dt, ctx.settings.subStepCount);
          }
          steps += n;

          const maxSteps = currentType() === 'capsule' ? 3000 : 1000;
          if (steps > maxSteps) {
            failureText = 'failed: did not come to rest';
            failure = true;
            autoGenerate = false;
          }
        }
      },

      draw(canvas) {
        if (pickText) canvas.text(pickText);
        if (failure) canvas.text(failureText);
        canvas.text(`run ${runCount}`);
      },

      destroy() {
        groundMesh?.release();
      },
    };
  },
});

registerSample({
  category: 'Continuous',
  name: 'Mesh Drop Unit Test',
  create(ctx) {
    ctx.camera.setView(0, 30, 20, { x: 0, y: 0, z: 0 });
    // TODO(api): upstream also sets the contact force draw scale to 0.1 here (GetGuiDraw()->forceScale).
    const { world } = ctx;
    const data = createMeshDrop(ctx, { x: 0, y: 0, z: 0 });
    let failed = false;

    return {
      step(dt) {
        ctx.stepWorld(dt);
        if (
          !failed &&
          ctx.stepCount >= 300 &&
          world.getMoveEvents().count > 0
        ) {
          failed = true;
        }
      },

      draw(canvas) {
        if (failed) canvas.text('failed!');
      },

      destroy() {
        data.mesh.release();
      },
    };
  },
});

// This sample shows that clustering based on the manifold normal can lead to clipping and/or tunneling.
registerSample({
  category: 'Continuous',
  name: 'Hump Mesh',
  create(ctx) {
    ctx.camera.setView(45, 25, 10, { x: 0, y: 1.2, z: 0 });
    const { scene } = ctx;

    scene.groundBox(20);

    const cellWidth = 8;
    const vertices = new Float32Array(18);
    let index = 0;
    let x = -0.5 * cellWidth;
    for (let ix = 0; ix <= 1; ++ix) {
      let z = -cellWidth;
      for (let iz = 0; iz <= 2; ++iz) {
        vertices.set([x, iz === 1 ? 0.05 * cellWidth : 0, z], 3 * index);
        z += cellWidth;
        index += 1;
      }
      x += cellWidth;
    }

    const indices = new Uint32Array(12);
    index = 0;
    for (let iz = 0; iz < 2; ++iz) {
      const index1 = iz;
      const index2 = index1 + 1;
      const index3 = index2 + 3;
      const index4 = index3 - 1;
      indices.set([index1, index2, index3, index3, index4, index1], index);
      index += 6;
    }

    const hump = scene.meshData({
      vertices,
      indices,
      medianSplit: true,
      identifyEdges: true,
    });

    const ground = scene.createBody({});
    scene.mesh(ground, hump);

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
      linearVelocity: { x: 0, y: -50, z: 0 },
    });
    scene.box(body, { hx: 0.5, hy: 0.05, hz: 1 });

    return {};
  },
});

registerSample({
  category: 'Continuous',
  name: 'Is Fast',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 15, z: 0 });
    const { scene } = ctx;

    scene.groundBox(40);

    const useCapsule = false;
    const spinners = [
      { x: -12, omega: { x: 0, y: 0, z: 4 } },
      { x: 0, omega: { x: 0, y: 4, z: 0 } },
      { x: 12, omega: { x: 4, y: 0, z: 0 } },
    ];
    for (const { x, omega } of spinners) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x, y: 20, z: 0 },
        gravityScale: 0,
        angularVelocity: omega,
      });
      if (useCapsule) {
        scene.capsule(body, {
          center1: { x: 0, y: -9.5, z: 0 },
          center2: { x: 0, y: 9.5, z: 0 },
          radius: 0.5,
        });
      } else {
        scene.box(body, { hx: 0.5, hy: 10, hz: 0.5 });
      }
    }

    return {};
  },
});

// CCD versus a dense mesh can stall the solver. CCD does an AABB query so it considers
// along the sweep.
registerSample({
  category: 'Continuous',
  name: 'Stall',
  create(ctx) {
    ctx.camera.setView(130, 15, 15, { x: 0, y: 2, z: 0 });
    const { scene, b3 } = ctx;

    scene.groundBox(500);

    const torus = b3.createTorusMesh(200, 200, 2, 1);
    {
      const body = scene.createBody({
        name: 'torus',
        position: { x: 0, y: 2, z: 0 },
      });
      scene.mesh(body, wrapMesh(torus));
    }

    const savedThreshold = b3.stallThreshold;
    // Log any CCD that takes longer than 1 ms.
    b3.stallThreshold = 0.001;

    let bullet: Body | undefined;
    const launch = (): void => {
      if (bullet?.alive) scene.destroyBody(bullet);
      bullet = scene.createBody({
        type: 'dynamic',
        isBullet: true,
        name: 'rock',
        position: { x: 0, y: 1, z: -10 },
        // This exceeds the default maximum speed.
        linearVelocity: { x: 0, y: 0, z: 600 },
        angularVelocity: { x: 0, y: 0, z: 20 },
      });
      const rock = b3.createRock(0.25);
      scene.hull(bullet, {
        points: rock.getGeometry().positions,
        maxVertices: 128,
      });
      rock.release();
    };
    launch();

    return {
      ui(panel) {
        panel.button('Launch', launch);
      },

      destroy() {
        torus.release();
        b3.stallThreshold = savedThreshold;
      },
    };
  },
});
