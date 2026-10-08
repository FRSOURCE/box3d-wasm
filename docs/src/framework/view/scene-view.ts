// Mirrors a SceneBuilder into three.js. Meshes are created as bodies and
// shapes appear; every frame one TransformBatch.read() pulls all body poses out
// of wasm in a single call (no per-body JS to wasm traffic) and writes them
// straight into the mesh matrices. Sleep state comes from the step's move
// events, so it costs nothing per body either.
import {
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import type { Body, TransformBatch, World } from '@frsource/box3d-wasm';
import type {
  BodyEntry,
  SceneBuilder,
  SceneObserver,
  ShapeVisual,
} from '../builder.js';
import { buildGeometry, geometryKey } from './geometry.js';

const STATIC_COLOR = 0x7d869c;
const KINEMATIC_COLOR = 0x6c9be0;
/** Dynamic bodies cycle through these unless they ask for a colour. */
const DYNAMIC_PALETTE = [
  0xf38ba8, 0xfab387, 0xf9e2af, 0xa6e3a1, 0x89b4fa, 0xcba6f7, 0x94e2d5,
];
const SLEEP_DARKEN = 0.4;
const SHADOW_CASTER_LIMIT = 1500;
const MAX_OUTLINE_TRIANGLES = 20000;

interface BodyView {
  group: Group;
  meshes: Mesh[];
  paletteColor: number;
  outline: LineSegments[];
}

const ONE = new Vector3(1, 1, 1);

export class SceneView implements SceneObserver {
  private readonly root = new Group();
  private builder: SceneBuilder | undefined;
  private world: World | undefined;
  private batch: TransformBatch | undefined;
  private batchRevision = -1;
  private ordered: BodyView[] = [];
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly outlineMaterial = new LineBasicMaterial({
    color: 0xffe066,
    depthTest: false,
    transparent: true,
  });
  private outlined: BodyEntry | undefined;
  private paletteCursor = 0;
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scratchColor = new Color();

  constructor(private readonly scene: Scene) {
    this.root.name = 'bodies';
    scene.add(this.root);
  }

  attach(builder: SceneBuilder, world: World): void {
    this.detach();
    this.builder = builder;
    this.world = world;
    this.batch = world.createTransformBatch();
    this.batchRevision = -1;
    builder.observe(this);
  }

  /** Removes every mesh and frees the batch (before the world dies). */
  detach(): void {
    this.clearOutline();
    this.batch?.destroy();
    this.batch = undefined;
    this.ordered = [];
    this.root.clear();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.geometries.clear();
    this.ownedGeometries.clear();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.builder = undefined;
    this.world = undefined;
    this.paletteCursor = 0;
  }

  dispose(): void {
    this.detach();
    this.scene.remove(this.root);
    this.outlineMaterial.dispose();
  }

  get meshCount(): number {
    return this.ordered.length;
  }

  bodyAdded(entry: BodyEntry): void {
    const group = new Group();
    group.matrixAutoUpdate = false;
    entry.view = {
      group,
      meshes: [],
      paletteColor:
        DYNAMIC_PALETTE[this.paletteCursor++ % DYNAMIC_PALETTE.length] ??
        STATIC_COLOR,
      outline: [],
    } satisfies BodyView;
    this.root.add(group);
  }

  shapeAdded(entry: BodyEntry, visual: ShapeVisual): void {
    const view = entry.view as BodyView;
    const { geometry, local } = this.geometryFor(visual);
    const mesh = new Mesh(geometry, this.materialFor(entry, view, visual));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(local);
    mesh.castShadow = (this.builder?.bodyCount ?? 0) < SHADOW_CASTER_LIMIT;
    mesh.receiveShadow = true;
    view.group.add(mesh);
    view.meshes.push(mesh);
    mesh.userData.visual = visual;
  }

  bodyChanged(entry: BodyEntry): void {
    this.applyMaterials(entry);
  }

  bodyRemoved(entry: BodyEntry): void {
    const view = entry.view as BodyView | undefined;
    if (!view) return;
    if (this.outlined === entry) this.clearOutline();
    this.root.remove(view.group);
    for (const mesh of view.meshes) {
      if (this.ownedGeometries.delete(mesh.geometry)) mesh.geometry.dispose();
    }
    entry.view = undefined;
  }

  /**
   * Call once per rendered frame after the physics ticks. `stepped` says
   * whether the world advanced since the last call (sleep state only changes then).
   */
  sync(selected: Body | null, stepped: boolean): void {
    const { builder, world, batch } = this;
    if (!builder || !world || !batch) return;

    builder.prune();
    if (builder.revision !== this.batchRevision)
      this.rebuildBatch(batch, builder);

    batch.read();
    const data = batch.data;
    const { position, rotation } = this;
    const views = this.ordered;
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      if (!view) continue;
      const r = i * batch.stride;
      const group = view.group;
      group.matrix.compose(
        position.set(data[r] ?? 0, data[r + 1] ?? 0, data[r + 2] ?? 0),
        rotation.set(
          data[r + 3] ?? 0,
          data[r + 4] ?? 0,
          data[r + 5] ?? 0,
          data[r + 6] ?? 1,
        ),
        ONE,
      );
      group.matrixWorldNeedsUpdate = true;
    }

    if (stepped) this.applySleepState(world, builder);
    this.updateOutline(selected ? builder.entryOf(selected) : undefined);
  }

  private rebuildBatch(batch: TransformBatch, builder: SceneBuilder): void {
    const bodies: Body[] = [];
    const views: BodyView[] = [];
    for (const entry of builder.entries.values()) {
      bodies.push(entry.body);
      views.push(entry.view as BodyView);
    }
    batch.setBodies(bodies);
    this.ordered = views;
    this.batchRevision = builder.revision;
  }

  private applySleepState(world: World, builder: SceneBuilder): void {
    const events = world.getMoveEvents();
    for (let i = 0; i < events.count; i++) {
      const body = events.bodyAt(i);
      const entry = body ? builder.entryOf(body) : undefined;
      if (!entry) continue;
      const asleep = events.fellAsleepAt(i);
      if (entry.asleep === asleep) continue;
      entry.asleep = asleep;
      this.applyMaterials(entry);
    }
  }

  private applyMaterials(entry: BodyEntry): void {
    const view = entry.view as BodyView | undefined;
    if (!view) return;
    for (const mesh of view.meshes) {
      mesh.material = this.materialFor(
        entry,
        view,
        mesh.userData.visual as ShapeVisual,
      );
    }
  }

  private geometryFor(visual: ShapeVisual): ReturnType<typeof buildGeometry> {
    const key = geometryKey(visual);
    const built = buildGeometry(visual);
    if (key === undefined) {
      this.ownedGeometries.add(built.geometry);
      return built;
    }
    const cached = this.geometries.get(key);
    if (cached) {
      built.geometry.dispose();
      return { geometry: cached, local: built.local };
    }
    this.geometries.set(key, built.geometry);
    return built;
  }

  /** upstream colouring: static grey, kinematic blue, dynamic coloured, asleep darker. */
  private materialFor(
    entry: BodyEntry,
    view: BodyView,
    visual: ShapeVisual,
  ): MeshStandardMaterial {
    const base =
      entry.type === 'static'
        ? STATIC_COLOR
        : entry.type === 'kinematic'
          ? KINEMATIC_COLOR
          : (entry.color ?? view.paletteColor);
    const doubleSided = visual.kind === 'mesh' || visual.kind === 'heightField';
    const key = `${base}:${entry.asleep}:${doubleSided}`;
    let material = this.materials.get(key);
    if (!material) {
      const color = this.scratchColor.setHex(base);
      if (entry.asleep) color.multiplyScalar(SLEEP_DARKEN);
      material = new MeshStandardMaterial({
        color: color.clone(),
        roughness: entry.type === 'static' ? 0.9 : 0.55,
        metalness: 0.05,
      });
      if (doubleSided) material.side = DoubleSide;
      this.materials.set(key, material);
    }
    return material;
  }

  private updateOutline(entry: BodyEntry | undefined): void {
    if (entry === this.outlined) return;
    this.clearOutline();
    const view = entry?.view as BodyView | undefined;
    if (!entry || !view) return;
    for (const mesh of view.meshes) {
      const triangles =
        (mesh.geometry.index?.count ??
          mesh.geometry.getAttribute('position').count) / 3;
      if (triangles > MAX_OUTLINE_TRIANGLES) continue;
      const lines = new LineSegments(
        new EdgesGeometry(mesh.geometry, 20),
        this.outlineMaterial,
      );
      lines.renderOrder = 5;
      mesh.add(lines);
      view.outline.push(lines);
    }
    this.outlined = entry;
  }

  private clearOutline(): void {
    const view = this.outlined?.view as BodyView | undefined;
    if (view) {
      for (const lines of view.outline) {
        lines.removeFromParent();
        lines.geometry.dispose();
      }
      view.outline.length = 0;
    }
    this.outlined = undefined;
  }
}
