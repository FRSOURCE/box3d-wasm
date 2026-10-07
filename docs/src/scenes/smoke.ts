import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import type { Body } from '@frsource/box3d-wasm';
import type { Quat, Vec3 } from '../physics';
import { palette, pick, rand } from '../utils';
import type { SceneDef, SceneInstance } from './types';

const BOX_COUNT = 50;
const GROUND_HALF = { x: 20, y: 0.5, z: 20 };

interface Tracked {
  body: Body;
  mesh: Mesh;
}

/**
 * Temporary phase 0 scene: boxes dropped on a ground slab, meshes synced by
 * polling every body each frame. Phase 1 replaces this with move events.
 */
export const smoke: SceneDef = {
  label: 'Smoke',
  help: 'drag: orbit   scroll: zoom',
  camera: { position: [14, 10, 18], target: [0, 3, 0] },
  build({ world, scene }): SceneInstance {
    const groundMaterial = new MeshStandardMaterial({ color: '#2a2f3a' });
    const groundMesh = new Mesh(
      new BoxGeometry(GROUND_HALF.x * 2, GROUND_HALF.y * 2, GROUND_HALF.z * 2),
      groundMaterial,
    );
    groundMesh.position.y = -GROUND_HALF.y;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const ground = world.createBody({
      type: 'static',
      position: { x: 0, y: -GROUND_HALF.y, z: 0 },
    });
    ground.createBox({ halfExtents: GROUND_HALF, friction: 0.6 });

    const tracked: Tracked[] = [];
    for (let i = 0; i < BOX_COUNT; i++) {
      const half = { x: rand(0.3, 0.8), y: rand(0.3, 0.8), z: rand(0.3, 0.8) };
      const position = { x: rand(-3, 3), y: 2 + i * 0.9, z: rand(-3, 3) };

      const body = world.createBody({ type: 'dynamic', position });
      body.createBox({ halfExtents: half, density: 1, friction: 0.5 });

      const mesh = new Mesh(
        new BoxGeometry(half.x * 2, half.y * 2, half.z * 2),
        new MeshStandardMaterial({ color: pick(palette) }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      tracked.push({ body, mesh });
    }

    const position: Vec3 = { x: 0, y: 0, z: 0 };
    const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
    const sync = (): void => {
      for (const { body, mesh } of tracked) {
        body.getPosition(position);
        body.getRotation(rotation);
        mesh.position.set(position.x, position.y, position.z);
        mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
    };
    sync();

    return {
      bodyCount: () => tracked.length + 1,
      sync,
      dispose() {
        for (const { mesh } of tracked) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          disposeMaterial(mesh);
        }
        scene.remove(groundMesh);
        groundMesh.geometry.dispose();
        groundMaterial.dispose();
      },
    };
  },
};

function disposeMaterial(mesh: Mesh): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) material.dispose();
}
