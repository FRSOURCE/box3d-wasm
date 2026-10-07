import { version } from '@frsource/box3d-wasm/package.json';
import type { Flavour } from './physics';
import { element } from './utils';

export interface HudState {
  flavour: Flavour;
  workerCount: number;
  fps: number;
  bodies: number;
  awake: number;
  physicsMs: number;
  help: string;
}

const hud = element<HTMLDivElement>('hud');

export function updateHud(state: HudState): void {
  const flavour =
    state.flavour === 'deluxe'
      ? `deluxe, ${state.workerCount} worker${state.workerCount === 1 ? '' : 's'}`
      : 'standard';
  hud.textContent =
    `Box3D by Erin Catto · @frsource/box3d-wasm ${version} · ${flavour}\n` +
    `bodies: ${state.bodies}  awake: ${state.awake}\n` +
    `physics: ${state.physicsMs.toFixed(2)} ms/frame  render: ${Math.round(state.fps)} fps\n` +
    state.help;
}

export function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  hud.textContent = `failed to start: ${message}`;
}
