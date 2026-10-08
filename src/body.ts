import type {
  Compound,
  HeightField,
  Hull,
  HullShapeOptions,
  Mesh,
  MeshShapeOptions,
} from './geometry.js';
import { Handle } from './handle.js';
import {
  type Mover,
  PlaneList,
  type TimeOfImpactResult,
  uploadMover,
} from './mover.js';
import { ContactList } from './queries.js';
import type { Joint } from './joints.js';
import { ALL_BITS_WORD, hi32, join64, lo32 } from './runtime/bits.js';
import type { ShapeProxy } from './proxy.js';
import { BodyDef, BodyFlag } from './runtime/layouts.js';
import type { Runtime } from './runtime/module.js';
import { readMassData, Shape, stageShapeDef } from './shape.js';
import {
  type AABB,
  type BodyCastResult,
  type BodyOptions,
  type BodyType,
  type BoxOptions,
  type CapsuleOptions,
  type HullOptions,
  type ShapeOptions,
  type Mat3,
  type MassData,
  mat3,
  type MotionLocks,
  type QueryFilter,
  type Quat,
  quat,
  type SphereOptions,
  type Transform,
  transform,
  type Vec3,
  vec3,
} from './types.js';
import type { World } from './world.js';

const BODY_TYPES: readonly BodyType[] = ['static', 'kinematic', 'dynamic'];

function bodyTypeCode(type: BodyType | undefined): number {
  return type === 'dynamic' ? 2 : type === 'kinematic' ? 1 : 0;
}

/** Writes b3DefaultBodyDef plus the given overrides into the def buffer. */
function stageBodyDef(rt: Runtime, o: BodyOptions): void {
  rt.m._bx_BodyDef_Default();
  if (o.type !== undefined) rt.defU(BodyDef.TYPE, bodyTypeCode(o.type));
  rt.defVec3(BodyDef.POSITION, o.position);
  rt.defQuat(BodyDef.ROTATION, o.rotation);
  rt.defVec3(BodyDef.LINEAR_VELOCITY, o.linearVelocity);
  rt.defVec3(BodyDef.ANGULAR_VELOCITY, o.angularVelocity);
  rt.defF(BodyDef.LINEAR_DAMPING, o.linearDamping);
  rt.defF(BodyDef.ANGULAR_DAMPING, o.angularDamping);
  rt.defF(BodyDef.GRAVITY_SCALE, o.gravityScale);
  rt.defF(BodyDef.SLEEP_THRESHOLD, o.sleepThreshold);
  rt.defF(BodyDef.SAFETY_FACTOR, o.safetyFactor);
  rt.defFlag(BodyDef.FLAGS, BodyFlag.ENABLE_SLEEP, o.enableSleep);
  rt.defFlag(BodyDef.FLAGS, BodyFlag.IS_AWAKE, o.isAwake);
  rt.defFlag(BodyDef.FLAGS, BodyFlag.IS_BULLET, o.isBullet);
  rt.defFlag(BodyDef.FLAGS, BodyFlag.IS_ENABLED, o.isEnabled);
  rt.defFlag(BodyDef.FLAGS, BodyFlag.ALLOW_FAST_ROTATION, o.allowFastRotation);
  rt.defFlag(
    BodyDef.FLAGS,
    BodyFlag.ENABLE_CONTACT_RECYCLING,
    o.enableContactRecycling,
  );
  const locks = o.motionLocks;
  if (locks !== undefined) {
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_LINEAR_X, locks.linearX);
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_LINEAR_Y, locks.linearY);
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_LINEAR_Z, locks.linearZ);
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_ANGULAR_X, locks.angularX);
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_ANGULAR_Y, locks.angularY);
    rt.defFlag(BodyDef.FLAGS, BodyFlag.LOCK_ANGULAR_Z, locks.angularZ);
  }
}

function flatPoints(points: Vec3[] | ArrayLike<number>): ArrayLike<number> {
  if (points.length === 0 || typeof points[0] === 'number') {
    return points as ArrayLike<number>;
  }
  const objects = points as Vec3[];
  const flat = new Float32Array(objects.length * 3);
  for (let i = 0; i < objects.length; i++) {
    const p = objects[i];
    flat[i * 3] = p.x;
    flat[i * 3 + 1] = p.y;
    flat[i * 3 + 2] = p.z;
  }
  return flat;
}

/** A rigid body. Created through World.createBody. */
export class Body extends Handle {
  /** Live shapes on this body, in creation order. */
  readonly shapes: Shape[] = [];
  /** Live joints attached to this body. */
  readonly joints = new Set<Joint>();

  constructor(
    readonly world: World,
    slot: number,
  ) {
    super(slot);
  }

  /** @internal */
  static create(world: World, options: BodyOptions): Body {
    const rt = world.rt;
    stageBodyDef(rt, options);
    const slot = rt.m._bx_CreateBody(world.slot);
    if (slot === 0) throw new Error('box3d: could not create a body');
    const body = new Body(world, slot);
    rt.bodies[slot] = body;
    world.bodies.add(body);
    if (options.name !== undefined) body.setName(options.name);
    return body;
  }

  get rt(): Runtime {
    return this.world.rt;
  }

  isValid(): boolean {
    return this.alive && this.rt.m._bx_Body_IsValid(this.slot) !== 0;
  }

  /** Removes the body, its shapes and its joints from the simulation. */
  destroy(): void {
    if (!this.alive) return;
    this.rt.m._bx_DestroyBody(this.slot);
    this.release();
  }

  /** @internal Marks the body and everything on it dead after the engine object went away. */
  release(): void {
    for (const shape of this.shapes) shape.release();
    this.shapes.length = 0;
    for (const joint of this.joints) joint.release();
    this.joints.clear();
    this.alive = false;
    this.rt.bodies[this.slot] = undefined;
    this.world.bodies.delete(this);
  }

  getType(): BodyType {
    this.assertAlive('body');
    const type = BODY_TYPES[this.rt.m._bx_Body_GetType(this.slot)];
    if (type === undefined) throw new Error('Box3D: body has an unknown type');
    return type;
  }

  setType(type: BodyType): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetType(this.slot, bodyTypeCode(type));
  }

  /**
   * Touching manifolds of this body, one record per manifold. The list is
   * shared and overwritten by the next getContacts call on any body or shape.
   */
  getContacts(): ContactList {
    this.assertAlive('body');
    const rt = this.rt;
    rt.contacts ??= new ContactList(rt);
    return rt.contacts.load(rt.m._bx_Body_GetContacts(this.slot));
  }

  /** Collision planes between a mover and this body's convex shapes, at the body's current transform. */
  collideMover(
    origin: Vec3,
    mover: Mover,
    filter: QueryFilter = {},
  ): PlaneList {
    this.assertAlive('body');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    rt.planes ??= new PlaneList(rt);
    return rt.planes.load(
      rt.m._bx_Body_CollideMover(
        this.slot,
        origin.x,
        origin.y,
        origin.z,
        uploadMover(rt, mover),
        category === undefined ? ALL_BITS_WORD : lo32(category),
        category === undefined ? ALL_BITS_WORD : hi32(category),
        mask === undefined ? ALL_BITS_WORD : lo32(mask),
        mask === undefined ? ALL_BITS_WORD : hi32(mask),
      ),
    );
  }

  /** Sweeps a mover against this body (held still); initial overlap is ignored. */
  timeOfImpactMover(
    origin: Vec3,
    mover: Mover,
    translation: Vec3,
    filter: QueryFilter = {},
  ): TimeOfImpactResult {
    this.assertAlive('body');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const shape = rt.m._bx_Body_TimeOfImpactMover(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      uploadMover(rt, mover),
      translation.x,
      translation.y,
      translation.z,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
    if (shape === 0) {
      return {
        hit: false,
        point: vec3(),
        normal: vec3(),
        fraction: 1,
        shape: undefined,
      };
    }
    return {
      hit: true,
      point: rt.scratchVec3(vec3(), 0),
      normal: rt.scratchVec3(vec3(), 3),
      fraction: rt.scratchF(6),
      shape: rt.shapes[shape],
    };
  }

  /** Casts a ray at this body (at its current transform). Returns the nearest hit, or `hit: false`. */
  castRay(
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = {},
    maxFraction = 1,
  ): BodyCastResult {
    this.assertAlive('body');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const shape = rt.m._bx_Body_CastRay(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      maxFraction,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
    return this.readCast(shape);
  }

  /** Sweeps a shape proxy at this body. */
  castShape(
    proxy: ShapeProxy,
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = {},
    maxFraction = 1,
    canEncroach = false,
  ): BodyCastResult {
    this.assertAlive('body');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const n = proxy.points.length / 3;
    if (!Number.isInteger(n) || n < 1 || n > 128) {
      throw new RangeError(
        'box3d: a shape proxy needs 1 to 128 points (flat xyz array)',
      );
    }
    const ptr = rt.arena.uploadF32(proxy.points);
    const shape = rt.m._bx_Body_CastShape(
      this.slot,
      ptr,
      n,
      proxy.radius ?? 0,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      maxFraction,
      canEncroach ? 1 : 0,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
    return this.readCast(shape);
  }

  /** True when the proxy placed at `origin` overlaps this body. */
  overlapShape(
    proxy: ShapeProxy,
    origin: Vec3,
    filter: QueryFilter = {},
  ): boolean {
    this.assertAlive('body');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const n = proxy.points.length / 3;
    if (!Number.isInteger(n) || n < 1 || n > 128) {
      throw new RangeError(
        'box3d: a shape proxy needs 1 to 128 points (flat xyz array)',
      );
    }
    const ptr = rt.arena.uploadF32(proxy.points);
    return (
      rt.m._bx_Body_OverlapShape(
        this.slot,
        ptr,
        n,
        proxy.radius ?? 0,
        origin.x,
        origin.y,
        origin.z,
        category === undefined ? ALL_BITS_WORD : lo32(category),
        category === undefined ? ALL_BITS_WORD : hi32(category),
        mask === undefined ? ALL_BITS_WORD : lo32(mask),
        mask === undefined ? ALL_BITS_WORD : hi32(mask),
      ) !== 0
    );
  }

  private readCast(shapeSlot: number): BodyCastResult {
    const rt = this.rt;
    if (shapeSlot === 0) {
      return {
        hit: false,
        shape: undefined,
        point: vec3(),
        normal: vec3(),
        fraction: 1,
        triangleIndex: -1,
        userMaterialId: 0,
      };
    }
    return {
      hit: true,
      shape: rt.shapes[shapeSlot],
      point: rt.scratchVec3(vec3(), 0),
      normal: rt.scratchVec3(vec3(), 3),
      fraction: rt.scratchF(6),
      triangleIndex: rt.scratchI(7),
      userMaterialId: join64(rt.scratchU(8), rt.scratchU(9)),
    };
  }

  getInverseMass(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetInverseMass(this.slot);
  }

  getLocalRotationalInertia(out: Mat3 = mat3()): Mat3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLocalRotationalInertia(this.slot);
    return this.readMat3(out);
  }

  getWorldInverseRotationalInertia(out: Mat3 = mat3()): Mat3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetWorldInverseRotationalInertia(this.slot);
    return this.readMat3(out);
  }

  getMaxExtent(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetMaxExtent(this.slot);
    return this.rt.scratchVec3(out);
  }

  getMinExtent(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetMinExtent(this.slot);
  }

  getMaxExtentOrigin(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetMaxExtentOrigin(this.slot);
    return this.rt.scratchVec3(out);
  }

  /** Velocity of the body at a world point. */
  getWorldPointVelocity(point: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetWorldPointVelocity(
      this.slot,
      point.x,
      point.y,
      point.z,
    );
    return this.rt.scratchVec3(out);
  }

  /** Velocity of the body at a point in its local frame. */
  getLocalPointVelocity(point: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLocalPointVelocity(
      this.slot,
      point.x,
      point.y,
      point.z,
    );
    return this.rt.scratchVec3(out);
  }

  getSafetyFactor(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetSafetyFactor(this.slot);
  }

  setSafetyFactor(factor: number): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetSafetyFactor(this.slot, factor);
  }

  enableContactRecycling(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_EnableContactRecycling(this.slot, flag ? 1 : 0);
  }

  isContactRecyclingEnabled(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsContactRecyclingEnabled(this.slot) !== 0;
  }

  /** Enables or disables hit events on every shape of the body. */
  enableHitEvents(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_EnableHitEvents(this.slot, flag ? 1 : 0);
  }

  /** Distance from `target` to the body's closest point; the point goes into `outPoint`. */
  getClosestPoint(target: Vec3, outPoint: Vec3 = vec3()): number {
    this.assertAlive('body');
    const distance = this.rt.m._bx_Body_GetClosestPoint(
      this.slot,
      target.x,
      target.y,
      target.z,
    );
    this.rt.scratchVec3(outPoint);
    return distance;
  }

  private readMat3(out: Mat3): Mat3 {
    this.rt.scratchVec3(out.cx, 0);
    this.rt.scratchVec3(out.cy, 3);
    this.rt.scratchVec3(out.cz, 6);
    return out;
  }

  getName(): string {
    this.assertAlive('body');
    return this.rt.string(this.rt.m._bx_Body_GetName(this.slot));
  }

  setName(name: string): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetName(this.slot, this.rt.arena.uploadString(name));
  }

  getPosition(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetPosition(this.slot);
    return this.rt.scratchVec3(out);
  }

  getRotation(out: Quat = quat()): Quat {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetRotation(this.slot);
    return this.rt.scratchQuat(out);
  }

  getTransform(out: Transform = transform()): Transform {
    this.readTransform(out.position, out.rotation);
    return out;
  }

  /** One call, no allocation: the sync path. */
  readTransform(outPosition: Vec3, outRotation: Quat): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetTransform(this.slot);
    this.rt.scratchVec3(outPosition, 0);
    this.rt.scratchQuat(outRotation, 3);
  }

  /** Teleports the body. For a moving kinematic body use setTargetTransform. */
  setTransform(position: Vec3, rotation: Quat): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetTransform(
      this.slot,
      position.x,
      position.y,
      position.z,
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    );
  }

  /** Sets the velocity so the body reaches the target over one time step. */
  setTargetTransform(target: Transform, timeStep: number, wake = true): void {
    this.assertAlive('body');
    const p = target.position;
    const q = target.rotation;
    this.rt.m._bx_Body_SetTargetTransform(
      this.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
      timeStep,
      wake ? 1 : 0,
    );
  }

  getLinearVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLinearVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }

  setLinearVelocity(v: Vec3): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetLinearVelocity(this.slot, v.x, v.y, v.z);
  }

  getAngularVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetAngularVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }

  setAngularVelocity(v: Vec3): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetAngularVelocity(this.slot, v.x, v.y, v.z);
  }

  applyForce(force: Vec3, point: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyForce(
      this.slot,
      force.x,
      force.y,
      force.z,
      point.x,
      point.y,
      point.z,
      wake ? 1 : 0,
    );
  }

  applyForceToCenter(force: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyForceToCenter(
      this.slot,
      force.x,
      force.y,
      force.z,
      wake ? 1 : 0,
    );
  }

  applyTorque(torque: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyTorque(
      this.slot,
      torque.x,
      torque.y,
      torque.z,
      wake ? 1 : 0,
    );
  }

  applyLinearImpulse(impulse: Vec3, point: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyLinearImpulse(
      this.slot,
      impulse.x,
      impulse.y,
      impulse.z,
      point.x,
      point.y,
      point.z,
      wake ? 1 : 0,
    );
  }

  applyLinearImpulseToCenter(impulse: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyLinearImpulseToCenter(
      this.slot,
      impulse.x,
      impulse.y,
      impulse.z,
      wake ? 1 : 0,
    );
  }

  applyAngularImpulse(impulse: Vec3, wake = true): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyAngularImpulse(
      this.slot,
      impulse.x,
      impulse.y,
      impulse.z,
      wake ? 1 : 0,
    );
  }

  getMass(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetMass(this.slot);
  }

  applyMassFromShapes(): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_ApplyMassFromShapes(this.slot);
  }

  getLocalCenterOfMass(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLocalCenterOfMass(this.slot);
    return this.rt.scratchVec3(out);
  }

  getWorldCenterOfMass(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetWorldCenterOfMass(this.slot);
    return this.rt.scratchVec3(out);
  }

  getMassData(
    out: MassData = { mass: 0, center: vec3(), inertia: mat3() },
  ): MassData {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetMassData(this.slot);
    return readMassData(this.rt, out);
  }

  /** Overrides the mass computed from the shapes. */
  setMassData(data: MassData): void {
    this.assertAlive('body');
    const rt = this.rt;
    rt.defF(0, data.mass);
    rt.defVec3(1, data.center);
    rt.defVec3(4, data.inertia.cx);
    rt.defVec3(7, data.inertia.cy);
    rt.defVec3(10, data.inertia.cz);
    rt.m._bx_Body_SetMassData(this.slot);
  }

  getLocalPoint(worldPoint: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLocalPoint(
      this.slot,
      worldPoint.x,
      worldPoint.y,
      worldPoint.z,
    );
    return this.rt.scratchVec3(out);
  }

  getWorldPoint(localPoint: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetWorldPoint(
      this.slot,
      localPoint.x,
      localPoint.y,
      localPoint.z,
    );
    return this.rt.scratchVec3(out);
  }

  getLocalVector(worldVector: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetLocalVector(
      this.slot,
      worldVector.x,
      worldVector.y,
      worldVector.z,
    );
    return this.rt.scratchVec3(out);
  }

  getWorldVector(localVector: Vec3, out: Vec3 = vec3()): Vec3 {
    this.assertAlive('body');
    this.rt.m._bx_Body_GetWorldVector(
      this.slot,
      localVector.x,
      localVector.y,
      localVector.z,
    );
    return this.rt.scratchVec3(out);
  }

  getLinearDamping(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetLinearDamping(this.slot);
  }

  setLinearDamping(damping: number): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetLinearDamping(this.slot, damping);
  }

  getAngularDamping(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetAngularDamping(this.slot);
  }

  setAngularDamping(damping: number): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetAngularDamping(this.slot, damping);
  }

  getGravityScale(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetGravityScale(this.slot);
  }

  setGravityScale(scale: number): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetGravityScale(this.slot, scale);
  }

  isAwake(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsAwake(this.slot) !== 0;
  }

  setAwake(awake: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetAwake(this.slot, awake ? 1 : 0);
  }

  enableSleep(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_EnableSleep(this.slot, flag ? 1 : 0);
  }

  isSleepEnabled(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsSleepEnabled(this.slot) !== 0;
  }

  getSleepThreshold(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetSleepThreshold(this.slot);
  }

  setSleepThreshold(threshold: number): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetSleepThreshold(this.slot, threshold);
  }

  isEnabled(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsEnabled(this.slot) !== 0;
  }

  setEnabled(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetEnabled(this.slot, flag ? 1 : 0);
  }

  isBullet(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsBullet(this.slot) !== 0;
  }

  setBullet(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_SetBullet(this.slot, flag ? 1 : 0);
  }

  allowFastRotation(flag: boolean): void {
    this.assertAlive('body');
    this.rt.m._bx_Body_AllowFastRotation(this.slot, flag ? 1 : 0);
  }

  isFastRotationAllowed(): boolean {
    this.assertAlive('body');
    return this.rt.m._bx_Body_IsFastRotationAllowed(this.slot) !== 0;
  }

  /** Axes left out keep their current lock. */
  setMotionLocks(locks: MotionLocks): void {
    this.assertAlive('body');
    const rt = this.rt;
    rt.m._bx_Body_GetMotionLocks(this.slot);
    const pick = (next: boolean | undefined, at: number): number =>
      (next ?? rt.scratchI(at) !== 0) ? 1 : 0;
    rt.m._bx_Body_SetMotionLocks(
      this.slot,
      pick(locks.linearX, 0),
      pick(locks.linearY, 1),
      pick(locks.linearZ, 2),
      pick(locks.angularX, 3),
      pick(locks.angularY, 4),
      pick(locks.angularZ, 5),
    );
  }

  getMotionLocks(): Required<MotionLocks> {
    this.assertAlive('body');
    const rt = this.rt;
    rt.m._bx_Body_GetMotionLocks(this.slot);
    return {
      linearX: rt.scratchI(0) !== 0,
      linearY: rt.scratchI(1) !== 0,
      linearZ: rt.scratchI(2) !== 0,
      angularX: rt.scratchI(3) !== 0,
      angularY: rt.scratchI(4) !== 0,
      angularZ: rt.scratchI(5) !== 0,
    };
  }

  getShapeCount(): number {
    this.assertAlive('body');
    return this.rt.m._bx_Body_GetShapeCount(this.slot);
  }

  computeAABB(out: AABB = { lowerBound: vec3(), upperBound: vec3() }): AABB {
    this.assertAlive('body');
    this.rt.m._bx_Body_ComputeAABB(this.slot);
    this.rt.scratchVec3(out.lowerBound, 0);
    this.rt.scratchVec3(out.upperBound, 3);
    return out;
  }

  createSphere(options: SphereOptions = {}): Shape {
    this.assertAlive('body');
    stageShapeDef(this.rt, options);
    const c = options.center;
    const slot = this.rt.m._bx_CreateSphereShape(
      this.slot,
      c?.x ?? 0,
      c?.y ?? 0,
      c?.z ?? 0,
      options.radius ?? 0.5,
    );
    return this.adopt(slot, 'sphere');
  }

  createCapsule(options: CapsuleOptions = {}): Shape {
    this.assertAlive('body');
    stageShapeDef(this.rt, options);
    let c1 = options.center1 ?? vec3(0, -0.5, 0);
    let c2 = options.center2 ?? vec3(0, 0.5, 0);
    if (options.height !== undefined) {
      c1 = vec3(0, -0.5 * options.height, 0);
      c2 = vec3(0, 0.5 * options.height, 0);
    }
    const slot = this.rt.m._bx_CreateCapsuleShape(
      this.slot,
      c1.x,
      c1.y,
      c1.z,
      c2.x,
      c2.y,
      c2.z,
      options.radius ?? 0.5,
    );
    return this.adopt(slot, 'capsule');
  }

  /** A box is a convex hull with its offset and rotation baked into the points. */
  createBox(options: BoxOptions = {}): Shape {
    this.assertAlive('body');
    stageShapeDef(this.rt, options);
    const he = options.halfExtents;
    const p = options.offset;
    const q = options.rotation;
    const slot = this.rt.m._bx_CreateBoxShape(
      this.slot,
      he?.x ?? options.hx ?? 0.5,
      he?.y ?? options.hy ?? 0.5,
      he?.z ?? options.hz ?? 0.5,
      p?.x ?? 0,
      p?.y ?? 0,
      p?.z ?? 0,
      q?.x ?? 0,
      q?.y ?? 0,
      q?.z ?? 0,
      q?.w ?? 1,
    );
    return this.adopt(slot, 'box');
  }

  /** Throws when the engine cannot build a hull from the points (fewer than four, coplanar, or degenerate). */
  createHull(options: HullOptions): Shape {
    this.assertAlive('body');
    const flat = flatPoints(options.points);
    if (flat.length % 3 !== 0 || flat.length < 12) {
      throw new RangeError('box3d: a hull needs at least four 3D points');
    }
    const maxVertices = options.maxVertices ?? 32;
    if (
      !Number.isInteger(maxVertices) ||
      maxVertices < 4 ||
      maxVertices > 128
    ) {
      throw new RangeError(
        'box3d: maxVertices must be an integer from 4 to 128',
      );
    }
    stageShapeDef(this.rt, options);
    const ptr = this.rt.arena.uploadF32(flat);
    const slot = this.rt.m._bx_CreateHullShape(
      this.slot,
      ptr,
      flat.length / 3,
      maxVertices,
    );
    return this.adopt(slot, 'hull');
  }

  /** Attaches a mesh. Meshes only collide on static bodies. The mesh must stay valid; it is freed after its last shape. */
  createMesh(mesh: Mesh, options: MeshShapeOptions = {}): Shape {
    this.assertAlive('body');
    if (!mesh.alive) throw new Error('box3d: mesh was released');
    stageShapeDef(this.rt, options);
    const scale = options.scale ?? { x: 1, y: 1, z: 1 };
    const slot = this.rt.m._bx_CreateMeshShape(
      this.slot,
      mesh.slot,
      scale.x,
      scale.y,
      scale.z,
    );
    return this.adopt(slot, 'mesh');
  }

  /** Attaches a prebuilt hull (see b3.createCylinder and friends), optionally placed and scaled. */
  createHullData(hull: Hull, options: HullShapeOptions = {}): Shape {
    this.assertAlive('body');
    if (!hull.alive) throw new Error('box3d: hull was released');
    stageShapeDef(this.rt, options);
    const p = options.position ?? { x: 0, y: 0, z: 0 };
    const q = options.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    const sc = options.scale ?? { x: 1, y: 1, z: 1 };
    const slot = this.rt.m._bx_CreateHullDataShape(
      this.slot,
      hull.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
      sc.x,
      sc.y,
      sc.z,
    );
    return this.adopt(slot, 'hull');
  }

  /** Attaches a baked compound. Compounds are only allowed on static bodies. */
  createCompound(compound: Compound, options: ShapeOptions = {}): Shape {
    this.assertAlive('body');
    if (!compound.alive) throw new Error('box3d: compound was released');
    stageShapeDef(this.rt, options);
    const slot = this.rt.m._bx_CreateCompoundShape(this.slot, compound.slot);
    return this.adopt(slot, 'compound');
  }

  /** Attaches a terrain. Height fields only collide on static bodies. */
  createHeightField(
    heightField: HeightField,
    options: ShapeOptions = {},
  ): Shape {
    this.assertAlive('body');
    if (!heightField.alive) throw new Error('box3d: height field was released');
    stageShapeDef(this.rt, options);
    const slot = this.rt.m._bx_CreateHeightFieldShape(
      this.slot,
      heightField.slot,
    );
    return this.adopt(slot, 'height field');
  }

  private adopt(slot: number, kind: string): Shape {
    if (slot === 0) throw new Error(`box3d: could not create a ${kind} shape`);
    const shape = new Shape(this, slot);
    this.rt.shapes[slot] = shape;
    this.shapes.push(shape);
    return shape;
  }
}
