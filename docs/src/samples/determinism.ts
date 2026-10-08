// Port of box3d/samples/sample_determinism.cpp and box3d/shared/determinism.c:
// a grid of ragdolls falls onto meshes and, once everything sleeps, the
// transforms of every bone are hashed (b3Hash) so two runs can be compared.
import type { Mesh, Transform, World } from '@frsource/box3d-wasm';
import type { MeshData, SceneBuilder } from '../framework/builder.js';
import { registerSample } from '../framework/registry.js';
import type { B3 } from '../framework/types.js';
import { BONE_COUNT, boneOf, createHuman, type Human } from './human.js';

const RAGDOLL_GROUP_SIZE = 2;
const RAGDOLL_GRID_COUNT = 2;
const GRID_SIZE = 15;
const B3_HASH_INIT = 5381;

// The golden values of box3d/test/test_determinism.c in the pinned engine
// (single precision build, one worker, 4 substeps at 60 Hz).
export const EXPECTED_SLEEP_STEP = 274;
export const EXPECTED_HASH = 0x773ab8ed;

/** b3Hash: djb2 over little-endian 32-bit halves of each 8-byte word, then single bytes. */
export function b3Hash(hash: number, data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let result = hash >>> 0;
  let i = 0;
  while (i + 8 <= data.byteLength) {
    result = (Math.imul(result, 33) + view.getUint32(i, true)) >>> 0;
    result = (Math.imul(result, 33) + view.getUint32(i + 4, true)) >>> 0;
    i += 8;
  }
  while (i < data.byteLength) {
    result = (Math.imul(result, 33) + (data[i] ?? 0)) >>> 0;
    i++;
  }
  return result;
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

export interface FallingRagdollData {
  groups: Human[][];
  meshes: Mesh[];
  stepCount: number;
  sleepStep: number;
  hash: number;
}

function createGroup(
  scene: SceneBuilder,
  data: FallingRagdollData,
  rowIndex: number,
  columnIndex: number,
): void {
  const groupIndex = rowIndex * RAGDOLL_GRID_COUNT + columnIndex;
  const span = RAGDOLL_GRID_COUNT * GRID_SIZE;
  const groupDistance = (1 * span) / RAGDOLL_GRID_COUNT;

  const position = {
    x: -0.5 * span + groupDistance * (columnIndex + 0.5),
    y: 15,
    z: -0.5 * span + groupDistance * (rowIndex + 0.5),
  };

  const group: Human[] = [];
  for (let i = 0; i < RAGDOLL_GROUP_SIZE; i++) {
    group.push(createHuman(scene, position, 5, 1, 0.7, groupIndex, false));
    position.x += 0.75;
  }
  data.groups[groupIndex] = group;
}

/** upstream CreateFallingRagdolls. */
export function createFallingRagdolls(
  b3: B3,
  scene: SceneBuilder,
): FallingRagdollData {
  const data: FallingRagdollData = {
    groups: [],
    meshes: [],
    stepCount: 0,
    sleepStep: 0,
    hash: 0,
  };

  const halfMeshGridRows = 4;
  const meshGridCellWidth = GRID_SIZE / (2 * halfMeshGridRows);
  const gridMesh = meshDataOf(
    b3.createGridMesh(
      2 * halfMeshGridRows,
      2 * halfMeshGridRows,
      meshGridCellWidth,
      0,
      true,
    ),
  );
  const torusMesh = meshDataOf(b3.createTorusMesh(16, 16, 0.25 * GRID_SIZE, 1));
  data.meshes.push(gridMesh.resource, torusMesh.resource);

  const span = GRID_SIZE * RAGDOLL_GRID_COUNT;
  let x = -0.5 * span + 0.5 * GRID_SIZE;
  for (let i = 0; i < RAGDOLL_GRID_COUNT; i++) {
    let z = -0.5 * span + 0.5 * GRID_SIZE;
    for (let j = 0; j < RAGDOLL_GRID_COUNT; j++) {
      const body = scene.createBody({
        type: 'static',
        position: { x, y: 0, z },
      });
      scene.mesh(body, gridMesh);
      scene.mesh(body, torusMesh);

      createGroup(scene, data, i, j);

      z += GRID_SIZE;
    }
    x += GRID_SIZE;
  }

  return data;
}

/** upstream UpdateFallingRagdolls: call after each step; true once the hash is known. */
export function updateFallingRagdolls(
  world: World,
  data: FallingRagdollData,
): boolean {
  if (data.hash === 0) {
    if (world.getMoveEvents().count === 0) {
      // b3WorldTransform in single precision: position then quaternion (vector, scalar)
      const floats = new Float32Array(7);
      const bytes = new Uint8Array(floats.buffer);
      const xf: Transform = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      };
      let hash = B3_HASH_INIT;
      for (let i = 0; i < RAGDOLL_GRID_COUNT; i++) {
        for (let j = 0; j < RAGDOLL_GRID_COUNT; j++) {
          for (let k = 0; k < RAGDOLL_GROUP_SIZE; k++) {
            const human = data.groups[i * RAGDOLL_GRID_COUNT + j]?.[k];
            if (!human) throw new Error('missing ragdoll');
            for (let b = 0; b < BONE_COUNT; b++) {
              boneOf(human, b).body.readTransform(xf.position, xf.rotation);
              floats.set([
                xf.position.x,
                xf.position.y,
                xf.position.z,
                xf.rotation.x,
                xf.rotation.y,
                xf.rotation.z,
                xf.rotation.w,
              ]);
              hash = b3Hash(hash, bytes);
            }
          }
        }
      }
      data.hash = hash;
      data.sleepStep = data.stepCount;
    }
  }

  data.stepCount += 1;
  return data.hash !== 0;
}

/** "sleep step = 274, hash = 0x773AB8ED", the line upstream prints. */
export function formatDeterminism(data: FallingRagdollData): string {
  const hex = data.hash.toString(16).toUpperCase().padStart(8, '0');
  return `sleep step = ${data.sleepStep}, hash = 0x${hex}`;
}

registerSample({
  category: 'Determinism',
  name: 'Falling Ragdolls',
  create(ctx) {
    ctx.camera.setView(45, 30, 40, { x: 0, y: 0, z: 0 });

    const data = createFallingRagdolls(ctx.b3, ctx.scene);
    let done = false;

    return {
      step(dt) {
        ctx.stepWorld(dt);
        if (!done) done = updateFallingRagdolls(ctx.world, data);
      },
      draw(canvas) {
        if (!done) return;
        canvas.text(formatDeterminism(data));
        const matches =
          data.sleepStep === EXPECTED_SLEEP_STEP && data.hash === EXPECTED_HASH;
        canvas.text(
          matches
            ? 'matches upstream golden hash (float build)'
            : `upstream expects sleep step = ${EXPECTED_SLEEP_STEP}, hash = 0x${EXPECTED_HASH.toString(16).toUpperCase()}`,
        );
      },
      destroy() {
        for (const mesh of data.meshes) mesh.release();
      },
    };
  },
});
