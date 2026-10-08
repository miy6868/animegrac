// Poses: Euler rotations in degrees (XYZ) per bone, relative to the A-pose bind.
// Rotation conventions (character faces +Z, left = +X):
//   x+ : bend forward/down (spine/head nod forward, arm swings back, knee bends)
//   upperLeg x- : lift thigh forward (sitting)
//   head y+ : turn toward the character's left
// `hips` may also carry `offset: [x, y, z]` (metres) from its bind position.

export const POSES = {
  stand: {
    hips: { rot: [0, 0, 0] },
    spine: [2, 0, 0],
    chest: [-2, 0, 0],
    neck: [4, 0, 0],
    head: [-2, 6, 2],
    upperArmL: [4, 0, -16],
    lowerArmL: [-10, 0, 6],
    handL: [0, 20, 0],
    upperArmR: [4, 0, 16],
    lowerArmR: [-10, 0, -6],
    handR: [0, -20, 0],
    upperLegL: [0, 0, 1],
    upperLegR: [0, 0, -1],
  },

  // A small wave.
  wave: {
    spine: [0, 0, -2],
    chest: [0, 6, 0],
    neck: [2, 0, 0],
    head: [-4, 10, 6],
    upperArmL: [0, 0, 6],
    lowerArmL: [-8, 0, 4],
    upperArmR: [-10, 0, 120],
    lowerArmR: [0, -10, -50],
    handR: [0, 0, 0],
    upperLegL: [0, 0, 2],
    upperLegR: [0, 0, -3],
    lowerLegR: [6, 0, 0],
  },
};
