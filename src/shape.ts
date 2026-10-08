import type { Body } from './body.js';
import {
  type Geometry,
  type Hull,
  type Mesh,
  readShapeGeometry,
} from './geometry.js';
import { Handle } from './handle.js';
import { ContactList, ShapeList, ShapeRayHit } from './queries.js';
import { hi32, join64, lo32 } from './runtime/bits.js';
import { ShapeDef, ShapeFlag } from './runtime/layouts.js';
import type { Runtime } from './runtime/module.js';
import {
  type AABB,
  type Bits,
  type Filter,
  type MassData,
  mat3,
  type ShapeOptions,
  type ShapeType,
  type SurfaceMaterial,
  type Vec3,
  vec3,
} from './types.js';

const SHAPE_TYPES: readonly ShapeType[] = [
  'capsule',
  'compound',
  'heightField',
  'hull',
  'mesh',
  'sphere',
];

/** Writes b3DefaultShapeDef plus the given overrides into the def buffer. */
/** Stages a materials table for the next shape creation. */
function stageMaterials(
  rt: Runtime,
  materials: readonly SurfaceMaterial[],
): void {
  if (materials.length > 255)
    throw new RangeError('box3d: at most 255 shape materials');
  const buffer = new ArrayBuffer(materials.length * 9 * 4);
  const f = new Float32Array(buffer);
  const u = new Uint32Array(buffer);
  materials.forEach((m, i) => {
    const at = i * 9;
    f[at] = m.friction ?? 0.6;
    f[at + 1] = m.restitution ?? 0;
    f[at + 2] = m.rollingResistance ?? 0;
    f[at + 3] = m.tangentVelocity?.x ?? 0;
    f[at + 4] = m.tangentVelocity?.y ?? 0;
    f[at + 5] = m.tangentVelocity?.z ?? 0;
    const id = m.userMaterialId ?? 0;
    u[at + 6] = lo32(id);
    u[at + 7] = hi32(id);
    u[at + 8] = m.customColor ?? 0;
  });
  const ptr = rt.arena.reserve(buffer.byteLength);
  rt.mem.views().u8.set(new Uint8Array(buffer), ptr);
  rt.m._bx_Def_StageMaterials(ptr, materials.length);
}

export function stageShapeDef(rt: Runtime, o: ShapeOptions): void {
  rt.m._bx_ShapeDef_Default();
  if (o.materials !== undefined && o.materials.length > 0)
    stageMaterials(rt, o.materials);
  rt.defF(ShapeDef.DENSITY, o.density);
  rt.defF(ShapeDef.FRICTION, o.friction);
  rt.defF(ShapeDef.RESTITUTION, o.restitution);
  rt.defF(ShapeDef.ROLLING_RESISTANCE, o.rollingResistance);
  rt.defVec3(ShapeDef.TANGENT_VELOCITY, o.tangentVelocity);
  rt.defF(ShapeDef.EXPLOSION_SCALE, o.explosionScale);
  if (o.userMaterialId !== undefined) {
    rt.defU(ShapeDef.USER_MATERIAL_ID, lo32(o.userMaterialId));
    rt.defU(ShapeDef.USER_MATERIAL_ID + 1, hi32(o.userMaterialId));
  }
  rt.defU(ShapeDef.CUSTOM_COLOR, o.customColor);
  const filter = o.filter;
  if (filter?.categoryBits !== undefined) {
    rt.defU(ShapeDef.CATEGORY_BITS, lo32(filter.categoryBits));
    rt.defU(ShapeDef.CATEGORY_BITS + 1, hi32(filter.categoryBits));
  }
  if (filter?.maskBits !== undefined) {
    rt.defU(ShapeDef.MASK_BITS, lo32(filter.maskBits));
    rt.defU(ShapeDef.MASK_BITS + 1, hi32(filter.maskBits));
  }
  rt.defI(ShapeDef.GROUP_INDEX, filter?.groupIndex);
  rt.defFlag(ShapeDef.FLAGS, ShapeFlag.IS_SENSOR, o.isSensor);
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.ENABLE_SENSOR_EVENTS,
    o.enableSensorEvents,
  );
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.ENABLE_CONTACT_EVENTS,
    o.enableContactEvents,
  );
  rt.defFlag(ShapeDef.FLAGS, ShapeFlag.ENABLE_HIT_EVENTS, o.enableHitEvents);
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.ENABLE_PRE_SOLVE_EVENTS,
    o.enablePreSolveEvents,
  );
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.INVOKE_CONTACT_CREATION,
    o.invokeContactCreation,
  );
  rt.defFlag(ShapeDef.FLAGS, ShapeFlag.UPDATE_BODY_MASS, o.updateBodyMass);
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.ENABLE_CUSTOM_FILTERING,
    o.enableCustomFiltering,
  );
  rt.defFlag(
    ShapeDef.FLAGS,
    ShapeFlag.ENABLE_SPECULATIVE_CONTACT,
    o.enableSpeculativeContact,
  );
}

/** A collision shape attached to a body. Created through Body.createSphere and friends. */
export class Shape extends Handle {
  private rayHit: ShapeRayHit | undefined;

  constructor(
    readonly body: Body,
    slot: number,
  ) {
    super(slot);
  }

  protected get rt(): Runtime {
    return this.body.world.rt;
  }

  isValid(): boolean {
    return this.alive && this.rt.m._bx_Shape_IsValid(this.slot) !== 0;
  }

  /** Removes the shape from its body. */
  destroy(updateBodyMass = true): void {
    if (!this.alive) return;
    this.rt.m._bx_DestroyShape(this.slot, updateBodyMass ? 1 : 0);
    this.body.shapes.splice(this.body.shapes.indexOf(this), 1);
    this.release();
  }

  /** @internal Marks the handle dead after the engine object went away. */
  release(): void {
    this.alive = false;
    this.rt.shapes[this.slot] = undefined;
  }

  getType(): ShapeType {
    this.assertAlive('shape');
    const type = SHAPE_TYPES[this.rt.m._bx_Shape_GetType(this.slot)];
    if (type === undefined) throw new Error('Box3D: shape has an unknown type');
    return type;
  }

  getDensity(): number {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_GetDensity(this.slot);
  }

  setDensity(density: number, updateBodyMass = true): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetDensity(this.slot, density, updateBodyMass ? 1 : 0);
  }

  getFriction(): number {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_GetFriction(this.slot);
  }

  setFriction(friction: number): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetFriction(this.slot, friction);
  }

  getRestitution(): number {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_GetRestitution(this.slot);
  }

  setRestitution(restitution: number): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetRestitution(this.slot, restitution);
  }

  getRollingResistance(): number {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_GetRollingResistance(this.slot);
  }

  setRollingResistance(value: number): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetRollingResistance(this.slot, value);
  }

  getTangentVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_GetTangentVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }

  setTangentVelocity(v: Vec3): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetTangentVelocity(this.slot, v.x, v.y, v.z);
  }

  getUserMaterialId(): Bits {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_GetUserMaterialId(this.slot);
    return join64(this.rt.scratchU(0), this.rt.scratchU(1));
  }

  setUserMaterialId(id: Bits): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetUserMaterialId(this.slot, lo32(id), hi32(id));
  }

  isSensor(): boolean {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_IsSensor(this.slot) !== 0;
  }

  enableSensorEvents(flag: boolean): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_EnableSensorEvents(this.slot, flag ? 1 : 0);
  }

  areSensorEventsEnabled(): boolean {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_AreSensorEventsEnabled(this.slot) !== 0;
  }

  enableContactEvents(flag: boolean): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_EnableContactEvents(this.slot, flag ? 1 : 0);
  }

  areContactEventsEnabled(): boolean {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_AreContactEventsEnabled(this.slot) !== 0;
  }

  enableHitEvents(flag: boolean): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_EnableHitEvents(this.slot, flag ? 1 : 0);
  }

  areHitEventsEnabled(): boolean {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_AreHitEventsEnabled(this.slot) !== 0;
  }

  getFilter(): Required<Filter> {
    this.assertAlive('shape');
    const rt = this.rt;
    rt.m._bx_Shape_GetFilter(this.slot);
    return {
      categoryBits: join64(rt.scratchU(0), rt.scratchU(1)),
      maskBits: join64(rt.scratchU(2), rt.scratchU(3)),
      groupIndex: rt.scratchI(4),
    };
  }

  /** Fields left out keep their current value. */
  setFilter(filter: Filter, invokeContacts = true): void {
    this.assertAlive('shape');
    const rt = this.rt;
    // Read the current words straight from scratch, so no bigint or object is built.
    rt.m._bx_Shape_GetFilter(this.slot);
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const categoryLo = category === undefined ? rt.scratchU(0) : lo32(category);
    const categoryHi = category === undefined ? rt.scratchU(1) : hi32(category);
    const maskLo = mask === undefined ? rt.scratchU(2) : lo32(mask);
    const maskHi = mask === undefined ? rt.scratchU(3) : hi32(mask);
    const group = filter.groupIndex ?? rt.scratchI(4);
    rt.m._bx_Shape_SetFilter(
      this.slot,
      categoryLo,
      categoryHi,
      maskLo,
      maskHi,
      group,
      invokeContacts ? 1 : 0,
    );
  }

  /**
   * Touching manifolds of this shape, one record per manifold. The list is
   * shared and overwritten by the next getContacts call on any body or shape.
   */
  getContacts(): ContactList {
    this.assertAlive('shape');
    const rt = this.rt;
    rt.contacts ??= new ContactList(rt);
    return rt.contacts.load(rt.m._bx_Shape_GetContacts(this.slot));
  }

  /** Shapes currently overlapping this sensor. Overwritten by the next sensor or overlap query. */
  getSensorOverlaps(): ShapeList {
    this.assertAlive('shape');
    const rt = this.rt;
    rt.sensorOverlaps ??= new ShapeList(rt);
    return rt.sensorOverlaps.load(rt.m._bx_Shape_GetSensorOverlaps(this.slot));
  }

  /**
   * Triangles for rendering a hull or mesh shape (mesh scale applied), in the
   * shape's body frame. Empty for other shape types.
   */
  getGeometry(): Geometry {
    this.assertAlive('shape');
    return readShapeGeometry(this.rt, this.slot);
  }

  /** Number of surface materials on a mesh shape. */
  getMeshMaterialCount(): number {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_GetMeshMaterialCount(this.slot);
  }

  getMeshSurfaceMaterial(index: number): Required<SurfaceMaterial> {
    this.assertAlive('shape');
    const rt = this.rt;
    rt.m._bx_Shape_GetMeshSurfaceMaterial(this.slot, index);
    return {
      friction: rt.scratchF(0),
      restitution: rt.scratchF(1),
      rollingResistance: rt.scratchF(2),
      tangentVelocity: rt.scratchVec3(vec3(), 3),
      userMaterialId: join64(rt.scratchU(6), rt.scratchU(7)),
      customColor: rt.scratchU(8),
    };
  }

  setMeshMaterial(index: number, material: SurfaceMaterial): void {
    this.assertAlive('shape');
    const current = this.getMeshSurfaceMaterial(index);
    const id = material.userMaterialId ?? current.userMaterialId;
    const tv = material.tangentVelocity ?? current.tangentVelocity;
    this.rt.m._bx_Shape_SetMeshMaterial(
      this.slot,
      index,
      material.friction ?? current.friction,
      material.restitution ?? current.restitution,
      material.rollingResistance ?? current.rollingResistance,
      tv.x,
      tv.y,
      tv.z,
      lo32(id),
      hi32(id),
      material.customColor ?? current.customColor,
    );
  }

  /** Replaces a hull shape's hull. The body's mass is not updated; call body.applyMassFromShapes(). */
  setHull(hull: Hull): void {
    this.assertAlive('shape');
    this.expectType('hull');
    if (!hull.alive) throw new Error('box3d: hull was released');
    this.rt.m._bx_Shape_SetHull(this.slot, hull.slot);
  }

  /** Points a mesh shape at another mesh or scale. The body's mass is not updated. */
  setMesh(mesh: Mesh, scale: Vec3 = { x: 1, y: 1, z: 1 }): void {
    this.assertAlive('shape');
    this.expectType('mesh');
    if (!mesh.alive) throw new Error('box3d: mesh was released');
    this.rt.m._bx_Shape_SetMesh(
      this.slot,
      mesh.slot,
      scale.x,
      scale.y,
      scale.z,
    );
  }

  /** The local sphere. Throws unless the shape is a sphere. */
  getSphere(): { center: Vec3; radius: number } {
    this.assertAlive('shape');
    this.expectType('sphere');
    this.rt.m._bx_Shape_GetSphere(this.slot);
    return {
      center: this.rt.scratchVec3(vec3(), 0),
      radius: this.rt.scratchF(3),
    };
  }

  setSphere(center: Vec3, radius: number): void {
    this.assertAlive('shape');
    this.expectType('sphere');
    this.rt.m._bx_Shape_SetSphere(
      this.slot,
      center.x,
      center.y,
      center.z,
      radius,
    );
  }

  /** The local capsule. Throws unless the shape is a capsule. */
  getCapsule(): { center1: Vec3; center2: Vec3; radius: number } {
    this.assertAlive('shape');
    this.expectType('capsule');
    this.rt.m._bx_Shape_GetCapsule(this.slot);
    return {
      center1: this.rt.scratchVec3(vec3(), 0),
      center2: this.rt.scratchVec3(vec3(), 3),
      radius: this.rt.scratchF(6),
    };
  }

  setCapsule(center1: Vec3, center2: Vec3, radius: number): void {
    this.assertAlive('shape');
    this.expectType('capsule');
    this.rt.m._bx_Shape_SetCapsule(
      this.slot,
      center1.x,
      center1.y,
      center1.z,
      center2.x,
      center2.y,
      center2.z,
      radius,
    );
  }

  /** The point on the shape closest to `target`. */
  getClosestPoint(target: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_GetClosestPoint(
      this.slot,
      target.x,
      target.y,
      target.z,
    );
    return this.rt.scratchVec3(out);
  }

  enablePreSolveEvents(flag: boolean): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_EnablePreSolveEvents(this.slot, flag ? 1 : 0);
  }

  arePreSolveEventsEnabled(): boolean {
    this.assertAlive('shape');
    return this.rt.m._bx_Shape_ArePreSolveEventsEnabled(this.slot) !== 0;
  }

  /** Pushes the shape with wind: a drag and lift force from the relative air velocity. */
  applyWind(
    wind: Vec3,
    drag: number,
    lift: number,
    maxSpeed: number,
    wake = true,
  ): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_ApplyWind(
      this.slot,
      wind.x,
      wind.y,
      wind.z,
      drag,
      lift,
      maxSpeed,
      wake ? 1 : 0,
    );
  }

  getName(): string {
    this.assertAlive('shape');
    const rt = this.rt;
    const ptr = rt.arena.reserve(256);
    const length = rt.m._bx_Shape_GetName(this.slot, ptr, 256);
    if (length >= 256) {
      const big = rt.arena.reserve(length + 1);
      rt.m._bx_Shape_GetName(this.slot, big, length + 1);
      return rt.string(big);
    }
    return rt.string(ptr);
  }

  setName(name: string): void {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_SetName(this.slot, this.rt.arena.uploadString(name));
  }

  private expectType(type: ShapeType): void {
    const actual = this.getType();
    if (actual !== type)
      throw new Error(`box3d: shape is a ${actual}, not a ${type}`);
  }

  getAABB(out: AABB = { lowerBound: vec3(), upperBound: vec3() }): AABB {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_GetAABB(this.slot);
    this.rt.scratchVec3(out.lowerBound, 0);
    this.rt.scratchVec3(out.upperBound, 3);
    return out;
  }

  computeMassData(
    out: MassData = { mass: 0, center: vec3(), inertia: mat3() },
  ): MassData {
    this.assertAlive('shape');
    this.rt.m._bx_Shape_ComputeMassData(this.slot);
    return readMassData(this.rt, out);
  }

  /** Casts a ray against this shape alone. The result object is reused by the next call. */
  rayCast(origin: Vec3, translation: Vec3): ShapeRayHit {
    this.assertAlive('shape');
    this.rayHit ??= new ShapeRayHit();
    const hit = this.rt.m._bx_Shape_RayCast(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
    );
    return this.rayHit.load(this.rt, hit);
  }
}

/** Reads the 13-float mass data layout the shim writes to scratch. */
export function readMassData(rt: Runtime, out: MassData): MassData {
  out.mass = rt.scratchF(0);
  rt.scratchVec3(out.center, 1);
  rt.scratchVec3(out.inertia.cx, 4);
  rt.scratchVec3(out.inertia.cy, 7);
  rt.scratchVec3(out.inertia.cz, 10);
  return out;
}
