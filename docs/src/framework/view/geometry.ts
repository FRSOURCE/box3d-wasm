// ShapeVisual (plain data from the SceneBuilder) to three.js geometry.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { ShapeVisual } from '../builder.js';

export interface VisualGeometry {
  geometry: BufferGeometry;
  /** Placement of the geometry in the body frame. */
  local: Matrix4;
}

const Y_AXIS = new Vector3(0, 1, 0);

/** Geometries are shared between identical shapes; `key` identifies the data. */
export function geometryKey(visual: ShapeVisual): string | undefined {
  switch (visual.kind) {
    case 'box': {
      const h = visual.halfExtents;
      return `box:${h.x},${h.y},${h.z}`;
    }
    case 'sphere':
      return `sphere:${visual.radius}`;
    case 'capsule': {
      const { center1: a, center2: b } = visual;
      return `capsule:${Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)},${visual.radius}`;
    }
    case 'cylinder':
      return `cylinder:${visual.radius},${visual.height},${visual.sides}`;
    default:
      return undefined;
  }
}

export function buildGeometry(visual: ShapeVisual): VisualGeometry {
  const local = new Matrix4();
  switch (visual.kind) {
    case 'box': {
      const h = visual.halfExtents;
      const o = visual.offset;
      const q = visual.rotation;
      local.compose(
        new Vector3(o.x, o.y, o.z),
        new Quaternion(q.x, q.y, q.z, q.w),
        new Vector3(1, 1, 1),
      );
      return { geometry: new BoxGeometry(2 * h.x, 2 * h.y, 2 * h.z), local };
    }
    case 'sphere': {
      const c = visual.center;
      local.makeTranslation(c.x, c.y, c.z);
      return {
        geometry: new SphereGeometry(visual.radius, 24, 16),
        local,
      };
    }
    case 'capsule': {
      const a = new Vector3(
        visual.center1.x,
        visual.center1.y,
        visual.center1.z,
      );
      const b = new Vector3(
        visual.center2.x,
        visual.center2.y,
        visual.center2.z,
      );
      const axis = b.clone().sub(a);
      const length = axis.length();
      const q = new Quaternion();
      if (length > 1e-9)
        q.setFromUnitVectors(Y_AXIS, axis.divideScalar(length));
      local.compose(a.add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
      return {
        geometry: new CapsuleGeometry(visual.radius, length, 6, 16),
        local,
      };
    }
    case 'cylinder': {
      // the hull's ring starts on +x; three's cylinder starts on +z, so a
      // quarter turn about y lines the facets up
      const geometry = new CylinderGeometry(
        visual.radius,
        visual.radius,
        visual.height,
        visual.sides,
        1,
      ).rotateY(Math.PI / 2);
      local.makeTranslation(0, visual.yOffset + 0.5 * visual.height, 0);
      return { geometry, local };
    }
    case 'hull': {
      const points: Vector3[] = [];
      for (let i = 0; i < visual.points.length; i += 3) {
        points.push(
          new Vector3(
            visual.points[i] ?? 0,
            visual.points[i + 1] ?? 0,
            visual.points[i + 2] ?? 0,
          ),
        );
      }
      return { geometry: new ConvexGeometry(points), local };
    }
    case 'mesh': {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new BufferAttribute(visual.vertices, 3),
      );
      geometry.setIndex(flipped(visual.indices, visual.clockwise));
      geometry.computeVertexNormals();
      local.makeScale(visual.scale.x, visual.scale.y, visual.scale.z);
      return { geometry, local };
    }
    case 'heightField':
      return { geometry: heightFieldGeometry(visual), local };
  }
}

/** The engine takes counter-clockwise triangles unless `clockwise` is set; three.js wants counter-clockwise. */
function flipped(indices: Uint32Array, clockwise: boolean): BufferAttribute {
  const out = Uint32Array.from(indices);
  if (clockwise) {
    for (let i = 0; i < out.length; i += 3) {
      const t = out[i + 1] ?? 0;
      out[i + 1] = out[i + 2] ?? 0;
      out[i + 2] = t;
    }
  }
  return new BufferAttribute(out, 1);
}

/** Heights are countX by countZ, row-major along x; cell (i, j) sits at (i * sx, h * sy, j * sz). */
function heightFieldGeometry(
  visual: Extract<ShapeVisual, { kind: 'heightField' }>,
): BufferGeometry {
  const { heights, countX, countZ, scale } = visual;
  const positions = new Float32Array(countX * countZ * 3);
  for (let j = 0; j < countZ; j++) {
    for (let i = 0; i < countX; i++) {
      const k = j * countX + i;
      positions[3 * k] = i * scale.x;
      positions[3 * k + 1] = (heights[k] ?? 0) * scale.y;
      positions[3 * k + 2] = j * scale.z;
    }
  }
  const indices = new Uint32Array((countX - 1) * (countZ - 1) * 6);
  let n = 0;
  for (let j = 0; j < countZ - 1; j++) {
    for (let i = 0; i < countX - 1; i++) {
      // cells flagged 0xFF are holes
      if (visual.materialIndices?.[j * (countX - 1) + i] === 0xff) continue;
      const a = j * countX + i;
      const b = a + 1;
      const c = a + countX;
      const d = c + 1;
      // counter-clockwise seen from +y
      indices.set(
        visual.clockwise ? [a, b, c, b, d, c] : [a, c, b, b, c, d],
        n,
      );
      n += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices.subarray(0, n), 1));
  geometry.computeVertexNormals();
  return geometry;
}
