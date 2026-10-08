// Bottom drawer: Profile (every step timer with a sparkline), Counters and
// Frame Time, like upstream's metrics drawer.
import {
  PROFILE_FIELDS,
  type ProfileField,
  type SampleRunner,
} from '../runner.js';
import { h } from './dom.js';

const FRAME_HISTORY = 240;
const SPARK_W = 120;
const SPARK_H = 18;

type Tab = 'Profile' | 'Counters' | 'Frame Time';
const TABS: readonly Tab[] = ['Profile', 'Counters', 'Frame Time'];

interface Row {
  field: ProfileField;
  now: HTMLElement;
  avg: HTMLElement;
  max: HTMLElement;
  canvas: HTMLCanvasElement;
}

function sparkline(
  canvas: HTMLCanvasElement,
  count: number,
  value: (i: number) => number,
  ceiling: number,
): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (count < 2 || ceiling <= 0) return;
  g.strokeStyle = '#89b4fa';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * (canvas.width - 1);
    const y =
      canvas.height - 1 - Math.min(1, value(i) / ceiling) * (canvas.height - 2);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

export class Diagnostics {
  private readonly frames = new Float32Array(FRAME_HISTORY);
  private frameCount = 0;
  private frameHead = 0;
  private tab: Tab = 'Profile';
  private readonly rows: Row[] = [];
  private readonly panes = new Map<Tab, HTMLElement>();
  private readonly tabButtons = new Map<Tab, HTMLElement>();
  private readonly counterBody = h('tbody');
  private counterCells = new Map<string, HTMLElement>();
  private readonly frameCanvas = h('canvas', { width: 480, height: 80 });
  private readonly frameText = h('div', { class: 'line' });

  constructor(
    private readonly root: HTMLElement,
    private readonly runner: SampleRunner,
  ) {
    const bar = h('div', { class: 'tabs' });
    for (const tab of TABS) {
      const button = h('button', { type: 'button', class: 'tab', text: tab });
      button.addEventListener('click', () => this.select(tab));
      this.tabButtons.set(tab, button);
      bar.append(button);
    }
    const reset = h('button', {
      type: 'button',
      class: 'tab right',
      text: 'Reset Profile',
    });
    reset.addEventListener('click', () => runner.history.clear());
    bar.append(reset);

    this.panes.set('Profile', this.buildProfile());
    this.panes.set('Counters', h('table', {}, this.counterBody));
    this.panes.set(
      'Frame Time',
      h('div', {}, this.frameCanvas, this.frameText),
    );
    root.append(bar, ...this.panes.values());
    root.hidden = true;
    this.select('Profile');
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  /** Record one rendered frame's duration. */
  recordFrame(ms: number): void {
    this.frames[this.frameHead] = ms;
    this.frameHead = (this.frameHead + 1) % FRAME_HISTORY;
    this.frameCount = Math.min(this.frameCount + 1, FRAME_HISTORY);
  }

  /** Redraws the active tab; call a few times a second while visible. */
  render(): void {
    if (!this.visible) return;
    if (this.tab === 'Profile') this.renderProfile();
    else if (this.tab === 'Counters') this.renderCounters();
    else this.renderFrames();
  }

  private select(tab: Tab): void {
    this.tab = tab;
    for (const [name, pane] of this.panes) pane.hidden = name !== tab;
    for (const [name, button] of this.tabButtons) {
      button.classList.toggle('active', name === tab);
    }
    this.render();
  }

  private buildProfile(): HTMLElement {
    const body = h('tbody');
    for (const field of PROFILE_FIELDS) {
      const now = h('td', { class: 'num' });
      const avg = h('td', { class: 'num' });
      const max = h('td', { class: 'num' });
      const canvas = h('canvas', { width: SPARK_W, height: SPARK_H });
      this.rows.push({ field, now, avg, max, canvas });
      body.append(
        h(
          'tr',
          {},
          h('td', { text: field }),
          now,
          avg,
          max,
          h('td', {}, canvas),
        ),
      );
    }
    const head = h(
      'thead',
      {},
      h(
        'tr',
        {},
        ...['timer', 'ms', 'avg', 'max', 'history'].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    return h('table', { class: 'profile' }, head, body);
  }

  private renderProfile(): void {
    const { history, profile } = this.runner;
    // the step total gives every sparkline a shared scale so rows compare
    const ceiling = Math.max(history.max('step'), 1e-6);
    for (const row of this.rows) {
      row.now.textContent = (profile[row.field] ?? 0).toFixed(3);
      row.avg.textContent = history.average(row.field).toFixed(3);
      row.max.textContent = history.max(row.field).toFixed(3);
      sparkline(
        row.canvas,
        history.count,
        (i) => history.at(row.field, i),
        ceiling,
      );
    }
  }

  private renderCounters(): void {
    const counters = this.runner.refreshCounters();
    for (const [key, value] of Object.entries(counters)) {
      let cell = this.counterCells.get(key);
      if (!cell) {
        cell = h('td', { class: 'num' });
        this.counterCells.set(key, cell);
        this.counterBody.append(h('tr', {}, h('td', { text: key }), cell));
      }
      cell.textContent = String(value);
    }
  }

  private renderFrames(): void {
    let sum = 0;
    let max = 0;
    const start =
      (this.frameHead - this.frameCount + FRAME_HISTORY) % FRAME_HISTORY;
    const at = (i: number): number =>
      this.frames[(start + i) % FRAME_HISTORY] ?? 0;
    for (let i = 0; i < this.frameCount; i++) {
      sum += at(i);
      max = Math.max(max, at(i));
    }
    const avg = this.frameCount > 0 ? sum / this.frameCount : 0;
    sparkline(this.frameCanvas, this.frameCount, at, Math.max(33.4, max));
    this.frameText.textContent = `frame ${avg.toFixed(1)} ms avg, ${max.toFixed(1)} ms max over ${this.frameCount} frames (${avg > 0 ? (1000 / avg).toFixed(0) : 0} fps); scale 0 to ${Math.max(33.4, max).toFixed(0)} ms`;
  }
}
