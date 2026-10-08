// Helpers shared by the Benchmark samples (stand-ins for upstream's
// shared/benchmarks.c utilities).
import type {
  Body,
  Mesh,
  Shape,
  ShapeOptions,
  Vec3,
} from '@frsource/box3d-wasm';
import type {
  MeshData,
  SceneBuilder,
  ShapeVisual,
} from '../framework/builder.js';
import type { B3, DebugCanvas } from '../framework/types.js';

/** The convex hull resource type (not exported by name from the package). */
export type Hull = ReturnType<B3['createHull']>;

/** A generated Mesh (b3CreateGridMesh and friends) wrapped so scene.mesh() can draw it. */
export function meshDataOf(mesh: Mesh): MeshData {
  const { positions, indices } = mesh.getGeometry();
  return { resource: mesh, vertices: positions, indices, clockwise: false };
}

/** Vertex positions of a prebuilt hull, for drawing it. */
export function hullPoints(hull: Hull): Float32Array {
  return hull.getGeometry().positions;
}

/**
 * b3CreateHullShape with shared hull data: the engine shape comes from the
 * prebuilt hull (no per-body hull build) and the view gets the matching points.
 */
export function attachHull(
  scene: SceneBuilder,
  body: Body,
  hull: Hull,
  points: Float32Array,
  options: ShapeOptions = {},
): Shape {
  const shape = body.createHullData(hull, options);
  // SceneBuilder.hull() would rebuild the hull from points; this records only the visual.
  const addVisual = (
    scene as unknown as { addVisual(b: Body, v: ShapeVisual): void }
  ).addVisual.bind(scene);
  addVisual(body, { kind: 'hull', points });
  return shape;
}

/** upstream DrawAxes: red x, green y, blue z from `origin`. */
export function drawAxes(
  canvas: DebugCanvas,
  origin: Vec3,
  length: number,
): void {
  canvas.line(origin, { ...origin, x: origin.x + length }, 0xff0000);
  canvas.line(origin, { ...origin, y: origin.y + length }, 0x00ff00);
  canvas.line(origin, { ...origin, z: origin.z + length }, 0x0000ff);
}

/** upstream DrawWireSphere: three great circles. */
export function drawWireSphere(
  canvas: DebugCanvas,
  center: Vec3,
  radius: number,
  segments: number,
  color: number,
): void {
  const point = (axis: number, t: number): Vec3 => {
    const c = radius * Math.cos(t);
    const s = radius * Math.sin(t);
    if (axis === 0) return { x: center.x + c, y: center.y + s, z: center.z };
    if (axis === 1) return { x: center.x, y: center.y + c, z: center.z + s };
    return { x: center.x + s, y: center.y, z: center.z + c };
  };
  for (let axis = 0; axis < 3; axis++) {
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      const b = (2 * Math.PI * (i + 1)) / segments;
      canvas.line(point(axis, a), point(axis, b), color);
    }
  }
}
