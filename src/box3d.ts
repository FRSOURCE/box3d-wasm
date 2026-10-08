import {
  type Compound,
  type CompoundOptions,
  createCompound,
  createGridHeightField,
  createHeightField,
  createWaveHeightField,
  geometryBuilders,
  type Hull,
  createMesh,
  type HeightField,
  type HeightFieldOptions,
  type Mesh,
  type MeshOptions,
} from './geometry.js';
import {
  type CollisionPlane,
  clipVector,
  type PlaneSolverResult,
  solvePlanes,
} from './mover.js';
import { Collision } from './collision.js';
import { boxProxy, capsuleProxy, sphereProxy } from './proxy.js';
import { Runtime, type Flavour, type WasmModule } from './runtime/module.js';
import type { Vec3, WorldOptions } from './types.js';
import { World } from './world.js';

/** Options forwarded to the emscripten module factory. */
export interface ModuleOptions {
  /** Resolves the .wasm (and the worker script in the deluxe build) when the default URL does not fit the host. */
  locateFile?: (path: string, prefix: string) => string;
  /** Deluxe only: worker threads to pre-spawn. Default min(8, hardwareConcurrency - 1). */
  pthreadPoolSize?: number;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

/** What the package's default export resolves to. */
export interface Box3D {
  /** `new b3.World(options)` creates a world bound to this module. */
  readonly World: new (options?: WorldOptions) => World;
  /** Builds a triangle mesh once; attach it to static bodies with `body.createMesh`. Release it when done. */
  createMesh(options: MeshOptions): Mesh;
  /** Builds a terrain once; attach it to a static body with `body.createHeightField`. Release it when done. */
  createHeightField(options: HeightFieldOptions): HeightField;
  /** A convex hull from points (at least four, not coplanar), reusable across shapes. */
  createHull(points: ArrayLike<number> | Vec3[], maxVertices?: number): Hull;
  createCylinder(
    height: number,
    radius: number,
    yOffset?: number,
    sides?: number,
  ): Hull;
  createCone(
    height: number,
    radius1: number,
    radius2: number,
    slices?: number,
  ): Hull;
  createRock(radius: number): Hull;
  createComplexHull(radius: number): Hull;
  createBoxMesh(center: Vec3, extent: Vec3, identifyEdges?: boolean): Mesh;
  createHollowBoxMesh(center: Vec3, extent: Vec3): Mesh;
  createPlatformMesh(
    center: Vec3,
    height: number,
    topWidth: number,
    bottomWidth: number,
  ): Mesh;
  createGridMesh(
    xCount: number,
    zCount: number,
    cellWidth: number,
    materialCount?: number,
    identifyEdges?: boolean,
  ): Mesh;
  createWaveMesh(
    xCount: number,
    zCount: number,
    cellWidth: number,
    amplitude: number,
    rowFrequency: number,
    columnFrequency: number,
  ): Mesh;
  createTorusMesh(
    radialResolution: number,
    tubularResolution: number,
    radius: number,
    thickness: number,
  ): Mesh;
  /** The engine's procedural grid terrain (rows by columns of cells, scaled), optionally with holes. */
  createGridHeightField(
    rowCount: number,
    columnCount: number,
    scale: Vec3,
    makeHoles?: boolean,
  ): HeightField;
  /** The engine's procedural wave terrain. */
  createWaveHeightField(
    rowCount: number,
    columnCount: number,
    scale: Vec3,
    rowFrequency: number,
    columnFrequency: number,
    makeHoles?: boolean,
  ): HeightField;
  /** Bakes spheres, capsules, hulls and meshes into one static shape (attach with `body.createCompound`). */
  createCompound(options: CompoundOptions): Compound;
  /** Standalone collision and geometry queries on primitives, without a world. */
  readonly collision: Collision;
  /** Builders for the shape proxies that casts and overlap tests take. */
  readonly proxy: {
    sphere: typeof sphereProxy;
    capsule: typeof capsuleProxy;
    box: typeof boxProxy;
  };
  /**
   * Engine-wide settings. Set the length units before creating any world; they
   * scale the engine's tolerances (default 1, meaning metres).
   */
  lengthUnitsPerMeter: number;
  /** Seconds a step may stall before the engine reports it. */
  stallThreshold: number;
  /** Most contact points in one manifold. */
  readonly maxManifoldPoints: number;
  /** True when the engine was built with double precision positions. */
  readonly doublePrecision: boolean;
  /** Worlds alive right now. */
  readonly worldCount: number;
  /** Solves the mover translation that satisfies the planes. Each plane's `push` is updated in place. */
  solvePlanes(targetDelta: Vec3, planes: CollisionPlane[]): PlaneSolverResult;
  /** Clips a velocity against planes that have a push and clipVelocity set. */
  clipVector(vector: Vec3, planes: readonly CollisionPlane[], out?: Vec3): Vec3;
  /** True for the deluxe (wasm threads) build. */
  readonly threaded: boolean;
  /** Largest workerCount a world can use, the calling thread included. 1 in the standard build. */
  readonly maxWorkers: number;
  readonly flavour: Flavour;
  readonly version: {
    /** Box3D's own version, major.minor.revision. */
    readonly engine: string;
    /** The commit of erincatto/box3d this build was compiled from. */
    readonly engineSha: string;
  };
  /** The emscripten module, for calling the shim directly. */
  readonly raw: WasmModule;
}

export function createBox3D(m: WasmModule, flavour: Flavour): Box3D {
  const rt = new Runtime(m, flavour);
  if (flavour === 'deluxe') {
    const pthread = (m as { PThread?: { unusedWorkers?: unknown[] } }).PThread;
    m._bx_SetWorkerPool(pthread?.unusedWorkers?.length ?? 0);
  }
  const code = m._bx_GetVersion();
  const engine = `${Math.floor(code / 10000)}.${Math.floor(code / 100) % 100}.${code % 100}`;
  const BoundWorld = class extends World {
    constructor(options?: WorldOptions) {
      super(rt, options);
    }
  };
  return {
    get lengthUnitsPerMeter() {
      return m._bx_GetLengthUnitsPerMeter();
    },
    set lengthUnitsPerMeter(value: number) {
      if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(
          'box3d: lengthUnitsPerMeter must be a positive number',
        );
      }
      m._bx_SetLengthUnitsPerMeter(value);
    },
    get stallThreshold() {
      return m._bx_GetStallThreshold();
    },
    set stallThreshold(value: number) {
      m._bx_SetStallThreshold(value);
    },
    maxManifoldPoints: m._bx_GetMaxManifoldPoints(),
    doublePrecision: m._bx_IsDoublePrecision() !== 0,
    get worldCount() {
      return m._bx_GetWorldCount();
    },
    World: BoundWorld,
    collision: new Collision(rt),
    createHull: (points, maxVertices) =>
      geometryBuilders.hull(rt, points, maxVertices),
    createCylinder: (h, r, y, n) => geometryBuilders.cylinder(rt, h, r, y, n),
    createCone: (h, r1, r2, n) => geometryBuilders.cone(rt, h, r1, r2, n),
    createRock: (r) => geometryBuilders.rock(rt, r),
    createComplexHull: (r) => geometryBuilders.complexHull(rt, r),
    createBoxMesh: (c, e, i) => geometryBuilders.boxMesh(rt, c, e, i),
    createHollowBoxMesh: (c, e) => geometryBuilders.hollowBoxMesh(rt, c, e),
    createPlatformMesh: (c, h, t, b) =>
      geometryBuilders.platformMesh(rt, c, h, t, b),
    createGridMesh: (x, z, w, m, i) =>
      geometryBuilders.gridMesh(rt, x, z, w, m, i),
    createWaveMesh: (x, z, w, a, rf, cf) =>
      geometryBuilders.waveMesh(rt, x, z, w, a, rf, cf),
    createTorusMesh: (r, t, rad, th) =>
      geometryBuilders.torusMesh(rt, r, t, rad, th),
    createCompound: (options) => createCompound(rt, options),
    createGridHeightField: (r, c, s, h) =>
      createGridHeightField(rt, r, c, s, h),
    createWaveHeightField: (r, c, s, rf, cf, h) =>
      createWaveHeightField(rt, r, c, s, rf, cf, h),
    solvePlanes: (targetDelta, planes) => solvePlanes(rt, targetDelta, planes),
    clipVector: (vector, planes, out) => clipVector(rt, vector, planes, out),
    proxy: { sphere: sphereProxy, capsule: capsuleProxy, box: boxProxy },
    createMesh: (options) => createMesh(rt, options),
    createHeightField: (options) => createHeightField(rt, options),
    threaded: flavour === 'deluxe',
    maxWorkers: m._bx_GetMaxWorkers(),
    flavour,
    version: { engine, engineSha: rt.string(m._bx_GetEngineSha()) },
    raw: m,
  };
}
