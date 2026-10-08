// Ported from box3d/samples/sample_benchmark.cpp and shared/benchmarks.c
// Release-build sizes are used throughout (upstream's BENCHMARK_DEBUG sizes are
// only for debug builds), except where noted on the sample.
import type { Body, Mesh, Shape, Vec3 } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import type { MeshData } from '../framework/builder.js';
import { DEG_TO_RAD } from '../framework/math.js';
import { createHuman, destroyHuman, type Human } from './benchmark-human.js';
import {
  attachHull,
  drawAxes,
  drawWireSphere,
  hullPoints,
  meshDataOf,
} from './benchmark-helpers.js';

registerSample({
  category: 'Benchmark',
  name: 'Large Pyramid',
  create(ctx) {
    ctx.camera.setView(40, -10, 110, { x: 0, y: 40, z: 0 });
    const { scene, world } = ctx;
    world.enableSleeping(false);
    const baseCount = 100;

    const ground = scene.createBody({
      position: { x: 0, y: -1, z: 0 },
    });
    scene.box(ground, { hx: 400, hy: 1, hz: 400 });

    const h = 0.5;
    const shift = 1 * h;
    for (let i = 0; i < baseCount; i++) {
      const y = (2 * i + 1) * shift;
      for (let j = i; j < baseCount; j++) {
        const x = (i + 1) * shift + 2 * (j - i) * shift - h * baseCount;
        const body = scene.createBody({
          type: 'dynamic',
          position: { x, y, z: 0 },
        });
        scene.box(body, { hx: h, hy: h, hz: h, density: 100 });
      }
    }
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Wide Pyramid',
  create(ctx) {
    ctx.camera.setView(0, 5, 80, { x: 0, y: 18, z: 0 });
    const { scene } = ctx;

    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(ground, { hx: 100, hy: 1, hz: 100 });

    const boxSize = 2;
    const boxSeparation = 0.5;
    const halfBoxSize = 0.5 * boxSize;
    const pyramidHeight = 15;
    const h = halfBoxSize - 0.025;

    for (let i = 0; i < pyramidHeight; i++) {
      const end = pyramidHeight - Math.floor((i + 1) / 2);
      for (let j = Math.floor(i / 2); j < end; j++) {
        for (let k = Math.floor(i / 2); k < end; k++) {
          const shift = i & 1 ? halfBoxSize : 0;
          const body = scene.createBody({
            type: 'dynamic',
            position: {
              x: -pyramidHeight + boxSize * j + shift,
              y: 1 + (boxSize + boxSeparation) * i,
              z: -pyramidHeight + boxSize * k + shift,
            },
          });
          scene.box(body, { hx: h, hy: h, hz: h });
        }
      }
    }
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Many Pyramids',
  create(ctx) {
    ctx.camera.setView(-10, 10, 120, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;

    const baseCount = 10;
    const extent = 0.5;
    const rowCount = 14;
    const columnCount = 14;
    const groundExtent = extent * columnCount * (baseCount + 1);

    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(ground, { hx: groundExtent, hy: 1, hz: groundExtent });

    const baseWidth = 2 * extent * baseCount;
    let baseZ = -groundExtent + 2 * extent;
    const deltaZ = (2 * (groundExtent - 2 * extent)) / (rowCount - 1);

    for (let i = 0; i < rowCount; i++) {
      for (let j = 0; j < columnCount; j++) {
        const centerX =
          -groundExtent + j * (baseWidth + 2 * extent) + 2 * extent;
        // upstream CreateSmallPyramid
        for (let row = 0; row < baseCount; row++) {
          const y = (2 * row + 1) * extent;
          for (let col = row; col < baseCount; col++) {
            const x =
              (row + 1) * extent + 2 * (col - row) * extent + centerX - 0.5;
            const body = scene.createBody({
              type: 'dynamic',
              position: { x, y, z: baseZ },
              enableSleep: false,
            });
            scene.box(body, {
              hx: extent,
              hy: extent,
              hz: extent,
              density: 100,
            });
          }
        }
      }
      baseZ += deltaZ;
    }
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Rain',
  create(ctx) {
    ctx.camera.setView(25, 10, 70, { x: 0, y: 0, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridSize = 15;
    const gridCount = 10;
    const groupSize = 3;
    const delay = 0x2f;

    const groups: Human[][] = Array.from(
      { length: gridCount * gridCount },
      () => [],
    );
    const meshes: Mesh[] = [];

    const halfRows = 4;
    const cellWidth = gridSize / (2 * halfRows);
    const gridMesh = b3.createGridMesh(
      2 * halfRows,
      2 * halfRows,
      cellWidth,
      1,
      true,
    );
    const torusMesh = b3.createTorusMesh(16, 16, 0.25 * gridSize, 1);
    meshes.push(gridMesh, torusMesh);
    const gridData: MeshData = meshDataOf(gridMesh);
    const torusData: MeshData = meshDataOf(torusMesh);

    const span = gridSize * gridCount;
    let x = -0.5 * span + 0.5 * gridSize;
    for (let i = 0; i < gridCount; i++) {
      let z = -0.5 * span + 0.5 * gridSize;
      for (let j = 0; j < gridCount; j++) {
        const body = scene.createBody({ position: { x, y: 0, z } });
        scene.mesh(body, gridData);
        scene.mesh(body, torusData);
        z += gridSize;
      }
      x += gridSize;
    }

    let columnCountNow = 0;
    let columnIndex = 0;

    const createGroup = (rowIndex: number, column: number): void => {
      const groupIndex = rowIndex * gridCount + column;
      const groupDistance = span / gridCount;
      const position = {
        x: -0.5 * span + groupDistance * (column + 0.5),
        y: 20,
        z: -0.5 * span + groupDistance * (rowIndex + 0.5),
      };
      const humans: Human[] = [];
      for (let i = 0; i < groupSize; i++) {
        humans.push(
          createHuman(scene, world, b3, position, 5, 1, 0.7, groupIndex),
        );
        position.x += 0.75;
      }
      groups[groupIndex] = humans;
    };

    const destroyGroup = (rowIndex: number, column: number): void => {
      const groupIndex = rowIndex * gridCount + column;
      for (const human of groups[groupIndex] ?? []) destroyHuman(scene, human);
      groups[groupIndex] = [];
    };

    return {
      step(dt) {
        // upstream StepRain
        if ((ctx.stepCount & delay) === 0) {
          if (columnCountNow < gridCount) {
            for (let i = 0; i < gridCount; i++) createGroup(i, columnCountNow);
            columnCountNow = Math.min(columnCountNow + 1, gridCount);
          } else {
            for (let i = 0; i < gridCount; i++) {
              destroyGroup(i, columnIndex);
              createGroup(i, columnIndex);
            }
            columnIndex += 1;
            if (columnIndex >= gridCount) columnIndex = 0;
          }
        }
        ctx.stepWorld(dt);
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.1, z: 0 }, 2);
      },
      destroy() {
        for (const mesh of meshes) mesh.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Joint Grid',
  create(ctx) {
    ctx.camera.setView(-25, 25, 94, { x: 30, y: -30, z: 30 });
    const { scene, world } = ctx;
    world.enableSleeping(false);

    const n = 100;
    const bodies: Body[] = [];
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const body = scene.createBody({
          type: i === 0 ? 'static' : 'dynamic',
          position: { x: k, y: -i, z: 0 },
          enableSleep: false,
        });
        scene.sphere(body, {
          radius: 0.4,
          // category 2, collides with everything but category 2
          filter: { categoryBits: 2, maskBits: 0xfffffffd },
        });

        const index = bodies.length;
        if (i > 0) {
          world.createSphericalJoint(bodies[index - 1] as Body, body, {
            anchorA: { x: 0, y: -0.5, z: 0 },
            anchorB: { x: 0, y: 0.5, z: 0 },
          });
        }
        if (k > 0) {
          world.createSphericalJoint(bodies[index - n] as Body, body, {
            anchorA: { x: 0.5, y: 0, z: 0 },
            anchorB: { x: -0.5, y: 0, z: 0 },
          });
        }
        bodies.push(body);
      }
    }
    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.1, z: 0 }, 4);
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Falling Boxes',
  create(ctx) {
    ctx.camera.setView(45, 10, 80, { x: 0, y: 20, z: 0 });
    const { scene } = ctx;
    scene.groundBox(100);

    const n = 50;
    const a = 0.5;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 8; j++) {
        for (let k = 0; k < 8; k++) {
          const body = scene.createBody({
            type: 'dynamic',
            position: {
              x: -16 * a + 4 * a * j,
              y: 4 * a * i + 5 * a,
              z: -16 * a + 4 * a * k,
            },
          });
          scene.box(body, { hx: a, hy: a, hz: a });
        }
      }
    }
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Candy Cups',
  create(ctx) {
    ctx.camera.setView(45, 20, 70, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;
    scene.groundBox(60);

    // CreateConvex( 0.6, 0, 0.95, 1 ): an octagonal frustum
    const sideCount = 8;
    const radius1 = 0.6;
    const height1 = 0;
    const radius2 = 0.95;
    const height2 = 1;
    const points: number[] = [];
    for (let i = 0; i < sideCount; i++) {
      const alpha = (2 * Math.PI * i) / sideCount;
      const c = Math.cos(alpha);
      const s = Math.sin(alpha);
      points.push(radius1 * c, height1, radius1 * s);
      points.push(radius2 * c, height2, radius2 * s);
    }
    const hull = b3.createHull(points, 2 * sideCount);
    const drawPoints = Float32Array.from(points);

    const n = 16;
    const m = 16;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        for (let k = 0; k < m; k++) {
          const body = scene.createBody({
            type: 'dynamic',
            position: { x: -10 + 2.5 * j, y: 1 * i, z: -10 + 2.5 * k },
          });
          attachHull(scene, body, hull, drawPoints);
        }
      }
    }
    hull.release();
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Explosion',
  create(ctx) {
    ctx.camera.setView(45, 20, 30, { x: 0, y: 0, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridMesh = b3.createGridMesh(40, 40, 1, 0, true);
    const ground = scene.createBody();
    scene.mesh(ground, meshDataOf(gridMesh));

    const hy = 1;
    scene.box(ground, { hx: 20, hy, hz: 0.1, offset: { x: 0, y: hy, z: -20 } });
    scene.box(ground, { hx: 20, hy, hz: 0.1, offset: { x: 0, y: hy, z: 20 } });
    scene.box(ground, { hx: 0.1, hy, hz: 20, offset: { x: -20, y: hy, z: 0 } });
    scene.box(ground, { hx: 0.1, hy, hz: 20, offset: { x: 20, y: hy, z: 0 } });

    // 15 sides rather than 16 to avoid manifold degeneracies
    const n = 16;
    for (let i = -n; i <= n; i++) {
      for (let k = -n; k <= n; k++) {
        const body = scene.createBody({
          type: 'dynamic',
          position: { x: i, y: 0, z: k },
        });
        scene.cylinder(body, {
          height: 0.5,
          radius: 0.2,
          yOffset: 0,
          sides: 15,
          explosionScale: 2,
        });
      }
    }

    let impulse = 1000;
    return {
      ui(panel) {
        panel.slider(
          'Magnitude',
          impulse,
          { min: 0, max: 2000, step: 0, format: (v) => v.toFixed(0) },
          (v) => {
            impulse = v;
          },
        );
        panel.button('Explode', () => {
          world.explode({
            position: { x: 0, y: -4, z: 0 },
            radius: 16,
            impulsePerArea: impulse,
          });
        });
      },
      destroy() {
        gridMesh.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Height Field',
  create(ctx) {
    ctx.camera.setView(0, 20, 50, { x: 0, y: 0, z: 0 });
    const { scene, world } = ctx;

    const columnCount = 50;
    const rowCount = 50;
    let radius = 0.1;

    const body = scene.createBody({
      position: { x: -0.5 * columnCount, y: 0, z: -0.5 * rowCount },
    });

    // b3CreateWave( 50, 50, one, 0.02, 0.04, true )
    const omegaZ = 2 * Math.PI * 0.02;
    const omegaX = 2 * Math.PI * 0.04;
    const heights = new Float32Array(rowCount * columnCount);
    for (let i = 0; i < rowCount; i++) {
      const rowHeight = Math.sin(omegaZ * i);
      for (let j = 0; j < columnCount; j++) {
        heights[i * columnCount + j] = rowHeight * Math.sin(omegaX * j);
      }
    }
    const cellCount = (rowCount - 1) * (columnCount - 1);
    const materialIndices = new Uint8Array(cellCount);
    for (let k = 1; k < cellCount; k++) {
      if (k % 16 === 0) materialIndices[k] = 0xff;
    }
    const data = scene.heightFieldData({
      heights,
      countX: columnCount,
      countZ: rowCount,
      materialIndices,
      minHeight: -256,
      maxHeight: 256,
    });
    scene.heightField(body, data);

    const delta = 0.4;
    const spanX = 0.94 * 0.5 * columnCount;
    const spanZ = 0.96 * 0.5 * rowCount;
    const rayTranslation = { x: 80000, y: -80000, z: 8 };

    return {
      ui(panel) {
        panel.slider(
          'Radius',
          radius,
          { min: 0, max: 1, step: 0, format: (v) => v.toFixed(1) },
          (v) => {
            radius = v;
          },
        );
      },
      draw(canvas) {
        const o = { x: 0, y: 0, z: 0 };
        canvas.line(o, { x: 0.4, y: 0, z: 0 }, 0xff0000);
        canvas.line(o, { x: 0, y: 0.4, z: 0 }, 0x00ff00);
        canvas.line(o, { x: 0, y: 0, z: 0.4 }, 0x0000ff);

        let hitCount = 0;
        let castCount = 0;
        const start = performance.now();
        const proxy = { points: [0, 0, 0], radius };
        for (let x = -spanX; x <= spanX; x += delta) {
          for (let z = -spanZ; z <= spanZ; z += delta) {
            const origin = { x, y: 2, z };
            let hit: boolean;
            if (radius === 0) {
              hit = world.castRayClosest(origin, rayTranslation).hit;
            } else {
              hit =
                world.castShape(proxy, origin, rayTranslation, {}, 'closest')
                  .count > 0;
            }
            castCount += 1;
            if (hit) hitCount += 1;
          }
        }
        const milliseconds = performance.now() - start;
        canvas.text(
          `count = ${castCount}, hit count = ${hitCount}, iterations = 0, inner = 0, ticks = 0`,
        );
        canvas.text(
          `ave iterations = 0.0, ave inner = 0.0, ave cast us ${((1000 * milliseconds) / castCount).toFixed(3)}`,
        );
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Falling Trees',
  create(ctx) {
    ctx.camera.setView(20, 0, 140, { x: 0, y: 15, z: 0 });
    const { scene, b3 } = ctx;
    const GRID_SIZES = [100, 50, 25];
    const SCALES = [1, 2, 4];
    let gridIndex = 0;
    let waveMesh: Mesh | undefined;

    // upstream CreateTrees( worldId, scale )
    const createTrees = (scale: number): void => {
      const xCount = scale * 150;
      const zCount = scale * 200;
      const cellWidth = 1 / scale;
      waveMesh = b3.createWaveMesh(xCount, zCount, cellWidth, 0.4, 0.05, 0.1);
      const ground = scene.createBody();
      scene.mesh(ground, meshDataOf(waveMesh));

      const bodyCount = 50;
      const hullCount = 22;
      let angularVelocity = -0.5;
      let z = -70;
      for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex++) {
        const position = { x: 0, y: 1, z };
        const body = scene.createBody({
          type: 'dynamic',
          position,
          sleepThreshold: 0.2,
        });

        let y = 1;
        let r = 0.75;
        const l = 1.5;
        for (let i = 0; i < hullCount; i++) {
          scene.cylinder(body, {
            height: l + 2 * r,
            radius: r,
            yOffset: y - r,
            sides: 6,
            density: 1,
            friction: 0.9,
            rollingResistance: 0.05,
            updateBodyMass: false,
          });
          y += l + 2 * r;
          r = 0.95 * r;
        }

        const velocityScale = 0.5 + (0.5 * bodyIndex) / bodyCount;
        body.applyMassFromShapes();
        const center = body.getWorldCenterOfMass();
        const omega = { x: 0, y: 0, z: velocityScale * angularVelocity };
        const d = {
          x: center.x - position.x,
          y: center.y - position.y,
          z: center.z - position.z,
        };
        body.setAngularVelocity(omega);
        body.setLinearVelocity({
          x: omega.y * d.z - omega.z * d.y,
          y: omega.z * d.x - omega.x * d.z,
          z: omega.x * d.y - omega.y * d.x,
        });

        z += 3;
        angularVelocity = -angularVelocity;
      }
    };

    const generate = (): void => {
      // upstream recreates the world; clear it and rebuild instead
      for (const body of [...scene.entries.keys()]) scene.destroyBody(body);
      waveMesh?.release();
      waveMesh = undefined;
      createTrees(SCALES[gridIndex] ?? 1);
    };

    createTrees(1);

    return {
      ui(panel) {
        panel.radio(
          '',
          GRID_SIZES.map((s) => `${s}cm`),
          gridIndex,
          (index) => {
            gridIndex = index;
            generate();
          },
        );
      },
      destroy() {
        waveMesh?.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Sensor',
  create(ctx) {
    ctx.camera.setView(0, 0, 250, { x: 0, y: 110, z: 0 });
    const { scene, world } = ctx;

    interface ShapeUserData {
      row: number;
      active: boolean;
    }
    const userData = new Map<Shape, ShapeUserData>();

    const columnCount = 40;
    const rowCount = 40;
    const filterRow = rowCount >> 1;
    let maxBeginCount = 0;
    let maxEndCount = 0;

    world.setCallbacks({
      customFilter(a, b) {
        let data: ShapeUserData | undefined;
        if (a.isSensor()) data = userData.get(a);
        else if (b.isSensor()) data = userData.get(b);
        if (data) return data.active || data.row !== filterRow;
        return true;
      },
    });

    const activeSensor: ShapeUserData = { row: 0, active: true };

    {
      const gridSize = 3;
      // These destroy anything they touch, including themselves.
      let x = -40 * gridSize;
      for (let i = 0; i < 81; i++) {
        const body = scene.createBody({ position: { x, y: 0, z: 0 } });
        const shape = scene.box(body, {
          hx: 0.48 * gridSize,
          hy: 0.48 * gridSize,
          hz: 0.48 * gridSize,
          isSensor: true,
          enableSensorEvents: true,
        });
        userData.set(shape, activeSensor);
        x += gridSize;
      }
    }

    {
      const shift = 5;
      const xCenter = 0.5 * shift * columnCount;
      const yStart = 10;
      for (let j = 0; j < rowCount; j++) {
        const data: ShapeUserData = { row: j, active: false };
        const y = j * shift + yStart;
        for (let i = 0; i < columnCount; i++) {
          const body = scene.createBody({
            position: { x: i * shift - xCenter, y, z: 0 },
          });
          const shape = scene.box(body, {
            hx: 0.5,
            hy: 0.5,
            hz: 0.5,
            isSensor: true,
            enableSensorEvents: true,
            enableCustomFiltering: j === filterRow,
          });
          userData.set(shape, data);
        }
      }
    }

    const createRow = (y: number): void => {
      const shift = 5;
      const xCenter = 0.5 * shift * columnCount;
      for (let i = 0; i < columnCount; i++) {
        // stagger bodies to avoid bunching up events into a single update
        const yOffset = ctx.random.range(-1, 1);
        const body = scene.createBody({
          type: 'dynamic',
          position: { x: shift * i - xCenter, y: y + yOffset, z: 0 },
          gravityScale: 0,
          linearVelocity: { x: 0, y: -5, z: 0 },
        });
        scene.sphere(body, { radius: 0.5, enableSensorEvents: true });
      }
    };

    const lime = 0x00ff00;

    return {
      step(dt) {
        ctx.stepWorld(dt);

        const zombies = new Set<Body>();

        const begins = world.getSensorBeginEvents();
        for (let i = 0; i < begins.count; i++) {
          const sensor = begins.sensorShapeAt(i);
          const visitor = begins.visitorBodyAt(i);
          const data = sensor ? userData.get(sensor) : undefined;
          if (!data || !visitor) continue;
          if (data.active) {
            zombies.add(visitor);
          } else {
            // Modify color while overlapped with a sensor
            scene.setBodyColor(visitor, lime);
          }
        }
        maxBeginCount = Math.max(begins.count, maxBeginCount);

        const ends = world.getSensorEndEvents();
        for (let i = 0; i < ends.count; i++) {
          const visitor = ends.visitorBodyAt(i);
          // Restore color to default
          if (visitor?.alive) scene.setBodyColor(visitor, undefined);
        }
        maxEndCount = Math.max(ends.count, maxEndCount);

        for (const body of zombies) scene.destroyBody(body);

        if ((ctx.stepCount & 0x1f) === 0) {
          createRow(10 + rowCount * 5);
        }
      },
      draw(canvas) {
        canvas.text(`max begin touch events = ${maxBeginCount}`);
        canvas.text(`max end touch events = ${maxEndCount}`);
      },
      destroy() {
        world.setCallbacks({});
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Washer',
  create(ctx) {
    ctx.camera.setView(15, 20, 60, { x: 0, y: 15, z: 0 });
    const { scene } = ctx;

    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(ground, { hx: 60, hy: 1, hz: 60 });

    // kinematic washer drum
    {
      const motorSpeed = 25;
      const body = scene.createBody({
        type: 'kinematic',
        position: { x: 0, y: 21, z: 0 },
        angularVelocity: { x: 0, y: 0, z: DEG_TO_RAD * motorSpeed },
        linearVelocity: { x: 0.001, y: -0.002, z: 0 },
      });

      const r0 = 14;
      const r1 = 16;
      const r2 = 18;
      const nd = { x: 0, y: 0, z: -10 };
      const pd = { x: 0, y: 0, z: 10 };

      const angle = Math.PI / 18;
      const stepAngle = angle;
      const offsetAngle = 0.1 * angle;
      const at = (center: Vec3, r: number, a: Vec3): number[] => [
        center.x + r * a.x,
        center.y + r * a.y,
        center.z + r * a.z,
      ];
      const rotZ = (v: Vec3, t: number): Vec3 => ({
        x: Math.cos(t) * v.x - Math.sin(t) * v.y,
        y: Math.sin(t) * v.x + Math.cos(t) * v.y,
        z: v.z,
      });

      let u1: Vec3 = { x: 1, y: 0, z: 0 };
      for (let i = 0; i < 36; i++) {
        const u2: Vec3 = i === 35 ? { x: 1, y: 0, z: 0 } : rotZ(u1, stepAngle);

        {
          const a1 = rotZ(u1, -offsetAngle);
          const a2 = rotZ(u2, offsetAngle);
          const points = [
            ...at(nd, r1, a1),
            ...at(nd, r2, a1),
            ...at(nd, r1, a2),
            ...at(nd, r2, a2),
            ...at(pd, r1, a1),
            ...at(pd, r2, a1),
            ...at(pd, r1, a2),
            ...at(pd, r2, a2),
          ];
          scene.hull(body, { points, maxVertices: 8 });
        }

        if (i % 9 === 0) {
          const points = [
            ...at(nd, r0, u1),
            ...at(nd, r1, u1),
            ...at(nd, r0, u2),
            ...at(nd, r1, u2),
            ...at(pd, r0, u1),
            ...at(pd, r1, u1),
            ...at(pd, r0, u2),
            ...at(pd, r1, u2),
          ];
          scene.hull(body, { points, maxVertices: 8 });
        }

        u1 = u2;
      }
    }

    const gridCount = 20;
    const a = 0.2;
    let x = -2 * a * gridCount;
    for (let i = 0; i < gridCount; i++) {
      let y = -2 * a * gridCount + 21;
      for (let j = 0; j < gridCount; j++) {
        let z = -2 * a * gridCount;
        for (let k = 0; k < gridCount; k++) {
          const body = scene.createBody({
            type: 'dynamic',
            position: { x, y, z },
          });
          scene.box(body, { hx: a, hy: a, hz: a });
          z += 4 * a;
        }
        y += 4 * a;
      }
      x += 4 * a;
    }
    return {};
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Large World',
  create(ctx) {
    ctx.camera.setView(0, 10, 250, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;

    // Upstream uses a 1000 x 1000 floor (a million static bodies); that is far
    // too much for the browser, so this uses 100 x 100.
    const cell = 10;
    const gridCount = 100;
    const sphereCount = 100;
    const dropInterval = 5;
    const halfSpan = 0.5 * cell * gridCount;

    for (let i = 0; i < gridCount; i++) {
      const x = -halfSpan + (i + 0.5) * cell;
      for (let j = 0; j < gridCount; j++) {
        const z = -halfSpan + (j + 0.5) * cell;
        const body = scene.createBody({ position: { x, y: 0, z } });
        scene.box(body, {
          hx: 0.5 * cell,
          hy: 0.25,
          hz: 0.5 * cell,
          // every static shape gets buffered into the move set on creation
          invokeContactCreation: true,
        });
      }
    }

    let spheresDropped = 0;
    let side = 1;
    while (side * side < sphereCount) side += 1;

    return {
      step(dt) {
        // upstream StepLargeWorld
        const stepCount = ctx.stepCount;
        if (
          spheresDropped < sphereCount &&
          stepCount !== 0 &&
          stepCount % dropInterval === 0
        ) {
          const gi = spheresDropped % side;
          const gj = Math.floor(spheresDropped / side);
          // confine drops to the inner 80% of the floor
          const inset = 0.1 * 2 * halfSpan;
          const usable = 2 * halfSpan - 2 * inset;
          const body = scene.createBody({
            type: 'dynamic',
            position: {
              x: -halfSpan + inset + (gi + 0.5) * (usable / side),
              y: 1.5,
              z: -halfSpan + inset + (gj + 0.5) * (usable / side),
            },
          });
          scene.sphere(body, { radius: 0.5 });
          spheresDropped += 1;
        }
        ctx.stepWorld(dt);
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Hull',
  create(ctx) {
    ctx.camera.setView(0, 15, 5, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    const count = 64;
    const points = new Float32Array(count * 3);
    for (let i = 0; i < points.length; i++) points[i] = ctx.random.range(-1, 1);

    const hull = b3.createHull(points, count);
    const scale = { x: -1, y: 1, z: 1 };
    const transformed = hull.transformed({ scale });

    const left = scene.createBody({ position: { x: -2, y: 0, z: 0 } });
    attachHull(scene, left, hull, hullPoints(hull));
    const right = scene.createBody({ position: { x: 2, y: 0, z: 0 } });
    attachHull(scene, right, transformed, hullPoints(transformed));

    const trials = 2000;
    let lines: string[] = [];

    return {
      step(dt) {
        let start = performance.now();
        let area = 0;
        for (let i = 0; i < trials; i++) {
          const h = b3.createHull(points, count);
          area += 1;
          h.release();
        }
        const createTime = performance.now() - start;

        start = performance.now();
        for (let i = 0; i < trials; i++) {
          hull.transformed({ scale }).release();
        }
        const cloneTime = performance.now() - start;

        // TODO(api): the hull's surfaceArea is not exposed, so the area readouts are omitted.
        void area;
        lines = [
          `trials = ${trials}`,
          `createTime (us) = ${((1000 * createTime) / trials).toFixed(2)}`,
          `cloneTime (us) = ${((1000 * cloneTime) / trials).toFixed(2)}`,
          `createTime / cloneTime = ${(createTime / cloneTime).toFixed(2)}`,
        ];
        ctx.stepWorld(dt);
      },
      draw(canvas) {
        for (const line of lines) canvas.text(line);
      },
      destroy() {
        hull.release();
        transformed.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Chains',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 5, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridCount = 25;
    const mesh = b3.createWaveMesh(80, 80, 1, 0.5, 0.05, 0.01);
    const ground = scene.createBody();
    scene.mesh(ground, meshDataOf(mesh));

    const linkRadius = 0.125;
    const linkExtent = 0.25;
    const linkCount = 4;
    const shapes: Shape[] = [];

    let x = -1 * gridCount;
    for (let rowIndex = 0; rowIndex < gridCount; rowIndex++) {
      let z = -1 * gridCount;
      for (let columnIndex = 0; columnIndex < gridCount; columnIndex++) {
        let previous: Body | undefined;
        for (let i = 0; i < linkCount; i++) {
          const body = scene.createBody({
            type: i === 0 ? 'static' : 'dynamic',
            position: { x, y: (1 - 2 * i) * linkExtent + 3, z },
            enableSleep: false,
          });
          const shape = scene.capsule(body, {
            center1: { x: 0, y: -linkExtent, z: 0 },
            center2: { x: 0, y: linkExtent, z: 0 },
            radius: linkRadius,
          });
          if (i === linkCount - 1) shapes.push(shape);
          if (previous) {
            world.createSphericalJoint(previous, body, {
              anchorA: { x: 0, y: -linkExtent, z: 0 },
              anchorB: { x: 0, y: linkExtent, z: 0 },
              enableSpring: true,
              hertz: 1,
              dampingRatio: 0.7,
              enableMotor: true,
              maxMotorTorque: 1,
            });
          }
          previous = body;
        }
        z += 2;
      }
      x += 2;
    }

    const noise = { x: 0, y: 0, z: 0 };
    return {
      step(dt) {
        const speed = 20;
        const wind = {
          x: speed * (1 + noise.x),
          y: speed * noise.y,
          z: speed * noise.z,
        };
        for (const shape of shapes) shape.applyWind(wind, 1, 1, 20, false);

        const rand = {
          x: ctx.random.range(-0.3, 0.3),
          y: ctx.random.range(-0.3, 0.3),
          z: ctx.random.range(-0.3, 0.3),
        };
        noise.x += 0.05 * (rand.x - noise.x);
        noise.y += 0.05 * (rand.y - noise.y);
        noise.z += 0.05 * (rand.z - noise.z);

        ctx.stepWorld(dt);
      },
      destroy() {
        mesh.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Destruction',
  create(ctx) {
    ctx.camera.setView(0, 40, 30, { x: 0, y: 0, z: 0 });
    const { scene, world, b3 } = ctx;

    const gridCount = 20;
    const extent = 2.5;

    const gridMesh = b3.createGridMesh(40, 40, 1, 0, true);
    const ground = scene.createBody();
    scene.mesh(ground, meshDataOf(gridMesh));

    let bodies: Body[] = [];
    const explosion = {
      position: { x: 0, y: 2 * extent, z: 0 },
      radius: extent,
      falloff: 0.5 * extent,
      impulsePerArea: 1000,
    };
    let spawnMilliseconds = 0;
    let destroyMilliseconds = 0;

    const spawn = (): void => {
      const start = performance.now();
      const a = extent / gridCount;
      bodies = [];
      for (let i = 0; i < gridCount; i++) {
        for (let j = 0; j < gridCount; j++) {
          for (let k = 0; k < gridCount; k++) {
            if (Math.floor(ctx.random.range(1, 3)) === 1) continue;
            const body = scene.createBody({
              type: 'dynamic',
              position: {
                x: (2 * i - gridCount + 1) * a,
                y: (2 * j + 1) * a,
                z: (2 * k - gridCount + 1) * a,
              },
            });
            scene.box(body, { hx: 0.8 * a, hy: 0.8 * a, hz: 0.8 * a });
            bodies.push(body);
          }
        }
      }
      world.explode(explosion);
      spawnMilliseconds = performance.now() - start;
    };

    const destroyBodies = (): void => {
      const start = performance.now();
      for (const body of bodies) scene.destroyBody(body);
      bodies = [];
      destroyMilliseconds = performance.now() - start;
    };

    spawn();

    return {
      step(dt) {
        ctx.stepWorld(dt);
        if (ctx.stepCount % 140 === 0) {
          destroyBodies();
          spawn();
        }
      },
      draw(canvas) {
        canvas.text(`spawn = ${spawnMilliseconds.toFixed(2)} ms`);
        canvas.text(`destroy = ${destroyMilliseconds.toFixed(2)} ms`);
        drawWireSphere(
          canvas,
          explosion.position,
          explosion.radius,
          24,
          0x00ffff,
        );
        drawWireSphere(
          canvas,
          explosion.position,
          explosion.radius + explosion.falloff,
          24,
          0xfff8dc,
        );
      },
      destroy() {
        gridMesh.release();
      },
    };
  },
});

registerSample({
  category: 'Benchmark',
  name: 'Junkyard',
  create(ctx) {
    ctx.camera.setView(45, 30, 125, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    const ground = scene.createBody({ position: { x: 0, y: -1, z: 0 } });
    scene.box(ground, { hx: 120, hy: 1, hz: 120 });
    scene.box(ground, { hx: 1, hy: 8, hz: 50, offset: { x: -50, y: 8, z: 0 } });
    scene.box(ground, { hx: 1, hy: 8, hz: 50, offset: { x: 50, y: 8, z: 0 } });
    scene.box(ground, { hx: 50, hy: 8, hz: 1, offset: { x: 0, y: 8, z: -50 } });
    scene.box(ground, { hx: 50, hy: 8, hz: 1, offset: { x: 0, y: 8, z: 50 } });

    {
      const rock = b3.createRock(1.5);
      const points = hullPoints(rock);
      const count = 24;
      const height = 24;
      for (let y = 0; y < count; y++) {
        for (let x = 0; x <= 20; x++) {
          for (let z = 0; z <= 20; z++) {
            const body = scene.createBody({
              type: 'dynamic',
              position: {
                x: -40 + 4 * x,
                y: 4 * y + height + 1,
                z: -40 + 4 * z,
              },
            });
            attachHull(scene, body, rock, points);
          }
        }
      }
      rock.release();
    }

    const radius = 35;
    let degrees = 0;
    const pusher = scene.createBody({
      type: 'kinematic',
      position: { x: radius, y: 0, z: 0 },
    });
    scene.cylinder(pusher, { height: 24, radius: 4, yOffset: 0, sides: 16 });

    return {
      step(dt) {
        // upstream StepJunkyard
        const omega = -6;
        degrees += omega * dt;
        const t = degrees * DEG_TO_RAD;
        pusher.setTargetTransform(
          {
            position: {
              x: radius * Math.cos(t),
              y: 0,
              z: radius * Math.sin(t),
            },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          dt,
          false,
        );
        ctx.stepWorld(dt);
      },
    };
  },
});
