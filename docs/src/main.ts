// three.js showcase of @frsource/box3d-wasm
//
// ?scene=smoke   start on a specific scene
// ?threads=0     force the single-threaded build
// ?threads=N     threaded build with N solver workers
// ?ff=600        fast-forward that many steps before the first frame

import { ensureCrossOriginIsolation } from './coi';
import { showError, updateHud } from './hud';
import { createMenu, markActiveScene } from './menu';
import {
  createWorld,
  defaultWorkerCount,
  destroyWorld,
  loadBox3D,
  type World,
} from './physics';
import {
  applyCameraPreset,
  camera,
  controls,
  renderer,
  scene,
} from './renderer';
import { DEFAULT_SCENE, SCENES } from './scenes/index';
import type { SceneInstance } from './scenes/types';
import { assertDefined, clamp, parseInteger } from './utils';

const DT = 1 / 60;
const SUB_STEPS = 4;
const MAX_FRAME_SECONDS = 0.1;
const HUD_INTERVAL_MS = 500;

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const threadsParam = parseInteger(params.get('threads'));
  const wantThreads = threadsParam !== 0;
  const requestedScene = params.get('scene');
  let currentScene =
    requestedScene && SCENES[requestedScene] ? requestedScene : DEFAULT_SCENE;

  await ensureCrossOriginIsolation(wantThreads);
  const { b3, flavour, maxWorkers } = await loadBox3D({ threads: wantThreads });
  let workerCount = defaultWorkerCount(threadsParam, maxWorkers);

  let world: World = createWorld(b3, workerCount);
  let instance: SceneInstance | null = null;

  const loadScene = (key: string): void => {
    currentScene = key;
    instance?.dispose();
    destroyWorld(world);
    world = createWorld(b3, workerCount);
    const def = assertDefined(SCENES[key]);
    instance = def.build({ world, b3, scene, camera });
    applyCameraPreset(def.camera);
    markActiveScene(key);
  };

  createMenu({
    scenes: SCENES,
    current: currentScene,
    onScene: loadScene,
    onReset: () => loadScene(currentScene),
    threads: {
      enabled: flavour === 'deluxe',
      workerCount,
      maxWorkers,
      onWorkerCount: (count) => {
        workerCount = count;
        loadScene(currentScene);
      },
    },
  });
  loadScene(currentScene);

  const fastForward = clamp(parseInteger(params.get('ff')) ?? 0, 0, 100_000);
  for (let i = 0; i < fastForward; i++) world.step(DT, SUB_STEPS);

  let accumulator = 0;
  let last = performance.now();
  let physicsMs = 0;
  let hudLast = last;
  let framesSinceHud = 0;

  const frame = (now: number): void => {
    accumulator += Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;

    const stepStart = performance.now();
    let stepped = false;
    while (accumulator >= DT) {
      world.step(DT, SUB_STEPS);
      accumulator -= DT;
      stepped = true;
    }
    if (stepped) {
      instance?.sync();
      physicsMs = physicsMs * 0.9 + (performance.now() - stepStart) * 0.1;
    }

    controls.update();
    renderer.render(scene, camera);

    framesSinceHud++;
    if (now - hudLast >= HUD_INTERVAL_MS) {
      updateHud({
        flavour,
        workerCount,
        fps: (framesSinceHud * 1000) / (now - hudLast),
        bodies: instance?.bodyCount() ?? 0,
        awake: world.getAwakeBodyCount(),
        physicsMs,
        help: assertDefined(SCENES[currentScene]).help,
      });
      hudLast = now;
      framesSinceHud = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  showError(error);
  throw error;
});
