// Content for the yacht game: the boat, islands, rings and clouds, all built
// from primitives. The look (cel tones, tinted lines, fade) comes from the
// anime-style engine via style.createMaterial / style.stylize.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { prepareHairAttributes } from 'anime-style';

/** S(geometry, color, opts) -> styled mesh. Materials are shared per (color, opts). */
export function makeKit(style) {
  const cache = new Map();
  const mat = (color, o = {}) => {
    const key = JSON.stringify([color, o]);
    if (!cache.has(key)) cache.set(key, style.createMaterial({ kind: 'prop', color, ...o }));
    return cache.get(key);
  };
  const S = (geo, color, o = {}) => {
    const { outline = true, ow = 1, cast = true, recv = true, ...m } = o;
    const mesh = new THREE.Mesh(geo);
    style.stylize(mesh, { kind: m.kind ?? 'prop', material: mat(color, m), outline, outlineWidth: ow, castShadow: cast, receiveShadow: recv });
    return mesh;
  };
  return { S, mat };
}

export const COLORS = {
  hull: '#fdfdff', bottom: '#ff5c6c', rail: '#2c4a94', deck: '#f3c68c', cabin: '#ffffff',
  window: '#3d63c9', mast: '#eef1f8', sail: '#ffffff', jib: '#fff3c4', pennant: '#ff4f6a',
  sand: '#ffe2a0', grass: '#5ccc66', leaf: '#2fb86e', trunk: '#c58a58', rock: '#aab3d6',
  red: '#ff5a64', lantern: '#fff1a6', ring: '#ffcc33', cloud: '#ffffff', foam: '#ffffff',
};

/**
 * A thin, closed sail (so the inverted-hull outline has a silhouette): a box
 * remapped onto the triangle tack T, head H, clew C, bellied along +x.
 */
function sailGeometry(T, H, C, { billow = 0.22, roach = 0, thick = 0.035, nu = 16, nv = 10 } = {}) {
  const g = new THREE.BoxGeometry(thick, 1, 1, 1, nu, nv);
  const p = g.attributes.position;
  const a = new THREE.Vector3();
  const o = new THREE.Vector3();
  const chord = T.distanceTo(C);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = p.getY(i) + 0.5; // 0 foot .. 1 head
    const v = p.getZ(i) + 0.5; // 0 luff .. 1 leech
    a.lerpVectors(T, C, v);
    o.lerpVectors(a, H, u);
    o.z -= roach * Math.sin(Math.PI * u) * v * v;
    o.x += x + billow * chord * Math.sin(Math.PI * v) * Math.pow(1 - u, 0.8);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  // The remap can mirror the box (e.g. clew toward -Z). An inside-out mesh makes
  // the inverted-hull outline paint over the whole surface, so fix the winding.
  // box axes (x, y, z) map to (x, H - T, C - T): mirrored when x . ((H-T) x (C-T)) < 0
  const e1 = new THREE.Vector3().subVectors(H, T);
  const e2 = new THREE.Vector3().subVectors(C, T);
  if (e1.y * e2.z - e1.z * e2.y < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The yacht. Local frame: bow +Z, port +X, waterline y = 0.
 * Returns { root, hull (rolls/pitches), boom, mainSail, jibSwing, jibSail, pennant, jibSign }.
 */
export function buildBoat(S) {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.rotation.order = 'YXZ';
  root.add(hull);

  const L0 = -1.75;
  const L1 = 1.95;
  const zOf = (s) => L0 + (L1 - L0) * s;
  const top = (s) => 0.55 + 0.18 * s * s; // sheer rises to the bow
  const keel = (s) => -0.36 + 0.3 * s * s;
  const halfW = (s) => (s < 0.4 ? 0.78 - 0.16 * ((0.4 - s) / 0.4) ** 2 : 0.78 * Math.pow(Math.max(0, 1 - ((s - 0.4) / 0.6) ** 2), 0.6));
  const pt = (s, v, side) => [side * halfW(s) * Math.pow(Math.max(0, 1 - v ** 2.2), 0.55), top(s) + (keel(s) - top(s)) * v, zOf(s)];

  // hull = two lofted bands (topsides / bottom paint), each with a flat transom
  const band = (v0, v1, color) => {
    const M = 32;
    const K = 6;
    const pos = [];
    const idx = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= M; i++) for (let j = 0; j <= K; j++) pos.push(...pt(i / M, v0 + ((v1 - v0) * j) / K, side));
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < K; j++) {
          const a = base + i * (K + 1) + j;
          const b = a + K + 1;
          if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
          else idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const ring = [];
    for (let j = 0; j <= K; j++) ring.push(pt(0, v0 + ((v1 - v0) * j) / K, 1));
    for (let j = K; j >= 0; j--) ring.push(pt(0, v0 + ((v1 - v0) * j) / K, -1));
    const c = pos.length / 3;
    pos.push(0, ring.reduce((acc, q) => acc + q[1], 0) / ring.length, zOf(0));
    for (const q of ring) pos.push(...q);
    for (let k = 0; k < ring.length - 1; k++) idx.push(c, c + 1 + k, c + 2 + k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return S(geo, color);
  };
  hull.add(band(0, 0.6, COLORS.hull), band(0.6, 1, COLORS.bottom));

  // deck (a surface strip under the gunwale; the hull outline covers its silhouette)
  {
    const pos = [];
    const idx = [];
    const M = 32;
    for (let i = 0; i <= M; i++) {
      const s = i / M;
      const w = halfW(s) * 0.995;
      pos.push(w, top(s) - 0.01, zOf(s), -w, top(s) - 0.01, zOf(s));
    }
    for (let i = 0; i < M; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    hull.add(S(geo, COLORS.deck, { outline: false }));
  }
  // navy rub rail along the gunwale and across the transom
  {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(...pt(i / 20, 0, 1)));
    for (let i = 19; i >= 0; i--) pts.push(new THREE.Vector3(...pt(i / 20, 0, -1)));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    hull.add(S(new THREE.TubeGeometry(curve, 160, 0.05, 6, true), COLORS.rail, { ow: 0.8 }));
  }

  // cabin with windows
  const deckY = top(0.47);
  const cabin = S(new RoundedBoxGeometry(1.0, 0.42, 1.25, 3, 0.13), COLORS.cabin);
  cabin.position.set(0, deckY + 0.16, -0.05);
  hull.add(cabin);
  const cabinTop = deckY + 0.37;
  for (const sx of [1, -1]) {
    const win = S(new RoundedBoxGeometry(0.06, 0.13, 0.78, 2, 0.03), COLORS.window, { ow: 0.7 });
    win.position.set(sx * 0.49, deckY + 0.2, -0.05);
    hull.add(win);
  }

  // little sailor at the helm
  {
    const sailor = new THREE.Group();
    const body = S(new THREE.CapsuleGeometry(0.15, 0.2, 4, 14), '#3a64c8');
    body.position.y = 0.27;
    const head = S(new THREE.SphereGeometry(0.16, 22, 16), '#ffe0cc', { kind: 'skin' });
    head.position.y = 0.66;
    // kind 'hair' needs strand attributes; applyTo() adds them, stylize() does not
    const hairGeo = prepareHairAttributes(new THREE.SphereGeometry(0.165, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const hair = S(hairGeo, '#5a3a2e', { kind: 'hair' });
    hair.position.set(0, 0.68, -0.012);
    const hat = S(new THREE.CylinderGeometry(0.15, 0.17, 0.09, 18), '#ffffff');
    hat.position.y = 0.8;
    sailor.add(body, head, hair, hat);
    sailor.position.set(0, top(0.12) - 0.05, -1.15);
    hull.add(sailor);
  }

  // mast, boom, sails
  const mastZ = 0.42;
  const mastH = 4.6;
  const mast = S(new THREE.CylinderGeometry(0.045, 0.065, mastH, 10), COLORS.mast, { ow: 0.8 });
  mast.position.set(0, cabinTop + mastH / 2 - 0.05, mastZ);
  hull.add(mast);
  const headY = cabinTop + mastH - 0.05;

  const boom = new THREE.Group();
  boom.position.set(0, cabinTop + 0.38, mastZ);
  hull.add(boom);
  const boomBar = S(new THREE.CylinderGeometry(0.05, 0.05, 2.05, 8).rotateX(Math.PI / 2), COLORS.mast, { ow: 0.8 });
  boomBar.position.z = -1.0;
  boom.add(boomBar);
  const mainSail = S(sailGeometry(new THREE.Vector3(0, 0.06, -0.07), new THREE.Vector3(0, headY - boom.position.y - 0.12, -0.04), new THREE.Vector3(0, 0.08, -1.98), { billow: 0.2, roach: 0.25 }), COLORS.sail);
  boom.add(mainSail);

  // jib: hangs on the forestay (bow -> mast), swings about the stay
  const tack = new THREE.Vector3(0, top(1) + 0.02, L1 - 0.12);
  const jibHead = new THREE.Vector3(0, headY - 0.55, mastZ + 0.05);
  const stay = new THREE.Vector3().subVectors(jibHead, tack);
  const stayLen = stay.length();
  stay.normalize();
  const jibFrame = new THREE.Group();
  jibFrame.position.copy(tack);
  jibFrame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stay);
  hull.add(jibFrame);
  const jibSwing = new THREE.Group();
  jibFrame.add(jibSwing);
  const clewWorld = new THREE.Vector3(0, cabinTop + 0.1, mastZ - 0.35);
  const inv = jibFrame.quaternion.clone().invert();
  const clew = clewWorld.clone().sub(tack).applyQuaternion(inv);
  const jibSail = S(sailGeometry(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, stayLen * 0.97, 0), clew, { billow: 0.18 }), COLORS.jib);
  jibSwing.add(jibSail);
  const forestay = S(new THREE.CylinderGeometry(0.014, 0.014, stayLen, 4).translate(0, stayLen / 2, 0), COLORS.rail, { outline: false, cast: false });
  forestay.position.copy(tack);
  forestay.quaternion.copy(jibFrame.quaternion);
  hull.add(forestay);
  // which swing direction moves the clew to starboard (-X)?
  const test = clew.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).applyQuaternion(jibFrame.quaternion);
  const jibSign = test.x < 0 ? 1 : -1;

  // masthead pennant (points downwind)
  const pennant = new THREE.Group();
  pennant.position.set(0, headY + 0.02, mastZ);
  hull.add(pennant);
  const flag = S(sailGeometry(new THREE.Vector3(0, -0.16, 0), new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, 0, -0.75), { billow: 0, thick: 0.02, nu: 2, nv: 6 }), COLORS.pennant, { ow: 0.8 });
  pennant.add(flag);
  const ball = S(new THREE.SphereGeometry(0.07, 12, 8), COLORS.pennant, { ow: 0.8 });
  ball.position.y = 0.16;
  pennant.add(ball);

  return { root, hull, boom, mainSail, jibSwing, jibSail, pennant, flag, jibSign };
}

/** A palm tree: curved tube trunk + drooping faceted fronds. */
function palm(S, rng, h) {
  const g = new THREE.Group();
  const lean = 0.25 + rng() * 0.45;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3(lean * 0.25 * h, h * 0.4, 0),
    new THREE.Vector3(lean * 0.65 * h, h * 0.78, 0),
    new THREE.Vector3(lean * 0.85 * h, h, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 18, 0.2, 8, false);
  // taper the trunk toward the top
  const p = trunkGeo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / 9) / 18;
    curve.getPointAt(Math.min(1, seg), c);
    const k = 1 - 0.45 * seg;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
  }
  trunkGeo.computeVertexNormals();
  g.add(S(trunkGeo, COLORS.trunk));
  const crown = new THREE.Group();
  crown.position.copy(curve.getPointAt(1));
  g.add(crown);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / n) * Math.PI * 2 + rng() * 0.4;
    const len = h * (0.42 + rng() * 0.12);
    const leaf = S(new THREE.ConeGeometry(0.42, len, 4, 1).translate(0, len / 2, 0).scale(1, 1, 0.22), COLORS.leaf);
    leaf.rotation.x = 1.75 + rng() * 0.35;
    arm.add(leaf);
    crown.add(arm);
  }
  for (let i = 0; i < 3; i++) {
    const nut = S(new THREE.SphereGeometry(0.15, 10, 8), '#8a5a3c', { ow: 0.8 });
    nut.position.set(Math.cos(i * 2.1) * 0.2, -0.18, Math.sin(i * 2.1) * 0.2);
    crown.add(nut);
  }
  return g;
}

function rock(S, rng, s) {
  const m = S(new THREE.DodecahedronGeometry(1, 0), COLORS.rock);
  m.scale.set(s * (0.8 + rng() * 0.5), s * (0.6 + rng() * 0.6), s * (0.8 + rng() * 0.5));
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  return m;
}

function lighthouse(S) {
  const g = new THREE.Group();
  const bands = [COLORS.hull, COLORS.red, COLORS.hull, COLORS.red, COLORS.hull];
  const H = 7;
  const rAt = (y) => 1.15 - (0.4 * y) / H;
  bands.forEach((col, i) => {
    const y0 = (i * H) / bands.length;
    const y1 = ((i + 1) * H) / bands.length;
    const m = S(new THREE.CylinderGeometry(rAt(y1), rAt(y0), y1 - y0, 28), col);
    m.position.y = (y0 + y1) / 2;
    g.add(m);
  });
  const gallery = S(new THREE.CylinderGeometry(1.05, 1.05, 0.18, 28), COLORS.rail);
  gallery.position.y = H + 0.09;
  const lantern = S(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 16), COLORS.lantern, { kind: 'flat' });
  lantern.position.y = H + 0.58;
  const roof = S(new THREE.ConeGeometry(0.85, 0.9, 20), COLORS.red);
  roof.position.y = H + 1.43;
  const door = S(new RoundedBoxGeometry(0.5, 0.9, 0.2, 2, 0.06), COLORS.rail, { ow: 0.7 });
  door.position.set(0, 0.45, 1.1);
  g.add(gallery, lantern, roof, door);
  return g;
}

/** Island: sand dome + grass + palms / lighthouse / rocks, with a foam ring at the waterline. */
export function buildIsland(S, style, rng, o) {
  const g = new THREE.Group();
  const r = o.r;
  const opt = { cast: false };
  const sand = S(new THREE.SphereGeometry(r, 48, 16), COLORS.sand, opt);
  sand.scale.y = 0.2;
  sand.position.y = -r * 0.09;
  g.add(sand);
  let groundY = r * 0.11;
  if (o.palms || o.lighthouse) {
    const grass = S(new THREE.SphereGeometry(r * 0.66, 40, 14), COLORS.grass, opt);
    grass.scale.y = 0.27;
    grass.position.y = 0;
    g.add(grass);
    groundY = r * 0.66 * 0.27;
  }
  for (let i = 0; i < (o.palms || 0); i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.1 + rng() * 0.32);
    const t = palm(S, rng, 4 + rng() * 2.2);
    t.position.set(Math.cos(a) * d, groundY * 0.85, Math.sin(a) * d);
    t.rotation.y = rng() * Math.PI * 2;
    t.traverse((m) => (m.castShadow = false));
    g.add(t);
  }
  if (o.lighthouse) {
    const lh = lighthouse(S);
    lh.position.y = groundY * 0.8;
    lh.rotation.y = o.lhYaw ?? 0;
    lh.traverse((m) => (m.castShadow = false));
    g.add(lh);
  }
  for (let i = 0; i < (o.rocks || 0); i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (o.palms || o.lighthouse ? 0.75 + rng() * 0.3 : rng() * 0.6);
    const m = rock(S, rng, (o.rockSize ?? 1.2) * (0.6 + rng() * 0.8));
    m.position.set(Math.cos(a) * d, r * 0.05, Math.sin(a) * d);
    m.castShadow = false;
    g.add(m);
  }
  const foam = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r * 1.02, 64).rotateX(-Math.PI / 2));
  style.stylize(foam, { kind: 'flat', color: COLORS.foam, outline: false, castShadow: false });
  foam.position.y = 0.12;
  g.add(foam);
  g.position.set(o.x, 0, o.z);
  g.userData = { foam, r, cr: r * 0.92 + 1.2 };
  return g;
}

/** Golden ring pickup. */
export function buildRing(S) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  spin.add(S(new THREE.TorusGeometry(1.0, 0.17, 14, 40), COLORS.ring, { ow: 1.1 }));
  const gem = S(new THREE.OctahedronGeometry(0.28, 0), '#ff6fa3', { ow: 1.1 });
  spin.add(gem);
  g.userData = { spin, gem };
  return g;
}

/** Flat-bottomed cumulus from overlapping spheres (inner lines come for free). */
export function buildCloud(S, rng, w) {
  const g = new THREE.Group();
  const puffs = [[0, 0.3, 0.5], [-0.6, 0.12, 0.34], [0.62, 0.14, 0.38], [-0.28, 0.6, 0.36], [0.3, 0.68, 0.4], [1.02, 0.02, 0.24], [-1.0, 0.0, 0.22]];
  for (const [x, y, r] of puffs) {
    const m = S(new THREE.SphereGeometry(r * w, 28, 18), COLORS.cloud, { fade: 0.45, cast: false, recv: false, ow: 1.3, rim: 0 });
    m.position.set(x * w, y * w, (rng() - 0.5) * 0.4 * w);
    g.add(m);
  }
  return g;
}
