import { Body } from './body.js';
import { TransformBatch } from './batch.js';
import {
  ContactBeginEvents,
  ContactEndEvents,
  ContactHitEvents,
  JointEvents,
  MoveEvents,
  SensorEvents,
} from './events.js';
import { DebugDrawBuffers, type DebugDrawOptions } from './debugdraw.js';
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
import {
  CAST_MODES,
  type CastMode,
  HitList,
  RayHit,
  ShapeList,
} from './queries.js';
import { type Mover, PlaneList, uploadMover } from './mover.js';
import type { ShapeProxy } from './proxy.js';
import { ALL_BITS_WORD, hi32, join64, lo32 } from './runtime/bits.js';
import { Stride, WorldDef, WorldFlag } from './runtime/layouts.js';
import type { Runtime } from './runtime/module.js';
import {
  type AABB,
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
  type WorldCallbacks,
  type WorldCapacity,
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

const COLOR_COUNTS = 24;
const MANIFOLD_COUNTS = 8;

function emptyCounters(): Counters {
  const counters = {
    byteCount: 0,
    satCallCount: 0,
    satCacheHitCount: 0,
    colorCounts: new Array<number>(COLOR_COUNTS).fill(0),
    manifoldCounts: new Array<number>(MANIFOLD_COUNTS).fill(0),
  } as Counters;
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
const NO_FILTER: QueryFilter = Object.freeze({});

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
  private readonly drawBuffers: DebugDrawBuffers;
  private readonly hits: HitList;
  private readonly overlaps: ShapeList;

  constructor(
    readonly rt: Runtime,
    options: WorldOptions = {},
  ) {
    super(createWorld(rt, options));
    this.drawBuffers = new DebugDrawBuffers(rt);
    this.hits = new HitList(rt);
    this.overlaps = new ShapeList(rt);
    this.moveEvents = new MoveEvents(rt, Stride.MOVE);
    this.contactBeginEvents = new ContactBeginEvents(rt, Stride.CONTACT_BEGIN);
    this.contactEndEvents = new ContactEndEvents(rt, Stride.CONTACT_END);
    this.contactHitEvents = new ContactHitEvents(rt, Stride.CONTACT_HIT);
    this.sensorBeginEvents = new SensorEvents(rt, Stride.SENSOR);
    this.sensorEndEvents = new SensorEvents(rt, Stride.SENSOR);
    this.jointEvents = new JointEvents(rt, Stride.JOINT_EVENT);
  }

  isValid(): boolean {
    return this.alive && this.rt.m._bx_World_IsValid(this.slot) !== 0;
  }

  /** Destroys the world and every body, shape and joint in it. */
  destroy(): void {
    if (!this.alive) return;
    const callbacks = (
      this.rt.m as unknown as { bxCallbacks?: Record<number, unknown> }
    ).bxCallbacks;
    if (callbacks) Reflect.deleteProperty(callbacks, this.slot);
    this.rt.m._bx_DestroyWorld(this.slot);
    for (const body of this.bodies) body.release();
    this.bodies.clear();
    this.joints.clear();
    this.alive = false;
  }

  step(timeStep: number, subStepCount = 4): void {
    this.assertAlive('world');
    if (!(timeStep >= 0) || !Number.isFinite(timeStep)) {
      throw new RangeError(`box3d: invalid time step ${timeStep}`);
    }
    if (!Number.isInteger(subStepCount) || subStepCount < 1) {
      throw new RangeError(
        `box3d: sub-step count must be an integer >= 1, got ${subStepCount}`,
      );
    }
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

  enableWarmStarting(flag: boolean): void {
    this.assertAlive('world');
    this.rt.m._bx_World_EnableWarmStarting(this.slot, flag ? 1 : 0);
  }

  isWarmStartingEnabled(): boolean {
    this.assertAlive('world');
    return this.rt.m._bx_World_IsWarmStartingEnabled(this.slot) !== 0;
  }

  enableSpeculative(flag: boolean): void {
    this.assertAlive('world');
    this.rt.m._bx_World_EnableSpeculative(this.slot, flag ? 1 : 0);
  }

  enableRestitutionPropagation(flag: boolean): void {
    this.assertAlive('world');
    this.rt.m._bx_World_EnableRestitutionPropagation(this.slot, flag ? 1 : 0);
  }

  isRestitutionPropagationEnabled(): boolean {
    this.assertAlive('world');
    return this.rt.m._bx_World_IsRestitutionPropagationEnabled(this.slot) !== 0;
  }

  setRestitutionIterations(iterations: number): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetRestitutionIterations(this.slot, iterations);
  }

  getRestitutionIterations(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetRestitutionIterations(this.slot);
  }

  setContactRecycleDistance(distance: number): void {
    this.assertAlive('world');
    this.rt.m._bx_World_SetContactRecycleDistance(this.slot, distance);
  }

  getContactRecycleDistance(): number {
    this.assertAlive('world');
    return this.rt.m._bx_World_GetContactRecycleDistance(this.slot);
  }

  /** The bounds of everything in the world. */
  getBounds(out: AABB = { lowerBound: vec3(), upperBound: vec3() }): AABB {
    this.assertAlive('world');
    this.rt.m._bx_World_GetBounds(this.slot);
    this.rt.scratchVec3(out.lowerBound, 0);
    this.rt.scratchVec3(out.upperBound, 3);
    return out;
  }

  /** The largest body, shape and contact counts the world has needed so far. */
  getMaxCapacity(): WorldCapacity {
    this.assertAlive('world');
    this.rt.m._bx_World_GetMaxCapacity(this.slot);
    const rt = this.rt;
    return {
      staticShapes: rt.scratchI(0),
      dynamicShapes: rt.scratchI(1),
      staticBodies: rt.scratchI(2),
      dynamicBodies: rt.scratchI(3),
      contacts: rt.scratchI(4),
    };
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
  /**
   * Runs a debug draw pass (joints, bounds, contacts, islands, mass...) into
   * line and point buffers owned by the world; the next call overwrites them.
   */
  debugDraw(options: DebugDrawOptions = {}): DebugDrawBuffers {
    this.assertAlive('world');
    return this.drawBuffers.fill(this.slot, options);
  }

  /**
   * Installs JS callbacks that run inside the step. Passing `{}` removes them.
   *
   * - `friction` / `restitution` combine two surfaces; return a number, or undefined for the default
   *   (geometric mean of friction, larger restitution). Material ids are numbers, or bigints above 2^53.
   * - `customFilter` returns false to stop two shapes colliding (needs `enableCustomFiltering` on the shapes).
   * - `preSolve` returns false to disable one contact point this step (needs `enablePreSolveEvents`).
   *
   * Callbacks make the step run on one thread: the world drops to a single worker while any callback is set.
   */
  setCallbacks(callbacks: WorldCallbacks): void {
    this.assertAlive('world');
    const rt = this.rt;
    const m = rt.m as unknown as { bxCallbacks?: Record<number, unknown> };
    const table = (m.bxCallbacks ??= {});
    let mask = 0;
    const entry: Record<string, unknown> = {};
    if (callbacks.friction) {
      mask |= 1;
      const fn = callbacks.friction;
      entry.friction = (
        a: number,
        aLo: number,
        aHi: number,
        b: number,
        bLo: number,
        bHi: number,
      ) => fn(a, join64(aLo, aHi), b, join64(bLo, bHi)) ?? Number.NaN;
    }
    if (callbacks.restitution) {
      mask |= 2;
      const fn = callbacks.restitution;
      entry.restitution = (
        a: number,
        aLo: number,
        aHi: number,
        b: number,
        bLo: number,
        bHi: number,
      ) => fn(a, join64(aLo, aHi), b, join64(bLo, bHi)) ?? Number.NaN;
    }
    if (callbacks.preSolve) {
      mask |= 4;
      const fn = callbacks.preSolve;
      const point = vec3();
      const normal = vec3();
      entry.preSolve = (
        a: number,
        b: number,
        px: number,
        py: number,
        pz: number,
        nx: number,
        ny: number,
        nz: number,
      ) => {
        const sa = rt.shapes[a];
        const sb = rt.shapes[b];
        if (!sa || !sb) return true;
        point.x = px;
        point.y = py;
        point.z = pz;
        normal.x = nx;
        normal.y = ny;
        normal.z = nz;
        return fn(sa, sb, point, normal);
      };
    }
    if (callbacks.customFilter) {
      mask |= 8;
      const fn = callbacks.customFilter;
      entry.customFilter = (a: number, b: number) => {
        const sa = rt.shapes[a];
        const sb = rt.shapes[b];
        return sa && sb ? fn(sa, sb) : true;
      };
    }
    if (mask === 0) Reflect.deleteProperty(table, this.slot);
    else table[this.slot] = entry;
    rt.m._bx_World_SetCallbacks(this.slot, mask);
  }

  /** A bulk transform reader and writer over the given bodies (see TransformBatch). */
  createTransformBatch(bodies: readonly Body[] = []): TransformBatch {
    this.assertAlive('world');
    return new TransformBatch(this.rt, bodies);
  }

  castRayClosest(
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = NO_FILTER,
  ): RayHit {
    this.assertAlive('world');
    // Plain words for the default filter keep this path free of bigint math.
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const shape = this.rt.m._bx_World_CastRayClosest(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
    return this.rayHit.load(this.rt, shape);
  }

  /**
   * Casts a ray and collects hits: 'all' (nearest first), 'closest' or 'any'.
   * The result belongs to the world and is overwritten by the next cast.
   */
  castRay(
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = NO_FILTER,
    mode: CastMode = 'all',
  ): HitList {
    this.assertAlive('world');
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const count = this.rt.m._bx_World_CastRay(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      translation.x,
      translation.y,
      translation.z,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
      CAST_MODES[mode],
    );
    return this.hits.load(count);
  }

  /** Sweeps a shape proxy (see sphereProxy, capsuleProxy, boxProxy) from origin along translation. */
  castShape(
    proxy: ShapeProxy,
    origin: Vec3,
    translation: Vec3,
    filter: QueryFilter = NO_FILTER,
    mode: CastMode = 'all',
  ): HitList {
    this.assertAlive('world');
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const count = this.withProxy(proxy, (ptr, n) =>
      this.rt.m._bx_World_CastShape(
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
        category === undefined ? ALL_BITS_WORD : lo32(category),
        category === undefined ? ALL_BITS_WORD : hi32(category),
        mask === undefined ? ALL_BITS_WORD : lo32(mask),
        mask === undefined ? ALL_BITS_WORD : hi32(mask),
        CAST_MODES[mode],
      ),
    );
    return this.hits.load(count);
  }

  /** Shapes whose bounding box overlaps the box. This is a broad-phase test, not exact. */
  overlapAABB(
    lowerBound: Vec3,
    upperBound: Vec3,
    filter: QueryFilter = NO_FILTER,
  ): ShapeList {
    this.assertAlive('world');
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const count = this.rt.m._bx_World_OverlapAABB(
      this.slot,
      lowerBound.x,
      lowerBound.y,
      lowerBound.z,
      upperBound.x,
      upperBound.y,
      upperBound.z,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
    return this.overlaps.load(count);
  }

  /** Shapes that overlap a proxy placed at origin. */
  overlapShape(
    proxy: ShapeProxy,
    origin: Vec3,
    filter: QueryFilter = NO_FILTER,
  ): ShapeList {
    this.assertAlive('world');
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    const count = this.withProxy(proxy, (ptr, n) =>
      this.rt.m._bx_World_OverlapShape(
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
      ),
    );
    return this.overlaps.load(count);
  }

  /**
   * Sweeps a capsule mover along `translation` and returns the fraction (0 to 1)
   * it can travel before hitting something.
   */
  castMover(
    origin: Vec3,
    mover: Mover,
    translation: Vec3,
    filter: QueryFilter = NO_FILTER,
  ): number {
    this.assertAlive('world');
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    return this.rt.m._bx_World_CastMover(
      this.slot,
      origin.x,
      origin.y,
      origin.z,
      uploadMover(this.rt, mover),
      translation.x,
      translation.y,
      translation.z,
      category === undefined ? ALL_BITS_WORD : lo32(category),
      category === undefined ? ALL_BITS_WORD : hi32(category),
      mask === undefined ? ALL_BITS_WORD : lo32(mask),
      mask === undefined ? ALL_BITS_WORD : hi32(mask),
    );
  }

  /**
   * Collision planes between the mover and the world, ready for solvePlanes.
   * The list is shared and overwritten by the next collideMover call.
   */
  collideMover(
    origin: Vec3,
    mover: Mover,
    filter: QueryFilter = NO_FILTER,
  ): PlaneList {
    this.assertAlive('world');
    const rt = this.rt;
    const category = filter.categoryBits;
    const mask = filter.maskBits;
    rt.planes ??= new PlaneList(rt);
    return rt.planes.load(
      rt.m._bx_World_CollideMover(
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

  private withProxy<T>(
    proxy: ShapeProxy,
    fn: (ptr: number, count: number) => T,
  ): T {
    const n = proxy.points.length / 3;
    if (!Number.isInteger(n) || n < 1 || n > 128) {
      throw new RangeError(
        'box3d: a shape proxy needs 1 to 128 points (flat xyz array)',
      );
    }
    const ptr = this.rt.arena.uploadF32(proxy.points);
    return fn(ptr, n);
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
      m._bx_MoveEventsPtr(this.slot),
    );
  }

  getContactBeginEvents(): ContactBeginEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactBeginEvents.load(
      m._bx_World_GetContactBeginEvents(this.slot),
      m._bx_ContactBeginEventsPtr(this.slot),
    );
  }

  getContactEndEvents(): ContactEndEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactEndEvents.load(
      m._bx_World_GetContactEndEvents(this.slot),
      m._bx_ContactEndEventsPtr(this.slot),
    );
  }

  getContactHitEvents(): ContactHitEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.contactHitEvents.load(
      m._bx_World_GetContactHitEvents(this.slot),
      m._bx_ContactHitEventsPtr(this.slot),
    );
  }

  getSensorBeginEvents(): SensorEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.sensorBeginEvents.load(
      m._bx_World_GetSensorBeginEvents(this.slot),
      m._bx_SensorBeginEventsPtr(this.slot),
    );
  }

  getSensorEndEvents(): SensorEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.sensorEndEvents.load(
      m._bx_World_GetSensorEndEvents(this.slot),
      m._bx_SensorEndEventsPtr(this.slot),
    );
  }

  /** Joints that crossed their force or torque threshold in the last step. */
  getJointEvents(): JointEvents {
    this.assertAlive('world');
    const m = this.rt.m;
    return this.jointEvents.load(
      m._bx_World_GetJointEvents(this.slot),
      m._bx_JointEventsPtr(this.slot),
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
    out.satCallCount = this.rt.scratchI(14);
    out.satCacheHitCount = this.rt.scratchI(15);
    for (let i = 0; i < COLOR_COUNTS; i++)
      out.colorCounts[i] = this.rt.scratchI(16 + i);
    for (let i = 0; i < MANIFOLD_COUNTS; i++) {
      out.manifoldCounts[i] = this.rt.scratchI(16 + COLOR_COUNTS + i);
    }
    return out;
  }
}
