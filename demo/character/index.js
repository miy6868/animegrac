// Demo content: a self-made procedural anime character, rigged and posable.
// It is NOT part of the style engine — it only *uses* it (style.createMaterial,
// style.stylize, the hair/face attribute contracts). Replace it with any model.
import { Group, Mesh, SkinnedMesh, Skeleton, Bone, Euler, Quaternion, MathUtils, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { bodyJoints, createRig, BONE_NAMES } from './rig.js';
import { legGeometry, armGeometry, neckGeometry, teeBodyGeometry, teeSleeveGeometry, shortsPelvisGeometry, shortsLegGeometry, sockGeometry, handGeometries, shoeGeometries } from './body.js';
import { headGeometry, earGeometry, createFaceTexture, HEAD } from './head.js';
import { buildHair } from './hair.js';
import { POSES } from './poses.js';

export const CHARACTER_PRESETS = {
  // Apricot-haired girl in an oversized indigo tee.
  mio: {
    height: 1.58,
    headScale: 1.1,
    palette: {
      skin: { color: '#fdece6', shadow: '#f2a99b' },
      hair: { color: '#f8a77a', shadow: '#e5735e' },
      top: { color: '#2b2e4a' },
      bottom: { color: '#f4f1ea' },
      socks: { color: '#ffffff' },
      shoe: { color: '#fbfbfb' },
      sole: { color: '#e6ebf4' },
      accent: { color: '#f2705c' },
    },
    face: { eyeColor: '#5b74e0', lashColor: '#3b2430', eyeSize: 1, blush: 0.35, expression: 'neutral' },
    hair: { length: 0.5, sideLength: 0.34, bangsLength: 0.075, ahoge: true, flare: 0.08 },
    outfit: { teeLength: 0.85, sleeve: 0.16, inseam: 0.24, sockHeight: 0.15 },
  },
  // Short dark-teal bob, white tee, navy shorts.
  rin: {
    height: 1.55,
    palette: {
      skin: { color: '#fdeee6', shadow: '#efab9a' },
      hair: { color: '#2f5f73', shadow: '#22425a' },
      top: { color: '#fbfaf6' },
      bottom: { color: '#2d3a66' },
      socks: { color: '#2d3a66' },
      shoe: { color: '#fbfbfb' },
      sole: { color: '#e6ebf4' },
      accent: { color: '#ffcc4d' },
    },
    face: { eyeColor: '#e0a13a', lashColor: '#1f2633', eyeSize: 0.95, blush: 0.25, eyeTilt: 0.12 },
    hair: { length: 0.08, sideLength: 0.1, bangsLength: 0.07, ahoge: false, flare: 0.25, backCount: 6 },
    outfit: { teeLength: 0.82, sleeve: 0.14, inseam: 0.16, sockHeight: 0.26 },
  },
};

const pal = (x) => (typeof x === 'string' ? { color: x } : { ...x });
const _e = new Euler();
const _q = new Quaternion();
const _qParent = new Quaternion();
const _qTarget = new Quaternion();
const _qIdentity = new Quaternion();

/** Skin weights for the hair: 0 = follows the head, 1 = follows the gravity bone. */
function addHangWeights(geo) {
  const hang = geo.attributes.hairHang;
  const n = hang.count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const h = hang.getX(i);
    idx[i * 4] = 0;
    idx[i * 4 + 1] = 1;
    w[i * 4] = 1 - h;
    w[i * 4 + 1] = h;
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(w, 4));
}

/**
 * @param {AnimeStyle} style
 * @param {string|object} design preset name or design object (merged over 'mio')
 */
export function createCharacter(style, design = 'mio') {
  const base = CHARACTER_PRESETS.mio;
  const src = typeof design === 'string' ? CHARACTER_PRESETS[design] : design;
  const d = {
    ...base,
    ...src,
    palette: { ...base.palette, ...(src.palette || {}) },
    face: { ...base.face, ...(src.face || {}) },
    hair: { ...base.hair, ...(src.hair || {}) },
    outfit: { ...base.outfit, ...(src.outfit || {}) },
  };
  const J = bodyJoints({ height: d.height });
  const s = J.scale;
  const rig = createRig(J);
  const { root, bones, skeleton } = rig;

  // ---- materials (colors only; everything else comes from the style)
  const faceTex = createFaceTexture({ ...d.face, hairColor: pal(d.palette.hair).color, skinColor: pal(d.palette.skin).color }, s);
  const M = {
    skin: style.createMaterial({ kind: 'skin', name: 'skin', ...pal(d.palette.skin) }),
    // anime convention: the neck sits in the head's shadow
    neck: style.createMaterial({ kind: 'skin', name: 'neck', ...pal(d.palette.skin), thresholdBias: -0.3 }),
    face: style.createMaterial({
      kind: 'face',
      name: 'face',
      ...pal(d.palette.skin),
      faceMap: faceTex,
      faceRect: HEAD.faceRect.map((v) => v * s),
      flattenAxis: [0, 0, 1],
    }),
    hair: style.createMaterial({ kind: 'hair', name: 'hair', ...pal(d.palette.hair) }),
    top: style.createMaterial({ kind: 'cloth', name: 'top', ...pal(d.palette.top), side: 2 }),
    bottom: style.createMaterial({ kind: 'cloth', name: 'bottom', ...pal(d.palette.bottom), side: 2 }),
    socks: style.createMaterial({ kind: 'cloth', name: 'socks', ...pal(d.palette.socks) }),
    shoe: style.createMaterial({ kind: 'prop', name: 'shoe', ...pal(d.palette.shoe) }),
    sole: style.createMaterial({ kind: 'prop', name: 'sole', ...pal(d.palette.sole) }),
    accent: style.createMaterial({ kind: 'prop', name: 'accent', ...pal(d.palette.accent) }),
  };

  root.updateMatrixWorld(true);
  const meshes = [];
  const skinned = (geo, mat, name, o = {}) => {
    const m = new SkinnedMesh(geo, mat);
    m.name = name;
    root.add(m);
    m.updateMatrixWorld(true);
    m.bind(skeleton);
    m.frustumCulled = false;
    style.stylize(m, { material: mat, outlineWidth: o.outlineWidth ?? 1, receiveShadow: o.receiveShadow ?? true });
    meshes.push(m);
    return m;
  };
  const rigid = (geo, mat, bone, name, o = {}) => {
    const m = new Mesh(geo, mat);
    m.name = name;
    bones[bone].add(m);
    style.stylize(m, { material: mat, outlineWidth: o.outlineWidth ?? 1, receiveShadow: o.receiveShadow ?? true, outline: o.outline });
    meshes.push(m);
    return m;
  };

  // ---- body
  skinned(neckGeometry(J, s), M.neck, 'neck');
  for (const side of [1, -1]) {
    const sfx = side > 0 ? 'L' : 'R';
    skinned(legGeometry(J, side, s), M.skin, 'leg' + sfx);
    skinned(armGeometry(J, side, s), M.skin, 'arm' + sfx);
    const [palm, thumb] = handGeometries(J, side, s);
    rigid(palm, M.skin, 'hand' + sfx, 'hand' + sfx);
    rigid(thumb, M.skin, 'hand' + sfx, 'thumb' + sfx);
    skinned(sockGeometry(J, side, s, { height: d.outfit.sockHeight }), M.socks, 'sock' + sfx);
    const shoe = shoeGeometries(J, side, s);
    rigid(shoe.sole, M.sole, 'foot' + sfx, 'sole' + sfx);
    rigid(shoe.upper, M.shoe, 'foot' + sfx, 'shoe' + sfx);
    rigid(shoe.accent, M.accent, 'foot' + sfx, 'shoeAccent' + sfx);
    rigid(shoe.tongue, M.shoe, 'foot' + sfx, 'shoeTongue' + sfx);
    skinned(teeSleeveGeometry(J, side, s, { sleeve: d.outfit.sleeve }), M.top, 'sleeve' + sfx);
    skinned(shortsLegGeometry(J, side, s, { inseam: d.outfit.inseam }), M.bottom, 'shortsLeg' + sfx);
  }
  skinned(teeBodyGeometry(J, s, { length: d.outfit.teeLength }), M.top, 'tee');
  skinned(shortsPelvisGeometry(J, s), M.bottom, 'shorts');

  // ---- head (everything on the head lives in one group so it can be scaled: anime heads are big)
  const headGroup = new Group();
  headGroup.name = 'headGroup';
  headGroup.scale.setScalar(d.headScale ?? 1.1);
  bones.head.add(headGroup);
  const onHead = (geo, mat, name, o = {}) => {
    const m = new Mesh(geo, mat);
    m.name = name;
    headGroup.add(m);
    style.stylize(m, { material: mat, outlineWidth: o.outlineWidth ?? 1, receiveShadow: o.receiveShadow ?? true });
    meshes.push(m);
    return m;
  };
  onHead(headGeometry(s), M.face, 'head');
  for (const side of [1, -1]) onHead(earGeometry(side, s), M.skin, side > 0 ? 'earL' : 'earR');
  const teeRows = [
    [0.8, 0.178, 0.118, 0.004],
    [1.06, 0.168, 0.115, 0.006],
    [1.17, 0.166, 0.11, 0.004],
    [1.235, 0.16, 0.098, 0],
    [1.262, 0.135, 0.082, -0.004],
    [1.284, 0.092, 0.064, -0.004],
    [1.3, 0.066, 0.055, -0.004],
  ].map(([y, rx, rz, zc]) => [y * s, rx * s, rz * s, zc * s]);
  const hair = buildHair(J, d.hair, s, { rows: teeRows }, d.headScale ?? 1.1);
  // Hanging hair is skinned to a "gravity" bone that is counter-rotated every
  // frame, so long hair falls straight down whatever the head does.
  const hairAnchor = new Bone();
  hairAnchor.name = 'hairAnchor';
  const hairHang = new Bone();
  hairHang.name = 'hairHang';
  hairHang.position.copy(HEAD.center).multiplyScalar(s);
  headGroup.add(hairAnchor, hairHang);
  addHangWeights(hair.strands);
  const hairStrands = new SkinnedMesh(hair.strands, M.hair);
  hairStrands.name = 'hair';
  headGroup.add(hairStrands);
  root.updateMatrixWorld(true);
  hairStrands.bind(new Skeleton([hairAnchor, hairHang]));
  hairStrands.frustumCulled = false;
  style.stylize(hairStrands, { material: M.hair, receiveShadow: false });
  meshes.push(hairStrands);
  const hairShell = onHead(hair.shell, M.hair, 'hairShell');
  hairShell.receiveShadow = false;
  const hang = { q: new Quaternion(), vel: new Quaternion(), init: false };

  // ---- runtime
  const state = { pose: null, blink: 0, nextBlink: 2.5, expression: { ...d.face }, idle: 1, look: [0, 0] };

  function setPose(pose) {
    const p = typeof pose === 'string' ? POSES[pose] : pose;
    if (!p) throw new Error(`Unknown pose ${pose}`);
    state.pose = p;
    for (const name of BONE_NAMES) {
      const b = bones[name];
      const entry = p[name];
      const rot = Array.isArray(entry) ? entry : entry?.rot || [0, 0, 0];
      b.userData.poseQuat = new Quaternion().setFromEuler(_e.set(...rot.map((v) => MathUtils.degToRad(v)), 'XYZ'));
      b.quaternion.copy(b.userData.poseQuat);
      b.position.copy(b.userData.bindPosition);
      if (entry?.offset) b.position.add({ x: entry.offset[0] * s, y: entry.offset[1] * s, z: entry.offset[2] * s });
    }
    root.updateMatrixWorld(true);
    hang.init = false;
    updateHair(0);
    return api;
  }

  function setExpression(next = {}) {
    Object.assign(state.expression, next);
    faceTex.userData.repaint({ ...state.expression, blink: state.blink });
    return api;
  }

  /** Keep the hanging hair aligned with gravity, with a little lag (secondary motion). */
  function updateHair(dt) {
    headGroup.updateWorldMatrix(true, false);
    headGroup.getWorldQuaternion(_qParent);
    root.getWorldQuaternion(_qTarget); // "upright" = the character root's orientation
    _qTarget.premultiply(_qParent.invert()); // -> local to headGroup
    // only partially: hair still follows a bit of the head tilt
    _qTarget.slerp(_qIdentity, 0.15);
    if (!hang.init || dt === 0) {
      hang.q.copy(_qTarget);
      hang.init = true;
    } else hang.q.slerp(_qTarget, 1 - Math.exp(-dt * 9));
    hairHang.quaternion.copy(hang.q);
  }

  /** Idle motion: breathing, small head drift, blinking. Hair sway is in the shader. */
  function update(dt, time) {
    if (!state.pose) return;
    const k = state.idle;
    const breathe = Math.sin(time * 2.1) * k;
    const add = (name, x, y, z) => {
      const b = bones[name];
      _q.setFromEuler(_e.set(x, y, z, 'XYZ'));
      b.quaternion.copy(b.userData.poseQuat).multiply(_q);
    };
    add('chest', -0.012 * breathe, 0, 0);
    add('neck', 0.008 * breathe, 0, 0);
    add('head', Math.sin(time * 0.7) * 0.02 * k, Math.sin(time * 0.43) * 0.035 * k, Math.sin(time * 0.55) * 0.015 * k);
    add('upperArmL', 0, 0, 0.01 * breathe);
    add('upperArmR', 0, 0, -0.01 * breathe);
    // blink
    state.nextBlink -= dt;
    let blink = 0;
    if (state.nextBlink < 0) {
      blink = 1;
      if (state.nextBlink < -0.12) state.nextBlink = 2.2 + Math.random() * 2.8;
    }
    if (blink !== state.blink) {
      state.blink = blink;
      faceTex.userData.repaint({ ...state.expression, blink });
    }
    root.updateMatrixWorld(true);
    updateHair(dt);
  }

  function setPalette(partial) {
    for (const [k, v] of Object.entries(partial)) {
      if (k === 'skin') {
        M.skin.setColors(pal(v));
        M.neck.setColors(pal(v));
        M.face.setColors(pal(v));
      } else if (M[k]) M[k].setColors(pal(v));
    }
    return api;
  }

  const api = {
    root,
    bones,
    skeleton,
    joints: J,
    materials: M,
    meshes,
    design: d,
    faceTexture: faceTex,
    setPose,
    setExpression,
    setPalette,
    update,
    set idle(v) {
      state.idle = v;
    },
    get idle() {
      return state.idle;
    },
  };
  setPose('stand');
  return api;
}

export { POSES };
