// The right-hand info panel: sample identity, run state, camera, the sample's
// own controls and the Solver section (upstream DrawInfoPanel).
import type { CameraInfo } from '../view/camera-rig.js';
import type { SampleRunner } from '../runner.js';
import type { SampleDef } from '../types.js';
import { h } from './dom.js';
import { DomPanel } from './panel.js';

export interface SolverUiOptions {
  /** Worker threads exist only in the deluxe build. */
  deluxe: boolean;
  maxWorkers: number;
  /** Rebuild the world with a new worker count. */
  onWorkerCount(count: number): void;
  /** Reload with threads on or off (a different wasm module). */
  onToggleThreads(): void;
}

export interface InfoState {
  paused: boolean;
  frameMs: number;
  stepCount: number;
  camera: CameraInfo;
  bodies: number;
  awake: number;
}

export class InfoPanel {
  readonly controls: DomPanel;
  private readonly name = h('div', { class: 'name' });
  private readonly category = h('div', { class: 'category' });
  private readonly paused = h('div', { class: 'paused', text: 'PAUSED (p)' });
  private readonly stats = h('div', { class: 'stats' });
  private readonly solverSection = h('details', {
    class: 'section',
    open: true,
  });
  private lastStats = '';

  constructor(
    root: HTMLElement,
    private readonly runner: SampleRunner,
    solver: SolverUiOptions,
  ) {
    const controls = h('div', { class: 'controls' });
    this.controls = new DomPanel(controls);
    const solverBody = h('div');
    this.solverSection.append(h('summary', { text: 'Solver' }), solverBody);
    this.buildSolver(new DomPanel(solverBody), solver);
    this.paused.hidden = true;
    root.append(
      this.name,
      this.category,
      h('hr'),
      this.paused,
      this.stats,
      h('hr'),
      controls,
      this.solverSection,
    );
  }

  setSample(def: SampleDef): void {
    this.name.textContent = def.name;
    this.category.textContent = def.category;
    this.solverSection.hidden = runnerHidesSolver(this.runner);
  }

  update(state: InfoState): void {
    this.paused.hidden = !state.paused;
    const { pivot, yawDegrees, pitchDegrees, radius } = state.camera;
    const text =
      `${state.frameMs.toFixed(1)} ms\n` +
      `step ${state.stepCount}\n` +
      `bodies ${state.bodies}  awake ${state.awake}\n` +
      `pivot m (${pivot.x.toFixed(1)}, ${pivot.y.toFixed(1)}, ${pivot.z.toFixed(1)})\n` +
      `yaw/pitch (${yawDegrees.toFixed(1)}, ${pitchDegrees.toFixed(1)})\n` +
      `radius m ${radius.toFixed(1)}`;
    if (text !== this.lastStats) {
      this.stats.textContent = text;
      this.lastStats = text;
    }
    this.controls.refreshText();
  }

  private buildSolver(panel: DomPanel, options: SolverUiOptions): void {
    const { settings } = this.runner;
    panel.slider(
      'Sub-steps',
      settings.subStepCount,
      { min: 1, max: 50, step: 1 },
      (v) => {
        settings.subStepCount = v;
      },
    );
    panel.slider(
      'Hertz',
      settings.hertz,
      { min: 5, max: 240, step: 1, format: (v) => `${v.toFixed(0)} hz` },
      (v) => {
        settings.hertz = v;
      },
    );
    if (options.deluxe) {
      panel.slider(
        'Workers',
        settings.workerCount,
        { min: 1, max: options.maxWorkers, step: 1 },
        (v) => options.onWorkerCount(v),
      );
    }
    panel.slider(
      'Recycle',
      settings.recycleDistance * 100,
      { min: 0, max: 10, format: (v) => `${v.toFixed(1)} cm` },
      (v) => {
        settings.recycleDistance = v / 100;
      },
    );
    panel.checkbox('Sleep', settings.enableSleep, (v) => {
      settings.enableSleep = v;
    });
    panel.checkbox('Warm Starting', settings.enableWarmStarting, (v) => {
      settings.enableWarmStarting = v;
    });
    panel.checkbox('Continuous', settings.enableContinuous, (v) => {
      settings.enableContinuous = v;
    });
    panel.button('Restart (r)', () => this.runner.restart());
    panel.button(
      `threads: ${options.deluxe ? 'on' : 'off'}`,
      options.onToggleThreads,
    );
  }
}

function runnerHidesSolver(runner: SampleRunner): boolean {
  return runner.sample?.hasSolverControls === false;
}
