// Stylized ocean for the anime-style engine: a CPU-animated wave grid that is
// cel-shaded like any other surface (hard light/shadow bands on the wave
// faces), plus flat white sea glints and a foam wake.
import * as THREE from 'three';

// Sharp-crested travelling waves (directions in radians, lengths in metres).
const WAVES = [
  { A: 0.22, L: 13, dir: 0.3, speed: 0.55, sharp: 1.2, ph: 0 },
  { A: 0.17, L: 9, dir: 1.55, speed: 0.6, sharp: 1.2, ph: 1.7 },
  { A: 0.13, L: 7, dir: 2.75, speed: 0.62, sharp: 1.0, ph: 3.3 },
  { A: 0.08, L: 4.8, dir: -0.85, speed: 0.66, sharp: 0, ph: 4.1 },
  { A: 0.045, L: 3.2, dir: 4.1, speed: 0.7, sharp: 0, ph: 2.3 },
].map((w) => {
  const k = (2 * Math.PI) / w.L;
  return { ...w, kx: Math.cos(w.dir) * k, kz: Math.sin(w.dir) * k, om: Math.sqrt(9.81 * k) * w.speed, e0: Math.exp(-2 * w.sharp) };
});

/** Height h and slope (gx, gz) of the sea at world (x, z), time t. */
export function wave(x, z, t, out = {}) {
  let h = 0;
  let gx = 0;
  let gz = 0;
  for (const w of WAVES) {
    const th = w.kx * x + w.kz * z - w.om * t + w.ph;
    const s = Math.sin(th);
    const c = Math.cos(th);
    let f = s;
    let df = c;
    if (w.sharp > 0) {
      const e = Math.exp(w.sharp * (s - 1));
      const n = 1 / (1 - w.e0);
      f = (2 * e - 1 - w.e0) * n;
      df = 2 * w.sharp * c * e * n;
    }
    h += w.A * f;
    gx += w.A * df * w.kx;
    gz += w.A * df * w.kz;
  }
  out.h = h;
  out.gx = gx;
  out.gz = gz;
  return out;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i, j, k) => {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export class Ocean {
  /**
   * Near: a uniform grid that follows the boat in whole-cell steps (so every
   * vertex always samples the same world points -> no swimming), waves fade out
   * toward its edge. Far: a flat ring out to the horizon (the atmosphere fade
   * melts it into the background color).
   */
  constructor(style, { size = 84, cell = 0.6, look } = {}) {
    const seg = Math.round(size / cell);
    this.cell = size / seg;
    this.style = style;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    this.near = new THREE.Mesh(geo);
    this.far = new THREE.Mesh(new THREE.RingGeometry(size * 0.45, 2000, 96, 1).rotateX(-Math.PI / 2));
    this.setLook(look);
    this.group = new THREE.Group();
    for (const m of [this.near, this.far]) {
      m.receiveShadow = true;
      m.castShadow = false;
      m.frustumCulled = false;
      this.group.add(m);
    }
    const p = geo.attributes.position;
    this.bx = new Float32Array(p.count);
    this.bz = new Float32Array(p.count);
    this.env = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      this.bx[i] = p.getX(i);
      this.bz[i] = p.getZ(i);
      this.env[i] = 1 - smooth(size * 0.26, size * 0.45, Math.hypot(this.bx[i], this.bz[i]));
    }
    this._w = {};
  }

  /**
   * { color, shadow?, bias } -- bias places the light/shadow edge on the wave faces
   * (depends on light elevation). thresholdBias is a creation-time option, so a new
   * material is made instead of setColors().
   */
  setLook({ color, shadow, bias = -0.25 }) {
    this.material?.dispose();
    // fade: the sea melts fully into the backdrop at the far end of the atmosphere range
    // (keep fade * atmosphere.strength <= 1, the shader does not clamp it)
    this.material = this.style.createMaterial({ kind: 'default', color, shadow, thresholdBias: bias, fade: 2.2, rim: 0 });
    this.near.material = this.material;
    this.far.material = this.material;
  }

  update(t, cx, cz) {
    const c = this.cell;
    const ox = Math.round(cx / c) * c;
    const oz = Math.round(cz / c) * c;
    this.group.position.set(ox, 0, oz);
    const geo = this.near.geometry;
    const P = geo.attributes.position.array;
    const N = geo.attributes.normal.array;
    const w = this._w;
    for (let i = 0, n = this.env.length; i < n; i++) {
      const e = this.env[i];
      if (e <= 0) continue;
      wave(ox + this.bx[i], oz + this.bz[i], t, w);
      const nx = -w.gx * e;
      const nz = -w.gz * e;
      const l = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      P[i * 3 + 1] = w.h * e;
      N[i * 3] = nx * l;
      N[i * 3 + 1] = l;
      N[i * 3 + 2] = nz * l;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
}

/** Flat white sparkle dashes on a world-space lattice around the boat (stateless). */
export class Glints {
  constructor(style, { cell = 5.5, radius = 46, color = '#ffffff' } = {}) {
    this.cell = cell;
    this.radius = radius;
    this.n = Math.ceil((radius * 2) / cell) + 1;
    const shape = new THREE.Shape([new THREE.Vector2(-1.0, 0), new THREE.Vector2(0, 0.09), new THREE.Vector2(1.0, 0), new THREE.Vector2(0, -0.09)]);
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.material = style.createMaterial({ kind: 'flat', color });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -2;
    this.material.polygonOffsetUnits = -4;
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.n * this.n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._w = {};
  }

  update(t, cx, cz, camYaw) {
    const { cell, n } = this;
    const i0 = Math.floor((cx - this.radius) / cell);
    const j0 = Math.floor((cz - this.radius) / cell);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
    let k = 0;
    for (let i = i0; i < i0 + n; i++) {
      for (let j = j0; j < j0 + n; j++) {
        const x = (i + hash(i, j, 1)) * cell;
        const z = (j + hash(i, j, 2)) * cell;
        const d = Math.hypot(x - cx, z - cz);
        const v = Math.sin(t * (0.7 + hash(i, j, 3) * 0.9) + hash(i, j, 4) * 6.283);
        const s = smooth(0.35, 0.8, v) * (1 - smooth(this.radius * 0.7, this.radius, d)) * smooth(2.5, 5, d) * (0.6 + hash(i, j, 5) * 0.8);
        if (s < 0.02) continue;
        wave(x, z, t, this._w);
        this._p.set(x, this._w.h + 0.06, z);
        this._s.set(s, 1, s);
        this.mesh.setMatrixAt(k++, this._m.compose(this._p, this._q, this._s));
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Foam blobs dropped behind the stern (simulated in fixed steps, drawn as one instanced mesh). */
export class Wake {
  constructor(style, { max = 260, color = '#ffffff' } = {}) {
    this.max = max;
    this.items = [];
    const geo = new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2);
    this.material = style.createMaterial({ kind: 'flat', color });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -2;
    this.material.polygonOffsetUnits = -4;
    this.mesh = new THREE.InstancedMesh(geo, this.material, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._w = {};
  }

  clear() {
    this.items.length = 0;
  }

  spawn(x, z, vx, vz, size, life, spin) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, z, vx, vz, size, life, age: 0, spin });
  }

  step(dt) {
    const damp = Math.exp(-dt * 1.6);
    for (const f of this.items) {
      f.age += dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      f.vx *= damp;
      f.vz *= damp;
    }
    while (this.items.length && this.items[0].age >= this.items[0].life) this.items.shift();
    // items are spawned in time order, but lives differ; drop any expired stragglers
    if (this.items.some((f) => f.age >= f.life)) this.items = this.items.filter((f) => f.age < f.life);
  }

  render(t) {
    let k = 0;
    for (const f of this.items) {
      const a = f.age / f.life;
      const s = f.size * (0.55 + 1.1 * Math.sqrt(a)) * (1 - smooth(0.55, 1, a));
      if (s < 0.01) continue;
      wave(f.x, f.z, t, this._w);
      this._n.set(-this._w.gx, 1, -this._w.gz).normalize();
      this._q.setFromUnitVectors(this._up, this._n).multiply(this._q2.setFromAxisAngle(this._up, f.spin));
      this._p.set(f.x, this._w.h + 0.05, f.z);
      this._s.set(s, 1, s);
      this.mesh.setMatrixAt(k++, this._m.compose(this._p, this._q, this._s));
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
