// The contract between a sample and the demo shell. Nothing in this file (or
// anything a sample imports from the framework) touches three.js or the DOM,
// so samples run unchanged under the headless runner the tests use.
import type {
  AABB,
  Body,
  Box3D,
  DebugDrawOptions,
  Vec3,
  World,
} from '@frsource/box3d-wasm';
import type { SceneBuilder } from './builder.js';
import type { Random } from './math.js';

export type B3 = Box3D;

/** A pick or shot ray; `direction` is normalised. */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface KeyInput {
  /** `KeyboardEvent.key`, e.g. 'a', 'ArrowLeft', ' '. */
  key: string;
  /** `KeyboardEvent.code`, e.g. 'KeyA'; pass this to `ctx.isKeyDown`. */
  code: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface MouseInput {
  /** 0 left, 1 middle, 2 right. */
  button: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /** CSS pixels relative to the canvas. */
  x: number;
  y: number;
  ray: Ray;
}

/** A widget handle; `set` updates the widget without firing its callback. */
export interface Control<T> {
  readonly value: T;
  set(value: T): void;
}

export interface SliderOptions {
  min: number;
  max: number;
  /** Default 0 (continuous); 1 for integer sliders. */
  step?: number;
  /** Formats the readout next to the slider. */
  format?: (value: number) => string;
}

/** The sample controls section of the info panel (upstream's DrawControls). */
export interface Panel {
  slider(
    label: string,
    value: number,
    options: SliderOptions,
    onChange: (value: number) => void,
  ): Control<number>;
  checkbox(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
  ): Control<boolean>;
  /** One radio button per option; `selected` and the callback use the option index. */
  radio(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number>;
  combo(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number>;
  button(label: string, onClick: () => void): void;
  /** A static line, or a function re-evaluated about ten times a second. */
  text(content: string | (() => string)): void;
  separator(): void;
}

/** Per-frame overlay a sample can draw into from `draw()` (upstream's Render). */
export interface DebugCanvas {
  /** One HUD text line, stacked below the previous one. */
  text(line: string): void;
  /** `color` is 0xRRGGBB. */
  line(a: Vec3, b: Vec3, color?: number): void;
  point(p: Vec3, color?: number): void;
  aabb(box: AABB, color?: number): void;
}

/**
 * Filled in every frame by a third-person follow hook. The hook writes `eye`
 * and `target`. `yawDegrees`, `pitchDegrees` and `radius` are read-only inputs:
 * the look state the mouse drives (same convention as `setView`), so a hook
 * usually sets `target` to the followed position and `eye` to `orbitEye(...)`
 * of that target, optionally shortening `radius` first to avoid geometry.
 */
export interface FollowPose {
  eye: Vec3;
  target: Vec3;
  yawDegrees: number;
  pitchDegrees: number;
  radius: number;
}

export interface CameraApi {
  /**
   * Upstream Camera::SetView: the eye sits `radius` away from `pivot` in the
   * direction given by yaw (about +y, 0 looking down -z) and pitch (positive
   * is above the pivot).
   */
  setView(
    yawDegrees: number,
    pitchDegrees: number,
    radius: number,
    pivot: Vec3,
  ): void;
  /** Fits the bounds (the world's when omitted) the way the F key does. */
  frame(bounds?: AABB, padding?: number): void;
  readonly thirdPerson: boolean;
  /**
   * Hands the camera to `follow`, which writes the eye and target each frame
   * (OrbitControls and click-to-select are off meanwhile). In the browser the
   * pointer is locked and mouse movement turns `pose.yawDegrees` and
   * `pose.pitchDegrees`, the wheel changes `pose.radius`. Pass null to return
   * to the orbit camera.
   */
  setThirdPerson(follow: ((pose: FollowPose) => void) | null): void;
  /** Unit vector from the eye toward the view target (upstream's `-GetForward()`). */
  getViewDirection(): Vec3;
  /** Canvas width in CSS pixels (upstream's `m_camera->m_width`); 0 when there is no view. */
  readonly viewportWidth: number;
}

/** Solver and playback settings; the shell's Solver panel edits these live. */
export interface SolverSettings {
  /** Physics rate: each tick steps 1 / hertz seconds. Default 60. */
  hertz: number;
  subStepCount: number;
  /** Threads per step; only the deluxe build honours more than 1. */
  workerCount: number;
  /** Contact recycle distance in metres. */
  recycleDistance: number;
  enableSleep: boolean;
  enableWarmStarting: boolean;
  enableContinuous: boolean;
}

export interface SampleContext {
  readonly b3: B3;
  readonly world: World;
  /** Creates bodies and shapes and, in the browser, their three.js meshes. */
  readonly scene: SceneBuilder;
  /** Live solver settings; the world picks them up before every step. */
  readonly settings: SolverSettings;
  readonly camera: CameraApi;
  /** True while the same sample is being rebuilt by R, so the camera stays put. */
  readonly restart: boolean;
  /** Steps taken since the sample loaded. */
  readonly stepCount: number;
  /** Seeded generator, reset on every (re)start so a restart replays identically. */
  readonly random: Random;
  /** Mouse joint strength: maxSpringForce = mouseForceScale * mass * gravity. Default 100. */
  mouseForceScale: number;
  /** Shot speed multiplier: sphere 20 m/s * scale. Default 1. */
  launchSpeedScale: number;
  /** The body click-to-select highlighted, if any. */
  selected: Body | null;
  /** upstream Sample::Step: the mouse joint target, solver flags, `world.step`, profile. */
  stepWorld(timeStep: number): void;
  /** Rebuilds the controls panel by calling `sample.ui` again (for conditional widgets). */
  refreshUI(): void;
  isKeyDown(code: string): boolean;
}

export interface Sample {
  /** Called once after `create`, before the first step. */
  setup?(): void;
  /**
   * Replaces the default step. Call `ctx.stepWorld(dt)` yourself to advance
   * the world. Not called while paused (the shell then only refreshes the
   * mouse joint).
   */
  step?(dt: number): void;
  keyboard?(input: KeyInput): void;
  keyUp?(input: KeyInput): void;
  /** Return true to swallow the click (no select, grab or shot). */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- most handlers return nothing
  mouseDown?(input: MouseInput): boolean | void;
  mouseMove?(input: MouseInput): void;
  mouseUp?(input: MouseInput): void;
  /** Adds sample controls; called again by `ctx.refreshUI()`. */
  ui?(panel: Panel): void;
  /** Called every rendered frame for overlay text and lines. */
  draw?(canvas: DebugCanvas): void;
  /** Hide the Solver section (debug samples that own stepping). */
  hasSolverControls?: boolean;
  destroy?(): void;
}

export interface SampleDef {
  category: string;
  name: string;
  create(ctx: SampleContext): Sample;
}

/** Which debug-draw layers are on (View menu). */
export type DebugView = Required<
  Pick<
    DebugDrawOptions,
    | 'joints'
    | 'jointExtras'
    | 'bounds'
    | 'mass'
    | 'sleep'
    | 'contacts'
    | 'contactNormals'
    | 'contactFeatures'
    | 'contactForces'
    | 'anchorA'
    | 'graphColors'
    | 'islands'
    | 'forceScale'
    | 'jointScale'
  >
>;

export const DEFAULT_SETTINGS: Readonly<SolverSettings> = {
  hertz: 60,
  subStepCount: 4,
  workerCount: 1,
  recycleDistance: 0.05,
  enableSleep: true,
  enableWarmStarting: true,
  enableContinuous: true,
};

export function defaultDebugView(): DebugView {
  return {
    joints: false,
    jointExtras: false,
    bounds: false,
    mass: false,
    sleep: false,
    contacts: false,
    contactNormals: false,
    contactFeatures: false,
    contactForces: false,
    anchorA: true,
    graphColors: false,
    islands: false,
    forceScale: 1,
    jointScale: 1,
  };
}
