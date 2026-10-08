import type { Bits } from './runtime/bits.js';

export type { Bits };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
}

/** Column-major 3x3 matrix, the engine's b3Matrix3. */
export interface Mat3 {
  cx: Vec3;
  cy: Vec3;
  cz: Vec3;
}

export interface AABB {
  lowerBound: Vec3;
  upperBound: Vec3;
}

export interface MassData {
  mass: number;
  /** Local center of mass. */
  center: Vec3;
  /** Inertia tensor about the center of mass. */
  inertia: Mat3;
}

export type BodyType = 'static' | 'kinematic' | 'dynamic';

export type ShapeType =
  'capsule' | 'compound' | 'heightField' | 'hull' | 'mesh' | 'sphere';

export type JointType =
  | 'parallel'
  | 'distance'
  | 'filter'
  | 'motor'
  | 'prismatic'
  | 'revolute'
  | 'spherical'
  | 'weld'
  | 'wheel';

export interface Filter {
  categoryBits?: Bits;
  maskBits?: Bits;
  groupIndex?: number;
}

export interface QueryFilter {
  categoryBits?: Bits;
  maskBits?: Bits;
}

export interface MotionLocks {
  linearX?: boolean;
  linearY?: boolean;
  linearZ?: boolean;
  angularX?: boolean;
  angularY?: boolean;
  angularZ?: boolean;
}

export interface WorldCapacity {
  staticShapeCount?: number;
  dynamicShapeCount?: number;
  staticBodyCount?: number;
  dynamicBodyCount?: number;
  contactCount?: number;
}

/** Every field is optional and falls back to the engine default (b3DefaultWorldDef). */
export interface WorldOptions {
  gravity?: Vec3;
  restitutionThreshold?: number;
  hitEventThreshold?: number;
  contactHertz?: number;
  contactDampingRatio?: number;
  contactSpeed?: number;
  maximumLinearSpeed?: number;
  restitutionIterations?: number;
  enableSleep?: boolean;
  enableContinuous?: boolean;
  enableRestitutionPropagation?: boolean;
  /** Threads per step in the deluxe build, the calling thread included; clamped to maxWorkers. 'auto' means maxWorkers. */
  workerCount?: number | 'auto';
  capacity?: WorldCapacity;
}

export interface BodyOptions {
  /** Static when omitted. */
  type?: BodyType;
  position?: Vec3;
  rotation?: Quat;
  linearVelocity?: Vec3;
  angularVelocity?: Vec3;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  sleepThreshold?: number;
  safetyFactor?: number;
  enableSleep?: boolean;
  isAwake?: boolean;
  isBullet?: boolean;
  isEnabled?: boolean;
  allowFastRotation?: boolean;
  enableContactRecycling?: boolean;
  motionLocks?: MotionLocks;
  name?: string;
}

/** Per-surface material, for example one per mesh triangle group. */
export interface SurfaceMaterial {
  friction?: number;
  restitution?: number;
  rollingResistance?: number;
  tangentVelocity?: Vec3;
  userMaterialId?: Bits;
  customColor?: number;
}

export interface ShapeOptions {
  /** Materials that mesh triangle `materialIndices` index into (up to 255). */
  materials?: SurfaceMaterial[];
  density?: number;
  friction?: number;
  restitution?: number;
  rollingResistance?: number;
  tangentVelocity?: Vec3;
  explosionScale?: number;
  userMaterialId?: Bits;
  customColor?: number;
  filter?: Filter;
  isSensor?: boolean;
  enableSensorEvents?: boolean;
  enableContactEvents?: boolean;
  enableHitEvents?: boolean;
  enablePreSolveEvents?: boolean;
  invokeContactCreation?: boolean;
  updateBodyMass?: boolean;
  enableCustomFiltering?: boolean;
  enableSpeculativeContact?: boolean;
}

export interface SphereOptions extends ShapeOptions {
  center?: Vec3;
  /** Default 0.5. */
  radius?: number;
}

export interface CapsuleOptions extends ShapeOptions {
  /** Segment length between the hemisphere centers along the local y axis; overrides center1 and center2. */
  height?: number;
  center1?: Vec3;
  center2?: Vec3;
  /** Default 0.5. */
  radius?: number;
}

export interface BoxOptions extends ShapeOptions {
  /** Default 0.5 on every axis. */
  halfExtents?: Vec3;
  hx?: number;
  hy?: number;
  hz?: number;
  offset?: Vec3;
  rotation?: Quat;
}

export interface HullOptions extends ShapeOptions {
  /** Either {x, y, z} objects or a flat xyz array. At least four non-coplanar points. */
  points: Vec3[] | ArrayLike<number>;
  /** Default 32; the engine caps at 128. */
  maxVertices?: number;
}

export interface ExplodeOptions {
  position: Vec3;
  radius: number;
  /** Impulse fades to zero this far beyond the radius. */
  falloff?: number;
  impulsePerArea?: number;
  maskBits?: Bits;
}

export interface JointOptions {
  localFrameA?: Partial<Transform>;
  localFrameB?: Partial<Transform>;
  /** Shorthand for localFrameA.position. */
  anchorA?: Vec3;
  /** Shorthand for localFrameB.position. */
  anchorB?: Vec3;
  collideConnected?: boolean;
  forceThreshold?: number;
  torqueThreshold?: number;
  constraintHertz?: number;
  constraintDampingRatio?: number;
  drawScale?: number;
}

export interface DistanceJointOptions extends JointOptions {
  length?: number;
  enableSpring?: boolean;
  lowerSpringForce?: number;
  upperSpringForce?: number;
  hertz?: number;
  dampingRatio?: number;
  enableLimit?: boolean;
  minLength?: number;
  maxLength?: number;
  enableMotor?: boolean;
  maxMotorForce?: number;
  motorSpeed?: number;
}

export interface RevoluteJointOptions extends JointOptions {
  targetAngle?: number;
  enableSpring?: boolean;
  hertz?: number;
  dampingRatio?: number;
  enableLimit?: boolean;
  lowerAngle?: number;
  upperAngle?: number;
  enableMotor?: boolean;
  maxMotorTorque?: number;
  motorSpeed?: number;
}

export interface SphericalJointOptions extends JointOptions {
  enableSpring?: boolean;
  hertz?: number;
  dampingRatio?: number;
  targetRotation?: Quat;
  enableConeLimit?: boolean;
  coneAngle?: number;
  enableTwistLimit?: boolean;
  lowerTwistAngle?: number;
  upperTwistAngle?: number;
  enableMotor?: boolean;
  maxMotorTorque?: number;
  motorVelocity?: Vec3;
}

export interface PrismaticJointOptions extends JointOptions {
  enableSpring?: boolean;
  hertz?: number;
  dampingRatio?: number;
  targetTranslation?: number;
  enableLimit?: boolean;
  lowerTranslation?: number;
  upperTranslation?: number;
  enableMotor?: boolean;
  maxMotorForce?: number;
  motorSpeed?: number;
}

export interface WeldJointOptions extends JointOptions {
  linearHertz?: number;
  angularHertz?: number;
  linearDampingRatio?: number;
  angularDampingRatio?: number;
}

export interface MotorJointOptions extends JointOptions {
  linearVelocity?: Vec3;
  maxVelocityForce?: number;
  angularVelocity?: Vec3;
  maxVelocityTorque?: number;
  linearHertz?: number;
  linearDampingRatio?: number;
  maxSpringForce?: number;
  angularHertz?: number;
  angularDampingRatio?: number;
  maxSpringTorque?: number;
}

export interface WheelJointOptions extends JointOptions {
  enableSuspensionSpring?: boolean;
  suspensionHertz?: number;
  suspensionDampingRatio?: number;
  enableSuspensionLimit?: boolean;
  lowerSuspensionLimit?: number;
  upperSuspensionLimit?: number;
  enableSpinMotor?: boolean;
  maxSpinTorque?: number;
  spinSpeed?: number;
  enableSteering?: boolean;
  steeringHertz?: number;
  steeringDampingRatio?: number;
  targetSteeringAngle?: number;
  maxSteeringTorque?: number;
  enableSteeringLimit?: boolean;
  lowerSteeringLimit?: number;
  upperSteeringLimit?: number;
}

export interface ParallelJointOptions extends JointOptions {
  hertz?: number;
  dampingRatio?: number;
  maxTorque?: number;
}

export type FilterJointOptions = JointOptions;

/** Step timings in milliseconds, the engine's b3Profile. */
export interface Profile {
  step: number;
  pairs: number;
  collide: number;
  solve: number;
  solverSetup: number;
  constraints: number;
  prepareConstraints: number;
  integrateVelocities: number;
  warmStart: number;
  solveImpulses: number;
  integratePositions: number;
  relaxImpulses: number;
  restitution: number;
  storeImpulses: number;
  splitIslands: number;
  transforms: number;
  sensorHits: number;
  jointEvents: number;
  hitEvents: number;
  refit: number;
  bullets: number;
  sleepIslands: number;
  sensors: number;
}

export interface Counters {
  bodyCount: number;
  shapeCount: number;
  contactCount: number;
  jointCount: number;
  islandCount: number;
  stackUsed: number;
  arenaCapacity: number;
  staticTreeHeight: number;
  treeHeight: number;
  taskCount: number;
  awakeContactCount: number;
  recycledContactCount: number;
  byteCount: number;
  satCallCount: number;
  satCacheHitCount: number;
  /** Constraints per graph color. */
  colorCounts: number[];
  /** Contacts bucketed by manifold count. */
  manifoldCounts: number[];
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w };
}

export function transform(): Transform {
  return { position: vec3(), rotation: quat() };
}

export function mat3(): Mat3 {
  return { cx: vec3(), cy: vec3(), cz: vec3() };
}

export interface WorldCapacity {
  staticShapes: number;
  dynamicShapes: number;
  staticBodies: number;
  dynamicBodies: number;
  contacts: number;
}

/** Result of casting a ray or shape at one body. Allocates; the world-level casts reuse a result object instead. */
export interface BodyCastResult {
  hit: boolean;
  shape: import('./shape.js').Shape | undefined;
  point: Vec3;
  normal: Vec3;
  fraction: number;
  triangleIndex: number;
  userMaterialId: Bits;
}

/** Callbacks that run inside the step; see World.setCallbacks. */
export interface WorldCallbacks {
  friction?: (
    frictionA: number,
    materialIdA: Bits,
    frictionB: number,
    materialIdB: Bits,
  ) => number | undefined;
  restitution?: (
    restitutionA: number,
    materialIdA: Bits,
    restitutionB: number,
    materialIdB: Bits,
  ) => number | undefined;
  preSolve?: (
    shapeA: import('./shape.js').Shape,
    shapeB: import('./shape.js').Shape,
    point: Vec3,
    normal: Vec3,
  ) => boolean;
  customFilter?: (
    shapeA: import('./shape.js').Shape,
    shapeB: import('./shape.js').Shape,
  ) => boolean;
}
