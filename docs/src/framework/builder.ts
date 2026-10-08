// SceneBuilder is how samples create physics objects. Every body and shape it
// makes is recorded as a plain-data ShapeVisual; a SceneObserver (the three.js
// view in the browser, nothing under test) turns those into meshes. The class
// itself never touches three.js, so headless runs share all the sample logic.
import type {
  Body,
  BodyOptions,
  BodyType,
  BoxOptions,
  CapsuleOptions,
  HeightField,
  HeightFieldOptions,
  HullOptions,
  Mesh,
  MeshOptions,
  MeshShapeOptions,
  Quat,
  Shape,
  ShapeOptions,
  SphereOptions,
  Vec3,
  World,
} from '@frsource/box3d-wasm';
import { IDENTITY_QUAT } from './math.js';
import type { B3 } from './types.js';

export type ShapeVisual =
  | { kind: 'box'; halfExtents: Vec3; offset: Vec3; rotation: Quat }
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'capsule'; center1: Vec3; center2: Vec3; radius: number }
  | {
      kind: 'cylinder';
      radius: number;
      height: number;
      yOffset: number;
      sides: number;
    }
  | { kind: 'hull'; points: Float32Array }
  | {
      kind: 'mesh';
      vertices: Float32Array;
      indices: Uint32Array;
      scale: Vec3;
      clockwise: boolean;
    }
  | {
      kind: 'heightField';
      heights: Float32Array;
      countX: number;
      countZ: number;
      scale: Vec3;
      clockwise: boolean;
      /** Per-cell materials, (countX - 1) * (countZ - 1); 0xFF cells are holes. */
      materialIndices?: Uint8Array;
    };

export interface BodyEntry {
  readonly body: Body;
  type: BodyType;
  /** 0xRRGGBB override for the dynamic body colour. */
  color: number | undefined;
  readonly visuals: ShapeVisual[];
  asleep: boolean;
  /** Owned by the observer (the three.js object); the builder never reads it. */
  view?: unknown;
}

export interface SceneObserver {
  bodyAdded(entry: BodyEntry): void;
  shapeAdded(entry: BodyEntry, visual: ShapeVisual): void;
  /** Type or colour changed. */
  bodyChanged(entry: BodyEntry): void;
  bodyRemoved(entry: BodyEntry): void;
}

export interface BodySpec extends BodyOptions {
  /** 0xRRGGBB for a dynamic body; static and kinematic bodies use the type colours. */
  color?: number;
}

export interface CylinderOptions extends ShapeOptions {
  /** Along local +y from `yOffset`. */
  height: number;
  radius: number;
  /** Default 0, matching b3CreateCylinder. */
  yOffset?: number;
  /** 3 to 32. Default 16. */
  sides?: number;
}

/** A mesh built once and attachable to many static bodies. */
export interface MeshData {
  readonly resource: Mesh;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly clockwise: boolean;
}

export interface HeightFieldData {
  readonly resource: HeightField;
  readonly options: HeightFieldOptions & { heights: Float32Array };
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export class SceneBuilder {
  /** Tracked bodies in creation order. */
  readonly entries = new Map<Body, BodyEntry>();
  /** Bumped whenever a body is added or removed; views rebuild their batch on change. */
  revision = 0;
  private observer: SceneObserver | undefined;
  private readonly resources: (Mesh | HeightField)[] = [];
  private knownWorldBodies = 0;

  constructor(
    readonly world: World,
    readonly b3: B3,
  ) {}

  /** Attaches the view and replays what already exists. */
  observe(observer: SceneObserver): void {
    this.observer = observer;
    for (const entry of this.entries.values()) {
      observer.bodyAdded(entry);
      for (const visual of entry.visuals) observer.shapeAdded(entry, visual);
    }
  }

  get bodyCount(): number {
    return this.entries.size;
  }

  createBody(spec: BodySpec = {}): Body {
    const { color, ...options } = spec;
    const body = this.world.createBody(options);
    const entry: BodyEntry = {
      body,
      type: options.type ?? 'static',
      color,
      visuals: [],
      asleep: false,
    };
    this.entries.set(body, entry);
    this.revision++;
    this.observer?.bodyAdded(entry);
    return body;
  }

  /** Destroys the body (and its joints) and forgets its visuals. */
  destroyBody(body: Body): void {
    const entry = this.entries.get(body);
    if (entry) this.forget(entry);
    if (body.alive) body.destroy();
    this.knownWorldBodies = this.world.bodies.size;
  }

  /** Changes the body type and the colour that goes with it. */
  setBodyType(body: Body, type: BodyType): void {
    body.setType(type);
    const entry = this.entries.get(body);
    if (!entry) return;
    entry.type = type;
    this.observer?.bodyChanged(entry);
  }

  setBodyColor(body: Body, color: number | undefined): void {
    const entry = this.entries.get(body);
    if (!entry) return;
    entry.color = color;
    this.observer?.bodyChanged(entry);
  }

  entryOf(body: Body): BodyEntry | undefined {
    return this.entries.get(body);
  }

  /**
   * Drops entries whose body died behind the builder's back (a sample calling
   * `body.destroy()` directly). Cheap: it only scans when the world's body
   * count changed since the last look.
   */
  prune(): void {
    const count = this.world.bodies.size;
    if (count === this.knownWorldBodies) return;
    this.knownWorldBodies = count;
    for (const entry of [...this.entries.values()]) {
      if (!entry.body.alive) this.forget(entry);
    }
  }

  box(body: Body, options: BoxOptions = {}): Shape {
    const he = options.halfExtents;
    const halfExtents = {
      x: he?.x ?? options.hx ?? 0.5,
      y: he?.y ?? options.hy ?? 0.5,
      z: he?.z ?? options.hz ?? 0.5,
    };
    const shape = body.createBox(options);
    this.addVisual(body, {
      kind: 'box',
      halfExtents,
      offset: options.offset ?? ZERO,
      rotation: options.rotation ?? IDENTITY_QUAT,
    });
    return shape;
  }

  sphere(body: Body, options: SphereOptions = {}): Shape {
    const shape = body.createSphere(options);
    this.addVisual(body, {
      kind: 'sphere',
      center: options.center ?? ZERO,
      radius: options.radius ?? 0.5,
    });
    return shape;
  }

  capsule(body: Body, options: CapsuleOptions = {}): Shape {
    const shape = body.createCapsule(options);
    let center1 = options.center1 ?? { x: 0, y: -0.5, z: 0 };
    let center2 = options.center2 ?? { x: 0, y: 0.5, z: 0 };
    if (options.height !== undefined) {
      center1 = { x: 0, y: -0.5 * options.height, z: 0 };
      center2 = { x: 0, y: 0.5 * options.height, z: 0 };
    }
    this.addVisual(body, {
      kind: 'capsule',
      center1,
      center2,
      radius: options.radius ?? 0.5,
    });
    return shape;
  }

  hull(body: Body, options: HullOptions): Shape {
    const shape = body.createHull(options);
    this.addVisual(body, { kind: 'hull', points: flatPoints(options.points) });
    return shape;
  }

  /** upstream b3CreateCylinder: a hull of two rings, drawn as a cylinder. */
  cylinder(body: Body, options: CylinderOptions): Shape {
    const {
      height,
      radius,
      yOffset = 0,
      sides = 16,
      ...shapeOptions
    } = options;
    const points = new Float32Array(sides * 6);
    for (let i = 0; i < sides; i++) {
      const alpha = (2 * Math.PI * i) / sides;
      const x = radius * Math.cos(alpha);
      const z = radius * Math.sin(alpha);
      points.set([x, yOffset, z, x, yOffset + height, z], i * 6);
    }
    const shape = body.createHull({
      ...shapeOptions,
      points,
      maxVertices: 2 * sides,
    });
    this.addVisual(body, { kind: 'cylinder', radius, height, yOffset, sides });
    return shape;
  }

  /** Builds triangle mesh data once; attach it with `mesh()`. Released with the scene. */
  meshData(options: MeshOptions): MeshData {
    const resource = this.b3.createMesh(options);
    this.resources.push(resource);
    return {
      resource,
      vertices: Float32Array.from(options.vertices),
      indices: Uint32Array.from(options.indices),
      clockwise: options.clockwise ?? false,
    };
  }

  /** Meshes only collide as shapes of static bodies. */
  mesh(
    body: Body,
    data: MeshData | MeshOptions,
    options: MeshShapeOptions = {},
  ): Shape {
    const built = 'resource' in data ? data : this.meshData(data);
    const shape = body.createMesh(built.resource, options);
    this.addVisual(body, {
      kind: 'mesh',
      vertices: built.vertices,
      indices: built.indices,
      scale: options.scale ?? { x: 1, y: 1, z: 1 },
      clockwise: built.clockwise,
    });
    return shape;
  }

  heightFieldData(options: HeightFieldOptions): HeightFieldData {
    const resource = this.b3.createHeightField(options);
    this.resources.push(resource);
    return {
      resource,
      options: { ...options, heights: Float32Array.from(options.heights) },
    };
  }

  /** Height fields only collide as shapes of static bodies. */
  heightField(
    body: Body,
    data: HeightFieldData | HeightFieldOptions,
    options: ShapeOptions = {},
  ): Shape {
    const built = 'resource' in data ? data : this.heightFieldData(data);
    const shape = body.createHeightField(built.resource, options);
    this.addVisual(body, {
      kind: 'heightField',
      heights: built.options.heights,
      countX: built.options.countX,
      countZ: built.options.countZ,
      scale: built.options.scale ?? { x: 1, y: 1, z: 1 },
      clockwise: built.options.clockwise ?? false,
      materialIndices: built.options.materialIndices
        ? Uint8Array.from(built.options.materialIndices)
        : undefined,
    });
    return shape;
  }

  /** upstream AddGroundBox: a static slab `extent` half-wide whose top face is y = 0. */
  groundBox(extent: number): Body {
    const body = this.createBody({
      type: 'static',
      position: { x: 0, y: -1, z: 0 },
      name: 'ground',
    });
    this.box(body, { hx: extent, hy: 1, hz: extent });
    return body;
  }

  /** Frees meshes and height fields. The world (and its bodies) is destroyed by the owner. */
  dispose(): void {
    for (const resource of this.resources) resource.release();
    this.resources.length = 0;
    for (const entry of this.entries.values())
      this.observer?.bodyRemoved(entry);
    this.entries.clear();
    this.observer = undefined;
  }

  /**
   * Records an extra visual for a body whose shape the builder cannot draw by
   * itself (compound children, transformed hulls). Physics is unaffected.
   */
  addVisual(body: Body, visual: ShapeVisual): void {
    const entry = this.entries.get(body);
    if (!entry) return;
    entry.visuals.push(visual);
    this.observer?.shapeAdded(entry, visual);
  }

  private forget(entry: BodyEntry): void {
    this.entries.delete(entry.body);
    this.revision++;
    this.observer?.bodyRemoved(entry);
  }
}

function flatPoints(points: Vec3[] | ArrayLike<number>): Float32Array {
  if (points.length === 0 || typeof points[0] === 'number') {
    return Float32Array.from(points as ArrayLike<number>);
  }
  const objects = points as Vec3[];
  const flat = new Float32Array(objects.length * 3);
  objects.forEach((p, i) => flat.set([p.x, p.y, p.z], i * 3));
  return flat;
}
