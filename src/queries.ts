import type { Body } from './body.js';
import { join64 } from './runtime/bits.js';
import type { Runtime } from './runtime/module.js';
import type { Shape } from './shape.js';
import { type Bits, type Vec3, vec3 } from './types.js';

/** The result of a closest ray cast. One instance per world, overwritten by every cast. */
export class RayHit {
  hit = false;
  readonly point: Vec3 = vec3();
  readonly normal: Vec3 = vec3();
  fraction = 0;
  shape: Shape | undefined = undefined;
  body: Body | undefined = undefined;
  /** Triangle hit; meaningful when the shape is a mesh or height field. */
  triangleIndex = 0;
  /** Child hit; meaningful when the shape is a compound. */
  childIndex = 0;
  userMaterialId: Bits = 0;

  /** @internal */
  load(rt: Runtime, shapeSlot: number): this {
    this.hit = shapeSlot !== 0;
    if (!this.hit) {
      this.shape = undefined;
      this.body = undefined;
      return this;
    }
    rt.scratchVec3(this.point, 0);
    rt.scratchVec3(this.normal, 3);
    this.fraction = rt.scratchF(6);
    this.body = rt.bodies[rt.scratchI(7)];
    this.triangleIndex = rt.scratchI(8);
    this.childIndex = rt.scratchI(9);
    this.userMaterialId = join64(rt.scratchU(10), rt.scratchU(11));
    this.shape = rt.shapes[shapeSlot];
    return this;
  }
}

/** The result of a ray cast against one shape. */
export class ShapeRayHit {
  hit = false;
  readonly point: Vec3 = vec3();
  readonly normal: Vec3 = vec3();
  fraction = 0;
  triangleIndex = 0;

  /** @internal */
  load(rt: Runtime, hit: number): this {
    this.hit = hit !== 0;
    if (!this.hit) return this;
    rt.scratchVec3(this.point, 0);
    rt.scratchVec3(this.normal, 3);
    this.fraction = rt.scratchF(6);
    this.triangleIndex = rt.scratchI(7);
    return this;
  }
}
