// Scene helpers shared by the Collision and Character samples: engine meshes as
// scene mesh data, upstream's b3CreateWave terrain, and an OBJ loader
// (triangulation by ear clipping, like tinyobj with earcut).
import type { Mesh } from '@frsource/box3d-wasm';
import type { Vec3 } from '@frsource/box3d-wasm';
import type {
  HeightFieldData,
  MeshData,
  SceneBuilder,
} from '../framework/builder.js';
import type { Box3D } from '@frsource/box3d-wasm';

/** An engine-built mesh (torus, wave...) as mesh data the scene builder can attach and draw. */
export function meshDataOf(mesh: Mesh): MeshData {
  const geometry = mesh.getGeometry();
  return {
    resource: mesh,
    vertices: geometry.positions,
    indices: geometry.indices,
    clockwise: false,
  };
}

/** The heights of upstream's b3CreateWave. */
export function waveHeights(
  rowCount: number,
  columnCount: number,
  rowFrequency: number,
  columnFrequency: number,
): Float32Array {
  const heights = new Float32Array(rowCount * columnCount);
  const omegaZ = 2 * Math.PI * rowFrequency;
  const omegaX = 2 * Math.PI * columnFrequency;
  for (let i = 0; i < rowCount; i++) {
    const rowHeight = Math.sin(Math.fround(omegaZ * i));
    for (let j = 0; j < columnCount; j++) {
      heights[i * columnCount + j] =
        rowHeight * Math.sin(Math.fround(omegaX * j));
    }
  }
  return heights;
}

/** upstream b3CreateWave (global height range +-256, holes on every 16th cell). */
export function createWave(
  scene: SceneBuilder,
  rowCount: number,
  columnCount: number,
  scale: Vec3,
  rowFrequency: number,
  columnFrequency: number,
  makeHoles: boolean,
): HeightFieldData {
  const cells = (rowCount - 1) * (columnCount - 1);
  const materialIndices = new Uint8Array(cells);
  for (let k = 0; k < cells; k++) {
    if (makeHoles && k > 0 && k % 16 === 0) materialIndices[k] = 0xff;
  }
  return scene.heightFieldData({
    heights: waveHeights(rowCount, columnCount, rowFrequency, columnFrequency),
    countX: columnCount,
    countZ: rowCount,
    materialIndices,
    scale,
    minHeight: -256,
    maxHeight: 256,
    clockwise: false,
  });
}

export interface ObjMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  /** Cycles 0, 1, 2 per triangle like upstream's mesh loader. */
  materialIndices: Uint8Array;
}

/**
 * Parses the `v` and `f` lines of a Wavefront OBJ. Polygons are ear clipped
 * in the plane of their Newell normal, so concave faces (the stairs) work.
 */
export function parseObj(text: string): ObjMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const materialIndices: number[] = [];
  let materialIndex = 0;
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') {
      vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (parts[0] === 'f') {
      const face = parts.slice(1).map((token) => {
        const index = Number.parseInt(token.split('/')[0] ?? '1', 10);
        return index < 0 ? vertices.length / 3 + index : index - 1;
      });
      for (const triangle of triangulate(vertices, face)) {
        indices.push(...triangle);
        materialIndices.push(materialIndex);
        materialIndex = (materialIndex + 1) % 3;
      }
    }
  }
  return {
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
    materialIndices: Uint8Array.from(materialIndices),
  };
}

function triangulate(
  vertices: readonly number[],
  face: readonly number[],
): [number, number, number][] {
  if (face.length < 3) return [];
  if (face.length === 3) return [[face[0] ?? 0, face[1] ?? 0, face[2] ?? 0]];

  const point = (i: number): Vec3 => ({
    x: vertices[3 * i] ?? 0,
    y: vertices[3 * i + 1] ?? 0,
    z: vertices[3 * i + 2] ?? 0,
  });

  // Newell normal picks the projection plane and the winding sign
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < face.length; i++) {
    const a = point(face[i] ?? 0);
    const b = point(face[(i + 1) % face.length] ?? 0);
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const project = (i: number): [number, number] => {
    const p = point(i);
    if (ax >= ay && ax >= az) return nx > 0 ? [p.y, p.z] : [p.z, p.y];
    if (ay >= az) return ny > 0 ? [p.z, p.x] : [p.x, p.z];
    return nz > 0 ? [p.x, p.y] : [p.y, p.x];
  };

  const cross2 = (
    o: [number, number],
    a: [number, number],
    b: [number, number],
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const remaining = [...face];
  const out: [number, number, number][] = [];
  let guard = remaining.length * remaining.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev =
        remaining[(i + remaining.length - 1) % remaining.length] ?? 0;
      const cur = remaining[i] ?? 0;
      const next = remaining[(i + 1) % remaining.length] ?? 0;
      const a = project(prev);
      const b = project(cur);
      const c = project(next);
      if (cross2(a, b, c) <= 1e-12) continue; // reflex or degenerate
      let inside = false;
      for (const other of remaining) {
        if (other === prev || other === cur || other === next) continue;
        const p = project(other);
        if (
          cross2(a, b, p) >= 0 &&
          cross2(b, c, p) >= 0 &&
          cross2(c, a, p) >= 0
        ) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push([prev, cur, next]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length >= 3) {
    // fall back to a fan for whatever is left
    for (let i = 1; i + 1 < remaining.length; i++) {
      out.push([remaining[0] ?? 0, remaining[i] ?? 0, remaining[i + 1] ?? 0]);
    }
  }
  return out;
}

/** Mesh data for an OBJ the way upstream's CreateMeshData(path, 1, false, false, true, true) does. */
export function createObjMesh(
  scene: SceneBuilder,
  obj: ObjMesh,
  withMaterials = true,
): MeshData {
  return scene.meshData({
    vertices: obj.vertices,
    indices: obj.indices,
    materialIndices: withMaterials ? obj.materialIndices : undefined,
    weld: true,
    weldTolerance: 0.002,
    identifyEdges: true,
  });
}

/** The torus every collision sample casts at. Released with `release()`. */
export function createTorus(b3: Box3D): { mesh: Mesh; data: MeshData } {
  const mesh = b3.createTorusMesh(10, 12, 0.65, 0.35);
  return { mesh, data: meshDataOf(mesh) };
}
