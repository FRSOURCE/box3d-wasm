import type { Body } from './body.js';
import { Handle } from './handle.js';
import { ShapeRayHit } from './queries.js';
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
export function stageShapeDef(rt: Runtime, o: ShapeOptions): void {
  rt.m._bx_ShapeDef_Default();
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
    return SHAPE_TYPES[this.rt.m._bx_Shape_GetType(this.slot)] ?? 'hull';
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
    const current = this.getFilter();
    const category = filter.categoryBits ?? current.categoryBits;
    const mask = filter.maskBits ?? current.maskBits;
    this.rt.m._bx_Shape_SetFilter(
      this.slot,
      lo32(category),
      hi32(category),
      lo32(mask),
      hi32(mask),
      filter.groupIndex ?? current.groupIndex,
      invokeContacts ? 1 : 0,
    );
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
