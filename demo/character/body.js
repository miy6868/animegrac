// Skinned body parts and garments, built in bind pose (world space of the
// character root). Rigid parts (hands, shoes) are built in their bone's local space.
import { Vector3 } from 'three';
import { B } from './rig.js';
import { V, ringGeometry, tubeRings, roundEnds, polyline, profile, blendStops, smoothstep, lerp } from './geometry.js';

const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

/** Rings stacked along +Y (torso-like). rows: [[y, rx, rz, zc?, n?], ...] */
function stackRings(rows, weightsByY, { inwardFrom = Infinity } = {}) {
  return rows.map(([y, rx, rz, zc = 0, n = 2], i) => ({
    c: V(0, y, zc),
    ax: X,
    ay: Z,
    rx,
    ry: rz,
    n,
    w: weightsByY(y),
    v: i / (rows.length - 1),
    inward: i >= inwardFrom,
  }));
}

// ------------------------------------------------------------------ skin

export function legGeometry(J, side, s = 1) {
  const sfx = side > 0 ? 'L' : 'R';
  const top = J['upperLeg' + sfx].clone().add(V(-side * 0.008, 0.07 * s, 0));
  const pts = polyline([top, J['lowerLeg' + sfx], J['foot' + sfx]], 14);
  const R = [
    [0, [0.074, 0.078]],
    [0.12, [0.068, 0.072]],
    [0.33, [0.057, 0.06]],
    [0.5, [0.047, 0.048]],
    [0.56, [0.044, 0.046]],
    [0.67, [0.047, 0.051]],
    [0.86, [0.033, 0.034]],
    [1, [0.026, 0.027]],
  ];
  const rings = tubeRings(pts, {
    up: Z,
    radius: (u) => profile(R, u).map((r) => r * s),
    weights: (u) => blendStops([[0, B.hips], [0.13, B['upperLeg' + sfx]], [0.49, B['upperLeg' + sfx]], [0.6, B['lowerLeg' + sfx]], [0.95, B['lowerLeg' + sfx]], [1, B['foot' + sfx]]], u),
  });
  return ringGeometry(roundEnds(rings, { end: 0.02 * s }), { radial: 18, capStart: true });
}

export function armGeometry(J, side, s = 1) {
  const sfx = side > 0 ? 'L' : 'R';
  const dir = side > 0 ? J.armDirL : J.armDirR;
  const start = J['upperArm' + sfx].clone().addScaledVector(dir, -0.012 * s);
  const pts = polyline([start, J['lowerArm' + sfx], J['hand' + sfx]], 12);
  const R = [
    [0, [0.033, 0.035]],
    [0.2, [0.036, 0.037]],
    [0.52, [0.029, 0.03]],
    [0.65, [0.031, 0.032]],
    [0.92, [0.022, 0.02]],
    [1, [0.021, 0.019]],
  ];
  const rings = tubeRings(pts, {
    up: Z,
    radius: (u) => profile(R, u).map((r) => r * s),
    weights: (u) => blendStops([[0, B['shoulder' + sfx]], [0.1, B['upperArm' + sfx]], [0.5, B['upperArm' + sfx]], [0.6, B['lowerArm' + sfx]], [0.93, B['lowerArm' + sfx]], [1, B['hand' + sfx]]], u),
  });
  return ringGeometry(roundEnds(rings, { end: 0.012 * s }), { radial: 14, capStart: true });
}

export function neckGeometry(J, s = 1) {
  const pts = polyline([V(0, 1.2 * s, -0.012 * s), V(0, 1.44 * s, 0.002 * s)], 10);
  const rings = tubeRings(pts, {
    up: Z,
    radius: () => [0.031 * s, 0.033 * s],
    weights: (u) => blendStops([[0, B.chest], [0.35, B.neck], [0.7, B.neck], [0.95, B.head]], u),
  });
  return ringGeometry(rings, { radial: 14, capStart: true, capEnd: true });
}

// ------------------------------------------------------------- garments

/** Oversized tee: boxy body + wide sleeves ending above the elbow. */
export function teeBodyGeometry(J, s = 1, o = {}) {
  const len = o.length ?? 0.795; // hem height
  const w = o.width ?? 1;
  const rows = [
    [len + 0.016, 0.165 * w, 0.106, 0.004, 2.5],
    [len, 0.178 * w, 0.118, 0.004, 2.7],
    [len + 0.1, 0.174 * w, 0.116, 0.004, 2.7],
    [1.06, 0.168 * w, 0.115, 0.006, 2.7],
    [1.17, 0.166 * w, 0.11, 0.004, 2.6],
    [1.235, 0.16 * w, 0.098, 0.0, 2.4],
    [1.262, 0.135 * w, 0.082, -0.004, 2.2],
    [1.284, 0.092, 0.064, -0.004, 2],
    [1.298, 0.064, 0.053, -0.004, 2],
    [1.301, 0.058, 0.048, -0.004, 2],
    [1.28, 0.054, 0.045, -0.006, 2],
  ].map(([y, rx, rz, zc, n]) => [y * s, rx * s, rz * s, zc * s, n]);
  const rings = stackRings(rows, (y) => blendStops([[0.82 * s, B.hips], [1.0 * s, B.spine], [1.12 * s, B.chest], [1.29 * s, B.chest], [1.31 * s, B.neck]], y), {
    inwardFrom: 99,
  });
  rings[0].inward = true;
  rings[rings.length - 1].inward = true;
  rings[rings.length - 2].inward = true;
  return ringGeometry(rings, { radial: 28 });
}

export function teeSleeveGeometry(J, side, s = 1, o = {}) {
  const sfx = side > 0 ? 'L' : 'R';
  const dir = side > 0 ? J.armDirL : J.armDirR;
  const j = J['upperArm' + sfx];
  const len = (o.sleeve ?? 0.17) * s;
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(j.clone().addScaledVector(dir, lerp(0.0, len, i / 8)).add(V(-Math.sign(dir.x) * 0.006 * s, -0.004 * s, 0)));
  const R = [
    [0, [0.056, 0.062]],
    [0.4, [0.056, 0.06]],
    [1, [0.055, 0.058]],
  ];
  const rings = tubeRings(pts, {
    up: Z,
    radius: (u) => profile(R, u).map((r) => r * s),
    weights: (u) => blendStops([[0, B.chest], [0.35, B['upperArm' + sfx]]], u),
  });
  // fold the opening inward so the sleeve has some thickness
  const last = rings[rings.length - 1];
  rings.push({ ...last, c: last.c.clone().addScaledVector(dir, -0.012 * s), rx: last.rx - 0.008 * s, ry: last.ry - 0.008 * s, inward: true });
  rings.push({ ...last, c: last.c.clone().addScaledVector(dir, -0.04 * s), rx: last.rx - 0.012 * s, ry: last.ry - 0.012 * s, inward: true });
  last.inward = true; // the rim strip faces along the arm, i.e. "inward" radially
  return ringGeometry(rings, { radial: 18, capStart: true });
}

export function shortsPelvisGeometry(J, s = 1) {
  const rows = [
    [0.99, 0.128, 0.09, 0, 2.3],
    [0.9, 0.148, 0.1, -0.004, 2.4],
    [0.83, 0.15, 0.102, -0.006, 2.4],
    [0.79, 0.11, 0.088, -0.008, 2.2],
  ].map(([y, rx, rz, zc, n]) => [y * s, rx * s, rz * s, zc * s, n]);
  const rings = stackRings(rows, () => ({ [B.hips]: 1 }));
  return ringGeometry(rings, { radial: 24, capStart: true, capEnd: true, capBulge: -0.03 * s });
}

export function shortsLegGeometry(J, side, s = 1, o = {}) {
  const sfx = side > 0 ? 'L' : 'R';
  const top = J['upperLeg' + sfx].clone().add(V(-side * 0.008, 0.07 * s, 0));
  const knee = J['lowerLeg' + sfx];
  const len = o.inseam ?? 0.2;
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(top.clone().lerp(knee, (i / 8) * len * 1.0));
  const rings = tubeRings(pts, {
    up: Z,
    radius: (u) => [lerp(0.084, 0.079, u) * s, lerp(0.088, 0.083, u) * s],
    weights: (u) => blendStops([[0.0, B.hips], [0.45, B['upperLeg' + sfx]]], u),
  });
  const last = rings[rings.length - 1];
  const dn = last.t.clone();
  rings.push({ ...last, c: last.c.clone().addScaledVector(dn, -0.01 * s), rx: last.rx - 0.008 * s, ry: last.ry - 0.008 * s, inward: true });
  last.inward = true;
  return ringGeometry(rings, { radial: 20, capStart: true });
}

export function sockGeometry(J, side, s = 1, o = {}) {
  const sfx = side > 0 ? 'L' : 'R';
  const knee = J['lowerLeg' + sfx];
  const ankle = J['foot' + sfx];
  const h = o.height ?? 0.16; // sock top height above the ankle joint
  const top = ankle.clone().lerp(knee, h / knee.distanceTo(ankle));
  const pts = polyline([top, ankle.clone().add(V(0, -0.02 * s, 0.004 * s))], 8);
  const rings = tubeRings(pts, {
    up: Z,
    radius: (u) => {
      const r = lerp(0.036, 0.03, smoothstep(0, 1, u));
      return [r * s, (r + 0.001) * s];
    },
    weights: (u) => blendStops([[0, B['lowerLeg' + sfx]], [0.8, B['lowerLeg' + sfx]], [1, B['foot' + sfx]]], u),
  });
  rings[0].rx += 0.003 * s;
  rings[0].ry += 0.003 * s;
  return ringGeometry(rings, { radial: 18, capStart: true, capEnd: true });
}

// ------------------------------------------------------------- rigid parts

/** Mitten-style hand in the hand bone's local space (origin = wrist). */
export function handGeometries(J, side, s = 1) {
  const dir = (side > 0 ? J.armDirL : J.armDirR).clone();
  // palm faces the body (and slightly down) in the bind pose
  const palmN = V().set(-Math.sign(side) * Math.abs(dir.y), -Math.abs(dir.x), 0).normalize();
  const L = 0.115 * s;
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    pts.push(dir.clone().multiplyScalar(u * L).addScaledVector(palmN, 0.03 * s * u * u));
  }
  const R = [
    [0, [0.02, 0.014]],
    [0.32, [0.029, 0.014]],
    [0.62, [0.027, 0.011]],
    [0.88, [0.021, 0.008]],
    [1, [0.014, 0.006]],
  ];
  const rings = tubeRings(pts, { up: palmN, radius: (u) => profile(R, u).map((r) => r * s), n: 2.3 });
  const palm = ringGeometry(roundEnds(rings, { end: 0.012 * s, steps: 3 }), { radial: 14, capStart: true, skin: false });
  // thumb
  const tb = dir.clone().multiplyScalar(0.03 * s).add(V(0, 0, 0.018 * s));
  const tdir = dir.clone().multiplyScalar(0.8).add(V(0, 0, 0.55)).addScaledVector(palmN, 0.35).normalize();
  const tpts = [];
  for (let i = 0; i <= 6; i++) tpts.push(tb.clone().addScaledVector(tdir, (i / 6) * 0.055 * s));
  const trings = tubeRings(tpts, { up: palmN, radius: (u) => [lerp(0.012, 0.009, u) * s, lerp(0.011, 0.008, u) * s] });
  const thumb = ringGeometry(roundEnds(trings, { end: 0.008 * s, steps: 3 }), { radial: 10, capStart: true, skin: false });
  return [palm, thumb];
}

/** Chunky sneaker in the foot bone's local space (origin = ankle, toes +Z). */
export function shoeGeometries(J, side, s = 1) {
  const ground = -0.075 * s;
  const mk = (rows, n, opts = {}) => {
    const rings = rows.map(([z, cy, rx, ry, cx = 0]) => ({ c: V(cx * side * s, cy * s, z * s), ax: X, ay: Y, rx: rx * s, ry: ry * s, n, t: Z, v: 0 }));
    return ringGeometry(roundEnds(rings, { start: opts.start ?? 0.012 * s, end: opts.end ?? 0.02 * s, steps: 4 }), { radial: 20, skin: false, capStart: true, capEnd: true });
  };
  const upper = mk(
    [
      [-0.05, -0.033, 0.038, 0.042],
      [-0.025, -0.028, 0.044, 0.048],
      [0.02, -0.034, 0.047, 0.044],
      [0.08, -0.043, 0.05, 0.034],
      [0.135, -0.05, 0.046, 0.025, 0.004],
      [0.165, -0.053, 0.036, 0.019, 0.006],
    ],
    2.5,
  );
  const sole = mk(
    [
      [-0.058, ground / s + 0.014, 0.045, 0.016],
      [0.02, ground / s + 0.014, 0.054, 0.016],
      [0.1, ground / s + 0.014, 0.057, 0.016, 0.003],
      [0.17, ground / s + 0.015, 0.045, 0.016, 0.006],
    ],
    4,
    { start: 0.012 * s, end: 0.018 * s },
  );
  const accent = mk(
    [
      [-0.054, -0.03, 0.04, 0.042],
      [-0.03, -0.027, 0.046, 0.05],
      [0.005, -0.03, 0.0485, 0.048],
    ],
    2.5,
    { start: 0.012 * s, end: 0.004 * s },
  );
  // tongue / collar
  const tongue = mk(
    [
      [-0.0, 0.0, 0.03, 0.012],
      [0.04, -0.012, 0.032, 0.012],
    ],
    2.2,
    { start: 0.008 * s, end: 0.015 * s },
  );
  return { upper, sole, accent, tongue };
}

export { X, Y, Z, Vector3 };
