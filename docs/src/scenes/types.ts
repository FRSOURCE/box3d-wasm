import type { PerspectiveCamera, Scene } from 'three';
import type { B3, World } from '../physics';
import type { CameraPreset } from '../renderer';

export interface SceneContext {
  world: World;
  b3: B3;
  scene: Scene;
  camera: PerspectiveCamera;
}

/** What a built scene hands back so the frame loop can drive and tear it down. */
export interface SceneInstance {
  bodyCount(): number;
  /** Copies body poses onto meshes; called once per rendered frame after stepping. */
  sync(): void;
  /** Removes meshes; bodies die with the world, which the caller destroys. */
  dispose(): void;
}

export interface SceneDef {
  label: string;
  help: string;
  camera: CameraPreset;
  build(ctx: SceneContext): SceneInstance;
}
