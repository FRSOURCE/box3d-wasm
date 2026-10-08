// A faithful TypeScript port of upstream's shared Human/ragdoll helper
// (box3d/shared/human.c): a twelve bone ragdoll of capsules joined by
// spherical and revolute joints with cone/twist limits, joint friction (a
// motor with no speed) and optional joint springs. The bone table below is a
// transcription of the C data, so the ragdoll is identical to the native one.
import type {
  Body,
  FilterJoint,
  MotorJoint,
  ParallelJoint,
  Quat,
  RevoluteJoint,
  SphericalJoint,
  Vec3,
} from '@frsource/box3d-wasm';
import type { SceneBuilder } from '../framework/builder.js';
import { type Random } from '../framework/math.js';

export const BoneId = {
  pelvis: 0,
  spine_01: 1,
  spine_03: 2,
  neck: 3,
  thigh_l: 4,
  calf_l: 5,
  thigh_r: 6,
  calf_r: 7,
  upper_arm_l: 8,
  lower_arm_l: 9,
  upper_arm_r: 10,
  lower_arm_r: 11,
} as const;
export type BoneId = (typeof BoneId)[keyof typeof BoneId];
export const BONE_COUNT = 12;

export const FILTER_JOINT_COUNT = 9;

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
interface Frame {
  p: V3;
  q: Q4;
}

interface CapsuleDef {
  c1: V3;
  c2: V3;
  radius: number;
  /** upstream gives the feet half the default density. */
  halfDensity?: boolean;
}

interface BoneDef {
  name: string;
  parent: number;
  reference: Frame;
  friction: number;
  rollingResistance: number;
  /** `negate` puts the shape in collision group -groupIndex (same group never collides). */
  group: 'none' | 'negate';
  capsules: CapsuleDef[];
  joint?: {
    type: 'spherical' | 'revolute';
    frameA: Frame;
    frameB: Frame;
    /** Degrees; spherical cone limit. */
    swing: number;
    /** Degrees: lower and upper twist (spherical) or angle (revolute) limit. */
    twist: [number, number];
    friction: number;
  };
}

const SHIRT_COLOR = 0x48d1cc; // MediumTurquoise
const PANT_COLOR = 0x1e90ff; // DodgerBlue
const SKIN_COLORS = [0xffdead, 0xffffe0, 0xcd853f, 0xd2b48c]; // NavajoWhite, LightYellow, Peru, Tan

/** b3DefaultShapeDef().density with the default length units (water). */
const DEFAULT_DENSITY = 1000;

/** `degrees * B3_DEG_TO_RAD` evaluated in single precision, as the C code does. */
const toRadians = (degrees: number): number =>
  Math.fround(Math.fround(degrees) * Math.fround(0.01745329251));

// Transcribed from shared/human.c of the pinned engine (colours are not needed).
// prettier-ignore
const BONES: readonly BoneDef[] = [
  {
    name: 'pelvis',
    parent: -1,
    reference: { p: [0.000000, 0.996219, -0.023868], q: [1.000000, 0.000000, 0.000000, 0.000000] },
    friction: 0.6,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [0.040000, 0.000001, 0.000000], c2: [-0.040000, -0.000001, 0.000000], radius: 0.150000 },
    ],
  },
  {
    name: 'spine_01',
    parent: BoneId.pelvis,
    reference: { p: [0.000000, 1.017288, -0.024882], q: [1.000000, 0.000000, 0.000000, 0.000000] },
    friction: 0.5,
    rollingResistance: 0.1,
    group: 'negate',
    capsules: [
      { c1: [0.029876, -0.146581, 0.006260], c2: [-0.029876, -0.146574, 0.006260], radius: 0.145663 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [0.000000, -0.021069, 0.001014], q: [-0.642737, 0.000000, 0.000000, -0.766087] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.707107, 0.000000, 0.000000, -0.707107] },
      swing: 35.0,
      twist: [-17.5, 17.5],
      friction: 1,
    },
  },
  {
    name: 'spine_03',
    parent: BoneId.spine_01,
    reference: { p: [0.000000, 1.267766, -0.022320], q: [1.000000, 0.000000, 0.000000, 0.000000] },
    friction: 0.5,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [0.063996, -0.117434, -0.040199], c2: [-0.063996, -0.117432, -0.040199], radius: 0.165004 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [0.000000, -0.250478, -0.002562], q: [-0.642766, 0.000000, 0.000000, -0.766063] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.707107, 0.000000, 0.000000, -0.707107] },
      swing: 35.0,
      twist: [-17.5, 17.5],
      friction: 1,
    },
  },
  {
    name: 'neck_01',
    parent: BoneId.spine_03,
    reference: { p: [0.000000, 1.498783, 0.024462], q: [0.987879, 0.000000, 0.000000, 0.155228] },
    friction: 0.2,
    rollingResistance: 0.05,
    group: 'none',
    capsules: [
      { c1: [0.000000, -0.212340, 0.000000], c2: [0.000000, -0.087340, 0.000000], radius: 0.110000 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [0.000000, -0.231017, -0.046781], q: [-0.516157, -0.000002, 0.000003, -0.856494] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.707108, -0.000002, 0.000002, -0.707106] },
      swing: 30.0,
      twist: [-17.5, 17.5],
      friction: 1,
    },
  },
  {
    name: 'thigh_l',
    parent: BoneId.pelvis,
    reference: { p: [0.092175, 0.971562, -0.011177], q: [0.471412, 0.529510, -0.499888, -0.497495] },
    friction: 0.6,
    rollingResistance: 0.1,
    group: 'negate',
    capsules: [
      { c1: [-0.047269, 0.000001, 0.000000], c2: [-0.379769, 0.000005, 0.000000], radius: 0.091539 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [0.092175, 0.024656, -0.012691], q: [-0.460186, -0.365368, -0.637662, 0.498118] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.499997, -0.500003, 0.500002, 0.499998] },
      swing: 30.0,
      twist: [-10.0, 10.0],
      friction: 1,
    },
  },
  {
    name: 'calf_l',
    parent: BoneId.thigh_l,
    reference: { p: [0.118720, 0.534541, -0.035362], q: [0.521188, 0.480597, -0.546380, -0.445935] },
    friction: 0.1,
    rollingResistance: 0.0,
    group: 'none',
    capsules: [
      { c1: [-0.445000, 0.000001, 0.000000], c2: [0.005000, -0.000001, 0.000000], radius: 0.080000 },
      { c1: [-0.456371, 0.129321, 0.000013], c2: [-0.359977, 0.014394, 0.000013], radius: 0.070000, halfDensity: true },
    ],
    joint: {
      type: 'revolute',
      frameA: { p: [-0.438494, -0.000175, 0.000000], q: [0.344866, -0.938652, 0.000002, -0.000008] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.008182, -0.999967, 0.000001, -0.000007] },
      swing: 0,
      twist: [-30.0, 30.0],
      friction: 1,
    },
  },
  {
    name: 'thigh_r',
    parent: BoneId.pelvis,
    reference: { p: [-0.092175, 0.971562, -0.011177], q: [-0.497495, 0.499888, 0.529510, -0.471412] },
    friction: 0.6,
    rollingResistance: 0.1,
    group: 'negate',
    capsules: [
      { c1: [0.047269, -0.000001, 0.000000], c2: [0.379769, -0.000005, 0.000000], radius: 0.092587 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [-0.092175, 0.024656, -0.012691], q: [0.380666, 0.491846, 0.488644, -0.611889] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.500002, 0.499998, -0.499998, 0.500002] },
      swing: 30.0,
      twist: [-10.0, 10.0],
      friction: 1,
    },
  },
  {
    name: 'calf_r',
    parent: BoneId.thigh_r,
    reference: { p: [-0.118720, 0.534541, -0.035362], q: [-0.445935, 0.546380, 0.480597, -0.521188] },
    friction: 0.1,
    rollingResistance: 0.0,
    group: 'none',
    capsules: [
      { c1: [0.445000, -0.000002, 0.000003], c2: [-0.005000, 0.000000, 0.000003], radius: 0.080000 },
      { c1: [0.369113, -0.006830, 0.000017], c2: [0.465507, -0.121757, 0.000017], radius: 0.070000, halfDensity: true },
    ],
    joint: {
      type: 'revolute',
      frameA: { p: [0.438494, 0.000175, 0.000000], q: [0.000007, 0.000005, -0.344860, -0.938654] },
      frameB: { p: [0.0, 0.0, 0.0], q: [0.000006, 0.000005, 0.008188, -0.999966] },
      swing: 0,
      twist: [-30.0, 30.0],
      friction: 1,
    },
  },
  {
    name: 'upperarm_l',
    parent: BoneId.spine_03,
    reference: { p: [0.185817, 1.443630, 0.031306], q: [0.560220, -0.307179, 0.366233, -0.676512] },
    friction: 0.6,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [0.296038, 0.004386, -0.000794], c2: [-0.016086, 0.004384, -0.016127], radius: 0.065000 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [0.185817, -0.175865, -0.053625], q: [-0.559466, -0.213784, -0.670199, 0.438323] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.500953, -0.502617, -0.509318, -0.486844] },
      swing: 45.0,
      twist: [-20.0, 20.0],
      friction: 0.8,
    },
  },
  {
    name: 'lowerarm_l',
    parent: BoneId.upper_arm_l,
    reference: { p: [0.347683, 1.193455, 0.029378], q: [0.406736, -0.493012, 0.089135, -0.763911] },
    friction: 0.3,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [0.312329, -0.008256, -0.016454], c2: [0.033153, 0.008259, -0.002741], radius: 0.060000 },
    ],
    joint: {
      type: 'revolute',
      frameA: { p: [0.297979, 0.000361, 0.000000], q: [0.916726, 0.399352, 0.000839, -0.011456] },
      frameB: { p: [0.0, 0.0, 0.0], q: [0.999922, -0.003857, 0.004659, -0.010908] },
      swing: 0,
      twist: [-35.0, 35.0],
      friction: 0.06,
    },
  },
  {
    name: 'upperarm_r',
    parent: BoneId.spine_03,
    reference: { p: [-0.185817, 1.443630, 0.031306], q: [0.676512, 0.366233, 0.307179, 0.560220] },
    friction: 0.6,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [-0.300237, -0.000001, -0.000319], c2: [0.011887, 0.000001, 0.015013], radius: 0.065000 },
    ],
    joint: {
      type: 'spherical',
      frameA: { p: [-0.185817, -0.175865, -0.053625], q: [0.213793, 0.559449, 0.438334, -0.670204] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.509319, 0.486843, 0.500954, -0.502617] },
      swing: 45.0,
      twist: [-20.0, 20.0],
      friction: 0.8,
    },
  },
  {
    name: 'lowerarm_r',
    parent: BoneId.upper_arm_r,
    reference: { p: [-0.347683, 1.193455, 0.029378], q: [0.763911, 0.089135, 0.493012, 0.406736] },
    friction: 0.3,
    rollingResistance: 0.1,
    group: 'none',
    capsules: [
      { c1: [-0.312649, -0.000003, 0.016471], c2: [-0.032986, 0.000000, 0.002732], radius: 0.060000 },
    ],
    joint: {
      type: 'revolute',
      frameA: { p: [-0.297979, -0.000361, 0.000000], q: [-0.405444, 0.914059, 0.010541, 0.000852] },
      frameB: { p: [0.0, 0.0, 0.0], q: [-0.002794, 0.999936, 0.010042, 0.004364] },
      swing: 0,
      twist: [-35.0, 35.0],
      friction: 0.06,
    },
  },
];

export interface Bone {
  body: Body;
  /** The joint to the parent; undefined for the pelvis (until an align spring is added). */
  joint: RevoluteJoint | SphericalJoint | ParallelJoint | undefined;
  anchor: Body | undefined;
  anchorJoint: MotorJoint | ParallelJoint | undefined;
  jointType: 'revolute' | 'spherical' | undefined;
  jointFriction: number;
  parentIndex: number;
  referenceFrame: Frame;
}

export interface Human {
  bones: Bone[];
  filterJoints: FilterJoint[];
  frictionTorque: number;
  isSpawned: boolean;
}

/** The bone with this index (a Human always has all of them). */
export function boneOf(human: Human, index: number): Bone {
  const bone = human.bones[index];
  if (!bone) throw new Error(`human has no bone ${index}`);
  return bone;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry ${index}`);
  return item;
}

const vec = (v: V3): Vec3 => ({ x: v[0], y: v[1], z: v[2] });

/** b3NormalizeQuat, evaluated in single precision like the C code. */
function normalizeQuat(q: Q4): Quat {
  const f = Math.fround;
  const [x, y, z, w] = q.map(f) as Q4;
  const lengthSq = f(f(f(f(x * x) + f(y * y)) + f(z * z)) + f(w * w));
  if (lengthSq > f(1000 * 1.1754943508222875e-38)) {
    const s = f(1 / f(Math.sqrt(lengthSq)));
    return { x: f(s * x), y: f(s * y), z: f(s * z), w: f(s * w) };
  }
  return { x: 0, y: 0, z: 0, w: 1 };
}

const quatOf = (q: Q4): Quat => ({ x: q[0], y: q[1], z: q[2], w: q[3] });

/** b3ComputeQuatBetweenUnitVectors. */
function quatBetweenUnitVectors(a: Vec3, b: Vec3): Quat {
  const d = a.x * b.x + a.y * b.y + a.z * b.z;
  if (d < -0.99999) {
    // opposite: a half turn about any axis perpendicular to a
    const axis =
      Math.abs(a.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const c = {
      x: a.y * axis.z - a.z * axis.y,
      y: a.z * axis.x - a.x * axis.z,
      z: a.x * axis.y - a.y * axis.x,
    };
    const n = Math.hypot(c.x, c.y, c.z);
    return { x: c.x / n, y: c.y / n, z: c.z / n, w: 0 };
  }
  return normalizeQuat([
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
    1 + d,
  ]);
}

/** b3InvMulQuat: conj(a) * b. */
function invMulQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x - b.w * a.x - a.y * b.z + a.z * b.y,
    y: a.w * b.y - b.w * a.y - a.z * b.x + a.x * b.z,
    z: a.w * b.z - b.w * a.z - a.x * b.y + a.y * b.x,
    w: a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z,
  };
}

/**
 * upstream CreateHuman. `position` is the world offset of the pelvis frame
 * origin (the feet are about at position.y). `groupIndex` selects the skin
 * colour and the collision group of the spine and thighs.
 */
export function createHuman(
  scene: SceneBuilder,
  position: Vec3,
  frictionTorque: number,
  hertz: number,
  dampingRatio: number,
  groupIndex: number,
  colorize: boolean,
): Human {
  const world = scene.world;
  const skinColor = SKIN_COLORS[groupIndex % 4] ?? 0xffdead;
  const colorOf = (bone: number): number => {
    if (
      bone === BoneId.neck ||
      bone === BoneId.lower_arm_l ||
      bone === BoneId.lower_arm_r
    )
      return skinColor;
    if (
      bone === BoneId.spine_01 ||
      bone === BoneId.spine_03 ||
      bone === BoneId.upper_arm_l ||
      bone === BoneId.upper_arm_r
    )
      return SHIRT_COLOR;
    return PANT_COLOR;
  };

  const bones: Bone[] = BONES.map((def, index) => {
    const color = colorOf(index);
    const rf = def.reference;
    const body = scene.createBody({
      type: 'dynamic',
      name: def.name,
      position: {
        x: Math.fround(position.x + Math.fround(rf.p[0])),
        y: Math.fround(position.y + Math.fround(rf.p[1])),
        z: Math.fround(position.z + Math.fround(rf.p[2])),
      },
      rotation: quatOf(rf.q),
      color: colorize ? color : undefined,
    });
    for (const capsule of def.capsules) {
      scene.capsule(body, {
        center1: vec(capsule.c1),
        center2: vec(capsule.c2),
        radius: capsule.radius,
        friction: def.friction,
        rollingResistance: def.rollingResistance,
        density: capsule.halfDensity ? 0.5 * DEFAULT_DENSITY : DEFAULT_DENSITY,
        filter: { groupIndex: def.group === 'negate' ? -groupIndex : 0 },
        customColor: colorize ? color : 0,
      });
    }
    return {
      body,
      joint: undefined,
      anchor: undefined,
      anchorJoint: undefined,
      jointType: def.joint?.type,
      jointFriction: def.joint?.friction ?? 1,
      parentIndex: def.parent,
      referenceFrame: rf,
    };
  });

  for (let i = 1; i < BONE_COUNT; i++) {
    const joint = at(BONES, i).joint;
    if (!joint) continue;
    const bone = at(bones, i);
    const parent = at(bones, bone.parentIndex);
    const common = {
      localFrameA: {
        position: vec(joint.frameA.p),
        rotation: normalizeQuat(joint.frameA.q),
      },
      localFrameB: {
        position: vec(joint.frameB.p),
        rotation: normalizeQuat(joint.frameB.q),
      },
      enableSpring: hertz > 0,
      hertz,
      dampingRatio,
      enableMotor: true,
      maxMotorTorque: Math.fround(
        Math.fround(bone.jointFriction) * Math.fround(frictionTorque),
      ),
    };
    if (joint.type === 'revolute') {
      bone.joint = world.createRevoluteJoint(parent.body, bone.body, {
        ...common,
        enableLimit: true,
        lowerAngle: toRadians(joint.twist[0]),
        upperAngle: toRadians(joint.twist[1]),
      });
    } else {
      bone.joint = world.createSphericalJoint(parent.body, bone.body, {
        ...common,
        enableConeLimit: true,
        coneAngle: toRadians(joint.swing),
        enableTwistLimit: true,
        lowerTwistAngle: toRadians(joint.twist[0]),
        upperTwistAngle: toRadians(joint.twist[1]),
      });
    }
  }

  // Disable some collisions
  const filterPairs: [number, number][] = [
    [BoneId.thigh_l, BoneId.thigh_r],
    [BoneId.neck, BoneId.upper_arm_l],
    [BoneId.neck, BoneId.upper_arm_r],
  ];
  const filterJoints = filterPairs.map(([a, b]) =>
    world.createFilterJoint(at(bones, a).body, at(bones, b).body),
  );

  return { bones, filterJoints, frictionTorque, isSpawned: true };
}

/** upstream DestroyHuman: the filter joints, the joints, then the bodies (anchors too). */
export function destroyHuman(scene: SceneBuilder, human: Human): void {
  for (const joint of human.filterJoints) joint.destroy(false);
  human.filterJoints = [];

  for (const bone of human.bones) {
    bone.anchorJoint?.destroy(false);
    bone.anchorJoint = undefined;
    bone.joint?.destroy(false);
    bone.joint = undefined;
  }

  for (const bone of human.bones) {
    if (bone.body.alive) scene.destroyBody(bone.body);
    if (bone.anchor?.alive) scene.destroyBody(bone.anchor);
    bone.anchor = undefined;
  }
  human.isSpawned = false;
}

export function humanSetVelocity(human: Human, velocity: Vec3): void {
  for (const bone of human.bones) bone.body.setLinearVelocity(velocity);
}

/** A random impulse in [-magnitude, magnitude]^3 on spine_01. */
export function humanApplyRandomAngularImpulse(
  human: Human,
  magnitude: number,
  random: Random,
): void {
  boneOf(human, BoneId.spine_01).body.applyAngularImpulse(
    {
      x: random.range(-magnitude, magnitude),
      y: random.range(-magnitude, magnitude),
      z: random.range(-magnitude, magnitude),
    },
    true,
  );
}

export function humanSetJointFrictionTorque(
  human: Human,
  torque: number,
): void {
  human.frictionTorque = torque;
  for (let i = 1; i < BONE_COUNT; i++) {
    const bone = boneOf(human, i);
    (bone.joint as RevoluteJoint | SphericalJoint).setMaxMotorTorque(
      bone.jointFriction * torque,
    );
  }
}

export function humanSetJointSpringHertz(human: Human, hertz: number): void {
  for (let i = 1; i < BONE_COUNT; i++) {
    (boneOf(human, i).joint as RevoluteJoint | SphericalJoint).setSpringHertz(
      hertz,
    );
  }
}

export function humanSetJointDampingRatio(
  human: Human,
  dampingRatio: number,
): void {
  for (let i = 1; i < BONE_COUNT; i++) {
    (
      boneOf(human, i).joint as RevoluteJoint | SphericalJoint
    ).setSpringDampingRatio(dampingRatio);
  }
}

/** upstream Human_AlignSpring: a parallel joint from the ground that keeps the pelvis upright. */
export function humanAlignSpring(
  scene: SceneBuilder,
  human: Human,
  ground: Body,
  hertz: number,
  dampingRatio: number,
): void {
  const bone = boneOf(human, BoneId.pelvis);
  const q = quatBetweenUnitVectors({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
  const qb = bone.body.getRotation();
  bone.joint = scene.world.createParallelJoint(ground, bone.body, {
    localFrameA: { rotation: q },
    localFrameB: { rotation: invMulQuat(qb, q) },
    drawScale: 2,
    collideConnected: true,
    hertz,
    dampingRatio,
  });
}

/** upstream Human_CreateMotorAnchors: a kinematic anchor per bone held by a stiff motor joint. */
export function humanCreateMotorAnchors(
  scene: SceneBuilder,
  human: Human,
): void {
  for (const bone of human.bones) {
    const xf = bone.body.getTransform();
    bone.anchor = scene.createBody({
      type: 'kinematic',
      position: xf.position,
      rotation: xf.rotation,
    });
    bone.anchorJoint = scene.world.createMotorJoint(bone.anchor, bone.body, {
      angularHertz: 5,
      angularDampingRatio: 1,
      linearHertz: 5,
      linearDampingRatio: 1,
      maxSpringForce: 3.4028234663852886e38,
      maxSpringTorque: 3.4028234663852886e38,
    });
  }
}

/** upstream Human_CreateParallelAnchors: kinematic anchors that keep each bone's local z axis along world y. */
export function humanCreateParallelAnchors(
  scene: SceneBuilder,
  human: Human,
): void {
  const qFrameWorld = quatBetweenUnitVectors(
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 1, z: 0 },
  );
  for (const bone of human.bones) {
    const xf = bone.body.getTransform();
    bone.anchor = scene.createBody({
      type: 'kinematic',
      position: xf.position,
      rotation: xf.rotation,
    });
    const frameQuat = invMulQuat(xf.rotation, qFrameWorld);
    bone.anchorJoint = scene.world.createParallelJoint(bone.anchor, bone.body, {
      hertz: 8,
      dampingRatio: 1,
      maxTorque: 800,
      localFrameA: { rotation: frameQuat },
      localFrameB: { rotation: frameQuat },
    });
  }
}

export function humanSetBullet(human: Human, flag: boolean): void {
  for (const bone of human.bones) bone.body.setBullet(flag);
}
