// Yacht: a tiny sailing game on the anime-style engine, using the "own game
// loop" recipe (STYLE.md §3.4): our renderer + camera + one shadow light,
// style.update() every frame, everything else is plain three.js.
import * as THREE from 'three';
import { AnimeStyle } from 'anime-style';
import { Ocean, Glints, Wake, wave } from './ocean.js';
import { makeKit, buildBoat, buildIsland, buildRing, buildCloud } from './models.js';

const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const PREWARM = Number(q.get('t') ?? 6); // capture: seconds of autopilot sailing before frame 0
const VIEW_YAW = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 0)); // camera orbit offset
const STEP = 1 / 60;
const MAX_SPEED = 7.5; // m/s at full sail on a beam reach

// ------------------------------------------------------------------ look
// Scene-scale overrides on top of a preset: the default atmosphere range is
// character scale (0..0.6 m), a seascape needs ~200 m.
const SCENE_PARAMS = {
  atmosphere: { start: 4, end: 200, strength: 0.45 },
  outline: { width: 1.7, zOffset: 0.012 },
  light: { shadowSoftness: 0.08 },
};
const LOOKS = {
  day: { preset: 'skyPop', water: { color: '#2a84e6', bias: -0.25 }, glint: '#ffffff', foam: '#ffffff' },
  // the sunset preset's lower sun (25 deg) needs less bias on the waves, and a softer explicit shadow
  sunset: { preset: 'sunsetCoral', water: { color: '#7563d4', shadow: '#5d4cc0', bias: -0.16 }, glint: '#ffe0a8', foam: '#fff4ec' },
};
let lookName = q.has('sunset') || q.get('preset') === 'sunsetCoral' ? 'sunset' : 'day';

// --------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(CAPTURE ? 1 : Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.3, 2500);

const style = new AnimeStyle(LOOKS[lookName].preset);
style.setParams(SCENE_PARAMS);
style.bindScene(scene);

const key = new THREE.DirectionalLight(0xffffff, 1); // shadows only; cel tones read style.lightDirection
key.castShadow = !q.has('noshadow');
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 70 });
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

// ------------------------------------------------------------------ world
let seed = 1;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const { S } = makeKit(style);

const ocean = new Ocean(style, { look: LOOKS[lookName].water });
const glints = new Glints(style, { color: LOOKS[lookName].glint });
const wake = new Wake(style, { color: LOOKS[lookName].foam });
scene.add(ocean.group, glints.mesh, wake.mesh);

const boat = buildBoat(S);
scene.add(boat.root);

seed = 11;
const ISLANDS = [
  { x: 22, z: 62, r: 9, palms: 3, rocks: 2 },
  { x: -30, z: 112, r: 8, lighthouse: true, rocks: 5, lhYaw: 2.6 },
  { x: -48, z: 22, r: 4.5, rocks: 4, rockSize: 1.6 },
  { x: 70, z: -18, r: 11, palms: 4, rocks: 3 },
  { x: -12, z: -80, r: 7, palms: 2, rocks: 2 },
  { x: 95, z: 120, r: 5, rocks: 5, rockSize: 1.4 },
].map((o) => {
  const g = buildIsland(S, style, rand, o);
  scene.add(g);
  return g;
});

const clouds = [];
seed = 5;
for (let i = 0; i < 16; i++) {
  const w = 22 + rand() * 24;
  const c = buildCloud(S, rand, w);
  c.userData = { a: (i / 16) * Math.PI * 2 + rand() * 0.3, d: 520 + rand() * 140, w };
  clouds.push(c);
  scene.add(c);
}

const RING_START = [[3, 22], [6, 40], [2, 58], [-8, 76], [4, 96]];
const rings = [];
for (let i = 0; i < 9; i++) {
  const g = buildRing(S);
  rings.push(g);
  scene.add(g);
}

// ------------------------------------------------------------------ state
const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
/** direction the wind blows toward (radians, 0 = +Z); slowly veers */
const windAt = (t) => -Math.PI / 2 + 0.45 * Math.sin(t * 0.021 + 0.3) + 0.12 * Math.sin(t * 0.093);

let state;
let autopilot = CAPTURE;
const keys = {};

function placeRing(r, x, z) {
  r.userData.x = x;
  r.userData.z = z;
  r.userData.alive = true;
  r.userData.age = 0;
  r.userData.pop = -1;
  r.userData.phase = rand() * 6.28;
}

function respawnRing(r) {
  const s = state;
  for (let tries = 0; tries < 40; tries++) {
    // ahead-ish of the boat, pulled back toward the archipelago when far away
    const toHome = Math.atan2(-s.x, -s.z);
    const far = Math.hypot(s.x, s.z) > 140;
    const a = (far ? toHome : s.heading) + (rand() - 0.5) * 2.2;
    const d = 32 + rand() * 48;
    const x = s.x + Math.sin(a) * d;
    const z = s.z + Math.cos(a) * d;
    if (ISLANDS.some((g) => Math.hypot(g.position.x - x, g.position.z - z) < g.userData.cr + 5)) continue;
    if (rings.some((o) => o !== r && o.userData.alive && Math.hypot(o.userData.x - x, o.userData.z - z) < 12)) continue;
    placeRing(r, x, z);
    return;
  }
  placeRing(r, s.x + 40, s.z + 40);
}

function reset() {
  seed = 42;
  state = {
    n: 0, t: 0, x: 0, z: 0, heading: 0.12, speed: CAPTURE ? 5 : 2.5, sail: CAPTURE ? 1 : 0.75, rudder: 0,
    boom: 0.9, billow: -1, heel: 0, bob: 0, pitch: 0, roll: 0, camYaw: 0.12 + VIEW_YAW - 0.24, score: 0, dist: 0, bump: 0, popups: [], lightAz: -50,
  };
  rings.forEach((r, i) => {
    if (i < RING_START.length) placeRing(r, ...RING_START[i]);
    else respawnRing(r);
  });
  wake.clear();
}

function autopilotInput() {
  const s = state;
  let best = null;
  let bestScore = Infinity;
  for (const r of rings) {
    const u = r.userData;
    if (!u.alive) continue;
    const dx = u.x - s.x;
    const dz = u.z - s.z;
    const sc = Math.hypot(dx, dz) * (1 + 1.5 * Math.abs(angDiff(Math.atan2(dx, dz), s.heading)));
    if (sc < bestScore) {
      bestScore = sc;
      best = u;
    }
  }
  let want = best ? Math.atan2(best.x - s.x, best.z - s.z) : s.heading;
  const from = windAt(s.t) + Math.PI;
  if (Math.abs(angDiff(want, from)) < 0.9) want = from + Math.sign(angDiff(s.heading, from) || 1) * 0.9; // no-go zone
  for (const g of ISLANDS) {
    const dx = g.position.x - s.x;
    const dz = g.position.z - s.z;
    const b = angDiff(Math.atan2(dx, dz), s.heading);
    if (Math.hypot(dx, dz) - g.userData.cr < 12 && Math.abs(b) < 1.2) want = s.heading - Math.sign(b || 1) * 1.0;
  }
  return { steer: clamp(angDiff(want, s.heading) * 1.8, -1, 1), trim: 1 };
}

const _w = {};
function step(dt) {
  const s = state;
  s.n++;
  s.t = s.n * STEP;
  const input = autopilot
    ? autopilotInput()
    : { steer: (keys.left ? 1 : 0) - (keys.right ? 1 : 0), trim: (keys.up ? 1 : 0) - (keys.down ? 1 : 0) };
  s.sail = clamp(s.sail + input.trim * dt * 0.7, 0, 1);
  s.rudder += (input.steer - s.rudder) * ease(dt, 5);
  s.heading += s.rudder * (0.42 + 0.06 * s.speed) * dt;

  // point of sail: no-go zone up to ~30 deg off the wind, fastest on a beam reach
  const rel = angDiff(windAt(s.t) + Math.PI, s.heading); // + = wind over the port (+X) side
  const deg = THREE.MathUtils.radToDeg(Math.abs(rel));
  const polar = smooth(28, 62, deg) * (1 - 0.3 * smooth(115, 180, deg));
  const target = MAX_SPEED * polar * s.sail;
  s.speed += (target - s.speed) * ease(dt, target > s.speed ? 0.5 : 0.8);
  s.speed *= 1 - Math.abs(s.rudder) * 0.06 * dt;
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  s.x += fx * s.speed * dt;
  s.z += fz * s.speed * dt;
  s.dist += s.speed * dt;

  // sails swing to leeward; boat heels with the force
  const side = Math.sign(rel || 1);
  const boomOut = clamp((deg - 22) / 105, 0.06, 1) * 1.3;
  s.boom += (side * boomOut - s.boom) * ease(dt, 2.2);
  s.billow += (-side * (polar > 0.1 && s.sail > 0.05 ? 1 : 0.3) - s.billow) * ease(dt, 4);
  s.heel += (side * 0.2 * s.sail * polar * Math.sin(Math.abs(rel)) - s.heel) * ease(dt, 1.5);

  // ride the waves: height, pitch and roll from five samples around the hull
  const px = Math.cos(s.heading);
  const pz = -Math.sin(s.heading);
  const h = (x, z) => wave(x, z, s.t, _w).h;
  const hc = h(s.x, s.z);
  const hb = h(s.x + fx * 1.6, s.z + fz * 1.6);
  const hs = h(s.x - fx * 1.6, s.z - fz * 1.6);
  const hp = h(s.x + px * 0.8, s.z + pz * 0.8);
  const hsb = h(s.x - px * 0.8, s.z - pz * 0.8);
  s.bob += ((hc * 2 + hb + hs + hp + hsb) / 6 - s.bob) * ease(dt, 5);
  s.pitch += (-Math.atan2(hb - hs, 3.2) - s.speed * 0.008 - s.pitch) * ease(dt, 4);
  s.roll += (Math.atan2(hp - hsb, 1.6) * 0.8 - s.roll) * ease(dt, 4);

  // islands are solid
  for (const g of ISLANDS) {
    const dx = s.x - g.position.x;
    const dz = s.z - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d < g.userData.cr) {
      s.x = g.position.x + (dx / d) * g.userData.cr;
      s.z = g.position.z + (dz / d) * g.userData.cr;
      if (s.bump <= 0) s.speed *= 0.35;
      s.bump = 0.5;
    }
  }
  s.bump -= dt;

  // rings
  for (const r of rings) {
    const u = r.userData;
    u.age += dt;
    if (u.alive && Math.hypot(u.x - s.x, u.z - s.z) < 2.8) {
      u.alive = false;
      u.pop = 0;
      s.score++;
      s.popups.push(s.t);
    }
    if (!u.alive) {
      u.pop += dt;
      if (u.pop > 0.6) respawnRing(r);
    }
  }

  // foam: V-shaped wake from the stern quarters + a small bow wave, by distance sailed
  s.foamAcc = (s.foamAcc ?? 0) + s.speed * dt;
  while (s.foamAcc > 0.3) {
    s.foamAcc -= 0.3;
    const k = clamp(s.speed / MAX_SPEED, 0.2, 1);
    for (const sd of [1, -1]) {
      const sx = s.x - fx * 1.7 + px * sd * 0.5;
      const sz = s.z - fz * 1.7 + pz * sd * 0.5;
      wake.spawn(sx, sz, px * sd * 0.55 * k, pz * sd * 0.55 * k, 0.42 + rand() * 0.2, 1.3 + rand() * 0.5, rand() * 6.28);
      const bx = s.x + fx * 1.25 + px * sd * 0.6;
      const bz = s.z + fz * 1.25 + pz * sd * 0.6;
      wake.spawn(bx, bz, px * sd * 1.5 * k, pz * sd * 1.5 * k, 0.26 + rand() * 0.14, 0.8 + rand() * 0.3, rand() * 6.28);
    }
    wake.spawn(s.x - fx * 2.0 + px * (rand() - 0.5) * 0.5, s.z - fz * 2.0 + pz * (rand() - 0.5) * 0.5, 0, 0, 0.45 * k + 0.2, 1.0 + rand() * 0.4, rand() * 6.28);
  }
  wake.step(dt);

  // chase camera swings in behind the boat
  // (offset a little to windward: 3/4 view of the deck and the sail's lit face)
  s.camYaw += angDiff(s.heading + VIEW_YAW - side * 0.24, s.camYaw) * ease(dt, 1.4);

  // art direction: put the key light between the camera and the sail face it sees,
  // so the big sail reads as a lit white shape (light.azimuth is camera-relative)
  const H = s.heading;
  const bx = -Math.sin(s.boom) * Math.cos(H) - Math.cos(s.boom) * Math.sin(H); // boom direction (world)
  const bz = Math.sin(s.boom) * Math.sin(H) - Math.cos(s.boom) * Math.cos(H);
  const cfx = Math.sin(s.camYaw);
  const cfz = Math.cos(s.camYaw);
  let nx = bz;
  let nz = -bx;
  if (nx * -cfx + nz * -cfz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const dx = nx - cfx; // between sail normal and the direction toward the camera
  const dz = nz - cfz;
  let az = THREE.MathUtils.radToDeg(Math.atan2(dx * -cfz + dz * cfx, dx * -cfx + dz * -cfz));
  az = Math.sign(az || 1) * clamp(Math.abs(az), 30, 60);
  s.lightAz += (az - s.lightAz) * ease(dt, 1.2);
}

function simulateTo(t) {
  const n = Math.floor(t / STEP + 1e-6);
  if (n < state.n) reset();
  while (state.n < n) step(STEP);
}

// ----------------------------------------------------------------- render
const hud = {
  score: document.getElementById('score'),
  speed: document.getElementById('speed'),
  arrow: document.getElementById('wind-arrow'),
  sail: document.getElementById('sail-fill'),
  sailTxt: document.getElementById('sail-pct'),
  pop: document.getElementById('popups'),
  hint: document.getElementById('hint'),
};
let shownScore = -1;
let shownPopups = 0;

function render() {
  const s = state;
  const t = s.t;

  // boat
  boat.root.position.set(s.x, s.bob, s.z);
  boat.hull.rotation.set(s.pitch, s.heading, s.roll + s.heel);
  boat.boom.rotation.y = s.boom;
  boat.jibSwing.rotation.y = boat.jibSign * s.boom * 0.75;
  const bs = Math.sign(s.billow || 1) * Math.max(0.2, Math.abs(s.billow));
  boat.mainSail.scale.x = bs;
  boat.jibSail.scale.x = bs;
  boat.pennant.rotation.y = angDiff(windAt(t), s.heading) - Math.PI + Math.sin(t * 9) * 0.12;
  boat.flag.rotation.x = Math.sin(t * 13) * 0.08;

  // sea
  ocean.update(t, s.x, s.z);
  glints.update(t, s.x, s.z, s.camYaw);
  wake.render(t);
  ISLANDS.forEach((g, i) => {
    const k = 1 + 0.035 * Math.sin(t * 1.4 + i * 1.7);
    g.userData.foam.scale.set(k, 1, k);
  });

  // rings bob and spin; collected ones pop
  for (const r of rings) {
    const u = r.userData;
    const h = wave(u.x, u.z, t, _w).h;
    r.position.set(u.x, h * 0.6 + 1.45 + Math.sin(t * 2 + u.phase) * 0.12, u.z);
    r.userData.spin.rotation.y = t * 1.3 + u.phase;
    r.userData.gem.rotation.y = -t * 3;
    let sc = Math.min(1, u.age / 0.5);
    sc = sc * sc * (3 - 2 * sc);
    if (!u.alive) sc = u.pop < 0.15 ? 1 + u.pop * 3 : Math.max(0, 1.45 * (1 - (u.pop - 0.15) / 0.3));
    r.scale.setScalar(Math.max(0.001, sc));
    r.visible = sc > 0.01;
  }

  // camera: a little above and behind, long lens
  const cy = s.camYaw;
  const D = 21;
  camera.position.set(s.x - Math.sin(cy) * D, 4.4 + s.bob * 0.3, s.z - Math.cos(cy) * D);
  camera.lookAt(s.x + Math.sin(cy) * 5, 2.35, s.z + Math.cos(cy) * 5);

  // clouds sit on the horizon (they move with the camera, so they never get closer)
  for (const c of clouds) {
    const u = c.userData;
    c.position.set(camera.position.x + Math.sin(u.a) * u.d, -u.w * 0.12, camera.position.z + Math.cos(u.a) * u.d);
    c.lookAt(camera.position.x, c.position.y, camera.position.z);
  }

  // light.azimuth is read by update() every frame (no sync needed), but set() is the documented way
  if (Math.abs(style.get('light.azimuth') - s.lightAz) > 0.25) style.set('light.azimuth', Math.round(s.lightAz * 4) / 4);
  style.update(renderer, camera, { time: t, focusDistance: camera.position.distanceTo(boat.root.position) });
  key.position.set(s.x, 0, s.z).addScaledVector(style.lightDirection, 35);
  key.target.position.set(s.x, 0, s.z);
  renderer.render(scene, camera);

  // HUD
  if (s.score !== shownScore) {
    hud.score.textContent = s.score;
    shownScore = s.score;
  }
  hud.speed.textContent = (s.speed * 1.944).toFixed(1);
  // screen "up" = camera forward; +angle in world turns toward screen left
  hud.arrow.style.transform = `rotate(${-THREE.MathUtils.radToDeg(angDiff(windAt(t), cy))}deg)`;
  hud.sail.style.height = `${Math.round(s.sail * 100)}%`;
  hud.sailTxt.textContent = `${Math.round(s.sail * 100)}%`;
  while (shownPopups < s.popups.length) {
    shownPopups++;
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = '+1';
    hud.pop.appendChild(el);
    if (!CAPTURE) setTimeout(() => el.remove(), 1100);
    else el.remove();
  }
}

// ------------------------------------------------------------------ input
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) {
    keys[KEYMAP[e.code]] = true;
    autopilot = false;
    hud.hint.classList.add('gone');
    e.preventDefault();
  }
  if (e.code === 'KeyT') toggleLook();
  if (e.code === 'KeyP') autopilot = !autopilot;
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
});
addEventListener('blur', () => Object.keys(keys).forEach((k) => (keys[k] = false)));
for (const btn of document.querySelectorAll('[data-key]')) {
  const k = btn.dataset.key;
  const on = (e) => {
    e.preventDefault();
    keys[k] = true;
    autopilot = false;
    hud.hint.classList.add('gone');
    btn.setPointerCapture?.(e.pointerId);
  };
  const off = () => (keys[k] = false);
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('lostpointercapture', off);
}
document.getElementById('look').addEventListener('click', toggleLook);
if (q.has('touch') || matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('touch');
  hud.hint.innerHTML = 'Collect the <b>golden rings</b>!';
}

function toggleLook() {
  lookName = lookName === 'day' ? 'sunset' : 'day';
  applyLook();
}
function applyLook() {
  const L = LOOKS[lookName];
  style.usePreset(L.preset); // resets every param to the preset...
  style.setParams(SCENE_PARAMS); // ...so re-apply the scene-scale overrides
  ocean.setLook(L.water);
  glints.material.setColors({ color: L.glint });
  wake.material.setColors({ color: L.foam });
  document.body.classList.toggle('sunset', lookName === 'sunset');
}

// ----------------------------------------------------------------- resize
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // long lens, but keep at least ~24 deg horizontally on portrait screens
  const minH = THREE.MathUtils.degToRad(24);
  const v = Math.max(THREE.MathUtils.degToRad(27), 2 * Math.atan(Math.tan(minH / 2) / camera.aspect));
  camera.fov = THREE.MathUtils.radToDeg(v);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------- boot
applyLook();
reset();
window.__renderFrame = (time, dt) => {
  simulateTo((CAPTURE ? PREWARM : 0) + time);
  render();
  return renderer.domElement.toDataURL('image/png');
};
if (CAPTURE) {
  document.body.classList.add('capture');
  simulateTo(PREWARM);
  render();
  window.__ready = true;
} else {
  render();
  window.__ready = true;
  const clock = new THREE.Clock();
  let acc = 0;
  renderer.setAnimationLoop(() => {
    acc = Math.min(acc + clock.getDelta(), 0.25);
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    render();
  });
}
