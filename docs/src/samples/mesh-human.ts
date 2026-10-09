// The ragdoll of box3d/samples/shared/human.c (CreateHuman only), used by the
// Mesh Reflection sample. Positions, capsules, joint frames and limits are
// copied from upstream.
import type { Body, Quat, Vec3, World } from '@frsource/box3d-wasm';
import type { SceneBuilder } from '../framework/builder.js';
import { DEG_TO_RAD } from '../framework/math.js';

interface Frame {
  position: Vec3;
  rotation: Quat;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
/** upstream stores quaternions as { vector, scalar }. */
const q = (x: number, y: number, z: number, w: number): Quat => ({
  x,
  y,
  z,
  w,
});
const frame = (p: Vec3, r: Quat): Frame => ({ position: p, rotation: r });

type BoneKind = 'pelvis' | 'spine' | 'neck' | 'head' | 'leg' | 'arm';

interface BoneDef {
  name: string;
  parent: number;
  reference: Frame;
  capsule: { c1: Vec3; c2: Vec3; radius: number };
  /** 'self': -groupIndex, else 0 */
  group: 'self' | 'none';
  color: 'pants' | 'shirt' | 'skin';
  joint?: {
    type: 'spherical' | 'revolute';
    frameA: Frame;
    frameB: Frame;
    swing?: number;
    twist: [number, number];
    friction?: number;
  };
  kind: BoneKind;
}

const d = DEG_TO_RAD;

// index order matches upstream's BoneId
const BONES: BoneDef[] = [
  {
    name: 'pelvis',
    kind: 'pelvis',
    parent: -1,
    reference: frame(v(0, 0.932087, -0.051708), q(0.739169, 0, 0, 0.67352)),
    capsule: { c1: v(0.07, 0, -0.08), c2: v(-0.07, 0, -0.08), radius: 0.13 },
    group: 'none',
    color: 'pants',
  },
  {
    name: 'spine_01',
    kind: 'spine',
    parent: 0,
    reference: frame(v(0, 1.113505, -0.03481), q(0.739973, 0, 0, 0.672637)),
    capsule: {
      c1: v(0.06, 0, -0.052264),
      c2: v(-0.06, 0, -0.052264),
      radius: 0.12,
    },
    group: 'self',
    color: 'shirt',
    joint: {
      type: 'spherical',
      frameA: frame(v(0, 0, -0.182204), q(-0.999999, 0, 0, 0.001194)),
      frameB: frame(v(0, 0, -0.007736), q(-1, 0, 0, 0)),
      swing: 25 * d,
      twist: [-15 * d, 15 * d],
    },
  },
  {
    name: 'spine_02',
    kind: 'spine',
    parent: 1,
    reference: frame(v(0, 1.194336, -0.027087), q(0.703611, 0, 0, 0.710586)),
    capsule: {
      c1: v(0.08, -0.015133, -0.091801),
      c2: v(-0.08, -0.015133, -0.091801),
      radius: 0.1,
    },
    group: 'none',
    color: 'shirt',
    joint: {
      type: 'spherical',
      frameA: frame(v(0, 0, -0.088935), q(-0.998619, 0, 0, -0.05254)),
      frameB: frame(v(0, 0, -0.008199), q(-1, 0, 0, 0)),
      swing: 25 * d,
      twist: [-15 * d, 15 * d],
    },
  },
  {
    name: 'spine_03',
    kind: 'spine',
    parent: 2,
    reference: frame(
      v(0, 1.31043, -0.028232),
      q(0.669856, 0.000001, -0.000001, 0.742491),
    ),
    capsule: {
      c1: v(0.11, -0.039753, -0.13),
      c2: v(-0.11, -0.039753, -0.13),
      radius: 0.145,
    },
    group: 'none',
    color: 'shirt',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(0, 0, -0.124298),
        q(-0.998921, 0.000001, -0.000001, -0.046434),
      ),
      frameB: frame(v(0, 0, 0), q(-1, 0, -0.000001, 0)),
      swing: 15 * d,
      twist: [-10 * d, 10 * d],
    },
  },
  {
    name: 'neck',
    kind: 'neck',
    parent: 3,
    reference: frame(v(0, 1.575582, -0.055837), q(0.879922, 0, 0, 0.475118)),
    capsule: {
      c1: v(-0.000001, 0, -0.02),
      c2: v(0, -0.005, -0.08),
      radius: 0.07,
    },
    group: 'none',
    color: 'skin',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(0.000001, -0.000259, -0.266585),
        q(-0.942192, -0.000001, 0, 0.335074),
      ),
      frameB: frame(v(0, 0, 0), q(-1, 0, -0.000001, 0)),
      swing: 45 * d,
      twist: [-15 * d, 15 * d],
      friction: 0.8,
    },
  },
  {
    name: 'head',
    kind: 'head',
    parent: 4,
    reference: frame(v(0, 1.653348, -0.003241), q(0.750288, 0, 0, 0.661111)),
    capsule: {
      c1: v(-0.000001, 0.016892, -0.05869),
      c2: v(0, -0.003629, -0.115072),
      radius: 0.0975,
    },
    group: 'none',
    color: 'skin',
    joint: {
      type: 'spherical',
      frameA: frame(v(0, 0.001321, -0.093873), q(-0.974301, 0, 0, -0.225251)),
      frameB: frame(v(0, 0.001268, -0.005104), q(-1, 0, 0, 0)),
      swing: 15 * d,
      twist: [-15 * d, 15 * d],
      friction: 0.4,
    },
  },
  {
    name: 'thigh_l',
    kind: 'leg',
    parent: 0,
    reference: frame(
      v(0.090416, 0.986104, -0.03509),
      q(-0.703287, -0.070715, 0.053866, 0.705327),
    ),
    capsule: {
      c1: v(0.023719, 0.006008, -0.039068),
      c2: v(-0.064492, -0.004664, -0.424718),
      radius: 0.09,
    },
    group: 'self',
    color: 'pants',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(0.05, 0.011537, -0.055325),
        q(-0.714896, -0.022305, -0.698361, -0.02679),
      ),
      frameB: frame(v(0, 0, 0), q(-0.002064, 0.758987, 0.017046, 0.65088)),
      swing: 10 * d,
      twist: [-60 * d, 40 * d],
    },
  },
  {
    name: 'calf_l',
    kind: 'leg',
    parent: 6,
    reference: frame(
      v(0.101198, 0.527027, -0.037374),
      q(-0.653328, -0.06686, 0.058582, 0.751838),
    ),
    capsule: {
      c1: v(0.001778, 0, 0.009841),
      c2: v(-0.078577, 0.014707, -0.41816),
      radius: 0.075,
    },
    group: 'none',
    color: 'pants',
    joint: {
      type: 'revolute',
      frameA: frame(
        v(-0.069989, 0.000253, -0.453844),
        q(-0.000677, 0.760087, 0.105674, 0.641171),
      ),
      frameB: frame(v(0, 0, 0), q(-0.044589, 0.76554, 0.053368, 0.639619)),
      twist: [-5 * d, 45 * d],
    },
  },
  {
    name: 'thigh_r',
    kind: 'leg',
    parent: 0,
    reference: frame(
      v(-0.090416, 0.986104, -0.03509),
      q(-0.703287, 0.070715, -0.053865, 0.705326),
    ),
    capsule: {
      c1: v(-0.023719, 0.006008, -0.039068),
      c2: v(0.064492, -0.004664, -0.424718),
      radius: 0.09,
    },
    group: 'self',
    color: 'pants',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(-0.05, 0.011537, -0.055326),
        q(-0.039089, -0.714094, 0.043177, 0.697623),
      ),
      frameB: frame(v(0, 0, 0), q(0.758805, -0.019886, -0.651012, -0.001759)),
      swing: 10 * d,
      twist: [-30 * d, 60 * d],
    },
  },
  {
    name: 'calf_r',
    kind: 'leg',
    parent: 8,
    reference: frame(
      v(-0.101198, 0.527027, -0.037373),
      q(-0.653327, 0.06686, -0.058582, 0.751839),
    ),
    capsule: {
      c1: v(-0.00182, 0, 0.010071),
      c2: v(0.077883, 0.014825, -0.418047),
      radius: 0.075,
    },
    group: 'none',
    color: 'pants',
    joint: {
      type: 'revolute',
      frameA: frame(
        v(0.069988, 0.000253, -0.453844),
        q(0.760086, -0.000675, -0.641171, -0.105676),
      ),
      frameB: frame(v(0, 0, 0), q(0.76554, -0.044589, -0.639619, -0.053368)),
      twist: [-45 * d, 5 * d],
    },
  },
  {
    name: 'upper_arm_l',
    kind: 'arm',
    parent: 3,
    reference: frame(
      v(0.20378, 1.484275, -0.115897),
      q(0.143082, 0.69598, -0.69013, 0.13733),
    ),
    capsule: {
      c1: v(0, 0, 0),
      c2: v(-0.091118, 0.037775, 0.229719),
      radius: 0.075,
    },
    group: 'none',
    color: 'shirt',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(0.20378, -0.069369, -0.181921),
        q(-0.278486, 0.4456, -0.097014, 0.845266),
      ),
      frameB: frame(v(0, 0, 0), q(-0.201396, -0.001586, 0.90185, 0.382234)),
      swing: 60 * d,
      twist: [-5 * d, 5 * d],
    },
  },
  {
    name: 'lower_arm_l',
    kind: 'arm',
    parent: 10,
    reference: frame(
      v(0.305614, 1.242908, -0.117599),
      q(0.165048, 0.563437, -0.802002, 0.109959),
    ),
    capsule: {
      c1: v(0, 0, 0),
      c2: v(-0.142406, 0.039392, 0.261092),
      radius: 0.05,
    },
    group: 'none',
    color: 'skin',
    joint: {
      type: 'revolute',
      frameA: frame(
        v(-0.095482, 0.039584, 0.240723),
        q(0.512487, -0.180629, 0.839474, 0.003742),
      ),
      frameB: frame(v(0, 0, 0), q(0.503803, -0.029831, 0.858168, 0.094017)),
      twist: [-5 * d, 60 * d],
    },
  },
  {
    name: 'upper_arm_r',
    kind: 'arm',
    parent: 3,
    reference: frame(
      v(-0.20378, 1.484276, -0.115899),
      q(0.143083, -0.695978, 0.690132, 0.137329),
    ),
    capsule: {
      c1: v(0, 0, 0),
      c2: v(0.091118, 0.037775, 0.229718),
      radius: 0.075,
    },
    group: 'none',
    color: 'shirt',
    joint: {
      type: 'spherical',
      frameA: frame(
        v(-0.203779, -0.069371, -0.181922),
        q(-0.253621, -0.414842, 0.106962, 0.867261),
      ),
      frameB: frame(v(0, 0, 0), q(-0.201397, 0.001587, -0.90185, 0.382233)),
      swing: 60 * d,
      twist: [-5 * d, 5 * d],
    },
  },
  {
    name: 'lower_arm_r',
    kind: 'arm',
    parent: 12,
    reference: frame(
      v(-0.305614, 1.242907, -0.117599),
      q(0.165048, -0.563437, 0.802002, 0.109959),
    ),
    capsule: {
      c1: v(0, 0, 0),
      c2: v(0.142406, 0.039392, 0.261092),
      radius: 0.05,
    },
    group: 'none',
    color: 'skin',
    joint: {
      type: 'revolute',
      frameA: frame(
        v(0.095484, 0.039585, 0.240723),
        q(-0.180627, 0.512487, -0.003744, -0.839474),
      ),
      frameB: frame(v(0, 0, 0), q(-0.029831, 0.503803, -0.094017, -0.858169)),
      twist: [-60 * d, 5 * d],
    },
  },
];

const SHIRT = 0x48d1cc; // medium turquoise
const PANTS = 0x1e90ff; // dodger blue
const SKINS = [0xffdead, 0xffffe0, 0xcd853f, 0xd2b48c];

function normalized(r: Quat): Quat {
  const len = Math.hypot(r.x, r.y, r.z, r.w) || 1;
  return { x: r.x / len, y: r.y / len, z: r.z / len, w: r.w / len };
}

export interface Human {
  bodies: Body[];
}

/** upstream CreateHuman (the human is placed so the pelvis sits about 0.93 m above `position`). */
export function createHuman(
  scene: SceneBuilder,
  world: World,
  position: Vec3,
  frictionTorque: number,
  hertz: number,
  dampingRatio: number,
  groupIndex: number,
  colorize: boolean,
): Human {
  const skin = SKINS[groupIndex % 4] ?? SKINS[0] ?? 0xffdead;
  const colors = { pants: PANTS, shirt: SHIRT, skin };
  const bodies: Body[] = [];

  for (const bone of BONES) {
    const body = scene.createBody({
      type: 'dynamic',
      name: bone.name,
      position: {
        x: position.x + bone.reference.position.x,
        y: position.y + bone.reference.position.y,
        z: position.z + bone.reference.position.z,
      },
      rotation: bone.reference.rotation,
      color: colorize ? colors[bone.color] : undefined,
    });
    scene.capsule(body, {
      center1: bone.capsule.c1,
      center2: bone.capsule.c2,
      radius: bone.capsule.radius,
      rollingResistance: 0.2,
      filter: { groupIndex: bone.group === 'self' ? -groupIndex : 0 },
    });
    bodies.push(body);
  }

  for (let i = 1; i < BONES.length; i++) {
    const bone = BONES[i];
    const joint = bone?.joint;
    if (!bone || !joint) continue;
    const parent = bodies[bone.parent];
    const child = bodies[i];
    if (!parent || !child) continue;
    const localFrameA = {
      position: joint.frameA.position,
      rotation: normalized(joint.frameA.rotation),
    };
    const localFrameB = {
      position: joint.frameB.position,
      rotation: normalized(joint.frameB.rotation),
    };
    const maxMotorTorque = (joint.friction ?? 1) * frictionTorque;
    if (joint.type === 'revolute') {
      world.createRevoluteJoint(parent, child, {
        localFrameA,
        localFrameB,
        enableLimit: true,
        lowerAngle: joint.twist[0],
        upperAngle: joint.twist[1],
        enableSpring: hertz > 0,
        hertz,
        dampingRatio,
        enableMotor: true,
        maxMotorTorque,
      });
    } else {
      world.createSphericalJoint(parent, child, {
        localFrameA,
        localFrameB,
        enableConeLimit: true,
        coneAngle: joint.swing ?? 0,
        enableTwistLimit: true,
        lowerTwistAngle: joint.twist[0],
        upperTwistAngle: joint.twist[1],
        enableSpring: hertz > 0,
        hertz,
        dampingRatio,
        enableMotor: true,
        maxMotorTorque,
      });
    }
  }

  // thighs must not collide with each other
  const thighL = bodies[6];
  const thighR = bodies[8];
  if (thighL && thighR) world.createFilterJoint(thighL, thighR);

  return { bodies };
}
