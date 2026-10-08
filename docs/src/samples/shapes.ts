// Ported from box3d/samples/sample_shapes.cpp
import type { Body, Shape, RevoluteJoint, Vec3 } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import {
  add,
  AXIS_X,
  AXIS_Y,
  DEG_TO_RAD,
  quatFromAxisAngle,
  rotate,
  scale as mulScalar,
} from '../framework/math.js';
import { CONVEYOR_INDICES, CONVEYOR_VERTICES } from './shapes-data.js';

const SHAPES = ['Sphere', 'Box'] as const;

registerSample({
  category: 'Shapes',
  name: 'Inclined Plane',
  create(ctx) {
    ctx.camera.setView(-55, 30, 60, { x: 0, y: 7.5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(50);

    const rotation = quatFromAxisAngle(AXIS_X, 40 * DEG_TO_RAD);
    const plane = scene.createBody({
      position: { x: 0, y: 7.5, z: -5 },
      rotation,
    });
    scene.box(plane, { hx: 16, hy: 0.5, hz: 10, friction: 1 });

    // upstream reuses the body def, so the boxes share the plane's rotation
    const boxCount = 5;
    for (let index = 0; index < boxCount; index++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: -10 + 5 * index, y: 15.75, z: -10.6 },
        rotation,
      });
      scene.box(body, {
        hx: 1,
        hy: 1,
        hz: 1,
        friction: (index + 1) * (index + 1) * 0.04,
      });
    }
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'Rolling Resistance',
  create(ctx) {
    ctx.camera.setView(-140, 17, 60, { x: 0, y: 7.5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(50);

    const rotation = quatFromAxisAngle(AXIS_X, 10 * DEG_TO_RAD);
    const plane = scene.createBody({
      position: { x: 0, y: 2, z: -20 },
      rotation,
    });
    scene.box(plane, { hx: 32, hy: 0.5, hz: 15 });

    const count = 5;
    for (let index = 0; index < count; index++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: -25 + 5 * index, y: 8, z: -24 },
        rotation,
      });
      scene.sphere(body, { radius: 1, rollingResistance: 0.05 * index });
    }
    for (let index = 0; index < count; index++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 2 + 5 * index, y: 8, z: -24 },
        rotation,
      });
      scene.capsule(body, {
        center1: { x: -1, y: 0, z: 0 },
        center2: { x: 1, y: 0, z: 0 },
        radius: 0.5,
        rollingResistance: 0.05 * index,
      });
    }
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'High Resistance',
  create(ctx) {
    ctx.camera.setView(0, 5, 40, { x: 0, y: 7.5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(50);

    const count = 10;
    const rotation = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, DEG_TO_RAD * 30);
    for (let index = 0; index < count; index++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: -22 + 5 * index, y: 1.5, z: 0 },
        rotation,
      });
      scene.capsule(body, {
        center1: { x: 0, y: -1, z: 0 },
        center2: { x: 0, y: 1, z: 0 },
        radius: 0.5,
        rollingResistance: 0.2 * index,
      });
    }
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'Isotropic Friction',
  create(ctx) {
    ctx.camera.setView(45, 30, 150, { x: 0, y: 0, z: 0 });
    const { scene } = ctx;
    scene.groundBox(100);

    const boxCount = 32;
    for (let index = 0; index < boxCount; index++) {
      const alpha = (Math.PI / 16) * index;
      const c = Math.cos(alpha);
      const s = Math.sin(alpha);
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: 15 * c, y: 1, z: 15 * s },
        rotation: quatFromAxisAngle(AXIS_Y, -alpha),
        linearVelocity: { x: 25 * c, y: 0, z: 25 * s },
      });
      scene.box(body, { hx: 1, hy: 1, hz: 1, friction: 0.6 });
    }
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'Slide Twist',
  create(ctx) {
    ctx.camera.setView(-30, 17, 30, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(50);

    const rotation = quatFromAxisAngle(AXIS_X, 20 * DEG_TO_RAD);
    const plane = scene.createBody({
      position: { x: 0, y: 4, z: 0 },
      rotation,
    });
    scene.box(plane, { hx: 10, hy: 0.5, hz: 10, friction: 0.6 });

    const body = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
      rotation,
      angularVelocity: mulScalar(rotate(rotation, AXIS_Y), 25),
    });
    scene.box(body, { hx: 1, hy: 0.5, hz: 1, friction: 0.3 });
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'Restitution',
  create(ctx) {
    ctx.camera.setView(0, 25, 85, { x: 0, y: 20, z: 0 });
    const { scene } = ctx;
    scene.groundBox(50);

    const count = 40;
    let shapeType = 0;
    const bodies: Body[] = [];

    const createBodies = (): void => {
      for (const body of bodies) scene.destroyBody(body);
      bodies.length = 0;

      // restitution ramps from 0 to 1 across the row
      const dr = 1 / (count > 1 ? count - 1 : 1);
      const dx = 2;
      let x = -1 * (count - 1);
      let restitution = 0;
      for (let i = 0; i < count; i++) {
        const body = scene.createBody({
          type: 'dynamic',
          position: { x, y: 40, z: 0 },
        });
        bodies.push(body);
        if (shapeType === 0) scene.sphere(body, { radius: 0.5, restitution });
        else scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5, restitution });
        restitution += dr;
        x += dx;
      }
    };
    createBodies();

    return {
      ui(panel) {
        panel.radio('Shape', SHAPES, shapeType, (index) => {
          shapeType = index;
          createBodies();
        });
      },
    };
  },
});

// Shows an optimization when creating many static shapes: you can skip having
// them invoke collision, assuming dynamic bodies are added after the static ones.
registerSample({
  category: 'Shapes',
  name: 'Static Invoke',
  create(ctx) {
    ctx.camera.setView(0, 25, 10, { x: 0, y: 1, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const ball = scene.createBody({
      type: 'dynamic',
      position: { x: 0.25, y: 1, z: 0 },
    });
    scene.sphere(ball, { radius: 0.5, rollingResistance: 0.2 });

    let invoke = false;
    let bodyId: Body | null = null;

    const createStatic = (): void => {
      if (bodyId) {
        scene.destroyBody(bodyId);
        bodyId = null;
      }
      bodyId = scene.createBody({ position: { x: 0, y: 0.5, z: 0 } });
      scene.sphere(bodyId, { radius: 0.5, invokeContactCreation: invoke });
    };

    return {
      ui(panel) {
        panel.radio('Mode', ['Invoke', 'Passive'], invoke ? 0 : 1, (index) => {
          invoke = index === 0;
        });
        if (bodyId === null) {
          panel.button('Create', () => {
            createStatic();
            ctx.refreshUI();
          });
        } else {
          panel.button('Destroy', () => {
            if (bodyId) scene.destroyBody(bodyId);
            bodyId = null;
            ctx.refreshUI();
          });
        }
      },
      step(dt) {
        ctx.stepWorld(dt);
        if (ctx.stepCount === 20) {
          createStatic();
          ctx.refreshUI();
        }
      },
    };
  },
});

registerSample({
  category: 'Shapes',
  name: 'Conveyor Belt',
  create(ctx) {
    ctx.camera.setView(0, 25, 40, { x: 0, y: 1, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const platform = scene.createBody({
      position: { x: -5, y: 5, z: 0 },
      rotation: quatFromAxisAngle(AXIS_Y, 0.2),
    });
    scene.box(platform, {
      hx: 10,
      hy: 0.25,
      hz: 2,
      friction: 0.8,
      tangentVelocity: { x: 2, y: 0, z: 0 },
    });

    for (let i = 0; i < 5; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: -10 + 2 * i, y: 7, z: 0 },
      });
      scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });
    }
    return {};
  },
});

registerSample({
  category: 'Shapes',
  name: 'Conveyor Mesh',
  create(ctx) {
    ctx.camera.setView(65, 25, 28, { x: 0, y: 1, z: 0 });
    const { scene } = ctx;
    scene.groundBox(20);

    const triangleCount = CONVEYOR_INDICES.length / 3;
    const materialIndices = new Uint8Array(triangleCount);
    const velocities: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      // +x -z
      { x: 0.7, y: 0, z: -0.2 },
      // +x +z
      { x: 0.6, y: 0, z: 0.4 },
      // +z
      { x: 0, y: 0, z: 1.3 },
      // -x +z
      { x: -0.6, y: 0, z: 0.4 },
      // -x -z
      { x: -0.75, y: 0, z: -0.4 },
      // -z
      { x: 0, y: 0, z: -1.3 },
    ];
    const assign: [number, number[]][] = [
      [1, [0, 4]],
      [2, [9, 12]],
      [3, [21, 38]],
      [4, [43, 46]],
      [5, [30, 33]],
      [6, [18, 24]],
    ];
    for (const [material, triangles] of assign) {
      for (const t of triangles) materialIndices[t] = material;
    }

    const colors = [
      0x00ff00, 0xadff2f, 0xf0fff0, 0xff69b4, 0xcd5c5c, 0x4b0082, 0xfffff0,
    ];
    const materials = velocities.map((v, i) => ({
      friction: 0.8,
      tangentVelocity: mulScalar(v, 2),
      customColor: colors[i],
    }));

    const meshPosition = { x: 0, y: 0.5, z: 6 };
    const meshRotation = quatFromAxisAngle(AXIS_Y, 0.5 * Math.PI);
    const mesh = scene.meshData({
      vertices: CONVEYOR_VERTICES,
      indices: CONVEYOR_INDICES,
      materialIndices,
      medianSplit: true,
      identifyEdges: true,
      weld: true,
      weldTolerance: 0.002,
    });
    const meshBody = scene.createBody({
      position: meshPosition,
      rotation: meshRotation,
    });
    scene.mesh(meshBody, mesh, { materials });

    // high number of sides to stress the collision code; normally 16 or less
    for (let i = 0; i < 20; i++) {
      const body = scene.createBody({
        type: 'dynamic',
        position: { x: -8.5 + 0.9 * i, y: 1.5, z: -5.5 },
      });
      scene.cylinder(body, {
        height: 0.3,
        radius: 0.15,
        yOffset: 0,
        sides: 32,
      });
    }

    return {
      draw(canvas) {
        const v = CONVEYOR_VERTICES;
        const idx = CONVEYOR_INDICES;
        for (let i = 0; i < triangleCount; i++) {
          const p = [0, 1, 2].map((k) => {
            const at = 3 * (idx[3 * i + k] ?? 0);
            return { x: v[at] ?? 0, y: v[at + 1] ?? 0, z: v[at + 2] ?? 0 };
          }) as [Vec3, Vec3, Vec3];
          const e1 = {
            x: p[1].x - p[0].x,
            y: p[1].y - p[0].y,
            z: p[1].z - p[0].z,
          };
          const e2 = {
            x: p[2].x - p[0].x,
            y: p[2].y - p[0].y,
            z: p[2].z - p[0].z,
          };
          const ny = e1.z * e2.x - e1.x * e2.z;
          const len = Math.hypot(
            e1.y * e2.z - e1.z * e2.y,
            ny,
            e1.x * e2.y - e1.y * e2.x,
          );
          if (len === 0 || ny / len < 0.9) continue;
          const centroid = {
            x: (p[0].x + p[1].x + p[2].x) / 3,
            y: (p[0].y + p[1].y + p[2].y) / 3,
            z: (p[0].z + p[1].z + p[2].z) / 3,
          };
          const world = add(rotate(meshRotation, centroid), meshPosition);
          const vel = rotate(
            meshRotation,
            velocities[materialIndices[i] ?? 0] ?? centroid,
          );
          canvas.line(world, add(world, vel), 0x8a2be2);
        }
      },
    };
  },
});

const WIND_SHAPES = ['Circle', 'Capsule', 'Box'] as const;

registerSample({
  category: 'Shapes',
  name: 'Wind',
  create(ctx) {
    ctx.camera.setView(0, 0, 5, { x: 0, y: 1, z: 0 });
    const { scene, world } = ctx;
    scene.groundBox(20);
    const ground = scene.createBody();

    const maxCount = 60;
    let shapeType = 2;
    let windX = 6;
    let drag = 1;
    let lift = 0.75;
    let count = 10;
    let noise: Vec3 = { x: 0, y: 0, z: 0 };
    let lastWind: Vec3 = { x: 0, y: 0, z: 0 };
    const bodies: Body[] = [];
    const shapes: Shape[] = [];

    const createScene = (): void => {
      for (const body of bodies) scene.destroyBody(body);
      bodies.length = 0;
      shapes.length = 0;

      const radius = 0.1;
      const verticalOffset = 2;
      let previous = ground;
      let previousAnchor: Vec3 = { x: 0, y: verticalOffset, z: 0 };

      for (let i = 0; i < count; i++) {
        const body = scene.createBody({
          type: 'dynamic',
          position: { x: (2 * i + 1) * radius, y: verticalOffset, z: 0 },
          gravityScale: 0.5,
          enableSleep: false,
        });
        bodies.push(body);
        let shape: Shape;
        if (shapeType === 0) {
          shape = scene.sphere(body, { radius, density: 20 });
        } else if (shapeType === 1) {
          shape = scene.capsule(body, {
            center1: { x: -radius, y: 0, z: 0 },
            center2: { x: radius, y: 0, z: 0 },
            radius: 0.5 * radius,
            density: 20,
          });
        } else {
          shape = scene.box(body, {
            hx: 1.25 * radius,
            hy: 0.75 * radius,
            hz: 0.125 * radius,
            density: 20,
          });
        }
        shapes.push(shape);

        world.createSphericalJoint(previous, body, {
          anchorA: previousAnchor,
          anchorB: { x: -radius, y: 0, z: 0 },
          drawScale: 0.1,
        });
        previous = body;
        previousAnchor = { x: radius, y: 0, z: 0 };
      }
    };
    createScene();

    return {
      ui(panel) {
        panel.combo('Shape', WIND_SHAPES, shapeType, (index) => {
          shapeType = index;
          createScene();
        });
        panel.slider(
          'Wind',
          windX,
          { min: -50, max: 50, format: (v) => v.toFixed(1) },
          (v) => (windX = v),
        );
        panel.slider(
          'Drag',
          drag,
          { min: 0, max: 1, format: (v) => v.toFixed(2) },
          (v) => (drag = v),
        );
        panel.slider(
          'Lift',
          lift,
          { min: 0, max: 4, format: (v) => v.toFixed(2) },
          (v) => (lift = v),
        );
        panel.slider(
          'Count',
          count,
          { min: 1, max: maxCount, step: 1 },
          (v) => {
            count = v;
            createScene();
          },
        );
      },
      step(dt) {
        ctx.stepWorld(dt);
        const speed = Math.abs(windX);
        const direction = { x: windX < 0 ? -1 : speed > 0 ? 1 : 0, y: 0, z: 0 };
        const wind = mulScalar(add(direction, noise), speed);
        for (const shape of shapes) shape.applyWind(wind, drag, lift, 10, true);

        const rand = {
          x: ctx.random.range(-0.3, 0.3),
          y: ctx.random.range(-0.3, 0.3),
          z: ctx.random.range(-0.3, 0.3),
        };
        noise = {
          x: noise.x + 0.05 * (rand.x - noise.x),
          y: noise.y + 0.05 * (rand.y - noise.y),
          z: noise.z + 0.05 * (rand.z - noise.z),
        };
        lastWind = wind;
      },
      draw(canvas) {
        const p1 = { x: 0, y: 0.5, z: 0 };
        canvas.line(p1, add(p1, mulScalar(lastWind, 0.2)), 0xff00ff);
      },
    };
  },
});

registerSample({
  category: 'Shapes',
  name: 'Wind Drop',
  create(ctx) {
    ctx.camera.setView(-45, 15, 20, { x: 0, y: 5, z: 0 });
    const { scene } = ctx;
    scene.groundBox(15);

    const drag = 1;
    const lift = 4;
    const radius = 0.1;

    const body = scene.createBody({
      type: 'dynamic',
      linearVelocity: { x: 0, y: 0, z: 0 },
      rotation: quatFromAxisAngle(AXIS_X, 0.25),
      gravityScale: 0.5,
      position: { x: 0, y: 10, z: 0 },
    });
    const shape = scene.box(body, {
      hx: 4 * radius,
      hy: 0.1 * radius,
      hz: 4 * radius,
      density: 2,
    });

    return {
      step(dt) {
        ctx.stepWorld(dt);
        shape.applyWind({ x: 0, y: 0, z: 0 }, drag, lift, 10, true);
      },
    };
  },
});

registerSample({
  category: 'Shapes',
  name: 'Wind Flap',
  create(ctx) {
    ctx.camera.setView(-35, 15, 65, { x: 0, y: 5, z: 10 });
    const { scene, world } = ctx;
    scene.groundBox(50);

    const drag = 1;
    const lift = 2;
    const a = 0.4;
    const y = 20;
    const wingRotation = quatFromAxisAngle(AXIS_X, 0.1);

    const wing1 = scene.createBody({
      type: 'dynamic',
      position: { x: -2 * a, y, z: 0 },
    });
    const shape1 = scene.box(wing1, {
      hx: 2 * a,
      hy: 0.01,
      hz: a,
      rotation: wingRotation,
      density: 5,
    });
    const wing2 = scene.createBody({
      type: 'dynamic',
      position: { x: 2 * a, y, z: 0 },
    });
    const shape2 = scene.box(wing2, {
      hx: 2 * a,
      hy: 0.01,
      hz: a,
      rotation: wingRotation,
      density: 5,
    });
    const torso = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y, z: 0 },
    });
    scene.capsule(torso, {
      center1: { x: 0, y: 0, z: -a },
      center2: { x: 0, y: 0, z: a },
      radius: 0.25 * a,
      density: 10,
    });

    const hinge = {
      drawScale: 0.1,
      enableSpring: true,
      hertz: 6,
      dampingRatio: 0.5,
      enableLimit: true,
      lowerAngle: (-30 * Math.PI) / 180,
      upperAngle: (30 * Math.PI) / 180,
    };
    const joint1: RevoluteJoint = world.createRevoluteJoint(torso, wing1, {
      ...hinge,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 2 * a, y: 0, z: 0 },
    });
    const joint2: RevoluteJoint = world.createRevoluteJoint(torso, wing2, {
      ...hinge,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: -2 * a, y: 0, z: 0 },
    });
    world.createFilterJoint(wing1, wing2, {});

    let time = 0;
    return {
      step(dt) {
        ctx.stepWorld(dt);
        const zero = { x: 0, y: 0, z: 0 };
        shape1.applyWind(zero, drag, lift, 10, false);
        shape2.applyWind(zero, drag, lift, 10, false);

        const angle = Math.sin(10 * time);
        joint1.setTargetAngle(angle);
        joint2.setTargetAngle(-angle);
        const hertz = ctx.settings.hertz;
        time += hertz > 0 ? 1 / hertz : 0;
      },
    };
  },
});
