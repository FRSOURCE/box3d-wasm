// Ported from box3d/samples/sample_robustness.cpp
import type { Body } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';

const fixed = (digits: number) => (value: number) => value.toFixed(digits);

// Pyramid with heavy box on top
registerSample({
  category: 'Robustness',
  name: 'HighMassRatio1',
  create(ctx) {
    ctx.camera.setView(30, 15, 70, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;

    scene.groundBox(50);

    const extent = 1;
    for (let j = 0; j < 3; ++j) {
      let count = 10;
      const offset = -20 * extent + 2 * (count + 1) * extent * j;
      let y = extent;
      while (count > 0) {
        for (let i = 0; i < count; ++i) {
          const coeff = i - 0.5 * count;
          const yy = count === 1 ? y + 2 : y;
          const body = scene.createBody({
            type: 'dynamic',
            position: { x: 2 * coeff * extent + offset, y: yy, z: 0 },
          });
          scene.box(body, {
            hx: extent,
            hy: extent,
            hz: extent,
            density: count === 1 ? (j + 1) * 100 : 1,
          });
        }
        --count;
        y += 2 * extent;
      }
    }

    return {};
  },
});

// A pyramid of 5cm boxes. Stacking tiny objects is challenging for physics engines due to rotational effects.
// This is also challenging for Box3D because of the AABB margin and linear slop are close to the shape size. This
// leads to many collision pairs and some shape overlap.
registerSample({
  category: 'Robustness',
  name: 'Tiny Pyramid',
  create(ctx) {
    ctx.camera.setView(-30, 20, 10, { x: 0, y: 0.5, z: 0 });
    const { scene } = ctx;

    scene.groundBox(20);

    const extent = 0.025;
    const baseCount = 30;
    for (let i = 0; i < baseCount; ++i) {
      const y = (2 * i + 1) * extent;
      for (let j = i; j < baseCount; ++j) {
        const x = (i + 1) * extent + 2 * (j - i) * extent - baseCount * extent;
        const body = scene.createBody({
          type: 'dynamic',
          position: { x, y, z: 0 },
        });
        scene.box(body, { hx: extent, hy: extent, hz: extent });
      }
    }

    return {
      draw(canvas) {
        canvas.text(`${(200 * extent).toFixed(1)}cm boxes`);
      },
    };
  },
});

registerSample({
  category: 'Robustness',
  name: 'Overlap Recovery',
  create(ctx) {
    ctx.camera.setView(45, 20, 15, { x: 0, y: 0, z: 0 });
    const { scene, world } = ctx;

    let bodies: Body[] = [];
    let baseCount = 4;
    let overlap = 0.25;
    let extent = 0.5;
    let speed = 3;
    let hertz = 30;
    let dampingRatio = 10;

    scene.groundBox(20);

    const createScene = (): void => {
      for (const body of bodies) scene.destroyBody(body);
      bodies = [];

      world.setContactTuning(hertz, dampingRatio, speed);

      const fraction = 1 - overlap;
      let y = extent;
      for (let i = 0; i < baseCount; ++i) {
        let x = fraction * extent * (i - baseCount);
        for (let j = i; j < baseCount; ++j) {
          const body = scene.createBody({
            type: 'dynamic',
            position: { x, y, z: 0 },
          });
          scene.box(body, {
            hx: extent,
            hy: extent,
            hz: extent,
            density: 1,
          });
          bodies.push(body);
          x += 2 * fraction * extent;
        }
        y += 2 * fraction * extent;
      }
    };
    createScene();

    return {
      ui(panel) {
        panel.slider(
          'Extent',
          extent,
          { min: 0.1, max: 1, format: fixed(1) },
          (value) => {
            extent = value;
            createScene();
          },
        );
        panel.slider(
          'Base Count',
          baseCount,
          { min: 1, max: 10, step: 1, format: fixed(0) },
          (value) => {
            baseCount = value;
            createScene();
          },
        );
        panel.slider(
          'Overlap',
          overlap,
          { min: 0, max: 1, format: fixed(2) },
          (value) => {
            overlap = value;
            createScene();
          },
        );
        panel.slider(
          'Speed',
          speed,
          { min: 0, max: 10, format: fixed(1) },
          (value) => {
            speed = value;
            createScene();
          },
        );
        panel.slider(
          'Hertz',
          hertz,
          { min: 0, max: 240, format: fixed(0) },
          (value) => {
            hertz = value;
            createScene();
          },
        );
        panel.slider(
          'Damping Ratio',
          dampingRatio,
          { min: 0, max: 20, format: fixed(1) },
          (value) => {
            dampingRatio = value;
            createScene();
          },
        );
        panel.button('Reset Scene', createScene);
      },
    };
  },
});

// This forces a constraint graph color overflow
registerSample({
  category: 'Robustness',
  name: 'Overflow Color Pile',
  create(ctx) {
    ctx.camera.setView(30, 35, 15, { x: 0, y: 0, z: 0 });
    const { scene, world } = ctx;

    const ringCount = 5;
    const perRing = 5;
    const neighborCount = ringCount * perRing;

    // Static ground (top surface at y = 0)
    scene.groundBox(20);

    // Tall, heavy hub. Tall so neighbors can ring around it in multiple
    // vertical layers; heavy so it stays roughly still under uneven inward
    // pressure from the ring.
    const hubHalfX = 0.5;
    const hubHalfY = 2.5;
    const hubHalfZ = 0.5;
    const hub = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: hubHalfY, z: 0 },
    });
    scene.box(hub, { hx: hubHalfX, hy: hubHalfY, hz: hubHalfZ, density: 50 });

    // Neighbors: vertical rings around the hub, each box slightly overlapping
    // the hub so a contact exists on the very first step.
    const neighborHalf = 0.2;
    const ringRadius = hubHalfX + neighborHalf - 0.03;
    const ringSpacing = 0.5;
    const baseY = neighborHalf + 0.05;

    for (let ring = 0; ring < ringCount; ++ring) {
      const y = baseY + ringSpacing * ring;
      // Offset alternate rings by half a slot so neighbors don't sit
      // directly above each other.
      const thetaOffset = ring & 1 ? Math.PI / perRing : 0;
      for (let slot = 0; slot < perRing; ++slot) {
        const theta = thetaOffset + (2 * Math.PI * slot) / perRing;
        const body = scene.createBody({
          type: 'dynamic',
          position: {
            x: ringRadius * Math.cos(theta),
            y,
            z: ringRadius * Math.sin(theta),
          },
        });
        scene.box(body, {
          hx: neighborHalf,
          hy: neighborHalf,
          hz: neighborHalf,
        });
      }
    }

    let overflowContacts = 0;
    let contactCount = 0;

    return {
      step(dt) {
        ctx.stepWorld(dt);
        const counters = world.getCounters();
        overflowContacts = counters.colorCounts.at(-1) ?? 0;
        contactCount = counters.contactCount;
      },

      draw(canvas) {
        canvas.text(`neighbors = ${neighborCount}`);
        canvas.text(`overflow contacts = ${overflowContacts}`);
        canvas.text(`total contacts = ${contactCount}`);
      },
    };
  },
});
