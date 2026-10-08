// Shared by the Continuous, Events and World samples: wrapping an engine-built
// mesh for the scene builder and upstream's shared/stability.c MeshDrop.
import type { Mesh } from '@frsource/box3d-wasm';
import type { MeshData } from '../framework/builder.js';
import type { SampleContext } from '../framework/types.js';
import type { Vec3 } from '@frsource/box3d-wasm';

/**
 * Lets the scene builder attach (and draw) a mesh made by one of the engine's
 * procedural builders. The caller releases `mesh` when the sample is destroyed.
 */
export function wrapMesh(mesh: Mesh): MeshData {
  const geometry = mesh.getGeometry();
  return {
    resource: mesh,
    vertices: geometry.positions,
    indices: geometry.indices,
    clockwise: false,
  };
}

/** upstream CreateMeshDrop: a field of thin boxes raining onto a wave mesh. */
export function createMeshDrop(
  ctx: SampleContext,
  origin: Vec3,
): { mesh: Mesh } {
  const { scene, b3, random } = ctx;
  const mesh = b3.createWaveMesh(40, 40, 1, 0.5, 0.1, 0.2);
  const ground = scene.createBody({ position: origin });
  scene.mesh(ground, wrapMesh(mesh), { filter: { categoryBits: 1 } });

  const gridCount = 32;
  for (let i = 0; i < gridCount; ++i) {
    for (let j = 0; j < gridCount; ++j) {
      const body = scene.createBody({
        type: 'dynamic',
        position: {
          x: origin.x + 0.5 * (i - 0.5 * gridCount),
          y: origin.y + 5,
          z: origin.z + 0.5 * (j - 0.5 * gridCount),
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
      scene.box(body, {
        hx: 0.02,
        hy: 0.2,
        hz: 0.04,
        rollingResistance: 0.1,
        // Don't allow shapes to collide with each other.
        filter: { categoryBits: 2, maskBits: 1 },
      });
    }
  }
  return { mesh };
}
