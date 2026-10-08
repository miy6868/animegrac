// Clump hair. A smooth scalp shell + flattened, tapered clumps that follow the
// head and then fall under gravity, pushed out of the face and the torso.
// Each clump is its own closed tube, so the outline hull draws a line around
// every clump -> the "strand bundle" look. Built in head-bone local space.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V, ringGeometry, smoothstep, lerp, profile, smoothPath } from './geometry.js';
import { HEAD } from './head.js';

const DEG = Math.PI / 180;

export const HAIR_DEFAULTS = {
  length: 0.36, // back hair length below where it leaves the head (m)
  sideLength: 0.24, // locks in front of the ears
  bangsLength: 0.075,
  volume: 1, // scales the hair shell offset
  backCount: 7, // clumps per half of the back
  bangsCount: 9,
  flare: 0.1, // outward spread of long hair
  ahoge: true,
  seed: 7,
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * @param {object} J      body joints (bind pose, world)
 * @param {object} design hair design (see HAIR_DEFAULTS)
 * @param {number} s      body scale
 * @param {object} torso  { rows: [[y, rx, rz, zc]...] } garment profile used for collisions (world)
 */
export function buildHair(J, design = {}, s = 1, torso = null, headScale = 1) {
  const d = { ...HAIR_DEFAULTS, ...design };
  const rand = rng(d.seed);
  const vol = d.volume;
  const Hc = HEAD.center.clone().add(V(0, 0.004, -0.004)).multiplyScalar(s);
  const Hr = V(0.104 + 0.01 * (vol - 1), 0.11 + 0.01 * (vol - 1), 0.108 + 0.01 * (vol - 1)).multiplyScalar(s);
  const headC = HEAD.center.clone().multiplyScalar(s);
  const headR = V(HEAD.radius * HEAD.scale.x, HEAD.radius * HEAD.scale.y, HEAD.radius * HEAD.scale.z).multiplyScalar(s);
  const headWorld = J.head.clone();

  const surf = (th, ph, lift = 0) =>
    V(Hc.x + Math.sin(th) * Math.sin(ph) * (Hr.x + lift), Hc.y + Math.cos(th) * (Hr.y + lift), Hc.z + Math.sin(th) * Math.cos(ph) * (Hr.z + lift));
  const surfN = (th, ph) => V((Math.sin(th) * Math.sin(ph)) / Hr.x, Math.cos(th) / Hr.y, (Math.sin(th) * Math.cos(ph)) / Hr.z).normalize();
  const merid = (th, ph) => V(Math.cos(th) * Math.sin(ph) * Hr.x, -Math.sin(th) * Hr.y, Math.cos(th) * Math.cos(ph) * Hr.z).normalize();

  // --- collisions (head-local) ---
  const pushOutOfHead = (p, margin) => {
    const q = V((p.x - headC.x) / (headR.x + margin), (p.y - headC.y) / (headR.y + margin), (p.z - headC.z) / (headR.z + margin));
    const l = q.length();
    if (l < 1) {
      q.multiplyScalar(1 / l);
      p.set(headC.x + q.x * (headR.x + margin), headC.y + q.y * (headR.y + margin), headC.z + q.z * (headR.z + margin));
    }
  };
  const rows = torso?.rows || [];
  const torsoAt = (yw) => {
    if (!rows.length || yw < rows[0][0] || yw > rows[rows.length - 1][0]) return null;
    for (let i = 1; i < rows.length; i++) {
      if (yw <= rows[i][0]) {
        const t = (yw - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0] || 1);
        return rows[i - 1].map((v, k) => lerp(v, rows[i][k], t));
      }
    }
    return null;
  };
  const pushOutOfTorso = (p, drape, margin) => {
    if (!drape) return;
    const w = p.clone().multiplyScalar(headScale).add(headWorld);
    const r = torsoAt(w.y);
    if (!r) return;
    const [, rx, rz, zc] = r;
    const ex = 2.6;
    const ax = Math.abs(w.x) / (rx + margin);
    if (ax >= 1) return;
    const half = (rz + margin) * Math.pow(1 - Math.pow(ax, ex), 1 / ex);
    if (drape === 'front' && w.z < zc + half) w.z = zc + half;
    if (drape === 'back' && w.z > zc - half) w.z = zc - half;
    p.copy(w.sub(headWorld).divideScalar(headScale));
  };

  const clumps = [];
  /**
   * One clump.
   *  ph: azimuth (0 = front), th0: root polar angle, thL: where it leaves the head,
   *  len: free length, w: width, th: thickness, tip: 0 = pointed .. 1 = blunt,
   *  inward/flare/forward: steering of the free part, drape: 'front'|'back'|null
   */
  const clump = (c) => {
    const pts = [];
    const nrm = [];
    const nS = 9;
    const lift = (c.lift ?? 0.004) * s;
    for (let i = 0; i <= nS; i++) {
      const u = i / nS;
      const th = lerp(c.th0, c.thL, u);
      const ph = c.ph + (c.twist ?? 0) * u;
      pts.push(surf(th, ph, lift * smoothstep(0, 0.6, u)));
      nrm.push(surfN(th, ph));
    }
    let dir = merid(c.thL, c.ph + (c.twist ?? 0));
    const nF = Math.max(3, Math.round((c.len / (0.014 * s)) | 0));
    const step = c.len / Math.max(1, nF);
    let p = pts[pts.length - 1].clone();
    for (let k = 1; k <= nF; k++) {
      const u = k / nF;
      const out = V(p.x - Hc.x, 0, p.z - Hc.z);
      if (out.lengthSq() < 1e-8) out.set(Math.sin(c.ph), 0, Math.cos(c.ph));
      out.normalize();
      const target = V(0, -1, 0)
        .addScaledVector(out, (c.flare ?? 0) * u - (c.inward ?? 0))
        .add(V(0, 0, c.forward ?? 0))
        .normalize();
      dir = dir.clone().lerp(target, Math.min(1, (c.gravity ?? 0.35) + u * 0.5)).normalize();
      if (c.curl && u > 0.7) dir.addScaledVector(out, -c.curl * (u - 0.7)).normalize();
      p = p.clone().addScaledVector(dir, step);
      pushOutOfHead(p, (c.headMargin ?? 0.008) * s);
      pushOutOfTorso(p, c.drape, 0.012 * s);
      pts.push(p);
      nrm.push(out.clone().lerp(V(0, 0, 0), 0).normalize());
    }
    // re-sample to an even, smooth path
    const path = smoothPath(pts, Math.max(14, pts.length + 4));
    let total = 0;
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push((total += path[i].distanceTo(path[i - 1])));
    const leaveLen = (() => {
      let l = 0;
      for (let i = 1; i <= nS; i++) l += pts[i].distanceTo(pts[i - 1]);
      return l;
    })();
    const uL = leaveLen / total;
    const tipW = c.tip ?? 0;
    const rings = path.map((pp, i) => {
      const u = lens[i] / total;
      const t = (i < path.length - 1 ? path[i + 1].clone().sub(pp) : pp.clone().sub(path[i - 1])).normalize();
      // outward reference: ellipsoid normal near the head, horizontal radial below it
      const nHead = V((pp.x - Hc.x) / Hr.x, (pp.y - Hc.y) / Hr.y, (pp.z - Hc.z) / Hr.z).normalize();
      const nHang = V(pp.x - Hc.x, 0, pp.z - Hc.z).normalize();
      const n0 = nHead.lerp(nHang, smoothstep(uL, uL + 0.25, u)).normalize();
      const b = V().crossVectors(n0, t).normalize();
      const n = V().crossVectors(t, b).normalize();
      const wProf = profile(
        [
          [0, 0.55],
          [uL * 0.7, 0.95],
          [uL + (1 - uL) * 0.25, 1],
          [uL + (1 - uL) * 0.6, 0.82],
          [1, tipW * 0.75],
        ],
        u,
      );
      const taper = 1 - smoothstep(0.82, 1, u) * (1 - tipW);
      const width = Math.max(0.0006 * s, c.w * wProf * taper);
      const thick = Math.max(0.0005 * s, c.th * lerp(0.35, 1, smoothstep(0, uL * 0.6, u)) * (1 - 0.55 * smoothstep(0.5, 1, u)) * taper);
      return {
        c: pp,
        ax: b,
        ay: n,
        rx: width,
        ry: thick,
        n: 2,
        t,
        v: Math.max(0, (lens[i] - leaveLen * 0.7) / Math.max(1e-4, total - leaveLen * 0.7)),
        // how much this point follows gravity instead of the head (stiff bangs: 0)
        hang: (c.stiff ? 0 : 1) * smoothstep(leaveLen, leaveLen + 0.14 * s, lens[i]),
        ow: lerp(1, 0.35, smoothstep(0.75, 1, u)),
      };
    });
    clumps.push(ringGeometry(rings, { radial: 10, capStart: true, capEnd: true, skin: false, hair: { seed: c.seed ?? rand() } }));
  };

  // ---- bangs
  const nb = d.bangsCount;
  for (let i = 0; i < nb; i++) {
    const f = nb === 1 ? 0 : i / (nb - 1) - 0.5; // -0.5..0.5
    const ph = (f * 118 + 3) * DEG;
    const side = Math.abs(f) * 2; // 0 center .. 1 sides
    clump({
      ph,
      th0: (26 + 6 * side) * DEG,
      thL: (54 + 14 * side) * DEG,
      len: d.bangsLength * s * (0.9 + 0.55 * side * side + (rand() - 0.5) * 0.18),
      w: (0.04 + 0.006 * rand()) * s,
      th: 0.011 * s,
      tip: i % 2 ? 0.3 : 0.05,
      inward: 0.25,
      gravity: 0.25,
      lift: 0.005 + (i % 2) * 0.003,
      twist: f * 0.15,
      headMargin: 0.009,
      stiff: true,
    });
  }
  // ---- side locks (in front of the ears)
  for (const side of [-1, 1]) {
    for (const [a, l, w] of [
      [68, 1, 0.042],
      [82, 0.88, 0.046],
    ]) {
      clump({
        ph: side * a * DEG,
        th0: 34 * DEG,
        thL: 84 * DEG,
        len: d.sideLength * l * s,
        w: w * s,
        th: 0.012 * s,
        tip: 0.05,
        inward: 0.05,
        forward: 0.02,
        flare: 0.05,
        drape: 'front',
        lift: 0.006,
        seed: rand(),
      });
    }
  }
  // ---- back / side long hair
  const nbk = d.backCount;
  for (const side of [-1, 1]) {
    for (let i = 0; i < nbk; i++) {
      const f = i / (nbk - 1); // 0 = side .. 1 = back center
      const a = lerp(98, 176, f);
      clump({
        ph: side * a * DEG,
        th0: lerp(34, 40, f) * DEG,
        thL: lerp(96, 118, f) * DEG,
        len: d.length * s * (0.9 + 0.16 * rand()),
        w: (0.052 + 0.01 * rand()) * s,
        th: 0.014 * s,
        tip: rand() < 0.3 ? 0.25 : 0.02,
        flare: d.flare,
        forward: -0.04,
        drape: 'back',
        lift: 0.004 + (i % 2) * 0.004,
        seed: rand(),
      });
    }
  }
  // ---- crown strands (a few visible lines on the top)
  for (const a of [-150, 165, 135, -120]) {
    clump({ ph: a * DEG, th0: 12 * DEG, thL: 70 * DEG, len: 0.01 * s, w: 0.05 * s, th: 0.008 * s, tip: 0.0, lift: 0.002, gravity: 0.2, stiff: true });
  }
  // ---- ahoge
  if (d.ahoge) {
    const p0 = surf(10 * DEG, -15 * DEG, 0);
    const ctrl = [p0, p0.clone().add(V(0.002, 0.022, 0.01).multiplyScalar(s)), p0.clone().add(V(0.004, 0.042, 0.03).multiplyScalar(s)), p0.clone().add(V(0.008, 0.036, 0.055).multiplyScalar(s))];
    const path = smoothPath(ctrl, 14);
    const rings = path.map((pp, i) => {
      const u = i / (path.length - 1);
      const t = (i < path.length - 1 ? path[i + 1].clone().sub(pp) : pp.clone().sub(path[i - 1])).normalize();
      const ax = V(1, 0, 0).addScaledVector(t, -t.x).normalize();
      const ay = V().crossVectors(t, ax).normalize();
      return { c: pp, ax, ay, rx: 0.011 * s * (1 - u * 0.85) * smoothstep(0, 0.2, u + 0.05), ry: 0.003 * s, n: 2, t, v: u, ow: lerp(1, 0.4, u) };
    });
    clumps.push(ringGeometry(rings, { radial: 8, capStart: true, capEnd: true, skin: false, hair: { seed: 0.3 } }));
  }

  const strands = mergeGeometries(clumps);
  strands.setAttribute('outlineNormal', strands.attributes.normal);

  // ---- scalp shell (smooth cap under the clumps)
  const shell = shellGeometry({ Hc, Hr, surf, surfN, merid, s });
  return { strands, shell };
}

function shellGeometry({ surf, surfN, merid, s }) {
  const M = 64;
  const K = 16;
  const thMax = (ph) => lerp(58, 128, (1 - Math.cos(ph)) / 2) * DEG;
  const pos = [];
  const nrm = [];
  const tan = [];
  const huv = [];
  const seed = [];
  const ow = [];
  const idx = [];
  // top vertex
  const top = surf(0, 0, -0.001 * s);
  pos.push(top.x, top.y, top.z);
  nrm.push(0, 1, 0);
  tan.push(0, 0, -1);
  huv.push(0.5, 0);
  seed.push(0.5);
  ow.push(1);
  for (let k = 1; k <= K + 1; k++) {
    for (let m = 0; m < M; m++) {
      const ph = (m / M) * Math.PI * 2;
      const fold = k === K + 1;
      const th = thMax(ph) * Math.min(1, k / K);
      const p = surf(th, ph, (fold ? -0.012 : -0.001) * s);
      const n = surfN(th, ph);
      const t = merid(th, ph);
      pos.push(p.x, p.y, p.z);
      nrm.push(n.x, n.y, n.z);
      tan.push(t.x, t.y, t.z);
      huv.push((m / M) * 24, (Math.min(1, k / K) * 0.3));
      seed.push(((m * 7) % 13) / 13);
      ow.push(1);
    }
  }
  const vi = (k, m) => 1 + (k - 1) * M + (m % M);
  for (let m = 0; m < M; m++) idx.push(0, vi(1, m + 1), vi(1, m));
  for (let k = 1; k <= K; k++) {
    for (let m = 0; m < M; m++) {
      idx.push(vi(k, m), vi(k, m + 1), vi(k + 1, m + 1));
      idx.push(vi(k, m), vi(k + 1, m + 1), vi(k + 1, m));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // keep analytic normals for the cap itself (smoother), computed ones only matter at the fold
  g.setAttribute('hairTangent', new Float32BufferAttribute(tan, 3));
  g.setAttribute('hairUV', new Float32BufferAttribute(huv, 2));
  g.setAttribute('hairSeed', new Float32BufferAttribute(seed, 1));
  g.setAttribute('outlineWidth', new Float32BufferAttribute(ow, 1));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('outlineNormal', g.attributes.normal);
  void nrm;
  return g;
}

export { Vector3 };
