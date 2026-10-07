// Word indices into the def buffer and record strides of the event buffers.
// Mirrors the enums in csrc/bx.h; test/exports.test.ts checks both sides agree.

export const WorldDef = {
  GRAVITY: 0,
  RESTITUTION_THRESHOLD: 3,
  HIT_EVENT_THRESHOLD: 4,
  CONTACT_HERTZ: 5,
  CONTACT_DAMPING_RATIO: 6,
  CONTACT_SPEED: 7,
  MAXIMUM_LINEAR_SPEED: 8,
  RESTITUTION_ITERATIONS: 9,
  WORKER_COUNT: 10,
  FLAGS: 11,
  CAPACITY: 12,
  WORDS: 17,
} as const;

export const WorldFlag = {
  ENABLE_SLEEP: 0,
  ENABLE_CONTINUOUS: 1,
  ENABLE_RESTITUTION_PROPAGATION: 2,
} as const;

export const BodyDef = {
  TYPE: 0,
  POSITION: 1,
  ROTATION: 4,
  LINEAR_VELOCITY: 8,
  ANGULAR_VELOCITY: 11,
  LINEAR_DAMPING: 14,
  ANGULAR_DAMPING: 15,
  GRAVITY_SCALE: 16,
  SLEEP_THRESHOLD: 17,
  SAFETY_FACTOR: 18,
  FLAGS: 19,
  WORDS: 20,
} as const;

export const BodyFlag = {
  ENABLE_SLEEP: 0,
  IS_AWAKE: 1,
  IS_BULLET: 2,
  IS_ENABLED: 3,
  ALLOW_FAST_ROTATION: 4,
  ENABLE_CONTACT_RECYCLING: 5,
  LOCK_LINEAR_X: 6,
  LOCK_LINEAR_Y: 7,
  LOCK_LINEAR_Z: 8,
  LOCK_ANGULAR_X: 9,
  LOCK_ANGULAR_Y: 10,
  LOCK_ANGULAR_Z: 11,
} as const;

export const ShapeDef = {
  DENSITY: 0,
  FRICTION: 1,
  RESTITUTION: 2,
  ROLLING_RESISTANCE: 3,
  TANGENT_VELOCITY: 4,
  EXPLOSION_SCALE: 7,
  USER_MATERIAL_ID: 8,
  CATEGORY_BITS: 10,
  MASK_BITS: 12,
  GROUP_INDEX: 14,
  FLAGS: 15,
  CUSTOM_COLOR: 16,
  WORDS: 17,
} as const;

export const ShapeFlag = {
  IS_SENSOR: 0,
  ENABLE_SENSOR_EVENTS: 1,
  ENABLE_CONTACT_EVENTS: 2,
  ENABLE_HIT_EVENTS: 3,
  ENABLE_PRE_SOLVE_EVENTS: 4,
  INVOKE_CONTACT_CREATION: 5,
  UPDATE_BODY_MASS: 6,
  ENABLE_CUSTOM_FILTERING: 7,
  ENABLE_SPECULATIVE_CONTACT: 8,
} as const;

export const JointDef = {
  LOCAL_FRAME_A: 0,
  LOCAL_FRAME_B: 7,
  FORCE_THRESHOLD: 14,
  TORQUE_THRESHOLD: 15,
  CONSTRAINT_HERTZ: 16,
  CONSTRAINT_DAMPING_RATIO: 17,
  DRAW_SCALE: 18,
  FLAGS: 19,
  WORDS: 20,
} as const;

export const JointFlag = {
  COLLIDE_CONNECTED: 0,
} as const;

const J = JointDef.WORDS;

export const DistanceJointDef = {
  LENGTH: J + 0,
  LOWER_SPRING_FORCE: J + 1,
  UPPER_SPRING_FORCE: J + 2,
  HERTZ: J + 3,
  DAMPING_RATIO: J + 4,
  MIN_LENGTH: J + 5,
  MAX_LENGTH: J + 6,
  MAX_MOTOR_FORCE: J + 7,
  MOTOR_SPEED: J + 8,
  FLAGS: J + 9,
  WORDS: J + 10,
} as const;

export const RevoluteJointDef = {
  TARGET_ANGLE: J + 0,
  HERTZ: J + 1,
  DAMPING_RATIO: J + 2,
  LOWER_ANGLE: J + 3,
  UPPER_ANGLE: J + 4,
  MAX_MOTOR_TORQUE: J + 5,
  MOTOR_SPEED: J + 6,
  FLAGS: J + 7,
  WORDS: J + 8,
} as const;

export const SphericalJointDef = {
  HERTZ: J + 0,
  DAMPING_RATIO: J + 1,
  TARGET_ROTATION: J + 2,
  CONE_ANGLE: J + 6,
  LOWER_TWIST_ANGLE: J + 7,
  UPPER_TWIST_ANGLE: J + 8,
  MAX_MOTOR_TORQUE: J + 9,
  MOTOR_VELOCITY: J + 10,
  FLAGS: J + 13,
  WORDS: J + 14,
} as const;

export const PrismaticJointDef = {
  HERTZ: J + 0,
  DAMPING_RATIO: J + 1,
  TARGET_TRANSLATION: J + 2,
  LOWER_TRANSLATION: J + 3,
  UPPER_TRANSLATION: J + 4,
  MAX_MOTOR_FORCE: J + 5,
  MOTOR_SPEED: J + 6,
  FLAGS: J + 7,
  WORDS: J + 8,
} as const;

export const WeldJointDef = {
  LINEAR_HERTZ: J + 0,
  ANGULAR_HERTZ: J + 1,
  LINEAR_DAMPING_RATIO: J + 2,
  ANGULAR_DAMPING_RATIO: J + 3,
  WORDS: J + 4,
} as const;

export const MotorJointDef = {
  LINEAR_VELOCITY: J + 0,
  MAX_VELOCITY_FORCE: J + 3,
  ANGULAR_VELOCITY: J + 4,
  MAX_VELOCITY_TORQUE: J + 7,
  LINEAR_HERTZ: J + 8,
  LINEAR_DAMPING_RATIO: J + 9,
  MAX_SPRING_FORCE: J + 10,
  ANGULAR_HERTZ: J + 11,
  ANGULAR_DAMPING_RATIO: J + 12,
  MAX_SPRING_TORQUE: J + 13,
  WORDS: J + 14,
} as const;

export const WheelJointDef = {
  SUSPENSION_HERTZ: J + 0,
  SUSPENSION_DAMPING_RATIO: J + 1,
  LOWER_SUSPENSION_LIMIT: J + 2,
  UPPER_SUSPENSION_LIMIT: J + 3,
  MAX_SPIN_TORQUE: J + 4,
  SPIN_SPEED: J + 5,
  STEERING_HERTZ: J + 6,
  STEERING_DAMPING_RATIO: J + 7,
  TARGET_STEERING_ANGLE: J + 8,
  MAX_STEERING_TORQUE: J + 9,
  LOWER_STEERING_LIMIT: J + 10,
  UPPER_STEERING_LIMIT: J + 11,
  FLAGS: J + 12,
  WORDS: J + 13,
} as const;

export const ParallelJointDef = {
  HERTZ: J + 0,
  DAMPING_RATIO: J + 1,
  MAX_TORQUE: J + 2,
  WORDS: J + 3,
} as const;

export const Stride = {
  MOVE: 9,
  CONTACT_BEGIN: 13,
  CONTACT_END: 4,
  CONTACT_HIT: 11,
  SENSOR: 4,
  JOINT_EVENT: 1,
} as const;
