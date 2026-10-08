// Helpers shared by the Mesh, Compound, Geometry, Issues and Tree samples:
// asset loading (OBJ meshes and bounds lists from docs/public), upstream's
// xorshift random generator, wrapping library meshes for the scene builder,
// merged-triangle baking for big compounds and debug-canvas drawing of axes,
// spheres, capsules and hull outlines. Nothing here touches three.js or the DOM.
import type { Box3D, Mesh, Quat, Vec3 } from '@frsource/box3d-wasm';
import type { MeshData, ShapeVisual } from '../framework/builder.js';
import { mulQuat, rotate } from '../framework/math.js';
import type { DebugCanvas } from '../framework/types.js';

/** The library does not export its Hull class as a type; this is its instance type. */
export type HullResource = ReturnType<Box3D['createHull']>;

// ---- colours (b3HexColor) -------------------------------------------------
export const COLOR = {
  red: 0xff0000,
  green: 0x00ff00,
  blue: 0x0000ff,
  yellow: 0xffff00,
  cyan: 0x00ffff,
  aqua: 0x00ffff,
  orange: 0xffa500,
  gray: 0x808080,
  purple: 0x800080,
  white: 0xffffff,
  magenta: 0xff00ff,
  lightGray: 0xd3d3d3,
  lightBlue: 0xadd8e6,
  greenYellow: 0xadff2f,
  aliceBlue: 0xf0f8ff,
  lightCoral: 0xf08080,
  orchid: 0xda70d6,
  darkMagenta: 0x8b008b,
  darkSeaGreen: 0x8fbc8f,
  blueViolet: 0x8a2be2,
} as const;

/** printf("%g") */
export const fmtG = (value: number): string =>
  String(Number(value.toPrecision(6)));

// ---- assets ----------------------------------------------------------------

/** URL of a file under docs/public, honouring the site's base path. */
export function assetUrl(path: string): string {
  const meta = import.meta as ImportMeta & {
    env?: { BASE_URL?: string };
  };
  return `${meta.env?.BASE_URL ?? '/'}${path}`;
}

/** Fetches a text asset; undefined when it cannot be loaded (headless runs, offline). */
export async function fetchText(path: string): Promise<string | undefined> {
  try {
    const response = await fetch(assetUrl(path));
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

/** upstream TempMesh: flat vertices, triangle indices and a material per triangle. */
export interface TempMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  materialIndices: Uint8Array;
}

/**
 * Ear clipping of one OBJ polygon (the role earcut plays in upstream's tiny
 * obj loader). Falls back to a fan for degenerate polygons.
 */
function triangulate(poly: number[], positions: Float32Array): number[] {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return poly;
  const p = (i: number): Vec3 => {
    const v = poly[i] ?? 0;
    return {
      x: positions[3 * v] ?? 0,
      y: positions[3 * v + 1] ?? 0,
      z: positions[3 * v + 2] ?? 0,
    };
  };
  // Newell normal, then project away its dominant axis
  const normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const a = p(i);
    const b = p((i + 1) % n);
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const sign =
    (drop === 0 ? normal.x : drop === 1 ? normal.y : normal.z) < 0 ? -1 : 1;
  const project = (i: number): [number, number] => {
    const v = p(i);
    if (drop === 0) return [v.y * sign, v.z];
    if (drop === 1) return [v.z * sign, v.x];
    return [v.x * sign, v.y];
  };
  const pts = poly.map((_, i) => project(i));
  const cross = (o: number, a: number, b: number): number => {
    const po = pts[o] ?? [0, 0];
    const pa = pts[a] ?? [0, 0];
    const pb = pts[b] ?? [0, 0];
    return (
      (pa[0] - po[0]) * (pb[1] - po[1]) - (pa[1] - po[1]) * (pb[0] - po[0])
    );
  };
  const inside = (t: number, a: number, b: number, c: number): boolean =>
    cross(a, b, t) >= 0 && cross(b, c, t) >= 0 && cross(c, a, t) >= 0;

  const remaining = poly.map((_, i) => i);
  const out: number[] = [];
  let guard = 0;
  while (remaining.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let k = 0; k < remaining.length; k++) {
      const a = remaining[(k + remaining.length - 1) % remaining.length] ?? 0;
      const b = remaining[k] ?? 0;
      const c = remaining[(k + 1) % remaining.length] ?? 0;
      if (cross(a, b, c) <= 0) continue;
      let ear = true;
      for (const t of remaining) {
        if (t === a || t === b || t === c) continue;
        if (inside(t, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push(poly[a] ?? 0, poly[b] ?? 0, poly[c] ?? 0);
      remaining.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) {
    out.push(
      poly[remaining[0] ?? 0] ?? 0,
      poly[remaining[1] ?? 0] ?? 0,
      poly[remaining[2] ?? 0] ?? 0,
    );
  } else if (remaining.length > 3) {
    const first = poly[remaining[0] ?? 0] ?? 0;
    for (let i = 1; i + 1 < remaining.length; i++) {
      out.push(
        first,
        poly[remaining[i] ?? 0] ?? 0,
        poly[remaining[i + 1] ?? 0] ?? 0,
      );
    }
  }
  return out;
}

/**
 * upstream LoadTempMesh: Wavefront OBJ, polygons triangulated, vertices scaled
 * (and swizzled to y-up when `zUp`), triangle materials cycling 0, 1, 2.
 */
export function parseObj(text: string, scale: number, zUp: boolean): TempMesh {
  const raw: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const parts = line.trim().split(/\s+/);
      const x = scale * Number(parts[1]);
      const y = scale * Number(parts[2]);
      const z = scale * Number(parts[3]);
      if (zUp) raw.push(y, z, x);
      else raw.push(x, y, z);
      vertexCount++;
    }
  }
  const positions = Float32Array.from(raw);
  for (const line of text.split('\n')) {
    if (!line.startsWith('f ')) continue;
    const poly: number[] = [];
    for (const token of line.trim().split(/\s+/).slice(1)) {
      const first = Number(token.split('/')[0]);
      poly.push(first < 0 ? vertexCount + first : first - 1);
    }
    indices.push(...triangulate(poly, positions));
  }
  const materialIndices = new Uint8Array(indices.length / 3);
  for (let i = 0; i < materialIndices.length; i++) materialIndices[i] = i % 3;
  return {
    vertices: positions,
    indices: Uint32Array.from(indices),
    materialIndices,
  };
}

/** Loads `public/meshes/<name>`; undefined when unavailable. */
export async function loadTempMesh(
  name: string,
  scale: number,
  zUp: boolean,
): Promise<TempMesh | undefined> {
  const text = await fetchText(`meshes/${name}`);
  return text === undefined ? undefined : parseObj(text, scale, zUp);
}

/** Wraps a library mesh so `scene.mesh` can attach and draw it. */
export function wrapMesh(mesh: Mesh): MeshData {
  const geometry = mesh.getGeometry();
  return {
    resource: mesh,
    vertices: geometry.positions,
    indices: geometry.indices,
    clockwise: false,
  };
}

/** A one-point shape proxy with a radius (the library's sphereProxy, without a value import). */
export function sphereProxy(radius: number): {
  points: number[];
  radius: number;
} {
  return { points: [0, 0, 0], radius };
}

// ---- upstream random (shared/utils.h) ------------------------------------

const RAND_LIMIT = 32767;
export const RAND_SEED = 12345;

/** The xorshift32 generator of shared/utils.h, so scenes match upstream's. */
export class UpstreamRandom {
  constructor(public seed = RAND_SEED) {}

  int(): number {
    let x = this.seed >>> 0;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    this.seed = x;
    return x % (RAND_LIMIT + 1);
  }

  /** [lo, hi] */
  range(lo: number, hi: number): number {
    const r = (this.int() & RAND_LIMIT) / RAND_LIMIT;
    return (hi - lo) * r + lo;
  }

  vec3(lo: Vec3, hi: Vec3): Vec3 {
    return {
      x: this.range(lo.x, hi.x),
      y: this.range(lo.y, hi.y),
      z: this.range(lo.z, hi.z),
    };
  }

  unitVector(): Vec3 {
    const u1 = this.range(0, 1);
    const u2 = this.range(0, 2 * Math.PI);
    const u3 = this.range(0, 2 * Math.PI);
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3) };
  }

  quat(): Quat {
    const u1 = this.range(0, 1);
    const u2 = this.range(0, 2 * Math.PI);
    const u3 = this.range(0, 2 * Math.PI);
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    return {
      x: a * Math.sin(u2),
      y: a * Math.cos(u2),
      z: b * Math.sin(u3),
      w: b * Math.cos(u3),
    };
  }
}

// ---- baking children into one mesh visual ------------------------------

/** Accumulates triangles (already in the body frame) for one merged mesh visual. */
export class TriangleBaker {
  private readonly vertices: number[] = [];
  private readonly indices: number[] = [];

  /** An oriented box with 12 triangles. */
  addBox(halfExtents: Vec3, position: Vec3, rotation: Quat): void {
    const base = this.vertices.length / 3;
    for (let i = 0; i < 8; i++) {
      const local = {
        x: i & 1 ? halfExtents.x : -halfExtents.x,
        y: i & 2 ? halfExtents.y : -halfExtents.y,
        z: i & 4 ? halfExtents.z : -halfExtents.z,
      };
      const p = rotate(rotation, local);
      this.vertices.push(p.x + position.x, p.y + position.y, p.z + position.z);
    }
    // counter-clockwise seen from outside; corner index bits are x, y, z
    const quads = [
      [1, 3, 7, 5], // +x
      [0, 4, 6, 2], // -x
      [2, 6, 7, 3], // +y
      [0, 1, 5, 4], // -y
      [4, 5, 7, 6], // +z
      [0, 2, 3, 1], // -z
    ];
    for (const q of quads) {
      const [a = 0, b = 0, c = 0, d = 0] = q;
      this.indices.push(
        base + a,
        base + b,
        base + c,
        base + a,
        base + c,
        base + d,
      );
    }
  }

  /** A triangle mesh placed with a scale, rotation and position (scale applied first). */
  addMesh(
    vertices: ArrayLike<number>,
    indices: ArrayLike<number>,
    position: Vec3,
    rotation: Quat,
    scale: Vec3,
  ): void {
    const base = this.vertices.length / 3;
    for (let i = 0; i < vertices.length; i += 3) {
      const p = rotate(rotation, {
        x: (vertices[i] ?? 0) * scale.x,
        y: (vertices[i + 1] ?? 0) * scale.y,
        z: (vertices[i + 2] ?? 0) * scale.z,
      });
      this.vertices.push(p.x + position.x, p.y + position.y, p.z + position.z);
    }
    const flip = (scale.x < 0 !== scale.y < 0) !== scale.z < 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = base + (indices[i] ?? 0);
      const b = base + (indices[i + 1] ?? 0);
      const c = base + (indices[i + 2] ?? 0);
      this.indices.push(a, flip ? c : b, flip ? b : c);
    }
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  visual(): ShapeVisual {
    return {
      kind: 'mesh',
      vertices: Float32Array.from(this.vertices),
      indices: Uint32Array.from(this.indices),
      scale: { x: 1, y: 1, z: 1 },
      clockwise: false,
    };
  }
}

/** Euler-angle composition used by the hull samples: qz * qy * qx. */
export function eulerZYX(xDeg: number, yDeg: number, zDeg: number): Quat {
  const h = (deg: number): number => 0.5 * ((deg * Math.PI) / 180);
  const qx = { x: Math.sin(h(xDeg)), y: 0, z: 0, w: Math.cos(h(xDeg)) };
  const qy = { x: 0, y: Math.sin(h(yDeg)), z: 0, w: Math.cos(h(yDeg)) };
  const qz = { x: 0, y: 0, z: Math.sin(h(zDeg)), w: Math.cos(h(zDeg)) };
  return mulQuat(qz, mulQuat(qy, qx));
}

// ---- debug canvas drawing --------------------------------------------------

/** upstream DrawAxes: red x, green y, blue z lines of length `scale`. */
export function drawAxes(
  canvas: DebugCanvas,
  origin: Vec3,
  scale: number,
): void {
  canvas.line(origin, { ...origin, x: origin.x + scale }, COLOR.red);
  canvas.line(origin, { ...origin, y: origin.y + scale }, COLOR.green);
  canvas.line(origin, { ...origin, z: origin.z + scale }, COLOR.blue);
}

/** Three great circles standing in for DrawSolidSphere. */
export function drawSphere(
  canvas: DebugCanvas,
  center: Vec3,
  radius: number,
  color: number,
  segments = 24,
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * (i + 1)) / segments;
    const c0 = radius * Math.cos(a0);
    const s0 = radius * Math.sin(a0);
    const c1 = radius * Math.cos(a1);
    const s1 = radius * Math.sin(a1);
    const { x, y, z } = center;
    canvas.line(
      { x: x + c0, y: y + s0, z },
      { x: x + c1, y: y + s1, z },
      color,
    );
    canvas.line(
      { x: x + c0, y, z: z + s0 },
      { x: x + c1, y, z: z + s1 },
      color,
    );
    canvas.line(
      { x, y: y + c0, z: z + s0 },
      { x, y: y + c1, z: z + s1 },
      color,
    );
  }
}

/** A capsule outline (DrawSolidCapsule stand-in): end spheres plus four side lines. */
export function drawCapsule(
  canvas: DebugCanvas,
  c1: Vec3,
  c2: Vec3,
  radius: number,
  color: number,
): void {
  drawSphere(canvas, c1, radius, color);
  drawSphere(canvas, c2, radius, color);
  // sides assume the segment is mostly along x, y or z; offsets are in the two other axes
  const d = { x: c2.x - c1.x, y: c2.y - c1.y, z: c2.z - c1.z };
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const az = Math.abs(d.z);
  const offsets: Vec3[] =
    ax >= ay && ax >= az
      ? [
          { x: 0, y: radius, z: 0 },
          { x: 0, y: -radius, z: 0 },
          { x: 0, y: 0, z: radius },
          { x: 0, y: 0, z: -radius },
        ]
      : ay >= az
        ? [
            { x: radius, y: 0, z: 0 },
            { x: -radius, y: 0, z: 0 },
            { x: 0, y: 0, z: radius },
            { x: 0, y: 0, z: -radius },
          ]
        : [
            { x: radius, y: 0, z: 0 },
            { x: -radius, y: 0, z: 0 },
            { x: 0, y: radius, z: 0 },
            { x: 0, y: -radius, z: 0 },
          ];
  for (const o of offsets) {
    canvas.line(
      { x: c1.x + o.x, y: c1.y + o.y, z: c1.z + o.z },
      { x: c2.x + o.x, y: c2.y + o.y, z: c2.z + o.z },
      color,
    );
  }
}

// ---- hull outlines -----------------------------------------------------------

export interface HullOutline {
  /** Flat xyz pairs: one feature edge per six numbers. */
  lines: Float32Array;
  vertexCount: number;
  faceCount: number;
  edgeCount: number;
  surfaceArea: number;
  /** Radius of the largest sphere around the centroid that fits inside. */
  innerRadius: number;
}

/**
 * Reduces a hull's triangles (Hull.getGeometry) to its feature edges (the
 * upstream DrawHull outline) and the counts upstream prints. Coplanar
 * triangles merge into one face.
 */
export function hullOutline(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): HullOutline {
  const triangleCount = indices.length / 3;
  const normals: Vec3[] = [];
  let area = 0;
  const point = (i: number): Vec3 => ({
    x: positions[3 * i] ?? 0,
    y: positions[3 * i + 1] ?? 0,
    z: positions[3 * i + 2] ?? 0,
  });
  const centroid = { x: 0, y: 0, z: 0 };
  const vertexCount = positions.length / 3;
  for (let i = 0; i < vertexCount; i++) {
    const p = point(i);
    centroid.x += p.x / vertexCount;
    centroid.y += p.y / vertexCount;
    centroid.z += p.z / vertexCount;
  }
  let innerRadius = Infinity;
  for (let t = 0; t < triangleCount; t++) {
    const a = point(indices[3 * t] ?? 0);
    const b = point(indices[3 * t + 1] ?? 0);
    const c = point(indices[3 * t + 2] ?? 0);
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const len = Math.hypot(n.x, n.y, n.z);
    area += 0.5 * len;
    if (len > 1e-12) {
      n.x /= len;
      n.y /= len;
      n.z /= len;
      const d =
        n.x * (a.x - centroid.x) +
        n.y * (a.y - centroid.y) +
        n.z * (a.z - centroid.z);
      innerRadius = Math.min(innerRadius, Math.abs(d));
    }
    normals.push(len > 1e-12 ? n : { x: 0, y: 0, z: 0 });
  }

  const edges = new Map<string, number[]>();
  const addEdge = (a: number, b: number, t: number): void => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const list = edges.get(key);
    if (list) list.push(t);
    else edges.set(key, [t]);
  };
  for (let t = 0; t < triangleCount; t++) {
    const a = indices[3 * t] ?? 0;
    const b = indices[3 * t + 1] ?? 0;
    const c = indices[3 * t + 2] ?? 0;
    addEdge(a, b, t);
    addEdge(b, c, t);
    addEdge(c, a, t);
  }

  const parent = Array.from({ length: triangleCount }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    return r;
  };
  const lines: number[] = [];
  let edgeCount = 0;
  for (const [key, tris] of edges) {
    const [ka, kb] = key.split(':').map(Number);
    const first = tris[0];
    const second = tris[1];
    let feature = true;
    if (first !== undefined && second !== undefined) {
      const n1 = normals[first] ?? { x: 0, y: 0, z: 0 };
      const n2 = normals[second] ?? { x: 0, y: 0, z: 0 };
      const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
      if (dot > 0.99999) {
        feature = false;
        parent[find(first)] = find(second);
      }
    }
    if (!feature) continue;
    edgeCount++;
    const a = point(ka ?? 0);
    const b = point(kb ?? 0);
    lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const faces = new Set<number>();
  for (let t = 0; t < triangleCount; t++) faces.add(find(t));

  return {
    lines: Float32Array.from(lines),
    vertexCount,
    faceCount: faces.size,
    edgeCount,
    surfaceArea: area,
    innerRadius: Number.isFinite(innerRadius) ? innerRadius : 0,
  };
}

/** Draws a hull outline translated by `offset`. */
export function drawOutline(
  canvas: DebugCanvas,
  outline: HullOutline,
  color: number,
  offset: Vec3 = { x: 0, y: 0, z: 0 },
): void {
  const l = outline.lines;
  for (let i = 0; i < l.length; i += 6) {
    canvas.line(
      {
        x: (l[i] ?? 0) + offset.x,
        y: (l[i + 1] ?? 0) + offset.y,
        z: (l[i + 2] ?? 0) + offset.z,
      },
      {
        x: (l[i + 3] ?? 0) + offset.x,
        y: (l[i + 4] ?? 0) + offset.y,
        z: (l[i + 5] ?? 0) + offset.z,
      },
      color,
    );
  }
}
