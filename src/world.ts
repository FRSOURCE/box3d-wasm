import { Body } from './body.js';
import {
  ContactBeginEvents,
  ContactEndEvents,
  ContactHitEvents,
  JointEvents,
  MoveEvents,
  SensorEvents,
} from './events.js';
import { Handle } from './handle.js';
import {
  createDistanceJoint,
  createFilterJoint,
  createMotorJoint,
  createParallelJoint,
  createPrismaticJoint,
  createRevoluteJoint,
  createSphericalJoint,
  createWeldJoint,
  createWheelJoint,
  type DistanceJoint,
  type FilterJoint,
  type Joint,
  type MotorJoint,
  type ParallelJoint,
  type PrismaticJoint,
  type RevoluteJoint,
  type SphericalJoint,
  type WeldJoint,
  type WheelJoint,
} from './joints.js';
import { RayHit } from './queries.js';
import { hi32, lo32 } from './runtime/bits.js';
import { WorldDef, WorldFlag } from './runtime/layouts.js';
import type { Runtime } from './runtime/module.js';
import {
  type BodyOptions,
  type Counters,
  type DistanceJointOptions,
  type ExplodeOptions,
  type FilterJointOptions,
  type MotorJointOptions,
  type ParallelJointOptions,
  type PrismaticJointOptions,
  type Profile,
  type QueryFilter,
  type RevoluteJointOptions,
  type SphericalJointOptions,
  type Vec3,
  vec3,
  type WeldJointOptions,
  type WheelJointOptions,
  type WorldOptions,
} from './types.js';

const PROFILE_FIELDS = [
  'step',
  'pairs',
  'collide',
  'solve',
  'solverSetup',
  'constraints',
  'prepareConstraints',
  'integrateVelocities',
  'warmStart',
  'solveImpulses',
  'integratePositions',
  'relaxImpulses',
  'restitution',
  'storeImpulses',
  'splitIslands',
  'transforms',
  'sensorHits',
  'jointEvents',
  'hitEvents',
  'refit',
  'bullets',
  'sleepIslands',
  'sensors',
] as const satisfies readonly (keyof Profile)[];

const COUNTER_FIELDS = [
  'bodyCount',
  'shapeCount',
  'contactCount',
  'jointCount',
  'islandCount',
  'stackUsed',
  'arenaCapacity',
  'staticTreeHeight',
  'treeHeight',
  'taskCount',
  'awakeContactCount',
  'recycledContactCount',
] as const satisfies readonly (keyof Counters)[];

function emptyProfile(): Profile {
  const profile = {} as Record<keyof Profile, number>;
  for (const field of PROFILE_FIELDS) profile[field] = 0;
  return profile;
}

function emptyCounters(): Counters {
  const counters = { byteCount: 0 } as Record<keyof Counters, number>;
  for (const field of COUNTER_FIELDS) counters[field] = 0;
  return counters;
}

/** Writes b3DefaultWorldDef plus the given overrides into the def buffer and creates the world. */
function createWorld(rt: Runtime, o: WorldOptions): number {
  const m = rt.m;
  m._bx_WorldDef_Default();
  rt.defVec3(WorldDef.GRAVITY, o.gravity);
  rt.defF(WorldDef.RESTITUTION_THRESHOLD, o.restitutionThreshold);
  rt.defF(WorldDef.HIT_EVENT_THRESHOLD, o.hitEventThreshold);
  rt.defF(WorldDef.CONTACT_HERTZ, o.contactHertz);
  rt.defF(WorldDef.CONTACT_DAMPING_RATIO, o.contactDampingRatio);
  rt.defF(WorldDef.CONTACT_SPEED, o.contactSpeed);
  rt.defF(WorldDef.MAXIMUM_LINEAR_SPEED, o.maximumLinearSpeed);
  rt.defI(WorldDef.RESTITUTION_ITERATIONS, o.restitutionIterations);
  rt.defFlag(WorldDef.FLAGS, WorldFlag.ENABLE_SLEEP, o.enableSleep);
  rt.defFlag(WorldDef.FLAGS, WorldFlag.ENABLE_CONTINUOUS, o.enableContinuous);
  rt.defFlag(
    WorldDef.FLAGS,
    WorldFlag.ENABLE_RESTITUTION_PROPAGATION,
    o.enableRestitutionPropagation,
  );
  if (o.workerCount !== undefined) {
    rt.defU(
      WorldDef.WORKER_COUNT,
      o.workerCount === 'auto' ? m._bx_GetMaxWorkers() : o.workerCount,
    );
  }
  const capacity = o.capacity;
  rt.defI(WorldDef.CAPACITY, capacity?.staticShapeCount);
  rt.defI(WorldDef.CAPACITY + 1, capacity?.dynamicShapeCount);
  rt.defI(WorldDef.CAPACITY + 2, capacity?.staticBodyCount);
  rt.defI(WorldDef.CAPACITY + 3, capacity?.dynamicBodyCount);
  rt.defI(WorldDef.CAPACITY + 4, capacity?.contactCount);
  const slot = m._bx_CreateWorld();
  if (slot === 0)
    throw new Error(
      'box3d: could not create a world (the engine allows 128 at once)',
    );
  return slot;
}

/** A simulation world. Construct it through the module: `new b3.World(options)`. */
export class World extends Handle {
  /** Live bodies in creation order is not guaranteed; iterate for bulk operations. */
  readonly bodies = new Set<Body>();
  readonly joints = new Set<Joint>();
  private readonly moveEvents: MoveEvents;
  private readonly contactBeginEvents: ContactBeginEvents;
  private readonly contactEndEvents: ContactEndEvents;
  private readonly contactHitEvents: ContactHitEvents;
  private readonly sensorBeginEvents: SensorEvents;
  private readonly sensorEndEvents: SensorEvents;
  private readonly jointEvents: JointEvents;
  private readonly rayHit = new RayHit();

  constructor(
    readonly rt: Runtime,
    options: WorldOptions = {},
  ) {
    super(createWorld(rt, options));
    this.moveEvents = new MoveEvents(rt, 9);
    this.contactBeginEvents = new ContactBeginEvents(rt, 13);
    this.contactEndEvents = new ContactEndEvents(rt, 4);
    this.contactHitEvents = new ContactHitEvents(rt, 11);
    this.sensorBeginEvents = new SensorEvents(rt, 4);
    this.sensorEndEvents = new SensorEvents(rt, 4);
    this.jointEvents = new JointEvents(rt, 1);
  }

  isValid(): boolean {
    return this.alive && this.rt.m._bx_World_IsValid(this.slot) !== 0;
  }

  /** Destroys the world and every body, shape and joint in it. */
  destroy(): void {
    if (!this.alive) return;
    this.rt.m._bx_DestroyWorld(this.slot);
    for (const body of this.bodies) body.release();
    this.bodies.clear();
    this.joints.clear();
    this.alive = false;
  }

  step(timeStep: number, subStepCount = 4): void {
    this.assertAlive('world');
    this.rt.m._bx_World_Step(this.slot, timeStep, subStepCount);
  }

  getGravity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('world');
    this.rt.m._bx_World_GetGravity(this.slot);
    return this.rt.scratchVec3(out);
  }

  setGravity(gravity: Vec3): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetGravity(this.slot, gravity.x, gravity.y, gravity.z);
  }

  enableSleeping(flag: boolean): void {
    this.assertAlive('world');
    this.rt.m._bx_World_EnableSleeping(this.slot, flag ? 1 : 0);
  }

  isSleepingEnabled(): boolean {
    this.assertAlive('world');
    return this.rt.m._bx_World_IsSleepingEnabled(this.slot) !== 0;
  }

  enableContinuous(flag: boolean): void {
    this.assertAlive('world');
    this.rt.m._bx_World_EnableContinuous(this.slot, flag ? 1 : 0);
  }

  isContinuousEnabled(): boolean {
    this.assertAlive('world');
    return this.rt.m._bx_World_IsContinuousEnabled(this.slot) !== 0;
  }

  setMaximumLinearSpeed(speed: number): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetMaximumLinearSpeed(this.slot, speed);
  }

  getMaximumLinearSpeed(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetMaximumLinearSpeed(this.slot);
  }

  setContactTuning(
    hertz: number,
    dampingRatio: number,
    contactSpeed: number,
  ): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetContactTuning(
      this.slot,
      hertz,
      dampingRatio,
      contactSpeed,
    );
  }

  setRestitutionThreshold(value: number): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetRestitutionThreshold(this.slot, value);
  }

  getRestitutionThreshold(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetRestitutionThreshold(this.slot);
  }

  setHitEventThreshold(value: number): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetHitEventThreshold(this.slot, value);
  }

  getHitEventThreshold(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetHitEventThreshold(this.slot);
  }

  getAwakeBodyCount(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetAwakeBodyCount(this.slot);
  }

  /** Threads a step uses, the calling thread included. 1 in the standard build. */
  getWorkerCount(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetWorkerCount(this.slot);
  }

  createBody(options: BodyOptions = {}): Body {
    this.assertAlive('world');
    return Body.create(this, options);
  }

  createDistanceJoint(
    a: Body,
    b: Body,
    options: DistanceJointOptions = {},
  ): DistanceJoint {
    this.assertAlive('world');
    return createDistanceJoint(this, a, b, options);
  }

  createRevoluteJoint(
    a: Body,
    b: Body,
    options: RevoluteJointOptions = {},
  ): RevoluteJoint {
    this.assertAlive('world');
    return createRevoluteJoint(this, a, b, options);
  }

  createSphericalJoint(
    a: Body,
    b: Body,
    options: SphericalJointOptions = {},
  ): SphericalJoint {
    this.assertAlive('world');
    return createSphericalJoint(this, a, b, options);
  }

  createPrismaticJoint(
    a: Body,
    b: Body,
    options: PrismaticJointOptions = {},
  ): PrismaticJoint {
    this.assertAlive('world');
    return createPrismaticJoint(this, a, b, options);
  }

  createWeldJoint(a: Body, b: Body, options: WeldJointOptions = {}): WeldJoint {
    this.assertAlive('world');
    return createWeldJoint(this, a, b, options);
  }

  createMotorJoint(
    a: Body,
    b: Body,
    options: MotorJointOptions = {},
  ): MotorJoint {
    this.assertAlive('world');
    return createMotorJoint(this, a, b, options);
  }

  createWheelJoint(
    a: Body,
    b: Body,
    options: WheelJointOptions = {},
  ): WheelJoint {
    this.assertAlive('world');
    return createWheelJoint(this, a, b, options);
  }

  createParallelJoint(
    a: Body,
    b: Body,
    options: ParallelJointOptions = {},
  ): ParallelJoint {
    this.assertAlive('world');
    return createParallelJoint(this, a, b, options);
  }

  createFilterJoint(
    a: Body,
    b: Body,
    options: FilterJointOptions = {},
  ): FilterJoint {
    this.assertAlive('world');
    return createFilterJoint(this, a, b, options);
  }

  /**
   * Casts a ray and returns the closest hit. The result object belongs to the
   * world and is overwritten by the next cast; copy what you need to keep.
   */
  castRayClosest(
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = {},
  ): RayHit {
    this.assertAlive('world');
    const category = filter.categoryBits ?? 0xffffffffffffffffn;
    const mask = filter.maskBits ?? 0xffffffffffffffffn;
    const shape = this.rt.m._bx_World_CastRayClosest(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      lo32(category),
      hi32(category),
      lo32(mask),
      hi32(mask),
    );
    return this.rayHit.load(this.rt, shape);
  }

  /** A radial impulse on every sphere, capsule and hull within radius plus falloff. */
  explode(options: ExplodeOptions): void {
    this.assertAlive('world');
    const p = options.position;
    const mask = options.maskBits ?? 0xffffffffffffffffn;
    this.rt.m._bx_World_Explode(
      this.slot,
      p.x,
      p.y,
      p.z,
      options.radius,
      options.falloff ?? 0,
      options.impulsePerArea ?? 0,
      lo32(mask),
      hi32(mask),
    );
  }

  /** Bodies that moved in the last step. The reader is reused; read it before the next step. */
  getMoveEvents(): MoveEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.moveEvents.load(
      m._bx_World_GetMoveEvents(this.slot),
      m._bx_MoveEventsPtr(),
    );
  }

  getContactBeginEvents(): ContactBeginEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactBeginEvents.load(
      m._bx_World_GetContactBeginEvents(this.slot),
      m._bx_ContactBeginEventsPtr(),
    );
  }

  getContactEndEvents(): ContactEndEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactEndEvents.load(
      m._bx_World_GetContactEndEvents(this.slot),
      m._bx_ContactEndEventsPtr(),
    );
  }

  getContactHitEvents(): ContactHitEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactHitEvents.load(
      m._bx_World_GetContactHitEvents(this.slot),
      m._bx_ContactHitEventsPtr(),
    );
  }

  getSensorBeginEvents(): SensorEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.sensorBeginEvents.load(
      m._bx_World_GetSensorBeginEvents(this.slot),
      m._bx_SensorBeginEventsPtr(),
    );
  }

  getSensorEndEvents(): SensorEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.sensorEndEvents.load(
      m._bx_World_GetSensorEndEvents(this.slot),
      m._bx_SensorEndEventsPtr(),
    );
  }

  /** Joints that crossed their force or torque threshold in the last step. */
  getJointEvents(): JointEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.jointEvents.load(
      m._bx_World_GetJointEvents(this.slot),
      m._bx_JointEventsPtr(),
    );
  }

  /** Timings of the last step in milliseconds. */
  getProfile(out: Profile = emptyProfile()): Profile {
    this.assertAlive('world');
    const count = this.rt.m._bx_World_GetProfile(this.slot);
    for (let i = 0; i < count && i < PROFILE_FIELDS.length; i++) {
      out[PROFILE_FIELDS[i]] = this.rt.scratchF(i);
    }
    return out;
  }

  getCounters(out: Counters = emptyCounters()): Counters {
    this.assertAlive('world');
    this.rt.m._bx_World_GetCounters(this.slot);
    for (let i = 0; i < COUNTER_FIELDS.length; i++) {
      out[COUNTER_FIELDS[i]] = this.rt.scratchI(i);
    }
    out.byteCount = this.rt.scratchU(12) + this.rt.scratchU(13) * 4294967296;
    return out;
  }
}
