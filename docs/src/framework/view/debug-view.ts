// Renders world.debugDraw() (joints, bounds, contacts, islands...) and the
// sample's own draw() overlay with LineSegments / Points.
import { Group } from 'three';
import type { AABB, Vec3, World } from '@frsource/box3d-wasm';
import type { DebugCanvas, DebugView } from '../types.js';
import { DrawLayer } from './draw-layer.js';

const LINE_STRIDE = 7;
const POINT_STRIDE = 5;
const WHITE = 0xffffff;

const LAYERS: readonly (keyof DebugView)[] = [
  'joints',
  'jointExtras',
  'bounds',
  'mass',
  'sleep',
  'contacts',
  'contactNormals',
  'contactFeatures',
  'contactForces',
  'graphColors',
  'islands',
];

export function anyDebugLayer(view: DebugView): boolean {
  return LAYERS.some((key) => view[key]);
}

export class DebugDrawView {
  readonly group: Group = new Group();
  private readonly lines = new DrawLayer('lines');
  private readonly points = new DrawLayer('points');

  constructor() {
    this.group.name = 'debug draw';
    this.group.add(this.lines.object, this.points.object);
  }

  /** Runs a debug draw pass when any layer is on, hides everything otherwise. */
  update(world: World, view: DebugView): void {
    if (!anyDebugLayer(view)) {
      this.lines.hide();
      this.points.hide();
      return;
    }
    // DebugView is a subset of DebugDrawOptions, so no options object is built per frame
    const buffers = world.debugDraw(view);

    const lineCount = buffers.lineCount;
    this.lines.begin();
    this.lines.reserve(lineCount);
    if (lineCount > 0) {
      const f = buffers.lines;
      const w = buffers.lineWords;
      for (let i = 0; i < lineCount; i++) {
        const o = i * LINE_STRIDE;
        this.lines.push(
          f[o] ?? 0,
          f[o + 1] ?? 0,
          f[o + 2] ?? 0,
          f[o + 3] ?? 0,
          f[o + 4] ?? 0,
          f[o + 5] ?? 0,
          (w[o + 6] ?? 0) & 0xffffff,
        );
      }
    }
    this.lines.end();

    const pointCount = buffers.pointCount;
    this.points.begin();
    this.points.reserve(pointCount);
    if (pointCount > 0) {
      const f = buffers.points;
      const w = buffers.pointWords;
      for (let i = 0; i < pointCount; i++) {
        const o = i * POINT_STRIDE;
        this.points.push(
          f[o] ?? 0,
          f[o + 1] ?? 0,
          f[o + 2] ?? 0,
          0,
          0,
          0,
          (w[o + 4] ?? 0) & 0xffffff,
        );
      }
    }
    this.points.end();
  }

  dispose(): void {
    this.lines.dispose();
    this.points.dispose();
  }
}

/** The DebugCanvas samples draw into; text goes to the HUD, geometry to the overlay layers. */
export class OverlayCanvas implements DebugCanvas {
  readonly group: Group = new Group();
  readonly textLines: string[] = [];
  private readonly lines = new DrawLayer('lines', 256);
  private readonly points = new DrawLayer('points', 256);

  constructor() {
    this.group.name = 'sample overlay';
    this.group.add(this.lines.object, this.points.object);
  }

  begin(): void {
    this.textLines.length = 0;
    this.lines.begin();
    this.points.begin();
  }

  end(): void {
    this.lines.end();
    this.points.end();
  }

  text(line: string): void {
    this.textLines.push(line);
  }

  line(a: Vec3, b: Vec3, color = WHITE): void {
    this.lines.push(a.x, a.y, a.z, b.x, b.y, b.z, color);
  }

  point(p: Vec3, color = WHITE): void {
    this.points.push(p.x, p.y, p.z, 0, 0, 0, color);
  }

  aabb({ lowerBound: l, upperBound: u }: AABB, color = WHITE): void {
    const edge = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
    ): void => this.lines.push(ax, ay, az, bx, by, bz, color);
    for (const y of [l.y, u.y]) {
      edge(l.x, y, l.z, u.x, y, l.z);
      edge(u.x, y, l.z, u.x, y, u.z);
      edge(u.x, y, u.z, l.x, y, u.z);
      edge(l.x, y, u.z, l.x, y, l.z);
    }
    for (const [x, z] of [
      [l.x, l.z],
      [u.x, l.z],
      [u.x, u.z],
      [l.x, u.z],
    ] as const) {
      edge(x, l.y, z, x, u.y, z);
    }
  }

  dispose(): void {
    this.lines.dispose();
    this.points.dispose();
  }
}
