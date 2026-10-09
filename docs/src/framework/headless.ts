// Everything a test (or a script) needs to run samples without a browser: a
// runner with no view attached, a Panel that records its controls so a test can
// poke them, and a canvas that only counts. See test/demo.test.ts.
import type { Body, Vec3 } from '@frsource/box3d-wasm';
import {
  SampleRunner,
  type ResettablePanel,
  type RunnerOptions,
} from './runner.js';
import type {
  B3,
  Control,
  DebugCanvas,
  SampleDef,
  SliderOptions,
} from './types.js';

export interface RecordedControl {
  kind: 'slider' | 'checkbox' | 'radio' | 'combo' | 'button' | 'text';
  label: string;
  /** Fires the control's callback the way the UI would; `value` defaults to a plausible change. */
  trigger(value?: number | boolean): void;
}

/** A Panel with no DOM: it remembers every control so tests can trigger them. */
export class HeadlessPanel implements ResettablePanel {
  controls: RecordedControl[] = [];

  clear(): void {
    this.controls = [];
  }

  slider(
    label: string,
    value: number,
    options: SliderOptions,
    onChange: (value: number) => void,
  ): Control<number> {
    const control = valueControl(value);
    this.controls.push({
      kind: 'slider',
      label,
      trigger: (v) => {
        const next =
          typeof v === 'number' ? v : (options.min + options.max) / 2;
        control.set(next);
        onChange(next);
      },
    });
    return control;
  }

  checkbox(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
  ): Control<boolean> {
    const control = valueControl(value);
    this.controls.push({
      kind: 'checkbox',
      label,
      trigger: (v) => {
        const next = typeof v === 'boolean' ? v : !control.value;
        control.set(next);
        onChange(next);
      },
    });
    return control;
  }

  radio(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number> {
    return this.choice('radio', label, options, selected, onChange);
  }

  combo(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number> {
    return this.choice('combo', label, options, selected, onChange);
  }

  button(label: string, onClick: () => void): void {
    this.controls.push({ kind: 'button', label, trigger: onClick });
  }

  text(content: string | (() => string)): void {
    this.controls.push({
      kind: 'text',
      label: typeof content === 'string' ? content : content(),
      trigger: () => {},
    });
  }

  separator(): void {}

  private choice(
    kind: 'radio' | 'combo',
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number> {
    const control = valueControl(selected);
    this.controls.push({
      kind,
      label,
      trigger: (v) => {
        const next =
          typeof v === 'number' ? v : (control.value + 1) % options.length;
        control.set(next);
        onChange(next);
      },
    });
    return control;
  }
}

function valueControl<T>(initial: T): Control<T> {
  let current = initial;
  return {
    get value() {
      return current;
    },
    set(value: T) {
      current = value;
    },
  };
}

/** A DebugCanvas that keeps what it was given, for assertions. */
export class RecordingCanvas implements DebugCanvas {
  lines: string[] = [];
  segments = 0;
  points = 0;

  text(line: string): void {
    this.lines.push(line);
  }

  line(): void {
    this.segments++;
  }

  point(): void {
    this.points++;
  }

  aabb(): void {
    this.segments += 12;
  }

  reset(): void {
    this.lines = [];
    this.segments = 0;
    this.points = 0;
  }
}

export interface HeadlessSession {
  runner: SampleRunner;
  panel: HeadlessPanel;
  canvas: RecordingCanvas;
}

/** A runner with a recording panel attached and no view. */
export function createHeadlessSession(
  b3: B3,
  options: RunnerOptions = {},
): HeadlessSession {
  const runner = new SampleRunner(b3, options);
  const panel = new HeadlessPanel();
  runner.setPanel(panel);
  return { runner, panel, canvas: new RecordingCanvas() };
}

/** Loads `def`, calls its draw hook and steps `frames` ticks. */
export function runSample(
  session: HeadlessSession,
  def: SampleDef,
  frames: number,
): void {
  const { runner, canvas } = session;
  runner.load(def);
  for (let i = 0; i < frames; i++) {
    runner.tick();
    canvas.reset();
    runner.draw(canvas);
  }
}

/** Positions that are not finite numbers, as `"name: x y z"` strings; empty when the world is healthy. */
export function nonFiniteBodies(runner: SampleRunner): string[] {
  const bad: string[] = [];
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  const world = runner.world;
  if (!world) return bad;
  for (const body of world.bodies as Iterable<Body>) {
    body.getPosition(p);
    if (!Number.isFinite(p.x + p.y + p.z)) {
      bad.push(`${body.getName() || `#${body.slot}`}: ${p.x} ${p.y} ${p.z}`);
    }
  }
  return bad;
}
