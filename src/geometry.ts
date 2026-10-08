import type { Runtime } from './runtime/module.js';
import type { Quat, ShapeOptions, Vec3 } from './types.js';

export interface MeshOptions {
  /** Flat xyz array (three floats per vertex), at least three vertices. */
  vertices: ArrayLike<number>;
  /** Three vertex indices per triangle, counter-clockwise unless `clockwise` is set. */
  indices: ArrayLike<number>;
  /** Merge vertices closer than `weldTolerance`. */
  weld?: boolean;
  /** Default 0.001 length units. */
  weldTolerance?: number;
  /** Faster build for grid-like meshes. */
  medianSplit?: boolean;
  /** Compute shared-edge adjacency, which smooths collision across triangle seams. */
  identifyEdges?: boolean;
  clockwise?: boolean;
  /** One material index per triangle, indexing the `materials` given to `body.createMesh`. */
  materialIndices?: ArrayLike<number>;
}

export interface MeshShapeOptions extends ShapeOptions {
  /** Non-uniform, may be negative; no component may be tiny. Default 1,1,1. */
  scale?: Vec3;
}

export interface HeightFieldOptions {
  /** countX * countZ heights, row-major along x. */
  heights: ArrayLike<number>;
  countX: number;
  countZ: number;
  /** Cell materials, (countX - 1) * (countZ - 1) bytes. 0xFF marks a hole. */
  materialIndices?: ArrayLike<number>;
  /** All components positive. Default 1,1,1. */
  scale?: Vec3;
  /** Quantisation range; share it between neighbouring fields so they line up. Defaults to the data range. */
  minHeight?: number;
  maxHeight?: number;
  clockwise?: boolean;
}

/** Shared immutable data referenced by shapes. Release it when you are done; it is freed once no shape uses it. */
abstract class Resource {
  private released = false;

  constructor(
    protected readonly rt: Runtime,
    /** @internal */
    readonly slot: number,
  ) {}

  get alive(): boolean {
    return !this.released;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.rt.m._bx_Resource_Release(this.slot);
  }
}

/** Triangles for rendering: positions are xyz triples, indices are counter-clockwise triples. */
export interface Geometry {
  positions: Float32Array;
  indices: Uint32Array;
}

function readGeometry(rt: Runtime, vertexCount: number): Geometry {
  if (vertexCount === 0)
    return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const mem = rt.mem.views();
  const vertexPtr = rt.m._bx_Geometry_Vertices() >> 2;
  const indexPtr = rt.m._bx_Geometry_Indices() >> 2;
  const indexCount = rt.m._bx_Geometry_IndexCount();
  return {
    positions: mem.f32.slice(vertexPtr, vertexPtr + vertexCount * 3),
    indices: Uint32Array.from(
      mem.i32.subarray(indexPtr, indexPtr + indexCount),
    ),
  };
}

/** A triangle mesh. Meshes only collide as shapes of static bodies. */
export class Mesh extends Resource {
  /** A copy of the mesh triangles, for rendering. */
  getGeometry(): Geometry {
    return readGeometry(this.rt, this.rt.m._bx_Resource_GetGeometry(this.slot));
  }

  /** Height of the mesh bounding volume hierarchy, for diagnostics. */
  getBvhHeight(): number {
    return this.rt.m._bx_Mesh_GetHeight(this.slot);
  }
}

/** A convex hull, reusable across shapes and bodies. The world copies it, so it can be released right after use. */
export class Hull extends Resource {
  /** A copy of the hull faces as triangles, for rendering. */
  getGeometry(): Geometry {
    return readGeometry(this.rt, this.rt.m._bx_Resource_GetGeometry(this.slot));
  }

  /** An independent copy of the hull. */
  clone(): Hull {
    const slot = this.rt.m._bx_Hull_Clone(this.slot);
    if (slot === 0) throw new Error('box3d: could not clone the hull');
    return new Hull(this.rt, slot);
  }

  /** A new hull with this one rotated, offset and scaled. */
  transformed(
    options: { position?: Vec3; rotation?: Quat; scale?: Vec3 } = {},
  ): Hull {
    const p = options.position ?? { x: 0, y: 0, z: 0 };
    const q = options.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    const sc = options.scale ?? { x: 1, y: 1, z: 1 };
    const slot = this.rt.m._bx_CloneHull(
      this.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
      sc.x,
      sc.y,
      sc.z,
    );
    if (slot === 0) throw new Error('box3d: could not transform the hull');
    return new Hull(this.rt, slot);
  }
}

/** A baked compound of spheres, capsules, hulls and meshes. Only allowed on static bodies. */
export class Compound extends Resource {}

export interface HullShapeOptions extends ShapeOptions {
  position?: Vec3;
  rotation?: Quat;
  /** Non-uniform scale applied to the hull. */
  scale?: Vec3;
}

export interface CompoundOptions {
  spheres?: { center: Vec3; radius: number }[];
  capsules?: { center1: Vec3; center2: Vec3; radius: number }[];
  hulls?: { hull: Hull; position?: Vec3; rotation?: Quat }[];
  meshes?: { mesh: Mesh; position?: Vec3; rotation?: Quat; scale?: Vec3 }[];
}

/** A height field terrain. Only allowed on static bodies. */
export class HeightField extends Resource {}

/** Copies a typed array into a temporary wasm allocation for the duration of fn. */
function withUpload<T>(
  rt: Runtime,
  values: ArrayLike<number>,
  kind: 'f32' | 'i32' | 'u8',
  fn: (ptr: number) => T,
): T {
  const bytes = kind === 'u8' ? values.length : values.length * 4;
  const ptr = rt.m._bx_Alloc(Math.max(bytes, 4));
  try {
    const mem = rt.mem.views();
    if (kind === 'f32') mem.f32.set(values, ptr >> 2);
    else if (kind === 'i32') mem.i32.set(values, ptr >> 2);
    else mem.u8.set(values, ptr);
    return fn(ptr);
  } finally {
    rt.m._bx_Free(ptr);
  }
}

export function createMesh(rt: Runtime, options: MeshOptions): Mesh {
  const { vertices, indices } = options;
  if (vertices.length % 3 !== 0 || vertices.length < 9) {
    throw new RangeError(
      'box3d: a mesh needs at least three vertices (flat xyz array)',
    );
  }
  if (indices.length % 3 !== 0 || indices.length < 3) {
    throw new RangeError(
      'box3d: a mesh needs at least one triangle (three indices each)',
    );
  }
  const vertexCount = vertices.length / 3;
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(
        `box3d: mesh index ${index} at ${i} is outside 0..${vertexCount - 1}`,
      );
    }
  }
  for (let i = 0; i < vertices.length; i++) {
    if (!Number.isFinite(vertices[i]))
      throw new RangeError('box3d: mesh vertices must be finite');
  }
  const flags =
    (options.weld ? 1 : 0) |
    (options.medianSplit ? 2 : 0) |
    (options.identifyEdges ? 4 : 0) |
    (options.clockwise ? 8 : 0);
  const triangleCount = indices.length / 3;
  if (
    options.materialIndices &&
    options.materialIndices.length !== triangleCount
  ) {
    throw new RangeError(
      `box3d: expected ${triangleCount} triangle material indices, got ${options.materialIndices.length}`,
    );
  }
  const create = (materialsPtr: number): number =>
    withUpload(rt, vertices, 'f32', (vp) =>
      withUpload(rt, indices, 'i32', (ip) =>
        rt.m._bx_CreateMesh(
          vp,
          vertexCount,
          ip,
          triangleCount,
          flags,
          options.weldTolerance ?? 0.001,
          materialsPtr,
        ),
      ),
    );
  const slot = options.materialIndices
    ? withUpload(rt, options.materialIndices, 'u8', create)
    : create(0);
  if (slot === 0)
    throw new Error(
      'box3d: the engine could not build the mesh (degenerate triangles?)',
    );
  return new Mesh(rt, slot);
}

export function createHeightField(
  rt: Runtime,
  options: HeightFieldOptions,
): HeightField {
  const { heights, countX, countZ } = options;
  if (
    !Number.isInteger(countX) ||
    !Number.isInteger(countZ) ||
    countX < 2 ||
    countZ < 2
  ) {
    throw new RangeError(
      'box3d: a height field needs countX and countZ of at least 2',
    );
  }
  if (heights.length !== countX * countZ) {
    throw new RangeError(
      `box3d: expected ${countX * countZ} heights, got ${heights.length}`,
    );
  }
  const cells = (countX - 1) * (countZ - 1);
  if (options.materialIndices && options.materialIndices.length !== cells) {
    throw new RangeError(
      `box3d: expected ${cells} cell materials, got ${options.materialIndices.length}`,
    );
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (!Number.isFinite(h))
      throw new RangeError('box3d: heights must be finite');
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const scale = options.scale ?? { x: 1, y: 1, z: 1 };
  if (!(scale.x > 0 && scale.y > 0 && scale.z > 0)) {
    throw new RangeError('box3d: height field scale must be positive');
  }
  const create = (materialsPtr: number): number =>
    withUpload(rt, heights, 'f32', (hp) =>
      rt.m._bx_CreateHeightField(
        hp,
        materialsPtr,
        countX,
        countZ,
        scale.x,
        scale.y,
        scale.z,
        options.minHeight ?? min,
        options.maxHeight ?? max,
        options.clockwise ? 1 : 0,
      ),
    );
  const slot = options.materialIndices
    ? withUpload(rt, options.materialIndices, 'u8', create)
    : create(0);
  if (slot === 0)
    throw new Error('box3d: the engine could not build the height field');
  return new HeightField(rt, slot);
}

const IDENTITY_Q: Quat = { x: 0, y: 0, z: 0, w: 1 };
const ZERO_V: Vec3 = { x: 0, y: 0, z: 0 };
const ONE_V: Vec3 = { x: 1, y: 1, z: 1 };

function hullFrom(rt: Runtime, slot: number, what: string): Hull {
  if (slot === 0)
    throw new Error(`box3d: the engine could not build the ${what}`);
  return new Hull(rt, slot);
}

function meshFrom(rt: Runtime, slot: number, what: string): Mesh {
  if (slot === 0)
    throw new Error(`box3d: the engine could not build the ${what}`);
  return new Mesh(rt, slot);
}

export function createHullResource(
  rt: Runtime,
  points: ArrayLike<number> | Vec3[],
  maxVertices = 32,
): Hull {
  const flat = flattenPoints(points);
  if (flat.length % 3 !== 0 || flat.length < 12) {
    throw new RangeError('box3d: a hull needs at least four 3D points');
  }
  if (!Number.isInteger(maxVertices) || maxVertices < 4 || maxVertices > 128) {
    throw new RangeError('box3d: maxVertices must be an integer from 4 to 128');
  }
  const slot = withUpload(rt, flat, 'f32', (ptr) =>
    rt.m._bx_CreateHull(ptr, flat.length / 3, maxVertices),
  );
  return hullFrom(rt, slot, 'hull (coplanar or degenerate points?)');
}

function flattenPoints(points: ArrayLike<number> | Vec3[]): ArrayLike<number> {
  if (points.length > 0 && typeof points[0] === 'object') {
    const list = points as Vec3[];
    const flat = new Float32Array(list.length * 3);
    list.forEach((p, i) => {
      flat[i * 3] = p.x;
      flat[i * 3 + 1] = p.y;
      flat[i * 3 + 2] = p.z;
    });
    return flat;
  }
  return points as ArrayLike<number>;
}

export const geometryBuilders = {
  hull: createHullResource,
  cylinder: (
    rt: Runtime,
    height: number,
    radius: number,
    yOffset = 0,
    sides = 16,
  ): Hull =>
    hullFrom(
      rt,
      rt.m._bx_CreateCylinderHull(height, radius, yOffset, sides),
      'cylinder',
    ),
  cone: (
    rt: Runtime,
    height: number,
    radius1: number,
    radius2: number,
    slices = 16,
  ): Hull =>
    hullFrom(
      rt,
      rt.m._bx_CreateConeHull(height, radius1, radius2, slices),
      'cone',
    ),
  rock: (rt: Runtime, radius: number): Hull =>
    hullFrom(rt, rt.m._bx_CreateRockHull(radius), 'rock'),
  complexHull: (rt: Runtime, radius: number): Hull =>
    hullFrom(rt, rt.m._bx_CreateComplexHull(radius), 'hull'),
  boxMesh: (
    rt: Runtime,
    center: Vec3,
    extent: Vec3,
    identifyEdges = false,
  ): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreateBoxMesh(
        center.x,
        center.y,
        center.z,
        extent.x,
        extent.y,
        extent.z,
        identifyEdges ? 1 : 0,
      ),
      'box mesh',
    ),
  hollowBoxMesh: (rt: Runtime, center: Vec3, extent: Vec3): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreateHollowBoxMesh(
        center.x,
        center.y,
        center.z,
        extent.x,
        extent.y,
        extent.z,
      ),
      'hollow box mesh',
    ),
  platformMesh: (
    rt: Runtime,
    center: Vec3,
    height: number,
    topWidth: number,
    bottomWidth: number,
  ): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreatePlatformMesh(
        center.x,
        center.y,
        center.z,
        height,
        topWidth,
        bottomWidth,
      ),
      'platform mesh',
    ),
  gridMesh: (
    rt: Runtime,
    xCount: number,
    zCount: number,
    cellWidth: number,
    materialCount = 1,
    identifyEdges = false,
  ): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreateGridMesh(
        xCount,
        zCount,
        cellWidth,
        materialCount,
        identifyEdges ? 1 : 0,
      ),
      'grid mesh',
    ),
  waveMesh: (
    rt: Runtime,
    xCount: number,
    zCount: number,
    cellWidth: number,
    amplitude: number,
    rowFrequency: number,
    columnFrequency: number,
  ): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreateWaveMesh(
        xCount,
        zCount,
        cellWidth,
        amplitude,
        rowFrequency,
        columnFrequency,
      ),
      'wave mesh',
    ),
  torusMesh: (
    rt: Runtime,
    radialResolution: number,
    tubularResolution: number,
    radius: number,
    thickness: number,
  ): Mesh =>
    meshFrom(
      rt,
      rt.m._bx_CreateTorusMesh(
        radialResolution,
        tubularResolution,
        radius,
        thickness,
      ),
      'torus mesh',
    ),
};

export function createCompound(
  rt: Runtime,
  options: CompoundOptions,
): Compound {
  const spheres: number[] = [];
  for (const s of options.spheres ?? [])
    spheres.push(s.center.x, s.center.y, s.center.z, s.radius);
  const capsules: number[] = [];
  for (const c of options.capsules ?? []) {
    capsules.push(
      c.center1.x,
      c.center1.y,
      c.center1.z,
      c.center2.x,
      c.center2.y,
      c.center2.z,
      c.radius,
    );
  }
  const hulls: number[] = [];
  for (const h of options.hulls ?? []) {
    if (!h.hull.alive) throw new Error('box3d: hull was released');
    const p = h.position ?? ZERO_V;
    const q = h.rotation ?? IDENTITY_Q;
    hulls.push(h.hull.slot, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  }
  const meshes: number[] = [];
  for (const m of options.meshes ?? []) {
    if (!m.mesh.alive) throw new Error('box3d: mesh was released');
    const p = m.position ?? ZERO_V;
    const q = m.rotation ?? IDENTITY_Q;
    const sc = m.scale ?? ONE_V;
    meshes.push(
      m.mesh.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
      sc.x,
      sc.y,
      sc.z,
    );
  }
  const count =
    spheres.length / 4 +
    capsules.length / 7 +
    hulls.length / 8 +
    meshes.length / 11;
  if (count === 0)
    throw new RangeError('box3d: a compound needs at least one child');
  // four separate uploads; each stays alive until the call returns
  const slot = withUpload(rt, spheres, 'f32', (sp) =>
    withUpload(rt, capsules, 'f32', (cp) =>
      withUpload(rt, hulls, 'f32', (hp) =>
        withUpload(rt, meshes, 'f32', (mp) =>
          rt.m._bx_CreateCompound(
            sp,
            spheres.length / 4,
            cp,
            capsules.length / 7,
            hp,
            hulls.length / 8,
            mp,
            meshes.length / 11,
          ),
        ),
      ),
    ),
  );
  if (slot === 0)
    throw new Error('box3d: the engine could not build the compound');
  return new Compound(rt, slot);
}

export function readShapeGeometry(rt: Runtime, shapeSlot: number): Geometry {
  return readGeometry(rt, rt.m._bx_Shape_GetGeometry(shapeSlot));
}

export function createGridHeightField(
  rt: Runtime,
  rowCount: number,
  columnCount: number,
  scale: Vec3,
  makeHoles = false,
): HeightField {
  const slot = rt.m._bx_CreateGridHeightField(
    rowCount,
    columnCount,
    scale.x,
    scale.y,
    scale.z,
    makeHoles ? 1 : 0,
  );
  if (slot === 0)
    throw new Error('box3d: the engine could not build the grid height field');
  return new HeightField(rt, slot);
}

export function createWaveHeightField(
  rt: Runtime,
  rowCount: number,
  columnCount: number,
  scale: Vec3,
  rowFrequency: number,
  columnFrequency: number,
  makeHoles = false,
): HeightField {
  const slot = rt.m._bx_CreateWaveHeightField(
    rowCount,
    columnCount,
    scale.x,
    scale.y,
    scale.z,
    rowFrequency,
    columnFrequency,
    makeHoles ? 1 : 0,
  );
  if (slot === 0)
    throw new Error('box3d: the engine could not build the wave height field');
  return new HeightField(rt, slot);
}
