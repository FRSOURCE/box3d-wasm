// A port of box3d/shared/human.c CreateHuman (creation only), for the World
// samples: 14 capsule bones joined by spherical and revolute joints.
import type { Body, Quat, Vec3 } from '@frsource/box3d-wasm';
import type { SceneBuilder } from '../framework/builder.js';
import { DEG_TO_RAD } from '../framework/math.js';

type V = [number, number, number];
type Q = [number, number, number, number];
type Frame = { p: V; q: Q };

interface BoneSpec {
  name: string;
  /** Reference frame: position and rotation relative to the human origin. */
  ref: Frame;
  /** Capsule centers and radius. */
  capsule: [V, V, number];
  /** 0: group 0, 1: -groupIndex. */
  negativeGroup?: boolean;
  parent?: number;
  joint?: 'spherical' | 'revolute';
  frameA?: Frame;
  frameB?: Frame;
  swing?: number;
  twist?: [number, number];
  jointFriction?: number;
}

const BONES: BoneSpec[] = [
  {
    name: 'pelvis',
    ref: { p: [0, 0.932087, -0.051708], q: [0.739169, 0, 0, 0.67352] },
    capsule: [[0.07, 0, -0.08], [-0.07, 0, -0.08], 0.13],
  },
  {
    name: 'spine_01',
    ref: { p: [0, 1.113505, -0.03481], q: [0.739973, 0, 0, 0.672637] },
    capsule: [[0.06, -0, -0.052264], [-0.06, 0, -0.052264], 0.12],
    negativeGroup: true,
    parent: 0,
    joint: 'spherical',
    frameA: { p: [0, 0, -0.182204], q: [-0.999999, 0, -0, 0.001194] },
    frameB: { p: [0, 0, -0.007736], q: [-1, 0, -0, 0] },
    swing: 25,
    twist: [-15, 15],
  },
  {
    name: 'spine_02',
    ref: { p: [0, 1.194336, -0.027087], q: [0.703611, 0, 0, 0.710586] },
    capsule: [[0.08, -0.015133, -0.091801], [-0.08, -0.015133, -0.091801], 0.1],
    parent: 1,
    joint: 'spherical',
    frameA: { p: [0, -0, -0.088935], q: [-0.998619, -0, 0, -0.05254] },
    frameB: { p: [-0, 0, -0.008199], q: [-1, 0, -0, 0] },
    swing: 25,
    twist: [-15, 15],
  },
  {
    name: 'spine_03',
    ref: {
      p: [-0, 1.31043, -0.028232],
      q: [0.669856, 0.000001, -0.000001, 0.742491],
    },
    capsule: [[0.11, -0.039753, -0.13], [-0.11, -0.039753, -0.13], 0.145],
    parent: 2,
    joint: 'spherical',
    frameA: {
      p: [-0, 0, -0.124298],
      q: [-0.998921, 0.000001, -0.000001, -0.046434],
    },
    frameB: { p: [0, 0, 0], q: [-1, 0, -0.000001, 0] },
    swing: 15,
    twist: [-10, 10],
  },
  {
    name: 'neck',
    ref: { p: [0, 1.575582, -0.055837], q: [0.879922, 0, 0, 0.475118] },
    capsule: [[-0.000001, -0, -0.02], [0, -0.005, -0.08], 0.07],
    parent: 3,
    joint: 'spherical',
    frameA: {
      p: [0.000001, -0.000259, -0.266585],
      q: [-0.942192, -0.000001, 0, 0.335074],
    },
    frameB: { p: [0, 0, 0], q: [-1, 0, -0.000001, 0] },
    swing: 45,
    twist: [-15, 15],
    jointFriction: 0.8,
  },
  {
    name: 'head',
    ref: { p: [0, 1.653348, -0.003241], q: [0.750288, 0, 0, 0.661111] },
    capsule: [
      [-0.000001, 0.016892, -0.05869],
      [0, -0.003629, -0.115072],
      0.0975,
    ],
    parent: 4,
    joint: 'spherical',
    frameA: { p: [0, 0.001321, -0.093873], q: [-0.974301, -0, -0, -0.225251] },
    frameB: { p: [0, 0.001268, -0.005104], q: [-1, 0, -0, 0] },
    swing: 15,
    twist: [-15, 15],
    jointFriction: 0.4,
  },
  {
    name: 'thigh_l',
    ref: {
      p: [0.090416, 0.986104, -0.03509],
      q: [-0.703287, -0.070715, 0.053866, 0.705327],
    },
    capsule: [
      [0.023719, 0.006008, -0.039068],
      [-0.064492, -0.004664, -0.424718],
      0.09,
    ],
    negativeGroup: true,
    parent: 0,
    joint: 'spherical',
    frameA: {
      p: [0.05, 0.011537, -0.055325],
      q: [-0.714896, -0.022305, -0.698361, -0.02679],
    },
    frameB: { p: [0, 0, 0], q: [-0.002064, 0.758987, 0.017046, 0.65088] },
    swing: 10,
    twist: [-60, 40],
  },
  {
    name: 'calf_l',
    ref: {
      p: [0.101198, 0.527027, -0.037374],
      q: [-0.653328, -0.06686, 0.058582, 0.751838],
    },
    capsule: [[0.001778, 0, 0.009841], [-0.078577, 0.014707, -0.41816], 0.075],
    parent: 6,
    joint: 'revolute',
    frameA: {
      p: [-0.069989, 0.000253, -0.453844],
      q: [-0.000677, 0.760087, 0.105674, 0.641171],
    },
    frameB: { p: [0, 0, 0], q: [-0.044589, 0.76554, 0.053368, 0.639619] },
    twist: [-5, 45],
  },
  {
    name: 'thigh_r',
    ref: {
      p: [-0.090416, 0.986104, -0.03509],
      q: [-0.703287, 0.070715, -0.053865, 0.705326],
    },
    capsule: [
      [-0.023719, 0.006008, -0.039068],
      [0.064492, -0.004664, -0.424718],
      0.09,
    ],
    negativeGroup: true,
    parent: 0,
    joint: 'spherical',
    frameA: {
      p: [-0.05, 0.011537, -0.055326],
      q: [-0.039089, -0.714094, 0.043177, 0.697623],
    },
    frameB: { p: [0, 0, 0], q: [0.758805, -0.019886, -0.651012, -0.001759] },
    swing: 10,
    twist: [-30, 60],
  },
  {
    name: 'calf_r',
    ref: {
      p: [-0.101198, 0.527027, -0.037373],
      q: [-0.653327, 0.06686, -0.058582, 0.751839],
    },
    capsule: [[-0.00182, 0, 0.010071], [0.077883, 0.014825, -0.418047], 0.075],
    parent: 8,
    joint: 'revolute',
    frameA: {
      p: [0.069988, 0.000253, -0.453844],
      q: [0.760086, -0.000675, -0.641171, -0.105676],
    },
    frameB: { p: [0, 0, 0], q: [0.76554, -0.044589, -0.639619, -0.053368] },
    twist: [-45, 5],
  },
  {
    name: 'upper_arm_l',
    ref: {
      p: [0.20378, 1.484275, -0.115897],
      q: [0.143082, 0.69598, -0.69013, 0.13733],
    },
    capsule: [[0, 0, 0], [-0.091118, 0.037775, 0.229719], 0.075],
    parent: 3,
    joint: 'spherical',
    frameA: {
      p: [0.20378, -0.069369, -0.181921],
      q: [-0.278486, 0.4456, -0.097014, 0.845266],
    },
    frameB: { p: [0, 0, 0], q: [-0.201396, -0.001586, 0.90185, 0.382234] },
    swing: 60,
    twist: [-5, 5],
  },
  {
    name: 'lower_arm_l',
    ref: {
      p: [0.305614, 1.242908, -0.117599],
      q: [0.165048, 0.563437, -0.802002, 0.109959],
    },
    capsule: [[0, 0, 0], [-0.142406, 0.039392, 0.261092], 0.05],
    parent: 10,
    joint: 'revolute',
    frameA: {
      p: [-0.095482, 0.039584, 0.240723],
      q: [0.512487, -0.180629, 0.839474, 0.003742],
    },
    frameB: { p: [0, 0, 0], q: [0.503803, -0.029831, 0.858168, 0.094017] },
    twist: [-5, 60],
  },
  {
    name: 'upper_arm_r',
    ref: {
      p: [-0.20378, 1.484276, -0.115899],
      q: [0.143083, -0.695978, 0.690132, 0.137329],
    },
    capsule: [[0, 0, 0], [0.091118, 0.037775, 0.229718], 0.075],
    parent: 3,
    joint: 'spherical',
    frameA: {
      p: [-0.203779, -0.069371, -0.181922],
      q: [-0.253621, -0.414842, 0.106962, 0.867261],
    },
    frameB: { p: [0, 0, 0], q: [-0.201397, 0.001587, -0.90185, 0.382233] },
    swing: 60,
    twist: [-5, 5],
  },
  {
    name: 'lower_arm_r',
    ref: {
      p: [-0.305614, 1.242907, -0.117599],
      q: [0.165048, -0.563437, 0.802002, 0.109959],
    },
    capsule: [[0, 0, 0], [0.142406, 0.039392, 0.261092], 0.05],
    parent: 12,
    joint: 'revolute',
    frameA: {
      p: [0.095484, 0.039585, 0.240723],
      q: [-0.180627, 0.512487, -0.003744, -0.839474],
    },
    frameB: { p: [0, 0, 0], q: [-0.029831, 0.503803, -0.094017, -0.858169] },
    twist: [-60, 5],
  },
];

const toVec = (v: V): Vec3 => ({ x: v[0], y: v[1], z: v[2] });

function toQuat(q: Q): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return { x: q[0] / len, y: q[1] / len, z: q[2] / len, w: q[3] / len };
}

/**
 * upstream CreateHuman with colorize = false: spawns the ragdoll with its
 * pelvis reference at `position` and returns its bodies in bone order.
 */
export function createHuman(
  scene: SceneBuilder,
  position: Vec3,
  frictionTorque: number,
  hertz: number,
  dampingRatio: number,
  groupIndex: number,
) {
  const bodies = BONES.map((bone) => {
    const body = scene.createBody({
      type: 'dynamic',
      name: bone.name,
      rotation: toQuat(bone.ref.q),
      position: {
        x: position.x + bone.ref.p[0],
        y: position.y + bone.ref.p[1],
        z: position.z + bone.ref.p[2],
      },
    });
    scene.capsule(body, {
      center1: toVec(bone.capsule[0]),
      center2: toVec(bone.capsule[1]),
      radius: bone.capsule[2],
      rollingResistance: 0.2,
      filter: { groupIndex: bone.negativeGroup ? -groupIndex : 0 },
    });
    return body;
  });

  const bodyAt = (index: number): Body => {
    const body = bodies[index];
    if (!body) throw new Error(`no bone ${index}`);
    return body;
  };
  for (const [i, bone] of BONES.entries()) {
    if (i === 0) continue;
    const parent = bodyAt(bone.parent ?? 0);
    const body = bodyAt(i);
    if (!bone.frameA || !bone.frameB || !bone.twist) continue;
    const localFrameA = {
      position: toVec(bone.frameA.p),
      rotation: toQuat(bone.frameA.q),
    };
    const localFrameB = {
      position: toVec(bone.frameB.p),
      rotation: toQuat(bone.frameB.q),
    };
    const maxMotorTorque = (bone.jointFriction ?? 1) * frictionTorque;
    if (bone.joint === 'revolute') {
      scene.world.createRevoluteJoint(parent, body, {
        localFrameA,
        localFrameB,
        enableLimit: true,
        lowerAngle: bone.twist[0] * DEG_TO_RAD,
        upperAngle: bone.twist[1] * DEG_TO_RAD,
        enableSpring: hertz > 0,
        hertz,
        dampingRatio,
        enableMotor: true,
        maxMotorTorque,
      });
    } else {
      scene.world.createSphericalJoint(parent, body, {
        localFrameA,
        localFrameB,
        enableConeLimit: true,
        coneAngle: (bone.swing ?? 0) * DEG_TO_RAD,
        enableTwistLimit: true,
        lowerTwistAngle: bone.twist[0] * DEG_TO_RAD,
        upperTwistAngle: bone.twist[1] * DEG_TO_RAD,
        enableSpring: hertz > 0,
        hertz,
        dampingRatio,
        enableMotor: true,
        maxMotorTorque,
      });
    }
  }

  // Disable some collisions
  scene.world.createFilterJoint(bodyAt(6), bodyAt(8));
  return bodies;
}
