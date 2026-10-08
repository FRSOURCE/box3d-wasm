// The Human ragdoll from box3d/shared/human.c, as far as the Benchmark samples
// need it (CreateHuman / DestroyHuman). Bone data is copied from upstream.
import type { Body, Joint, Quat, Transform, Vec3 } from '@frsource/box3d-wasm';
import type { SceneBuilder } from '../framework/builder.js';
import { DEG_TO_RAD } from '../framework/math.js';
import type { B3 } from '../framework/types.js';

type World = SceneBuilder['world'];

interface BoneDef {
  name: string;
  parent: number;
  /** [px, py, pz, qx, qy, qz, qw] */
  frame: readonly number[];
  capsule: readonly number[];
  radius: number;
  /** 0 keeps the default group, 1 uses the negative group index. */
  grouped?: boolean;
  joint?: {
    type: 'spherical' | 'revolute';
    a: readonly number[];
    b: readonly number[];
    swing?: number;
    twist: readonly [number, number];
    friction?: number;
  };
}

const BONES: readonly BoneDef[] = [
  {
    name: 'pelvis',
    parent: -1,
    frame: [0, 0.932087, -0.051708, 0.739169, 0, 0, 0.67352],
    capsule: [0.07, 0, -0.08, -0.07, 0, -0.08],
    radius: 0.13,
  },
  {
    name: 'spine_01',
    parent: 0,
    frame: [0, 1.113505, -0.03481, 0.739973, 0, 0, 0.672637],
    capsule: [0.06, 0, -0.052264, -0.06, 0, -0.052264],
    radius: 0.12,
    grouped: true,
    joint: {
      type: 'spherical',
      a: [0, 0, -0.182204, -0.999999, 0, 0, 0.001194],
      b: [0, 0, -0.007736, -1, 0, 0, 0],
      swing: 25,
      twist: [-15, 15],
    },
  },
  {
    name: 'spine_02',
    parent: 1,
    frame: [0, 1.194336, -0.027087, 0.703611, 0, 0, 0.710586],
    capsule: [0.08, -0.015133, -0.091801, -0.08, -0.015133, -0.091801],
    radius: 0.1,
    joint: {
      type: 'spherical',
      a: [0, 0, -0.088935, -0.998619, 0, 0, -0.05254],
      b: [0, 0, -0.008199, -1, 0, 0, 0],
      swing: 25,
      twist: [-15, 15],
    },
  },
  {
    name: 'spine_03',
    parent: 2,
    frame: [0, 1.31043, -0.028232, 0.669856, 0.000001, -0.000001, 0.742491],
    capsule: [0.11, -0.039753, -0.13, -0.11, -0.039753, -0.13],
    radius: 0.145,
    joint: {
      type: 'spherical',
      a: [0, 0, -0.124298, -0.998921, 0.000001, -0.000001, -0.046434],
      b: [0, 0, 0, -1, 0, -0.000001, 0],
      swing: 15,
      twist: [-10, 10],
    },
  },
  {
    name: 'neck',
    parent: 3,
    frame: [0, 1.575582, -0.055837, 0.879922, 0, 0, 0.475118],
    capsule: [-0.000001, 0, -0.02, 0, -0.005, -0.08],
    radius: 0.07,
    joint: {
      type: 'spherical',
      a: [0.000001, -0.000259, -0.266585, -0.942192, -0.000001, 0, 0.335074],
      b: [0, 0, 0, -1, 0, -0.000001, 0],
      swing: 45,
      twist: [-15, 15],
      friction: 0.8,
    },
  },
  {
    name: 'head',
    parent: 4,
    frame: [0, 1.653348, -0.003241, 0.750288, 0, 0, 0.661111],
    capsule: [-0.000001, 0.016892, -0.05869, 0, -0.003629, -0.115072],
    radius: 0.0975,
    joint: {
      type: 'spherical',
      a: [0, 0.001321, -0.093873, -0.974301, 0, 0, -0.225251],
      b: [0, 0.001268, -0.005104, -1, 0, 0, 0],
      swing: 15,
      twist: [-15, 15],
      friction: 0.4,
    },
  },
  {
    name: 'thigh_l',
    parent: 0,
    frame: [
      0.090416, 0.986104, -0.03509, -0.703287, -0.070715, 0.053866, 0.705327,
    ],
    capsule: [0.023719, 0.006008, -0.039068, -0.064492, -0.004664, -0.424718],
    radius: 0.09,
    grouped: true,
    joint: {
      type: 'spherical',
      a: [0.05, 0.011537, -0.055325, -0.714896, -0.022305, -0.698361, -0.02679],
      b: [0, 0, 0, -0.002064, 0.758987, 0.017046, 0.65088],
      swing: 10,
      twist: [-60, 40],
    },
  },
  {
    name: 'calf_l',
    parent: 6,
    frame: [
      0.101198, 0.527027, -0.037374, -0.653328, -0.06686, 0.058582, 0.751838,
    ],
    capsule: [0.001778, 0, 0.009841, -0.078577, 0.014707, -0.41816],
    radius: 0.075,
    joint: {
      type: 'revolute',
      a: [
        -0.069989, 0.000253, -0.453844, -0.000677, 0.760087, 0.105674, 0.641171,
      ],
      b: [0, 0, 0, -0.044589, 0.76554, 0.053368, 0.639619],
      twist: [-5, 45],
    },
  },
  {
    name: 'thigh_r',
    parent: 0,
    frame: [
      -0.090416, 0.986104, -0.03509, -0.703287, 0.070715, -0.053865, 0.705326,
    ],
    capsule: [-0.023719, 0.006008, -0.039068, 0.064492, -0.004664, -0.424718],
    radius: 0.09,
    grouped: true,
    joint: {
      type: 'spherical',
      a: [-0.05, 0.011537, -0.055326, -0.039089, -0.714094, 0.043177, 0.697623],
      b: [0, 0, 0, 0.758805, -0.019886, -0.651012, -0.001759],
      swing: 10,
      twist: [-30, 60],
    },
  },
  {
    name: 'calf_r',
    parent: 8,
    frame: [
      -0.101198, 0.527027, -0.037373, -0.653327, 0.06686, -0.058582, 0.751839,
    ],
    capsule: [-0.00182, 0, 0.010071, 0.077883, 0.014825, -0.418047],
    radius: 0.075,
    joint: {
      type: 'revolute',
      a: [
        0.069988, 0.000253, -0.453844, 0.760086, -0.000675, -0.641171,
        -0.105676,
      ],
      b: [0, 0, 0, 0.76554, -0.044589, -0.639619, -0.053368],
      twist: [-45, 5],
    },
  },
  {
    name: 'upper_arm_l',
    parent: 3,
    frame: [0.20378, 1.484275, -0.115897, 0.143082, 0.69598, -0.69013, 0.13733],
    capsule: [0, 0, 0, -0.091118, 0.037775, 0.229719],
    radius: 0.075,
    joint: {
      type: 'spherical',
      a: [
        0.20378, -0.069369, -0.181921, -0.278486, 0.4456, -0.097014, 0.845266,
      ],
      b: [0, 0, 0, -0.201396, -0.001586, 0.90185, 0.382234],
      swing: 60,
      twist: [-5, 5],
    },
  },
  {
    name: 'lower_arm_l',
    parent: 10,
    frame: [
      0.305614, 1.242908, -0.117599, 0.165048, 0.563437, -0.802002, 0.109959,
    ],
    capsule: [0, 0, 0, -0.142406, 0.039392, 0.261092],
    radius: 0.05,
    joint: {
      type: 'revolute',
      a: [
        -0.095482, 0.039584, 0.240723, 0.512487, -0.180629, 0.839474, 0.003742,
      ],
      b: [0, 0, 0, 0.503803, -0.029831, 0.858168, 0.094017],
      twist: [-5, 60],
    },
  },
  {
    name: 'upper_arm_r',
    parent: 3,
    frame: [
      -0.20378, 1.484276, -0.115899, 0.143083, -0.695978, 0.690132, 0.137329,
    ],
    capsule: [0, 0, 0, 0.091118, 0.037775, 0.229718],
    radius: 0.075,
    joint: {
      type: 'spherical',
      a: [
        -0.203779, -0.069371, -0.181922, -0.253621, -0.414842, 0.106962,
        0.867261,
      ],
      b: [0, 0, 0, -0.201397, 0.001587, -0.90185, 0.382233],
      swing: 60,
      twist: [-5, 5],
    },
  },
  {
    name: 'lower_arm_r',
    parent: 12,
    frame: [
      -0.305614, 1.242907, -0.117599, 0.165048, -0.563437, 0.802002, 0.109959,
    ],
    capsule: [0, 0, 0, 0.142406, 0.039392, 0.261092],
    radius: 0.05,
    joint: {
      type: 'revolute',
      a: [
        0.095484, 0.039585, 0.240723, -0.180627, 0.512487, -0.003744, -0.839474,
      ],
      b: [0, 0, 0, -0.029831, 0.503803, -0.094017, -0.858169],
      twist: [-60, 5],
    },
  },
];

export interface Human {
  bodies: Body[];
  joints: Joint[];
  isSpawned: boolean;
}

function frame(f: readonly number[]): Transform {
  const [px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0, qw = 1] = f;
  return {
    position: { x: px, y: py, z: pz },
    rotation: normalizeQuat(qx, qy, qz, qw),
  };
}

function normalizeQuat(x: number, y: number, z: number, w: number): Quat {
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

/** upstream CreateHuman (colorize is always false in the benchmarks). */
export function createHuman(
  scene: SceneBuilder,
  world: World,
  _b3: B3,
  position: Vec3,
  frictionTorque: number,
  hertz: number,
  dampingRatio: number,
  groupIndex: number,
): Human {
  const human: Human = { bodies: [], joints: [], isSpawned: true };

  for (const def of BONES) {
    const ref = frame(def.frame);
    const body = scene.createBody({
      type: 'dynamic',
      name: def.name,
      position: {
        x: position.x + ref.position.x,
        y: position.y + ref.position.y,
        z: position.z + ref.position.z,
      },
      rotation: ref.rotation,
    });
    const c = def.capsule;
    scene.capsule(body, {
      center1: { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0 },
      center2: { x: c[3] ?? 0, y: c[4] ?? 0, z: c[5] ?? 0 },
      radius: def.radius,
      rollingResistance: 0.2,
      filter: { groupIndex: def.grouped ? -groupIndex : 0 },
    });
    human.bodies.push(body);
  }

  for (let i = 1; i < BONES.length; i++) {
    const def = BONES[i];
    const joint = def?.joint;
    if (!def || !joint) continue;
    const parent = human.bodies[def.parent];
    const body = human.bodies[i];
    if (!parent || !body) continue;
    const common = {
      localFrameA: frame(joint.a),
      localFrameB: frame(joint.b),
      enableSpring: hertz > 0,
      hertz,
      dampingRatio,
      enableMotor: true,
      maxMotorTorque: (joint.friction ?? 1) * frictionTorque,
    };
    const lower = joint.twist[0] * DEG_TO_RAD;
    const upper = joint.twist[1] * DEG_TO_RAD;
    if (joint.type === 'revolute') {
      human.joints.push(
        world.createRevoluteJoint(parent, body, {
          ...common,
          enableLimit: true,
          lowerAngle: lower,
          upperAngle: upper,
        }),
      );
    } else {
      human.joints.push(
        world.createSphericalJoint(parent, body, {
          ...common,
          enableConeLimit: true,
          coneAngle: (joint.swing ?? 0) * DEG_TO_RAD,
          enableTwistLimit: true,
          lowerTwistAngle: lower,
          upperTwistAngle: upper,
        }),
      );
    }
  }

  // disable collision between the thighs
  const thighL = human.bodies[6];
  const thighR = human.bodies[8];
  if (thighL && thighR) {
    human.joints.push(world.createFilterJoint(thighL, thighR, {}));
  }
  return human;
}

/** upstream DestroyHuman: joints first, then bodies. */
export function destroyHuman(scene: SceneBuilder, human: Human): void {
  for (const joint of human.joints) joint.destroy(false);
  human.joints.length = 0;
  for (const body of human.bodies) scene.destroyBody(body);
  human.bodies.length = 0;
  human.isSpawned = false;
}
