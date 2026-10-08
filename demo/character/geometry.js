// Ring-grid geometry: every procedural body part, garment and hair clump is a
// sequence of cross-section rings. Rings carry their own skin weights so the
// result can be skinned to the rig.
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _o = new Vector3();

export const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Piecewise-linear interpolation over [[u, value], ...] (value may be a number or array). */
export function profile(points, u) {
  if (u <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [u1, v1] = points[i];
    if (u <= u1) {
      const [u0, v0] = points[i - 1];
      const t = smoothstep(0, 1, (u - u0) / (u1 - u0 || 1));
      if (Array.isArray(v0)) return v0.map((x, k) => lerp(x, v1[k], t));
      return lerp(v0, v1, t);
    }
  }
  return points[points.length - 1][1];
}

/** Cross-section shape: superellipse with exponent n (2 = ellipse, higher = boxier). */
function shape(angle, n) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (n === 2) return [c, s];
  return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/**
 * Parallel-transport frames along a polyline.
 * Returns [{ p, t, n, b, s }] where n starts as close as possible to `upHint`,
 * b = t x n, s = normalized arc length.
 */
export function pathFrames(points, upHint = V(0, 0, 1)) {
  const out = [];
  let len = 0;
  const lens = [0];
  for (let i = 1; i < points.length; i++) {
    len += points[i].distanceTo(points[i - 1]);
    lens.push(len);
  }
  let prevT = null;
  let n = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = new Vector3();
    if (i === 0) t.subVectors(points[1], points[0]);
    else if (i === points.length - 1) t.subVectors(points[i], points[i - 1]);
    else t.subVectors(points[i + 1], points[i - 1]);
    t.normalize();
    if (!n) {
      n = upHint.clone().addScaledVector(t, -upHint.dot(t));
      if (n.lengthSq() < 1e-8) n = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
      n.addScaledVector(t, -n.dot(t)).normalize();
    } else {
      // rotate previous normal by the rotation that maps prevT to t
      const axis = _a.crossVectors(prevT, t);
      const sin = axis.length();
      if (sin > 1e-6) {
        axis.divideScalar(sin);
        const ang = Math.atan2(sin, prevT.dot(t));
        n = n.clone().applyAxisAngle(axis, ang);
      } else n = n.clone();
      n.addScaledVector(t, -n.dot(t)).normalize();
    }
    const b = new Vector3().crossVectors(t, n).normalize();
    out.push({ p: p.clone(), t, n: n.clone(), b, s: len > 0 ? lens[i] / len : 0, len: lens[i] });
    prevT = t;
  }
  return out;
}

/** Dense points along a polyline through `joints` (straight segments). */
export function polyline(joints, perSegment = 8) {
  const pts = [];
  for (let i = 0; i < joints.length - 1; i++) {
    for (let k = 0; k < perSegment; k++) pts.push(joints[i].clone().lerp(joints[i + 1], k / perSegment));
  }
  pts.push(joints[joints.length - 1].clone());
  return pts;
}

/** Smooth points along a Catmull-Rom-ish path through control points. */
export function smoothPath(ctrl, count = 24) {
  const pts = [];
  const n = ctrl.length - 1;
  for (let i = 0; i <= count; i++) {
    const f = (i / count) * n;
    const k = Math.min(n - 1, Math.floor(f));
    const t = f - k;
    const p0 = ctrl[Math.max(0, k - 1)];
    const p1 = ctrl[k];
    const p2 = ctrl[k + 1];
    const p3 = ctrl[Math.min(n, k + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    pts.push(
      new Vector3(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      ),
    );
  }
  return pts;
}

/**
 * Build a BufferGeometry from rings.
 * ring = { c: Vector3, ax: Vector3, ay: Vector3, rx, ry, n?, w?: {bone: weight}, v?, t?: Vector3 (strand tangent), ow?: outline width }
 * options: radial, capStart, capEnd, hair: { seed }, skin: true (adds skinIndex/skinWeight)
 */
export function ringGeometry(rings, o = {}) {
  const radial = o.radial ?? 16;
  const pos = [];
  const idx = [];
  const skinI = [];
  const skinW = [];
  const hairT = [];
  const hairUV = [];
  const hairSeed = [];
  const hairHang = [];
  const ow = [];
  const uvs = [];
  const centers = [];
  const hair = o.hair;
  const phase = o.phase ?? 0;

  const pushSkin = (w) => {
    const entries = Object.entries(w || { 0: 1 })
      .map(([k, v]) => [Number(k), v])
      .filter(([, v]) => v > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = entries.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      skinI.push(entries[i] ? entries[i][0] : 0);
      skinW.push(entries[i] ? entries[i][1] / sum : 0);
    }
  };

  rings.forEach((r, ri) => {
    const n = r.n ?? 2;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2 + phase;
      const [X, Y] = shape(a, n);
      _o.copy(r.c).addScaledVector(r.ax, r.rx * X).addScaledVector(r.ay, r.ry * Y);
      pos.push(_o.x, _o.y, _o.z);
      pushSkin(r.w);
      uvs.push(k / radial, r.v ?? ri / Math.max(1, rings.length - 1));
      if (hair) {
        const t = r.t || _a.set(0, -1, 0);
        hairT.push(t.x, t.y, t.z);
        hairUV.push(0.5 + 0.5 * Math.cos(a), r.v ?? ri / Math.max(1, rings.length - 1));
        hairSeed.push(hair.seed ?? 0.5);
        hairHang.push(r.hang ?? 0);
      }
      ow.push(r.ow ?? 1);
      centers.push(r.c);
    }
  });

  const vid = (ri, k) => ri * radial + (k % radial);
  const tri = (a, b, c, outward) => {
    _a.fromArray(pos, a * 3);
    _b.fromArray(pos, b * 3);
    _c.fromArray(pos, c * 3);
    _n.subVectors(_b, _a).cross(_c.sub(_a));
    if (outward && _n.dot(outward) < 0) idx.push(a, c, b);
    else idx.push(a, b, c);
  };

  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < radial; k++) {
      const a = vid(ri, k);
      const b = vid(ri, k + 1);
      const c = vid(ri + 1, k + 1);
      const d = vid(ri + 1, k);
      // outward = from ring center toward the vertex
      const out = _o.fromArray(pos, a * 3).sub(rings[ri].c).clone();
      if (rings[ri].inward) out.negate();
      tri(a, b, c, out);
      tri(a, c, d, out);
    }
  }

  const addCap = (ri, dirSign) => {
    const r = rings[ri];
    const centerIdx = pos.length / 3;
    const tangent = r.t ? r.t.clone() : _o.subVectors(rings[Math.min(rings.length - 1, ri + 1)].c, rings[Math.max(0, ri - 1)].c).normalize().clone();
    const c = r.c.clone().addScaledVector(tangent, (o.capBulge ?? 0) * dirSign);
    pos.push(c.x, c.y, c.z);
    pushSkin(r.w);
    uvs.push(0.5, r.v ?? 0);
    if (hair) {
      hairT.push(tangent.x, tangent.y, tangent.z);
      hairUV.push(0.5, r.v ?? 0);
      hairSeed.push(hair.seed ?? 0.5);
      hairHang.push(r.hang ?? 0);
    }
    ow.push(r.ow ?? 1);
    const outward = tangent.multiplyScalar(dirSign);
    for (let k = 0; k < radial; k++) tri(centerIdx, vid(ri, k), vid(ri, k + 1), outward);
  };
  if (o.capStart) addCap(0, -1);
  if (o.capEnd) addCap(rings.length - 1, 1);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (o.skin !== false) {
    g.setAttribute('skinIndex', new Uint16BufferAttribute(skinI, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(skinW, 4));
  }
  if (hair) {
    g.setAttribute('hairTangent', new Float32BufferAttribute(hairT, 3));
    g.setAttribute('hairUV', new Float32BufferAttribute(hairUV, 2));
    g.setAttribute('hairSeed', new Float32BufferAttribute(hairSeed, 1));
    g.setAttribute('hairHang', new Float32BufferAttribute(hairHang, 1));
  }
  if (o.outlineWidth !== false) g.setAttribute('outlineWidth', new Float32BufferAttribute(ow, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('outlineNormal', g.attributes.normal);
  return g;
}

/**
 * Rings along a path (limbs, sleeves, hair clumps).
 * radius(s, frame) -> [rx, ry] (rx along frame.b = side, ry along frame.n = "up hint")
 * weights(s, frame) -> {boneIndex: w}
 */
export function tubeRings(points, { up = V(0, 0, 1), radius, weights, n = 2, outline, tangentOverride } = {}) {
  return pathFrames(points, up).map((f) => {
    const [rx, ry] = radius(f.s, f);
    return {
      c: f.p,
      ax: f.b,
      ay: f.n,
      rx: Math.max(rx, 1e-5),
      ry: Math.max(ry, 1e-5),
      n: typeof n === 'function' ? n(f.s) : n,
      w: weights ? weights(f.s, f) : undefined,
      v: f.s,
      t: tangentOverride ? tangentOverride(f) : f.t,
      ow: outline ? outline(f.s) : 1,
    };
  });
}

/** Add hemispherical rings before the first / after the last ring so ends are rounded. */
export function roundEnds(rings, { start = 0, end = 0, steps = 4 } = {}) {
  const out = [...rings];
  const mk = (r, dir, len, k) => {
    const a = (k / steps) * (Math.PI / 2);
    const sc = Math.cos(a);
    const t = r.t ? r.t.clone() : V(0, 1, 0);
    return { ...r, c: r.c.clone().addScaledVector(t, dir * Math.sin(a) * len), rx: r.rx * sc + 1e-5, ry: r.ry * sc + 1e-5 };
  };
  if (start > 0) {
    const r = rings[0];
    for (let k = 1; k <= steps; k++) out.unshift(mk(r, -1, start, k));
  }
  if (end > 0) {
    const r = rings[rings.length - 1];
    for (let k = 1; k <= steps; k++) out.push(mk(r, 1, end, k));
  }
  return out;
}

/** Linear blend of two bones by s between s0 and s1. */
export function blend2(a, b, s, s0, s1) {
  const t = smoothstep(s0, s1, s);
  return { [a]: 1 - t, [b]: t };
}

/** Blend along a list of [s, bone] stops. */
export function blendStops(stops, s) {
  if (s <= stops[0][0]) return { [stops[0][1]]: 1 };
  for (let i = 1; i < stops.length; i++) {
    if (s <= stops[i][0]) {
      const t = smoothstep(stops[i - 1][0], stops[i][0], s);
      const a = stops[i - 1][1];
      const b = stops[i][1];
      if (a === b) return { [a]: 1 };
      return { [a]: 1 - t, [b]: t };
    }
  }
  return { [stops[stops.length - 1][1]]: 1 };
}
