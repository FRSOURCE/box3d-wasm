import type { Quat, Vec3 } from './types.js';

/** A point cloud with an external radius, the generic shape for casts and overlap tests. At most 128 points. */
export interface ShapeProxy {
  /** Flat xyz array, relative to the query origin. */
  points: ArrayLike<number>;
  /** External radius added around the points. Default 0. */
  radius?: number;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** A sphere is one point with a radius. */
export function sphereProxy(radius: number, center: Vec3 = ZERO): ShapeProxy {
  return { points: [center.x, center.y, center.z], radius };
}

/** A capsule is two points with a radius. */
export function capsuleProxy(a: Vec3, b: Vec3, radius: number): ShapeProxy {
  return { points: [a.x, a.y, a.z, b.x, b.y, b.z], radius };
}

/** A box is its eight corners, optionally rotated and offset. */
export function boxProxy(
  halfExtents: Vec3,
  position: Vec3 = ZERO,
  rotation?: Quat,
): ShapeProxy {
  const points: number[] = [];
  for (let i = 0; i < 8; i++) {
    let x = i & 1 ? halfExtents.x : -halfExtents.x;
    let y = i & 2 ? halfExtents.y : -halfExtents.y;
    let z = i & 4 ? halfExtents.z : -halfExtents.z;
    if (rotation) {
      // v + 2 * cross(q.xyz, cross(q.xyz, v) + w * v)
      const { x: qx, y: qy, z: qz, w: qw } = rotation;
      const tx = qy * z - qz * y + qw * x;
      const ty = qz * x - qx * z + qw * y;
      const tz = qx * y - qy * x + qw * z;
      x += 2 * (qy * tz - qz * ty);
      y += 2 * (qz * tx - qx * tz);
      z += 2 * (qx * ty - qy * tx);
    }
    points.push(x + position.x, y + position.y, z + position.z);
  }
  return { points };
}
