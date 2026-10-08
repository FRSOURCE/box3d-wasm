// Ports of box3d/samples/sample_ragdoll.cpp. The Pose sample is compiled out
// upstream (`#if 0`, it needs a Human pose-control API that was removed), so it
// is not registered here either.
import type { Body, Mesh } from '@frsource/box3d-wasm';
import type { MeshData } from '../framework/builder.js';
import { quatFromAxisAngle } from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import type { B3, Panel, SampleContext } from '../framework/types.js';
import {
  createHuman,
  destroyHuman,
  humanCreateParallelAnchors,
  humanSetJointDampingRatio,
  humanSetJointFrictionTorque,
  humanSetJointSpringHertz,
  type Human,
} from './human.js';

/** b3CreateGridMesh wrapped as scene mesh data (the scene only builds meshes from raw triangles). */
function gridMeshData(
  b3: B3,
  xCount: number,
  zCount: number,
  cellWidth: number,
  materialCount: number,
  identifyEdges: boolean,
): MeshData {
  return meshDataOf(
    b3.createGridMesh(xCount, zCount, cellWidth, materialCount, identifyEdges),
  );
}

function meshDataOf(resource: Mesh): MeshData {
  const geometry = resource.getGeometry();
  return {
    resource,
    vertices: geometry.positions,
    indices: geometry.indices,
    clockwise: false,
  };
}

/** The slider/button panel shared by Ragdoll Box and Mesh (upstream DrawControls). */
function jointControls(
  panel: Panel,
  state: { friction: number; hertz: number; damping: number },
  human: () => Human,
  respawn: () => void,
): void {
  panel.slider(
    'Joint Friction',
    state.friction,
    { min: 0, max: 20, format: (v) => v.toFixed(0).padStart(3) },
    (v) => {
      state.friction = v;
      humanSetJointFrictionTorque(human(), v);
    },
  );
  panel.slider(
    'Hertz',
    state.hertz,
    { min: 0, max: 20, format: (v) => v.toFixed(1).padStart(3) },
    (v) => {
      state.hertz = v;
      humanSetJointSpringHertz(human(), v);
    },
  );
  panel.slider(
    'Damping',
    state.damping,
    { min: 0, max: 4, format: (v) => v.toFixed(1).padStart(3) },
    (v) => {
      state.damping = v;
      humanSetJointDampingRatio(human(), v);
    },
  );
  panel.button('Respawn', respawn);
}

registerSample({
  category: 'Ragdoll',
  name: 'Box',
  create(ctx) {
    ctx.camera.setView(45, 30, 6, { x: 0, y: 0, z: 0 });
    ctx.scene.groundBox(20);

    const state = { friction: 5, hertz: 1, damping: 0.7 };
    let human: Human;
    const spawn = () => {
      human = createHuman(
        ctx.scene,
        { x: 0, y: 2, z: 0 },
        state.friction,
        state.hertz,
        state.damping,
        1,
        false,
      );
    };
    spawn();

    return {
      ui(panel) {
        jointControls(
          panel,
          state,
          () => human,
          () => {
            destroyHuman(ctx.scene, human);
            spawn();
          },
        );
      },
    };
  },
});

registerSample({
  category: 'Ragdoll',
  name: 'Mesh',
  create(ctx) {
    ctx.camera.setView(45, 30, 6, { x: 0, y: 0, z: 0 });

    const ground = ctx.scene.createBody({ type: 'static' });
    const mesh = gridMeshData(ctx.b3, 20, 20, 2, 2, true);
    ctx.scene.mesh(ground, mesh);

    // four walls: half extents, centre
    const walls: [number, number, number, number, number, number][] = [
      [20, 5, 0.1, 0, 5, -20],
      [20, 5, 0.1, 0, 5, 20],
      [0.1, 5, 20, -20, 5, 0],
      [0.1, 5, 20, 20, 5, 0],
    ];
    for (const [hx, hy, hz, x, y, z] of walls) {
      ctx.scene.box(ground, {
        hx,
        hy,
        hz,
        offset: { x, y, z },
      });
    }

    const state = { friction: 5, hertz: 2, damping: 0.7 };
    let human: Human;
    const spawn = () => {
      human = createHuman(
        ctx.scene,
        { x: 0, y: 1, z: 0 },
        state.friction,
        state.hertz,
        state.damping,
        1,
        false,
      );
      humanCreateParallelAnchors(ctx.scene, human);
    };
    spawn();

    return {
      ui(panel) {
        jointControls(
          panel,
          state,
          () => human,
          () => {
            destroyHuman(ctx.scene, human);
            spawn();
          },
        );
      },
      destroy() {
        mesh.resource.release();
      },
    };
  },
});

registerSample({
  category: 'Ragdoll',
  name: 'Pile',
  create(ctx) {
    ctx.camera.setView(180, 30, 20, { x: 0, y: 0, z: 0 });

    const ground = ctx.scene.createBody({
      type: 'static',
      position: { x: 0, y: -1, z: 0 },
    });
    const mesh = gridMeshData(ctx.b3, 20, 20, 1, 1, true);
    ctx.scene.mesh(ground, mesh);

    // upstream: 20 in release builds, 8 in debug builds
    const count = 20;
    for (let i = 0; i < count; i++) {
      createHuman(
        ctx.scene,
        { x: 0.1 * i, y: 2 + 0.5 * i, z: -0.1 * i },
        10,
        0.5,
        0.7,
        i,
        false,
      );
    }

    return {
      destroy() {
        mesh.resource.release();
      },
    };
  },
});

registerSample({
  category: 'Ragdoll',
  name: 'Incline',
  create(ctx: SampleContext) {
    ctx.camera.setView(-20, 30, 25, { x: 0, y: 0, z: 0 });

    const mesh = gridMeshData(ctx.b3, 4, 4, 2, 1, true);

    const ramp = ctx.scene.createBody({
      type: 'static',
      position: { x: -10, y: 2, z: 0 },
      rotation: quatFromAxisAngle({ x: 0, y: 0, z: 1 }, -0.2 * Math.PI),
    });
    ctx.scene.mesh(ramp, mesh);

    const floor: Body = ctx.scene.createBody({
      type: 'static',
      position: { x: 0, y: 0, z: 0 },
    });
    ctx.scene.mesh(floor, mesh, { scale: { x: 4, y: 4, z: 4 } });

    const human = createHuman(
      ctx.scene,
      { x: -12, y: 6, z: 0 },
      10,
      2,
      0.7,
      1,
      false,
    );
    let time = 0;
    let motorized = true;

    return {
      step(dt) {
        if (time > 2 && motorized) {
          humanSetJointFrictionTorque(human, 0.5);
          humanSetJointSpringHertz(human, 0.5);
          motorized = false;
        }
        const hertz = ctx.settings.hertz;
        time += hertz > 0 ? 1 / hertz : 0;
        ctx.stepWorld(dt);
      },
      destroy() {
        mesh.resource.release();
      },
    };
  },
});
