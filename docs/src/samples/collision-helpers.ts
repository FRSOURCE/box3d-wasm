// Shared by the Collision, Manifold and Character samples: transform math,
// the debug colours upstream's draw calls use, and wireframe stand-ins for
// DrawSolidSphere / DrawSolidCapsule / DrawHull / DrawAxes / DrawGroundGrid
// (the framework's draw canvas only has lines, points, boxes and HUD text).
import type { Quat, Transform, Vec3 } from '@frsource/box3d-wasm';
import {
  add,
  cross,
  dot,
  length,
  mulQuat,
  normalize,
  rotate,
  scale,
  sub,
} from '../framework/math.js';
import type { DebugCanvas } from '../framework/types.js';

export const ZERO: Readonly<Vec3> = { x: 0, y: 0, z: 0 };
export const IDENTITY: Readonly<Transform> = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

/** b3HexColor values as 0xRRGGBB. */
export const Color = {
  white: 0xffffff,
  red: 0xff0000,
  green: 0x00ff00,
  blue: 0x0000ff,
  yellow: 0xffff00,
  orange: 0xffa500,
  cyan: 0x00ffff,
  aqua: 0x00ffff,
  gray: 0x808080,
  dimGray: 0x696969,
  purple: 0x9b30ff,
  limeGreen: 0x32cd32,
  lightGreen: 0x90ee90,
  lightBlue: 0xadd8e6,
  lightCoral: 0xf08080,
  lightCyan: 0xe0ffff,
  bisque: 0xffe4c4,
  aliceBlue: 0xf0f8ff,
  papayaWhip: 0xffefd5,
  mediumPurple: 0x9370db,
  mediumVioletRed: 0xc71585,
  floralWhite: 0xfffaf0,
  oliveDrab: 0x6b8e23,
  indianRed: 0xcd5c5c,
  slateGray: 0x708090,
  cornflowerBlue: 0x6495ed,
  darkSlateGray: 0x2f4f4f,
  gold: 0xffd700,
} as const;

/** Scales each channel, the stand-in for upstream's colour alpha on a dark background. */
export function fade(color: number, factor: number): number {
  const f = Math.min(1, Math.max(0, factor));
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

export const FLT_MAX = 3.4028234663852886e38;

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const copy = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export const lengthSquared = (a: Vec3): number => dot(a, a);

export const negate = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
  z: a.z + t * (b.z - a.z),
});

export const conjugate = (q: Quat): Quat => ({
  x: -q.x,
  y: -q.y,
  z: -q.z,
  w: q.w,
});

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  const s = len > 1e-12 ? 1 / len : 1;
  return { x: q.x * s, y: q.y * s, z: q.z * s, w: q.w * s };
}

/** upstream b3TransformPoint / b3TransformWorldPoint. */
export function transformPoint(xf: Transform, p: Vec3): Vec3 {
  return add(xf.position, rotate(xf.rotation, p));
}

/** upstream b3InvMulWorldTransforms: `a` inverse times `b` (b in a's frame). */
export function invMulTransforms(a: Transform, b: Transform): Transform {
  const inv = conjugate(a.rotation);
  return {
    position: rotate(inv, sub(b.position, a.position)),
    rotation: normalizeQuat(mulQuat(inv, b.rotation)),
  };
}

/** Points of a box in the engine's proxy order (bit 0 x, bit 1 y, bit 2 z). */
export function boxCorners(
  halfExtents: Vec3,
  position: Vec3 = ZERO,
  rotation?: Quat,
): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    let p = v3(
      i & 1 ? halfExtents.x : -halfExtents.x,
      i & 2 ? halfExtents.y : -halfExtents.y,
      i & 4 ? halfExtents.z : -halfExtents.z,
    );
    if (rotation) p = rotate(rotation, p);
    out.push(add(p, position));
  }
  return out;
}

export function flatten(points: readonly Vec3[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y, p.z);
  return out;
}

/** An arbitrary unit vector perpendicular to `n`. */
export function perpendicular(n: Vec3): Vec3 {
  const axis =
    Math.abs(n.x) < 0.57735
      ? v3(1, 0, 0)
      : Math.abs(n.y) < 0.57735
        ? v3(0, 1, 0)
        : v3(0, 0, 1);
  return normalize(cross(n, axis));
}

// --- drawing -------------------------------------------------------------

/** Twelve edges of box corners from `boxCorners`. */
export function drawCorners(
  canvas: DebugCanvas,
  corners: readonly Vec3[],
  color: number,
  xf: Transform = IDENTITY,
): void {
  const world = corners.map((p) => transformPoint(xf, p));
  for (let i = 0; i < 8; i++) {
    for (let bit = 1; bit < 8; bit <<= 1) {
      const j = i | bit;
      if (j !== i) {
        const a = world[i];
        const b = world[j];
        if (a && b) canvas.line(a, b, color);
      }
    }
  }
}

export function drawWireBox(
  canvas: DebugCanvas,
  xf: Transform,
  halfExtents: Vec3,
  color: number,
  offset: Vec3 = ZERO,
  rotation?: Quat,
): void {
  drawCorners(canvas, boxCorners(halfExtents, offset, rotation), color, xf);
}

function circle(
  canvas: DebugCanvas,
  center: Vec3,
  u: Vec3,
  v: Vec3,
  radius: number,
  color: number,
  from = 0,
  to = 2 * Math.PI,
  segments = 24,
): void {
  const count = Math.max(
    1,
    Math.round((segments * (to - from)) / (2 * Math.PI)),
  );
  let prev = add(
    center,
    add(scale(u, radius * Math.cos(from)), scale(v, radius * Math.sin(from))),
  );
  for (let i = 1; i <= count; i++) {
    const a = from + ((to - from) * i) / count;
    const p = add(
      center,
      add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a))),
    );
    canvas.line(prev, p, color);
    prev = p;
  }
}

export function drawWireSphere(
  canvas: DebugCanvas,
  xf: Transform,
  center: Vec3,
  radius: number,
  color: number,
): void {
  const c = transformPoint(xf, center);
  const q = xf.rotation;
  const x = rotate(q, v3(1, 0, 0));
  const y = rotate(q, v3(0, 1, 0));
  const z = rotate(q, v3(0, 0, 1));
  circle(canvas, c, x, y, radius, color);
  circle(canvas, c, y, z, radius, color);
  circle(canvas, c, z, x, radius, color);
}

export function drawWireCapsule(
  canvas: DebugCanvas,
  xf: Transform,
  center1: Vec3,
  center2: Vec3,
  radius: number,
  color: number,
): void {
  const c1 = transformPoint(xf, center1);
  const c2 = transformPoint(xf, center2);
  const axis = sub(c2, c1);
  const len = length(axis);
  if (len < 1e-6) {
    drawWireSphere(
      canvas,
      { position: c1, rotation: xf.rotation },
      ZERO,
      radius,
      color,
    );
    return;
  }
  const a = scale(axis, 1 / len);
  const u = perpendicular(a);
  const w = cross(a, u);
  circle(canvas, c1, u, w, radius, color);
  circle(canvas, c2, u, w, radius, color);
  for (const dir of [u, w, negate(u), negate(w)]) {
    canvas.line(
      add(c1, scale(dir, radius)),
      add(c2, scale(dir, radius)),
      color,
    );
  }
  // hemisphere arcs in two perpendicular planes
  for (const side of [u, w]) {
    circle(canvas, c2, side, a, radius, color, 0, Math.PI, 12);
    circle(canvas, c1, side, a, radius, color, Math.PI, 2 * Math.PI, 12);
  }
}

export function drawTriangle(
  canvas: DebugCanvas,
  xf: Transform,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  color: number,
): void {
  const p1 = transformPoint(xf, a);
  const p2 = transformPoint(xf, b);
  const p3 = transformPoint(xf, c);
  canvas.line(p1, p2, color);
  canvas.line(p2, p3, color);
  canvas.line(p3, p1, color);
}

/** upstream DrawAxes. */
export function drawAxes(
  canvas: DebugCanvas,
  xf: Transform,
  size: number,
): void {
  const o = xf.position;
  canvas.line(o, add(o, rotate(xf.rotation, v3(size, 0, 0))), Color.red);
  canvas.line(o, add(o, rotate(xf.rotation, v3(0, size, 0))), Color.green);
  canvas.line(o, add(o, rotate(xf.rotation, v3(0, 0, size))), Color.blue);
}

/** upstream DrawGroundGrid: `count` cells either side of the origin on y = 0. */
export function drawGroundGrid(canvas: DebugCanvas, count: number): void {
  const color = 0x4d4d4d;
  for (let i = -count; i <= count; i++) {
    canvas.line(v3(i, 0, -count), v3(i, 0, count), color);
    canvas.line(v3(-count, 0, i), v3(count, 0, i), color);
  }
}

/** A line with a small arrow head. */
export function drawArrow(
  canvas: DebugCanvas,
  a: Vec3,
  b: Vec3,
  color: number,
): void {
  canvas.line(a, b, color);
  const d = sub(b, a);
  const len = length(d);
  if (len < 1e-6) return;
  const n = scale(d, 1 / len);
  const u = perpendicular(n);
  const w = cross(n, u);
  const head = Math.min(0.25 * len, 0.1);
  const base = sub(b, scale(n, head));
  const spread = 0.5 * head;
  for (const side of [u, w, negate(u), negate(w)]) {
    canvas.line(b, add(base, scale(side, spread)), color);
  }
}

// --- misc ------------------------------------------------------------------

export const isNormalized = (n: Vec3): boolean =>
  Math.abs(lengthSquared(n) - 1) < 5e-4;

export function hex(value: number): string {
  return value.toString(16).toUpperCase();
}

export const f1 = (value: number): string => value.toFixed(1);
export const f2 = (value: number): string => value.toFixed(2);

/** C-style `%g`. */
export function g(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

/** Records lines and points during a step so `draw` can replay them every frame. */
export class DebugRecorder {
  private readonly lines: { a: Vec3; b: Vec3; color: number }[] = [];
  private readonly points: { p: Vec3; color: number }[] = [];

  clear(): void {
    this.lines.length = 0;
    this.points.length = 0;
  }

  line(a: Vec3, b: Vec3, color: number): void {
    this.lines.push({ a: copy(a), b: copy(b), color });
  }

  point(p: Vec3, color: number): void {
    this.points.push({ p: copy(p), color });
  }

  replay(canvas: DebugCanvas): void {
    for (const l of this.lines) canvas.line(l.a, l.b, l.color);
    for (const p of this.points) canvas.point(p.p, p.color);
  }
}
