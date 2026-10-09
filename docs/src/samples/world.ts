// Ported from box3d/samples/sample_world.cpp
//
// Upstream's Far* samples exist to show double precision world positions. The
// wasm build has float positions only (`b3.doublePrecision` is false), so every
// sample except Far Stack is built at the origin instead of 1e6..1e10 m out
// (float resolution that far from the origin would wreck the scene). Each says
// so in its HUD text. Far Stack keeps its offset buttons: in a float build the
// stack is meant to snap to a coarse grid and jitter far from the origin.
import type { Body, Vec3 } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import { add } from '../framework/math.js';
import { createMeshDrop, wrapMesh } from './continuous-helpers.js';
import { createHuman } from './world-human.js';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

registerSample({
  category: 'World',
  name: 'Far Stack',
  create(ctx) {
    const { scene, b3 } = ctx;
    const maxOffset = 10000;
    const columnCount = 6;

    // Double precision opens at the dramatic offset, float opens at the origin so it is usable
    // out of the box. Either way the buttons sweep the full range.
    let offsetKilometers = b3.doublePrecision ? maxOffset : 0;
    let base: Vec3 = ZERO;
    let created: Body[] = [];
    let top: Body | undefined;

    // Place the ground and stack at the current offset and aim the camera at them.
    const buildScene = (): void => {
      base = { x: 1000 * offsetKilometers, y: 0, z: 0 };
      ctx.camera.setView(0, 8, 16, add(base, { x: 0, y: 2, z: 0 }));

      const ground = scene.createBody({
        name: 'ground',
        position: add(base, { x: 0, y: -1, z: 0 }),
      });
      scene.box(ground, { hx: 12, hy: 1, hz: 12 });
      created = [ground];

      for (let i = 0; i < columnCount; ++i) {
        // A small alternating skew so a float build visibly drifts rather than balancing by luck.
        const skew = 0.02 * (i & 1 ? 1 : -1);
        const body = scene.createBody({
          type: 'dynamic',
          position: add(base, { x: skew, y: 0.5 + i, z: 0 }),
        });
        scene.box(body, {});
        created.push(body);
        top = body;
      }
    };
    buildScene();

    const rebuild = (): void => {
      for (const body of created) scene.destroyBody(body);
      buildScene();
    };

    return {
      ui(panel) {
        const presets = [0, 10, 100, 1000, maxOffset];
        const labels = ['origin', '10km', '100km', '1000km', '10000km'];
        presets.forEach((preset, i) => {
          panel.button(labels[i] ?? '', () => {
            offsetKilometers = preset;
            rebuild();
          });
        });
      },

      draw(canvas) {
        // Height of the top box above the ground, measured in the offset's own frame.
        const height = top ? top.getWorldCenterOfMass().y - base.y : 0;
        canvas.text(`double precision: ${b3.doublePrecision ? 'ON' : 'OFF'}`);
        canvas.text(`world offset: ${offsetKilometers.toFixed(1)} km`);
        canvas.text(`top box height above ground: ${height.toFixed(4)} m`);
      },
    };
  },
});

registerSample({
  category: 'World',
  name: 'Far Pyramid',
  create(ctx) {
    const { scene, b3 } = ctx;
    // upstream: 10000 km out, which needs double precision
    const offsetKilometers = 0;
    const base: Vec3 = { x: 1000 * offsetKilometers, y: 0, z: 0 };

    ctx.camera.setView(40, -10, 60, add(base, { x: 0, y: 20, z: 0 }));

    const baseCount = 40;

    const ground = scene.createBody({
      position: add(base, { x: 0, y: -1, z: 0 }),
    });
    scene.box(ground, { hx: 400, hy: 1, hz: 400 });

    const h = 0.5;
    const shift = h;
    for (let i = 0; i < baseCount; ++i) {
      const y = (2 * i + 1) * shift;
      for (let j = i; j < baseCount; ++j) {
        const x = (i + 1) * shift + 2 * (j - i) * shift - h * baseCount;
        const body = scene.createBody({
          type: 'dynamic',
          position: add(base, { x, y, z: 0 }),
        });
        scene.box(body, { hx: h, hy: h, hz: h, density: 100 });
      }
    }

    return {
      draw(canvas) {
        canvas.text(`double precision: ${b3.doublePrecision ? 'ON' : 'OFF'}`);
        canvas.text(
          `pyramid built ${offsetKilometers.toFixed(0)} km from the world origin (upstream: 10000 km, needs double precision)`,
        );
      },
    };
  },
});

registerSample({
  category: 'World',
  name: 'Far Ragdolls',
  create(ctx) {
    const { scene, b3 } = ctx;
    const count = 20;
    // upstream: 1000 km out, which needs double precision
    const offsetKilometers = 0;
    const base: Vec3 = { x: 1000 * offsetKilometers, y: 0, z: 0 };

    ctx.camera.setView(180, 30, 20, base);

    const groundMesh = b3.createGridMesh(20, 20, 1, 1, true);
    const ground = scene.createBody({
      position: add(base, { x: 0, y: -1, z: 0 }),
    });
    scene.mesh(ground, wrapMesh(groundMesh));

    for (let i = 0; i < count; ++i) {
      const offset = {
        x: 0.15 * (i - 0.5 * count),
        y: 2 + 0.25 * i,
        z: 0.15 * (0.5 * count - i),
      };
      createHuman(scene, add(base, offset), 10, 0.5, 0.7, i);
    }

    return {
      draw(canvas) {
        canvas.text(`double precision: ${b3.doublePrecision ? 'ON' : 'OFF'}`);
        canvas.text(
          `${count} ragdolls piled ${offsetKilometers.toFixed(0)} km from the world origin (upstream: 1000 km, needs double precision)`,
        );
      },

      destroy() {
        groundMesh.release();
      },
    };
  },
});

// The Mesh Drop unit test, run 1000 km out in both x and z upstream. A field of thin boxes rains onto a
// wave mesh and must come to rest. Past 300 steps any body still moving trips the failure readout.
registerSample({
  category: 'World',
  name: 'Far Mesh Drop',
  create(ctx) {
    const { world, b3 } = ctx;
    // upstream: 1000 km out in x and z, which needs double precision
    const offsetKilometers = 0;
    const base: Vec3 = {
      x: 1000 * offsetKilometers,
      y: 0,
      z: 1000 * offsetKilometers,
    };

    ctx.camera.setView(0, 30, 20, base);
    // TODO(api): upstream also sets the contact force draw scale to 0.1 here (GetGuiDraw()->forceScale).
    const data = createMeshDrop(ctx, base);
    let failed = false;

    return {
      step(dt) {
        ctx.stepWorld(dt);
        // Once the pile should have settled, any remaining body motion means it did not come to
        // rest far from the origin.
        if (
          !failed &&
          ctx.stepCount >= 300 &&
          world.getMoveEvents().count > 0
        ) {
          failed = true;
        }
      },

      draw(canvas) {
        canvas.text(`double precision: ${b3.doublePrecision ? 'ON' : 'OFF'}`);
        canvas.text(
          `mesh drop running ${offsetKilometers.toFixed(0)} km from the world origin (upstream: 1000 km, needs double precision)`,
        );
        if (failed) canvas.text('failed!');
      },

      destroy() {
        data.mesh.release();
      },
    };
  },
});
