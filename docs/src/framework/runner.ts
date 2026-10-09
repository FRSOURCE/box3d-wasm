// SampleRunner owns one loaded sample: its world, scene builder, mouse
// interaction, stepping and profile history. It has no idea about three.js or
// the DOM; the browser shell plugs a view in through RunnerOptions, and the
// tests drive it bare (see headless.ts).
import type { Body, Counters, Profile, World } from '@frsource/box3d-wasm';
import { SceneBuilder } from './builder.js';
import { Interaction } from './interaction.js';
import { createRandom, type Random } from './math.js';
import {
  type B3,
  type CameraApi,
  type DebugCanvas,
  DEFAULT_SETTINGS,
  defaultDebugView,
  type DebugView,
  type KeyInput,
  type MouseInput,
  type Panel,
  type Ray,
  type Sample,
  type SampleContext,
  type SampleDef,
  type SolverSettings,
} from './types.js';

export const GRAVITY = { x: 0, y: -10, z: 0 };

/** The step timers the Profile tab lists, in upstream's order. */
export const PROFILE_FIELDS = [
  'step',
  'pairs',
  'collide',
  'solve',
  'solverSetup',
  'constraints',
  'prepareConstraints',
  'integrateVelocities',
  'warmStart',
  'solveImpulses',
  'integratePositions',
  'relaxImpulses',
  'restitution',
  'storeImpulses',
  'splitIslands',
  'transforms',
  'jointEvents',
  'hitEvents',
  'refit',
  'sleepIslands',
  'bullets',
  'sensors',
] as const satisfies readonly (keyof Profile)[];

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Ring buffers of the last `capacity` steps per timer, for sparklines and averages. */
export class ProfileHistory {
  readonly capacity: number;
  /** Steps recorded, saturating at `capacity`. */
  count = 0;
  /** Index the next sample is written to. */
  head = 0;
  readonly series: Record<ProfileField, Float32Array>;

  constructor(capacity = 256) {
    this.capacity = capacity;
    this.series = {} as Record<ProfileField, Float32Array>;
    for (const field of PROFILE_FIELDS) {
      this.series[field] = new Float32Array(capacity);
    }
  }

  push(profile: Profile): void {
    for (const field of PROFILE_FIELDS) {
      this.series[field][this.head] = profile[field];
    }
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    for (const field of PROFILE_FIELDS) this.series[field].fill(0);
  }

  /** Oldest-first sample `i` of a timer, `0 <= i < count`. */
  at(field: ProfileField, i: number): number {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    return this.series[field][(start + i) % this.capacity] ?? 0;
  }

  average(field: ProfileField): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.at(field, i);
    return sum / this.count;
  }

  max(field: ProfileField): number {
    let max = 0;
    for (let i = 0; i < this.count; i++) max = Math.max(max, this.at(field, i));
    return max;
  }
}

/** A Panel the shell can wipe when the sample asks to rebuild its controls. */
export interface ResettablePanel extends Panel {
  clear(): void;
}

export interface RunnerOptions {
  camera?: CameraApi;
  /** Starting solver settings, merged over the defaults. */
  settings?: Partial<SolverSettings>;
  /** Called with each new builder before the sample is created (attach the view here). */
  onLoad?(scene: SceneBuilder, world: World): void;
  /** Called before the sample's world is destroyed. */
  onUnload?(): void;
}

/** The camera of a runner without a view: remembers third person mode, never calls the follow hook. */
function createNullCamera(): CameraApi {
  let follow: unknown = null;
  return {
    setView() {},
    frame() {},
    get thirdPerson() {
      return follow !== null;
    },
    setThirdPerson(next) {
      follow = next;
    },
    getViewDirection: () => ({ x: 0, y: 0, z: -1 }),
    viewportWidth: 0,
  };
}

export class SampleRunner {
  readonly settings: SolverSettings;
  readonly debugView: DebugView = defaultDebugView();
  readonly playback = { pause: false, singleStep: 0 };
  readonly history = new ProfileHistory();
  readonly profile: Profile = {} as Profile;
  readonly counters: Counters = {} as Counters;
  /** Selected body (click to select); cleared when a sample loads. */
  selected: Body | null = null;

  def: SampleDef | undefined;
  world: World | undefined;
  scene: SceneBuilder | undefined;
  sample: Sample | undefined;
  interaction: Interaction | undefined;
  stepCount = 0;

  private panel: ResettablePanel | undefined;
  private readonly keys = new Set<string>();
  private restarting = false;
  private applied: Partial<SolverSettings> = {};
  readonly camera: CameraApi;

  constructor(
    readonly b3: B3,
    private readonly options: RunnerOptions = {},
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
    const camera = options.camera ?? createNullCamera();
    // upstream only calls SetView while constructing a fresh (non-restart) sample
    this.camera = {
      setView: (...args) => {
        if (!this.restarting) camera.setView(...args);
      },
      frame: (bounds, padding) => camera.frame(bounds, padding),
      get thirdPerson() {
        return camera.thirdPerson;
      },
      setThirdPerson: (follow) => camera.setThirdPerson(follow),
      getViewDirection: () => camera.getViewDirection(),
      get viewportWidth() {
        return camera.viewportWidth;
      },
    };
  }

  /** Builds the sample's world and calls its create and setup hooks. */
  load(def: SampleDef, restart = false): void {
    this.unload();
    this.def = def;
    this.restarting = restart;
    this.stepCount = 0;
    this.history.clear();
    this.selected = null;
    this.applied = {};

    const world = new this.b3.World({
      gravity: GRAVITY,
      workerCount: this.settings.workerCount,
      enableSleep: this.settings.enableSleep,
    });
    this.world = world;
    world.setContactRecycleDistance(this.settings.recycleDistance);
    const scene = new SceneBuilder(world, this.b3);
    this.scene = scene;
    this.options.onLoad?.(scene, world);
    const interaction = new Interaction(world, scene);
    this.interaction = interaction;

    const ctx = new RunnerContext(this, world, scene, interaction, restart);
    this.sample = def.create(ctx);
    this.sample.setup?.();
    this.restarting = false;
    this.refreshUI();
  }

  restart(): void {
    if (this.def) this.load(this.def, true);
  }

  /** Destroys the sample, its scene and its world. Safe to call twice. */
  unload(): void {
    this.interaction?.endGrab();
    this.sample?.destroy?.();
    if (this.camera.thirdPerson) this.camera.setThirdPerson(null);
    this.options.onUnload?.();
    this.scene?.dispose();
    if (this.world?.alive) this.world.destroy();
    this.sample = undefined;
    this.scene = undefined;
    this.world = undefined;
    this.interaction = undefined;
    this.selected = null;
  }

  setPanel(panel: ResettablePanel | undefined): void {
    this.panel = panel;
    this.refreshUI();
  }

  refreshUI(): void {
    if (!this.panel) return;
    this.panel.clear();
    this.sample?.ui?.(this.panel);
  }

  /**
   * One fixed tick: obeys pause and single step, steps 1 / hertz seconds.
   * Returns true when the world advanced.
   */
  tick(): boolean {
    if (!this.sample) return false;
    const before = this.stepCount;
    let timeStep = 0;
    if (!this.playback.pause || this.playback.singleStep > 0) {
      timeStep = this.settings.hertz > 0 ? 1 / this.settings.hertz : 0;
      this.playback.singleStep = Math.max(0, this.playback.singleStep - 1);
    }
    if (timeStep > 0 && this.sample.step) this.sample.step(timeStep);
    else this.stepWorld(timeStep);
    return this.stepCount !== before;
  }

  /** upstream Sample::Step. A timeStep of 0 still refreshes contacts (editing while paused). */
  stepWorld(timeStep: number): void {
    const { world, interaction } = this;
    if (!world || !interaction) return;
    interaction.preStep(timeStep);
    this.applySettings(world);
    world.step(timeStep, this.settings.subStepCount);
    if (timeStep > 0) {
      this.stepCount++;
      world.getProfile(this.profile);
      this.history.push(this.profile);
    }
  }

  refreshCounters(): Counters {
    return this.world?.getCounters(this.counters) ?? this.counters;
  }

  draw(canvas: DebugCanvas): void {
    this.sample?.draw?.(canvas);
  }

  keyDown(input: KeyInput): void {
    this.keys.add(input.code);
    this.sample?.keyboard?.(input);
  }

  keyUp(input: KeyInput): void {
    this.keys.delete(input.code);
    this.sample?.keyUp?.(input);
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  releaseKeys(): void {
    this.keys.clear();
  }

  /**
   * Press: the sample gets the first say, then Ctrl+left grabs a body and
   * Shift+left shoots. Plain left clicks select via `clickSelect` on release.
   * Returns true when the sample swallowed the press (the view then keeps the
   * orbit camera still and does not treat the press as a click).
   */
  mouseDown(input: MouseInput): boolean {
    if (this.camera.thirdPerson || !this.interaction) return false;
    if (this.sample?.mouseDown?.(input)) return true;
    if (input.button !== 0) return false;
    if (input.shift) {
      this.interaction.shoot(input.ray, input);
    } else if (input.ctrl && !input.alt) {
      const body = this.interaction.beginGrab(input.ray);
      if (body) this.selected = body;
    }
    return false;
  }

  mouseMove(input: MouseInput): void {
    this.interaction?.moveGrab(input.ray);
    this.sample?.mouseMove?.(input);
  }

  mouseUp(input: MouseInput): void {
    this.interaction?.endGrab();
    this.sample?.mouseUp?.(input);
  }

  /** Plain click: select the body under the ray, or clear the selection. */
  clickSelect(ray: Ray): void {
    this.selected = this.interaction?.pick(ray) ?? null;
  }

  private applySettings(world: World): void {
    const s = this.settings;
    const a = this.applied;
    if (a.enableSleep !== s.enableSleep) world.enableSleeping(s.enableSleep);
    if (a.enableWarmStarting !== s.enableWarmStarting) {
      world.enableWarmStarting(s.enableWarmStarting);
    }
    if (a.enableContinuous !== s.enableContinuous) {
      world.enableContinuous(s.enableContinuous);
    }
    if (a.recycleDistance !== s.recycleDistance) {
      world.setContactRecycleDistance(s.recycleDistance);
    }
    Object.assign(a, s);
  }
}

/** The SampleContext a sample sees; a thin view over the runner and its interaction. */
class RunnerContext implements SampleContext {
  readonly b3: B3;
  readonly settings: SolverSettings;
  readonly camera: CameraApi;
  readonly random: Random = createRandom();

  constructor(
    private readonly runner: SampleRunner,
    readonly world: World,
    readonly scene: SceneBuilder,
    private readonly interaction: Interaction,
    readonly restart: boolean,
  ) {
    this.b3 = runner.b3;
    this.settings = runner.settings;
    this.camera = runner.camera;
  }

  get stepCount(): number {
    return this.runner.stepCount;
  }

  get mouseForceScale(): number {
    return this.interaction.mouseForceScale;
  }

  set mouseForceScale(value: number) {
    this.interaction.mouseForceScale = value;
  }

  get launchSpeedScale(): number {
    return this.interaction.launchSpeedScale;
  }

  set launchSpeedScale(value: number) {
    this.interaction.launchSpeedScale = value;
  }

  get selected(): Body | null {
    return this.runner.selected;
  }

  set selected(body: Body | null) {
    this.runner.selected = body;
  }

  stepWorld(timeStep: number): void {
    this.runner.stepWorld(timeStep);
  }

  refreshUI(): void {
    this.runner.refreshUI();
  }

  isKeyDown(code: string): boolean {
    return this.runner.isKeyDown(code);
  }
}
