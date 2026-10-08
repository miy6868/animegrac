// A small humanoid rig. Bind pose = A-pose facing +Z, Y up, metres.
// Bones have identity rotation in the bind pose, so a pose is just a set of
// Euler rotations in (world-aligned) parent space. Left = +X.
import { Bone, Group, Skeleton, Vector3 } from 'three';

export const BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'lowerArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'lowerArmR',
  'handR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'upperLegR',
  'lowerLegR',
  'footR',
];

/** bone index lookup, e.g. B.chest */
export const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));

/**
 * Joint positions (world, bind pose) for a body of a given height.
 * Proportions: ~7 heads, long legs, narrow shoulders.
 */
export function bodyJoints({ height = 1.58, armAngle = 68 } = {}) {
  const s = height / 1.58;
  const a = (armAngle * Math.PI) / 180;
  const armDir = (side) => new Vector3(side * Math.cos(a), -Math.sin(a), 0);
  const J = {
    hips: new Vector3(0, 0.86, 0),
    spine: new Vector3(0, 0.97, 0),
    chest: new Vector3(0, 1.1, 0),
    neck: new Vector3(0, 1.29, -0.008),
    head: new Vector3(0, 1.372, 0),
  };
  for (const [side, sfx] of [
    [1, 'L'],
    [-1, 'R'],
  ]) {
    J['shoulder' + sfx] = new Vector3(side * 0.03, 1.252, -0.012);
    J['upperArm' + sfx] = new Vector3(side * 0.145, 1.232, -0.012);
    J['lowerArm' + sfx] = J['upperArm' + sfx].clone().addScaledVector(armDir(side), 0.25);
    J['hand' + sfx] = J['lowerArm' + sfx].clone().addScaledVector(armDir(side), 0.225);
    J['handEnd' + sfx] = J['hand' + sfx].clone().addScaledVector(armDir(side), 0.15);
    J['upperLeg' + sfx] = new Vector3(side * 0.083, 0.835, 0);
    J['lowerLeg' + sfx] = new Vector3(side * 0.088, 0.455, 0.008);
    J['foot' + sfx] = new Vector3(side * 0.09, 0.075, -0.012);
    J['toe' + sfx] = new Vector3(side * 0.095, 0.02, 0.15);
  }
  for (const k of Object.keys(J)) J[k].multiplyScalar(s);
  J.armDirL = armDir(1);
  J.armDirR = armDir(-1);
  J.scale = s;
  return J;
}

const PARENT = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shoulderL: 'chest',
  upperArmL: 'shoulderL',
  lowerArmL: 'upperArmL',
  handL: 'lowerArmL',
  shoulderR: 'chest',
  upperArmR: 'shoulderR',
  lowerArmR: 'upperArmR',
  handR: 'lowerArmR',
  upperLegL: 'hips',
  lowerLegL: 'upperLegL',
  footL: 'lowerLegL',
  upperLegR: 'hips',
  lowerLegR: 'upperLegR',
  footR: 'lowerLegR',
};

export function createRig(joints) {
  const root = new Group();
  root.name = 'character';
  const bones = {};
  for (const name of BONE_NAMES) {
    const b = new Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONE_NAMES) {
    const b = bones[name];
    const parent = PARENT[name];
    if (parent) {
      bones[parent].add(b);
      b.position.subVectors(joints[name], joints[parent]);
    } else {
      root.add(b);
      b.position.copy(joints[name]);
    }
    b.userData.bindPosition = b.position.clone();
  }
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(BONE_NAMES.map((n) => bones[n]));
  return { root, bones, skeleton, joints };
}
