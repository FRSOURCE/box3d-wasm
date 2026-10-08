// Ported from box3d/samples/sample_stacking.cpp
import type { Body, Quat, Vec3 } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import {
  AXIS_Y,
  AXIS_Z,
  DEG_TO_RAD,
  quatFromAxisAngle,
} from '../framework/math.js';
import type { SceneBuilder } from '../framework/builder.js';

/** The points of upstream's b3CreateCylinder(height, radius, 0, sides), optionally scaled. */
function cylinderPoints(
  height: number,
  radius: number,
  sides: number,
  scale: Vec3 = { x: 1, y: 1, z: 1 },
): Float32Array {
  const points = new Float32Array(sides * 6);
  for (let i = 0; i < sides; i++) {
    const alpha = (2 * Math.PI * i) / sides;
    const x = radius * Math.cos(alpha) * scale.x;
    const z = radius * Math.sin(alpha) * scale.z;
    points.set([x, 0, z, x, height * scale.y, z], i * 6);
  }
  return points;
}

function card(
  scene: SceneBuilder,
  position: Vec3,
  rotation: Quat,
  half: Vec3,
  friction: number,
): void {
  const body = scene.createBody({ type: 'dynamic', position, rotation });
  scene.box(body, { halfExtents: half, friction });
}

registerSample({
  category: 'Stacking',
  name: 'Card House Thick',
  create(ctx) {
    ctx.camera.setView(0, 25, 10, { x: 0, y: 2, z: 0 });
    const { scene } = ctx;
    scene.groundBox(10);

    const alpha = 25 * DEG_TO_RAD;
    const width = 0.38;
    const height = 0.98;
    const depth = 0.08;
    const offsetX = 0.5 * height * Math.sin(alpha) + 0.045;
    const offsetY = 0.5 * height * Math.cos(alpha) + 0.035;
    const half = { x: 0.5 * depth, y: 0.5 * height, z: 0.5 * width };

    const verticalRow = (
      n: number,
      startXIn: number,
      dx: number,
      startY: number,
    ): void => {
      let startX = startXIn;
      for (let index = 0; index < n; index++) {
        card(
          scene,
          { x: startX - dx, y: startY, z: 0 },
          quatFromAxisAngle(AXIS_Z, -alpha),
          half,
          0.8,
        );
        card(
          scene,
          { x: startX + dx, y: startY, z: 0 },
          quatFromAxisAngle(AXIS_Z, alpha),
          half,
          0.8,
        );
        startX += 4 * dx;
      }
    };
    const horizontalRow = (
      n: number,
      startX: number,
      dx: number,
      startY: number,
    ): void => {
      for (let index = 0; index < n; index++) {
        card(
          scene,
          { x: startX + index * dx, y: startY, z: 0 },
          quatFromAxisAngle(AXIS_Z, 0.5 * Math.PI),
          half,
          0.8,
        );
      }
    };

    verticalRow(4, -6 * offsetX, offsetX, offsetY);
    horizontalRow(3, -4 * offsetX, 4 * offsetX, 2 * offsetY + 0.04);
    verticalRow(3, -4 * offsetX, offsetX, 3 * offsetY + 0.08);
    horizontalRow(2, -2 * offsetX, 4 * offsetX, 4 * offsetY + 0.12);
    verticalRow(2, -2 * offsetX, offsetX, 5 * offsetY + 0.16);
    horizontalRow(1, -0 * offsetX, 4 * offsetX, 6 * offsetY + 0.2);
    verticalRow(1, -0 * offsetX, offsetX, 7 * offsetY + 0.24);
    return {};
  },
});

// From PEEL
registerSample({
  category: 'Stacking',
  name: 'Card House',
  create(ctx) {
    ctx.camera.setView(30, 10, 3, { x: 0.75, y: 1, z: 0.4 });
    const { scene } = ctx;
    scene.groundBox(10);

    const cardHeight = 0.2;
    const cardThickness = 0.001;
    const cardDepth = 0.1;
    const angle0 = 25 * DEG_TO_RAD;
    const angle1 = -25 * DEG_TO_RAD;
    const angle2 = 0.5 * Math.PI;
    const half = { x: cardThickness, y: cardHeight, z: cardDepth };

    let nb = 5;
    let z0 = 0;
    let y = cardHeight - 0.02;
    while (nb > 0) {
      let z = z0;
      for (let i = 0; i < nb; i++) {
        if (i !== nb - 1) {
          card(
            scene,
            { x: z + 0.25, y: y + cardHeight - 0.015, z: 0 },
            quatFromAxisAngle(AXIS_Z, angle2),
            half,
            0.7,
          );
        }
        card(
          scene,
          { x: z, y, z: 0 },
          quatFromAxisAngle(AXIS_Z, angle1),
          half,
          0.7,
        );
        z += 0.175;
        card(
          scene,
          { x: z, y, z: 0 },
          quatFromAxisAngle(AXIS_Z, angle0),
          half,
          0.7,
        );
        z += 0.175;
      }
      y += cardHeight * 2 - 0.03;
      z0 += 0.175;
      nb--;
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Sphere Stack',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 10, z: 0 });
    const { scene } = ctx;
    scene.groundBox(15);

    const r = 0.5;
    let y = 1.5 * r;
    for (let i = 0; i < 30; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        name: 'sphere',
        position: { x: 0, y, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
      });
      scene.sphere(body, { radius: r, rollingResistance: 0.1 });
      y += 3 * r;
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Capsule Stack',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 10, z: 0 });
    const { scene } = ctx;
    scene.groundBox(40);

    const r = 0.5;
    let y = 1.5 * r;
    for (let i = 0; i < 20; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y, z: 0 },
        motionLocks: {
          linearZ: true,
          angularX: true,
          angularY: true,
          angularZ: true,
        },
      });
      scene.capsule(body, {
        center1: { x: -1, y: 0, z: 0 },
        center2: { x: 1, y: 0, z: 0 },
        radius: r,
      });
      y += 2 * r;
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Single Box',
  create(ctx) {
    ctx.camera.setView(0, 25, 10, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const body = scene.createBody({
      type: 'dynamic',
      name: 'cube',
      position: { x: 0, y: 0.5, z: 0 },
      angularVelocity: { x: 0, y: 10, z: 0 },
    });
    scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });

    return {
      draw(canvas) {
        const p = body.getPosition();
        canvas.text(
          `(x, y, z) = (${p.x.toPrecision(2)}, ${p.y.toPrecision(2)}, ${p.z.toPrecision(2)})`,
        );
      },
    };
  },
});

registerSample({
  category: 'Stacking',
  name: 'Cylinder',
  create(ctx) {
    ctx.camera.setView(0, 15, 10, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(10);

    const body = scene.createBody({
      type: 'dynamic',
      name: 'cylinder',
      position: { x: 0, y: 2, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 },
    });
    scene.cylinder(body, {
      height: 1,
      radius: 0.25,
      yOffset: 0,
      sides: 12,
      rollingResistance: 0.05,
    });
    // upstream also sets the debug draw forceScale to 0.01 here; the view has no sample hook for it
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Cylinder Stack',
  create(ctx) {
    ctx.camera.setView(0, 15, 15, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(10);

    const scales: Vec3[] = [
      { x: 1, y: 1, z: 1 },
      { x: -0.75, y: 1, z: 1 },
      { x: 1.2, y: 1, z: -0.9 },
      { x: 0.9, y: 0.9, z: 0.9 },
    ];
    for (let i = 0; i < 10; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        name: 'cylinder',
        position: { x: 0, y: 1.1 * i, z: 0 },
      });
      // upstream attaches one shared hull with a (possibly mirrored) scale; the
      // builder has no scaled hull shapes, so scale the ring points directly
      scene.hull(body, {
        points: cylinderPoints(1, 0.5, 15, scales[i % 4]),
        maxVertices: 30,
      });
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Box Stack',
  create(ctx) {
    ctx.camera.setView(0, 15, 50, { x: 0, y: 20, z: 0 });
    const { scene } = ctx;
    scene.groundBox(40);

    const a = 0.5;
    for (let i = 0; i < 40; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 1.5 * a + 2.5 * a * i, z: 0 },
        name: 'cube',
      });
      scene.box(body, { hx: a, hy: a, hz: a, rollingResistance: 0.1 });
    }
    return {};
  },
});

const JENGA_SHAPES = ['Capsule', 'Hull'] as const;

registerSample({
  category: 'Stacking',
  name: 'Jenga Stack',
  create(ctx) {
    ctx.camera.setView(35, 15, 30, { x: 0, y: 10, z: 0 });
    const { scene } = ctx;
    const size = 40;
    let shapeType = 1; // hull
    let bodies: Body[] = [];

    const createStack = (): void => {
      bodies.push(scene.groundBox(60));
      const rollingResistance = shapeType === 0 ? 0.1 : 0.01;
      for (let i = 0; i < size; i++) {
        const alpha = (i & 1) === 1 ? 0 : 0.5 * Math.PI;
        const x = (i & 1) === 0 ? 1.75 : 0;
        const z = (i & 1) === 0 ? 0 : 1.75;
        const rotation = quatFromAxisAngle(AXIS_Y, alpha);
        for (const sign of [1, -1]) {
          const body = scene.createBody({
            type: 'dynamic',
            position: { x: sign * x, y: 0.5 * i + 0.25, z: sign * z },
            rotation,
          });
          bodies.push(body);
          if (shapeType === 0) {
            scene.capsule(body, {
              center1: { x: -2.5, y: 0, z: 0 },
              center2: { x: 2.5, y: 0, z: 0 },
              radius: 0.25,
              rollingResistance,
            });
          } else {
            scene.box(body, { hx: 2.5, hy: 0.25, hz: 0.25, rollingResistance });
          }
        }
      }
    };
    createStack();

    return {
      ui(panel) {
        panel.radio('Shape', JENGA_SHAPES, shapeType, (index) => {
          shapeType = index;
          for (const body of bodies) scene.destroyBody(body);
          bodies = [];
          createStack();
        });
      },
    };
  },
});

registerSample({
  category: 'Stacking',
  name: 'Dominoes',
  create(ctx) {
    ctx.camera.setView(0, 15, 75, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(80);

    const n = 30;
    for (let ring = 0; ring < n; ring++) {
      const radius = 7 + 1.1 * ring;
      for (let alpha = 0; alpha <= 360; alpha += 2) {
        const cos = Math.cos(DEG_TO_RAD * alpha);
        const sin = Math.sin(DEG_TO_RAD * alpha);
        const shift = alpha / 630;
        const position = {
          x: radius * cos - shift * cos,
          y: 0.8,
          z: radius * sin - shift * sin,
        };
        const body = scene.createBody({
          type: 'dynamic',
          position,
          rotation: quatFromAxisAngle(AXIS_Y, -DEG_TO_RAD * alpha),
        });
        scene.box(body, { hx: 0.2, hy: 0.8, hz: 0.05 });
        if (alpha === 0) {
          body.applyLinearImpulse(
            { x: 0, y: 0, z: 25 },
            { x: position.x, y: position.y + 0.8, z: position.z },
            true,
          );
        }
      }
    }
    return {};
  },
});

// This wedge shape can have an incorrect manifold if not handled correctly
registerSample({
  category: 'Stacking',
  name: 'Wedge',
  create(ctx) {
    ctx.camera.setView(75, 10, 10, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 1, z: 0 },
    });
    scene.hull(body, {
      points: [
        -1, 1, -0.1, 1, 1, -0.1, -1, 1, 0.1, 1, 1, 0.1, -0.5, 0.5, 0, 0.5, 0.5,
        0,
      ],
      maxVertices: 6,
    });
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Arch',
  create(ctx) {
    ctx.camera.setView(25, 10, 30, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(40);

    const ps1 = [
      [16, 0],
      [14.93803712795643, 5.133601056842984],
      [13.79871746027416, 10.24928069555078],
      [12.56252963284711, 15.34107019122473],
      [11.20040987372525, 20.39856541571217],
      [9.66521217819836, 25.40369899225096],
      [7.87179930638133, 30.3179337000085],
      [5.635199558196225, 35.03820717801641],
      [2.405937953536585, 39.09554102558315],
    ] as const;
    const ps2 = [
      [24, 0],
      [22.33619528222415, 6.02299846205841],
      [20.54936888969905, 12.00964361211476],
      [18.60854610798073, 17.9470321677465],
      [16.46769273811807, 23.81367936585418],
      [14.05325025774858, 29.57079353071012],
      [11.23551045834022, 35.13775818285372],
      [7.752568160730571, 40.30450679009583],
      [3.016931552701656, 44.28891593799322],
    ] as const;

    const s = 0.25;
    const p1 = ps1.map(([x, y]) => ({ x: x * s, y: y * s }));
    const p2 = ps2.map(([x, y]) => ({ x: x * s, y: y * s }));
    const at = <T>(list: T[], i: number): T => list[i] as T;
    const halfDepth = 0.5;
    const shapeOptions = { density: 200 };

    const block = (quad: { x: number; y: number }[]): void => {
      const body = scene.createBody({ type: 'dynamic' });
      const points: number[] = [];
      for (const z of [-halfDepth, halfDepth]) {
        for (const q of quad) points.push(q.x, q.y, z);
      }
      scene.hull(body, { points, maxVertices: 8, ...shapeOptions });
    };

    for (let i = 0; i < 8; i++) {
      block([at(p1, i), at(p2, i), at(p2, i + 1), at(p1, i + 1)]);
    }
    for (let i = 0; i < 8; i++) {
      const m = (v: { x: number; y: number }) => ({ x: -v.x, y: v.y });
      block([m(at(p2, i)), m(at(p1, i)), m(at(p1, i + 1)), m(at(p2, i + 1))]);
    }
    {
      const a = at(p1, 8);
      const b = at(p2, 8);
      block([a, b, { x: -b.x, y: b.y }, { x: -a.x, y: a.y }]);
    }
    for (let i = 0; i < 4; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: 0.5 + at(p2, 8).y + 1 * i, z: 0 },
      });
      scene.box(body, { hx: 2, hy: 0.5, hz: halfDepth, ...shapeOptions });
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Double Domino',
  create(ctx) {
    ctx.camera.setView(0, 15, 15, { x: 0, y: 0.5, z: 1 });
    const { scene } = ctx;
    scene.groundBox(20);

    const count = 15;
    let x = -0.5 * count;
    for (let i = 0; i < count; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x, y: 0.5, z: 0 },
      });
      scene.box(body, {
        hx: 0.125,
        hy: 0.5,
        hz: 0.25,
        friction: 0.6,
        density: 4,
      });
      if (i === 0) {
        body.applyLinearImpulse(
          { x: 0.2, y: 0, z: 0 },
          { x, y: 1, z: 0 },
          true,
        );
      }
      x += 1.01;
    }
    return {};
  },
});

registerSample({
  category: 'Stacking',
  name: 'Pyramid2D',
  create(ctx) {
    ctx.camera.setView(0, 30, 50, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(40);

    const a = 1;
    const size = 12;
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size - row; column++) {
        const body = scene.createBody({
          type: 'dynamic',
          position: {
            x: (-10 + 2 * column + row) * a,
            y: (1.5 + 2.5 * row) * a,
            z: 0,
          },
          // a planar pyramid: only x/y translation and rotation about z
          motionLocks: { linearZ: true, angularX: true, angularY: true },
        });
        scene.box(body, { hx: a, hy: a, hz: a });
      }
    }
    return {};
  },
});
