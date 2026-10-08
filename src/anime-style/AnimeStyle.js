// AnimeStyle: one object that owns every style parameter, the shared shader
// uniforms, and the factories that turn meshes into the flat anime look.
import {
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  Vector4,
  BackSide,
  FrontSide,
  SRGBColorSpace,
  BufferAttribute,
  MathUtils,
  Color,
  Quaternion,
  DoubleSide,
} from 'three';
import { CEL_VERTEX, CEL_FRAGMENT, OUTLINE_VERTEX, OUTLINE_FRAGMENT } from './shaders.js';
import { resolveParams, mergeDeep, clone, PRESETS } from './presets.js';
import { toVec3, toRGB, toHex, shadowOf, lineOf, highlightOf } from './color.js';
import { computeOutlineNormals, createHull } from './outline.js';

/**
 * Defaults per material kind. Every key can be overridden in createMaterial().
 *  thresholdBias: + = more light, - = more shadow
 *  noLambert: 1 = ignore the light direction (flat fill, cast shadows only)
 */
export const MATERIAL_KINDS = {
  default: {},
  cloth: {},
  prop: {},
  skin: { thresholdBias: 0.04 },
  face: { thresholdBias: 0.08, textureDetail: 1 },
  hair: { thresholdBias: -0.02, textureDetailMul: 0.45 },
  eye: { noLambert: 1, outline: false, rim: 0, textureDetail: 1 },
  flat: { noLambert: 1 },
  ground: { noLambert: 1, outline: false, fade: 0, rim: 0, castShadow: false },
};

const _v2 = new Vector2();
const _v3 = new Vector3();
const _q = new Quaternion();

export class CelMaterial extends ShaderMaterial {
  constructor(style, options) {
    const o = { ...MATERIAL_KINDS[options.kind || 'default'], ...options };
    const defines = {};
    if (o.kind === 'hair') defines.HAIR = '';
    if (o.kind === 'face') defines.FACE = '';
    if (o.faceMap) defines.FACE_PAINT = '';
    if (o.map) {
      defines.USE_CEL_MAP = '';
      if (o.map.colorSpace === SRGBColorSpace) defines.CEL_MAP_SRGB = '';
    }
    const fr = o.faceRect || [-0.09, -0.09, 0.18, 0.18];
    const own = {
      uColor: { value: new Vector3(1, 1, 1) },
      uShadowOverride: { value: new Vector4(0, 0, 0, 0) },
      uShadowOverride2: { value: new Vector4(0, 0, 0, 0) },
      uThresholdBias: { value: o.thresholdBias ?? 0 },
      uFlatten: { value: o.flatten ?? 0 },
      uFlattenAxis: { value: new Vector3().fromArray(o.flattenAxis || [0, 0, 1]) },
      uFlattenAxisWorld: { value: new Vector4(0, 0, 1, 0) },
      uOpacity: { value: o.opacity ?? 1 },
      uAlphaTest: { value: o.alphaTest ?? 0 },
      uTexDetailMat: { value: o.textureDetail ?? -1 },
      uTexDetailMul: { value: o.textureDetailMul ?? 1 },
      uFadeMul: { value: o.fade ?? 1 },
      uRimMul: { value: o.rim ?? 1 },
      uHiMul: { value: o.highlightMul ?? 1 },
      uCastMul: { value: o.castMul ?? 1 },
      uCastAbs: { value: -1 },
      uNoLambert: { value: o.noLambert ?? 0 },
      uInnerDarken: { value: o.innerDarken ?? 1 },
      uMap: { value: o.map || null },
      uFaceMap: { value: o.faceMap || null },
      uFaceRect: { value: new Vector4(fr[0], fr[1], fr[2], fr[3]) },
      uHairHiColor: { value: new Vector4(1, 1, 1, 0) },
    };
    super({
      uniforms: { ...UniformsUtils.clone(UniformsLib.lights), ...style.uniforms, ...own },
      vertexShader: CEL_VERTEX,
      fragmentShader: CEL_FRAGMENT,
      lights: true,
      defines,
      side: o.side ?? FrontSide,
      transparent: !!o.transparent,
      depthWrite: o.depthWrite ?? !o.transparent,
    });
    this.type = 'AnimeCelMaterial';
    this.alphaTest = 0; // handled in the shader (uAlphaTest)
    this.isCelMaterial = true;
    this.style = style;
    this.options = o;
    this.name = o.name || o.kind || 'cel';
    /** explicit line color (w = 1) shared with the paired OutlineMaterial */
    this.lineOverrideUniform = { value: new Vector4(0, 0, 0, 0) };
    if (o.faceObject) this.trackFace(o.faceObject, o.faceForward);
    this.refresh();
  }

  /**
   * Make the face-flatten axis follow an object (usually the head bone of a
   * skinned model). `forwardWorld` is the face direction in world space *now*
   * (default: the model faces +Z). Call while the model is in its rest pose.
   */
  trackFace(object, forwardWorld = [0, 0, 1]) {
    object.updateWorldMatrix(true, false);
    const q = object.getWorldQuaternion(new Quaternion()).invert();
    this.faceTrack = { object, local: new Vector3().fromArray(forwardWorld).normalize().applyQuaternion(q) };
    this.style._tracked.add(this);
    return this;
  }

  _updateTracking() {
    const t = this.faceTrack;
    if (!t) return;
    t.object.getWorldQuaternion(_q);
    const a = _v3.copy(t.local).applyQuaternion(_q);
    this.uniforms.uFlattenAxisWorld.value.set(a.x, a.y, a.z, 1);
  }

  get kind() {
    return this.options.kind || 'default';
  }

  /** Change colors at runtime: setColors({ color, shadow, line, highlight }) */
  setColors(colors) {
    Object.assign(this.options, colors);
    this.refresh();
    return this;
  }

  /** Recompute everything derived from the style parameters. */
  refresh() {
    const p = this.style.params;
    const o = this.options;
    let base = o.color ?? '#ffffff';
    if (this.kind === 'ground' && (base === 'auto' || o.followBackground)) {
      base = p.ground.color === 'auto' ? p.background.color : p.ground.color;
    }
    toVec3(base, this.uniforms.uColor.value);
    const so = this.uniforms.uShadowOverride.value;
    if (o.shadow) {
      const c = toRGB(o.shadow);
      so.set(c.r, c.g, c.b, 1);
    } else so.w = 0;
    const so2 = this.uniforms.uShadowOverride2.value;
    if (o.shadow2) {
      const c = toRGB(o.shadow2);
      so2.set(c.r, c.g, c.b, 1);
    } else so2.w = 0;
    if (this.kind === 'ground') this.uniforms.uCastAbs.value = p.ground.shadowStrength;
    // lines and hair highlights are derived per pixel on the GPU (texture aware);
    // explicit colors override
    const lo = this.lineOverrideUniform.value;
    if (o.line) {
      const c = toRGB(o.line);
      lo.set(c.r, c.g, c.b, 1);
    } else lo.w = 0;
    const hi = this.uniforms.uHairHiColor.value;
    if (o.highlight) {
      const c = toRGB(o.highlight);
      hi.set(c.r, c.g, c.b, 1);
    } else hi.w = 0;
  }

  /** Derived colors as hex strings (handy for debugging and docs). */
  describe() {
    const p = this.style.params;
    const base = this.options.color ?? '#ffffff';
    return {
      base: toHex(toRGB(base)),
      shadow: toHex(this.options.shadow ? toRGB(this.options.shadow) : shadowOf(base, p.shading)),
      line: toHex(this.options.line ? toRGB(this.options.line) : lineOf(base, p.outline)),
      hairHighlight: toHex(this.options.highlight ? toRGB(this.options.highlight) : highlightOf(base, p.hair.highlightLighten)),
    };
  }
}

export class OutlineMaterial extends ShaderMaterial {
  constructor(style, cel, { width = 1, hasWidthAttribute = false } = {}) {
    const defines = {};
    if (cel.defines.HAIR !== undefined) defines.HAIR = '';
    if (hasWidthAttribute) defines.USE_OUTLINE_WIDTH = '';
    if (cel.defines.USE_CEL_MAP !== undefined) {
      defines.USE_CEL_MAP = '';
      if (cel.defines.CEL_MAP_SRGB !== undefined) defines.CEL_MAP_SRGB = '';
      if (cel.uniforms.uAlphaTest.value > 0) defines.OUTLINE_CUTOUT = '';
    }
    const u = style.uniforms;
    super({
      uniforms: {
        uOutlineWidth: u.uOutlineWidth,
        uPxScale: u.uPxScale,
        uResolution: u.uResolution,
        uOutlineDepthRef: u.uOutlineDepthRef,
        uOutlineDepthAtten: u.uOutlineDepthAtten,
        uOutlineZOffset: u.uOutlineZOffset,
        uFadeColor: u.uFadeColor,
        uFadeStrength: u.uFadeStrength,
        uFadeStart: u.uFadeStart,
        uFadeEnd: u.uFadeEnd,
        uFocusDist: u.uFocusDist,
        uTime: u.uTime,
        uHairSway: u.uHairSway,
        uBaseColor: cel.uniforms.uColor,
        uLineOverride: cel.lineOverrideUniform,
        uLineSat: u.uLineSat,
        uLineVal: u.uLineVal,
        uLineHue: u.uLineHue,
        uLineHueShift: u.uLineHueShift,
        uLineTint: u.uLineTint,
        uLineFixed: u.uLineFixed,
        uLineFixedMix: u.uLineFixedMix,
        uFadeMul: cel.uniforms.uFadeMul,
        uWidthMul: { value: width },
        uMap: cel.uniforms.uMap,
        uAlphaTest: cel.uniforms.uAlphaTest,
      },
      vertexShader: OUTLINE_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      defines,
      side: BackSide,
    });
    this.type = 'AnimeOutlineMaterial';
    this.isOutlineMaterial = true;
    this.cel = cel;
  }
  get width() {
    return this.uniforms.uWidthMul.value;
  }
  set width(v) {
    this.uniforms.uWidthMul.value = v;
  }
}

export class AnimeStyle {
  /**
   * @param {string|object} params preset name ('skyPop', ...) or a (partial) params object
   */
  constructor(params) {
    this.params = resolveParams(params);
    this.materials = new Set();
    this.hulls = new Set();
    this._tracked = new Set();
    this._listeners = new Set();
    this.focusDistance = 4;
    this.lightDirection = new Vector3(0, 1, 0);
    this.uniforms = {
      uLightDir: { value: new Vector3(0, 1, 0) },
      uSteps: { value: 2 },
      uThreshold: { value: 0.5 },
      uSoftness: { value: 0.01 },
      uStepSpread: { value: 0.2 },
      uShadowSat: { value: 0.36 },
      uShadowVal: { value: 0.92 },
      uShadowHue: { value: 0.7 },
      uShadowHueShift: { value: 0 },
      uShadowTint: { value: new Vector3(1, 1, 1) },
      uCastStrength: { value: 1 },
      uCastSoftness: { value: 0.1 },
      uHiStrength: { value: 0 },
      uHiThreshold: { value: 0.9 },
      uHiLighten: { value: 0.3 },
      uRimColor: { value: new Vector3(1, 1, 1) },
      uRimStrength: { value: 0 },
      uRimWidth: { value: 0.2 },
      uFadeColor: { value: new Vector3(1, 1, 1) },
      uFadeStrength: { value: 0 },
      uFadeStart: { value: 0 },
      uFadeEnd: { value: 1 },
      uFocusDist: { value: 4 },
      uFaceFlatten: { value: 0.7 },
      uHairHiStrength: { value: 1 },
      uHairHiThreshold: { value: 0.9 },
      uHairHiShift: { value: 0 },
      uHairHiJag: { value: 0.3 },
      uHairHiJagFreq: { value: 2 },
      uHairHiSoftness: { value: 0.01 },
      uHairHiPower: { value: 20 },
      uHairSway: { value: 1 },
      uTime: { value: 0 },
      uOutlineWidth: { value: 1.5 },
      uPxScale: { value: 1 },
      uResolution: { value: new Vector2(1000, 1000) },
      uOutlineDepthRef: { value: 4 },
      uOutlineDepthAtten: { value: 0.5 },
      uOutlineZOffset: { value: 0.004 },
      uLineSat: { value: 0.55 },
      uLineVal: { value: 0.72 },
      uLineHue: { value: 0.96 },
      uLineHueShift: { value: 0.06 },
      uLineTint: { value: new Vector3(1, 1, 1) },
      uLineFixed: { value: new Vector3(0, 0, 0) },
      uLineFixedMix: { value: 0 },
      uHairHiLighten: { value: 0.55 },
      uTexDetail: { value: 1 },
      uTexBlur: { value: 4 },
      uPaletteSnap: { value: 0 },
      uPaletteCount: { value: 0 },
      uPalette: { value: Array.from({ length: 16 }, () => new Vector3()) },
    };
    this.sync();
  }

  static get presets() {
    return Object.keys(PRESETS);
  }

  // ---------------------------------------------------------------- params

  /** Read a param by dotted path: style.get('outline.width') */
  get(path) {
    return path.split('.').reduce((o, k) => o?.[k], this.params);
  }

  /** Set a param by dotted path and apply it: style.set('shading.steps', 3) */
  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], this.params);
    obj[last] = value;
    this.sync();
    return this;
  }

  /** Deep-merge a partial params object and apply it. */
  setParams(partial) {
    mergeDeep(this.params, clone(partial));
    this.sync();
    return this;
  }

  /** Switch to a preset (in place, so UI bindings to style.params stay valid). */
  usePreset(nameOrParams) {
    const fresh = resolveParams(nameOrParams);
    for (const section of Object.keys(fresh)) {
      if (typeof fresh[section] === 'object') Object.assign(this.params[section] ?? (this.params[section] = {}), fresh[section]);
      else this.params[section] = fresh[section];
    }
    this.sync();
    return this;
  }

  toJSON() {
    return clone(this.params);
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  get backgroundColor() {
    return this.params.background.color;
  }

  /** Push params into uniforms/materials. Call after mutating style.params directly. */
  sync() {
    const p = this.params;
    const u = this.uniforms;
    const s = p.shading;
    u.uSteps.value = Math.round(s.steps);
    u.uThreshold.value = s.threshold;
    u.uSoftness.value = Math.max(1e-4, s.softness);
    u.uStepSpread.value = s.stepSpread;
    u.uShadowSat.value = s.shadowSaturation;
    u.uShadowVal.value = s.shadowValue;
    u.uShadowHue.value = s.shadowHue / 360;
    u.uShadowHueShift.value = s.shadowHueShift;
    toVec3(s.shadowTint, u.uShadowTint.value);
    u.uCastStrength.value = s.castStrength;
    u.uCastSoftness.value = p.light.shadowSoftness;
    u.uHiStrength.value = s.highlightStrength;
    u.uHiThreshold.value = s.highlightThreshold;
    u.uHiLighten.value = s.highlightLighten;
    toVec3(s.rimColor, u.uRimColor.value);
    u.uRimStrength.value = s.rimStrength;
    u.uRimWidth.value = s.rimWidth;

    const a = p.atmosphere;
    toVec3(a.color === 'auto' ? p.background.color : a.color, u.uFadeColor.value);
    u.uFadeStrength.value = a.strength;
    u.uFadeStart.value = a.start;
    u.uFadeEnd.value = Math.max(a.end, a.start + 1e-3);

    u.uFaceFlatten.value = p.face.flatten;
    u.uTexDetail.value = p.texture?.detail ?? 1;
    u.uTexBlur.value = p.texture?.blur ?? 4;
    const pal = (p.palette?.colors || []).slice(0, 16);
    pal.forEach((c, i) => toVec3(c, u.uPalette.value[i]));
    u.uPaletteCount.value = pal.length;
    u.uPaletteSnap.value = pal.length ? p.palette.snap : 0;
    const h = p.hair;
    u.uHairHiStrength.value = h.highlightStrength;
    u.uHairHiThreshold.value = h.highlightThreshold;
    u.uHairHiShift.value = h.highlightShift;
    u.uHairHiJag.value = h.highlightJag;
    u.uHairHiJagFreq.value = h.highlightJagFrequency;
    u.uHairHiSoftness.value = Math.max(1e-4, h.highlightSoftness);
    u.uHairHiPower.value = h.highlightPower;
    u.uHairSway.value = h.sway;

    const o = p.outline;
    u.uOutlineWidth.value = o.width;
    u.uOutlineDepthAtten.value = o.depthAttenuation;
    u.uOutlineZOffset.value = o.zOffset;
    u.uLineSat.value = o.saturation;
    u.uLineVal.value = o.value;
    u.uLineHue.value = o.hue / 360;
    u.uLineHueShift.value = o.hueShift;
    toVec3(o.tint, u.uLineTint.value);
    toVec3(o.color, u.uLineFixed.value);
    u.uLineFixedMix.value = o.fixedMix;
    u.uHairHiLighten.value = h.highlightLighten;
    for (const hull of this.hulls) hull.visible = o.enabled && hull.userData.wantVisible !== false;

    for (const m of this.materials) m.refresh();
    for (const fn of this._listeners) fn(this);
  }

  // ------------------------------------------------------------- factories

  /**
   * Create a cel material.
   * @param {object} o
   *   color      base (lit) color
   *   shadow     optional explicit shadow color (else derived from color)
   *   shadow2    optional deep-shadow color for steps = 3
   *   line       optional explicit outline color (else derived)
   *   highlight  optional hair highlight color (else derived)
   *   kind       'default'|'skin'|'face'|'hair'|'cloth'|'prop'|'eye'|'flat'|'ground'
   *   map        optional texture (multiplied with color)
   *   thresholdBias, flatten, flattenAxis, fade, rim, castMul, noLambert, side
   *   textureDetail  per-material override of params.texture.detail (eyes/faces keep 1)
   *   textureDetailMul  multiplier on params.texture.detail (hair: 0.45)
   *   opacity, transparent, alphaTest, depthWrite
   *   faceObject, faceForward  make the face shading follow a (head) bone
   */
  createMaterial(o = {}) {
    const mat = new CelMaterial(this, o);
    this.materials.add(mat);
    mat.addEventListener('dispose', () => {
      this.materials.delete(mat);
      this._tracked.delete(mat);
    });
    return mat;
  }

  /**
   * Give a mesh the style: cel material + outline hull.
   * Options are createMaterial() options plus:
   *   outline (bool), outlineWidth (multiplier), castShadow, receiveShadow, material (reuse)
   */
  stylize(mesh, o = {}) {
    const kindDefaults = MATERIAL_KINDS[o.kind || 'default'] || {};
    const mat = o.material || this.createMaterial(o);
    mesh.material = mat;
    mesh.castShadow = o.castShadow ?? kindDefaults.castShadow ?? true;
    mesh.receiveShadow = o.receiveShadow ?? true;
    const wantOutline = o.outline ?? kindDefaults.outline ?? true;
    if (wantOutline) this.addOutline(mesh, { width: o.outlineWidth ?? 1 });
    return mesh;
  }

  /** Add (or replace) the outline hull of a mesh whose material is a CelMaterial. */
  addOutline(mesh, { width = 1 } = {}) {
    if (mesh.userData.outline) this.removeOutline(mesh);
    const g = mesh.geometry;
    if (!g.attributes.outlineNormal) computeOutlineNormals(g);
    const hasWidthAttribute = !!g.attributes.outlineWidth;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const outlineMats = mats.map((m) => new OutlineMaterial(this, m, { width, hasWidthAttribute }));
    const hull = createHull(mesh, Array.isArray(mesh.material) ? outlineMats : outlineMats[0]);
    mesh.add(hull);
    mesh.userData.outline = hull;
    this.hulls.add(hull);
    hull.visible = this.params.outline.enabled;
    return hull;
  }

  removeOutline(mesh) {
    const hull = mesh.userData.outline;
    if (!hull) return;
    mesh.remove(hull);
    this.hulls.delete(hull);
    (Array.isArray(hull.material) ? hull.material : [hull.material]).forEach((m) => m.dispose());
    delete mesh.userData.outline;
  }

  /**
   * Convert every mesh under `root` (a loaded glTF / VRM / FBX scene, or your own
   * meshes) to the style. Source colors, textures and alpha are kept; lighting,
   * shadows and lines come from the style.
   *
   * @param {Object3D} root
   * @param {object} [o]
   *   map(mesh, oldMaterial, guessedKind) => createMaterial options | false (skip) | undefined (auto)
   *   kinds     { 'regex': kind } extra name rules, checked before the built-in guesses
   *   kind      kind for everything that no rule matches (default: guessed, else 'default')
   *   headBone  Object3D the face follows, or 'auto' (default: a bone named like "head")
   *   forward   model facing direction in world space right now (default [0,0,1])
   *   outline / outlineWidth / outlineFromVertexColor (use vertex color R as line width)
   *   castShadow / receiveShadow
   *   useSourceShade  use a source MToon shade color as the shadow color
   * @returns {Array} report rows { mesh, material, kind, color, outline } (also in style.lastReport)
   */
  applyTo(root, o = {}) {
    const meshes = [];
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (obj.isMesh && !obj.userData.isOutlineHull && !obj.material?.isCelMaterial) meshes.push(obj);
    });
    const report = [];
    const rules = Object.entries(o.kinds || {}).map(([re, kind]) => [new RegExp(re, 'i'), kind]);
    for (const mesh of meshes) {
      const olds = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let skip = false;
      let anyOutline = false;
      const news = olds.map((m) => {
        const name = `${m?.name ?? ''} ${mesh.name}`;
        const guessed = rules.find(([re]) => re.test(name))?.[1] ?? o.kind ?? guessKind(name);
        if (m?.isOutline) {
          // a source toon outline pass (e.g. three-vrm MToon): the style draws its own lines
          m.visible = false;
          report.push({ mesh: mesh.name, material: m.name, kind: 'source-outline (hidden)', outline: false });
          return m;
        }
        const custom = o.map ? o.map(mesh, m, guessed) : undefined;
        if (custom === false) {
          skip = true;
          return m;
        }
        const src = readSourceMaterial(m);
        const kind = custom?.kind ?? guessed;
        const opts = { kind, name: m?.name || kind, ...src, ...custom };
        if (o.useSourceShade && src.sourceShade && !opts.shadow) opts.shadow = src.sourceShade;
        delete opts.sourceShade;
        if (kind === 'hair') prepareHairAttributes(mesh.geometry);
        if (kind === 'face' && !opts.faceObject && o.headBone !== null) {
          opts.faceObject = (o.headBone && o.headBone !== 'auto' ? o.headBone : findHeadBone(mesh)) || mesh;
          opts.faceForward = o.forward || [0, 0, 1];
        }
        const mat = this.createMaterial(opts);
        const kindDefaults = MATERIAL_KINDS[kind] || {};
        const wantOutline = custom?.outline ?? (o.outline !== false && kindDefaults.outline !== false && !opts.transparent);
        anyOutline ||= wantOutline;
        report.push({ mesh: mesh.name, material: opts.name, kind, color: toHex(toRGB(opts.color)), map: !!opts.map, transparent: !!opts.transparent, outline: wantOutline });
        return mat;
      });
      if (skip) continue;
      mesh.material = Array.isArray(mesh.material) ? news : news[0];
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = o.receiveShadow ?? true;
      if (o.outlineFromVertexColor && mesh.geometry.attributes.color && !mesh.geometry.attributes.outlineWidth) {
        const c = mesh.geometry.attributes.color;
        const w = new Float32Array(c.count);
        for (let i = 0; i < c.count; i++) w[i] = c.getX(i);
        mesh.geometry.setAttribute('outlineWidth', new BufferAttribute(w, 1));
      }
      // multi-material meshes get one hull; groups whose material wants no line are hidden in it
      if (anyOutline) {
        const hull = this.addOutline(mesh, { width: o.outlineWidth ?? 1 });
        if (Array.isArray(hull.material)) {
          hull.material.forEach((hm, i) => {
            const row = report[report.length - olds.length + i];
            if (!row.outline) hm.visible = false;
          });
        }
      }
    }
    this.lastReport = report;
    return report;
  }

  // ------------------------------------------------------------- per frame

  /** Direction *toward* the key light, in world space. */
  computeLightDirection(camera, target = new Vector3()) {
    const l = this.params.light;
    const az = MathUtils.degToRad(l.azimuth);
    const el = MathUtils.degToRad(l.elevation);
    target.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    if (l.followCamera && camera) {
      // rotate by the camera yaw only, so tilting the camera keeps the light height
      camera.getWorldDirection(_v3);
      const yaw = Math.atan2(-_v3.x, -_v3.z);
      target.applyAxisAngle(_v3.set(0, 1, 0), yaw);
    }
    return target.normalize();
  }

  /**
   * Call once per frame before rendering.
   * @param {WebGLRenderer} renderer
   * @param {Camera} camera
   * @param {object} [o] { time, focusDistance }
   */
  update(renderer, camera, o = {}) {
    const u = this.uniforms;
    renderer.getDrawingBufferSize(_v2);
    u.uResolution.value.copy(_v2);
    u.uPxScale.value = _v2.y / 1000;
    this.computeLightDirection(camera, this.lightDirection);
    u.uLightDir.value.copy(this.lightDirection);
    if (o.focusDistance !== undefined) this.focusDistance = o.focusDistance;
    u.uFocusDist.value = this.focusDistance;
    u.uOutlineDepthRef.value = this.focusDistance;
    if (o.time !== undefined) u.uTime.value = o.time;
    for (const m of this._tracked) m._updateTracking();
  }

  /** A THREE.Color of the background (for scene.background). */
  backgroundColorObject(target = new Color()) {
    return target.set(this.params.background.color);
  }

  /**
   * Keep scene.background in sync with the style (for your own renderer setup;
   * AnimeStage does this for you). Returns an unsubscribe function.
   */
  bindScene(scene) {
    if (!scene.background?.isColor) scene.background = new Color();
    const apply = () => this.backgroundColorObject(scene.background);
    apply();
    return this.onChange(apply);
  }
}

function guessKind(name) {
  const n = name.toLowerCase();
  if (/hair|bang|ahoge|ponytail|twintail|髪/.test(n)) return 'hair';
  if (/eyeline|eyelash|lash|brow|mouth|teeth|tongue|まつげ|眉|口/.test(n)) return 'face';
  if (/eye|iris|pupil|highlight|白目|瞳/.test(n)) return 'eye';
  if (/face|head|顔/.test(n)) return 'face';
  if (/skin|body|arm|leg|hand|肌/.test(n)) return 'skin';
  if (/cloth|top|bottom|shirt|skirt|pant|short|jacket|coat|dress|shoe|sock|boot|服/.test(n)) return 'cloth';
  return 'default';
}

/** Pull color / texture / alpha out of any three.js material (Standard, Basic, Phong, MToon...). */
function readSourceMaterial(m) {
  if (!m) return { color: '#ffffff' };
  const out = {
    color: m.color?.isColor ? '#' + m.color.getHexString(SRGBColorSpace) : '#ffffff',
    map: m.map || undefined,
    side: m.side,
    transparent: !!m.transparent && (m.opacity < 1 || !!m.map),
    opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || (m.uniforms?.alphaTest?.value ?? 0),
  };
  if (m.transparent) out.depthWrite = m.depthWrite;
  // three-vrm MToonMaterial keeps its shade color here
  const shade = m.shadeColorFactor || m.uniforms?.shadeColorFactor?.value;
  if (shade?.isColor) out.sourceShade = '#' + shade.getHexString(SRGBColorSpace);
  return out;
}

/** Find the head bone of a skinned mesh (VRoid, Mixamo, VRM, Unity-style names). */
export function findHeadBone(mesh) {
  const bones = mesh.skeleton?.bones || [];
  let best = null;
  for (const b of bones) {
    const n = b.name.toLowerCase();
    if (!/head/.test(n) || /top|end|nub|_tip|headset/.test(n)) continue;
    if (!best || b.name.length < best.name.length) best = b;
  }
  return best;
}

/**
 * Hair shading needs per-vertex strand data (see STYLE.md "hair attribute contract"):
 *   hairTangent (vec3) strand direction root -> tip, in geometry space
 *   hairUV      (vec2) x = coordinate across strands (zig-zag phase), y = 0 at the crown .. 1 at the tips
 *   hairSeed    (float) one random value per clump
 * For meshes that don't have them (any glTF/VRM hair) we estimate: strands
 * radiate from the crown (top of the hair) and run down along the surface;
 * every connected piece of the mesh counts as one clump.
 */
export function prepareHairAttributes(geometry, { crown, force = false } = {}) {
  if (geometry.attributes.hairTangent && !force) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const n = pos.count;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const top = crown ? new Vector3().fromArray(crown) : new Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2 - (bb.max.z - bb.min.z) * 0.05);
  const height = Math.max(1e-6, bb.max.y - bb.min.y);

  // connected pieces -> one seed per clump (union-find over the index)
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  // vertices that share a position (split seams) belong together
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const j = seen.get(k);
    if (j === undefined) seen.set(k, i);
    else join(i, j);
  }
  const index = geometry.index;
  if (index) for (let t = 0; t < index.count; t += 3) {
    join(index.getX(t), index.getX(t + 1));
    join(index.getX(t), index.getX(t + 2));
  } else for (let t = 0; t < n; t += 3) {
    join(t, t + 1);
    join(t, t + 2);
  }

  const tan = new Float32Array(n * 3);
  const huv = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  const p = new Vector3();
  const nn = new Vector3();
  const d = new Vector3();
  const hash = (x) => {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    nn.fromBufferAttribute(nrm, i);
    d.subVectors(p, top);
    // mostly radial from the crown, pulled down for hanging strands
    d.normalize().add(new Vector3(0, -0.35, 0));
    d.addScaledVector(nn, -nn.dot(d));
    if (d.lengthSq() < 1e-8) d.set(0, -1, 0);
    d.normalize();
    tan[i * 3] = d.x;
    tan[i * 3 + 1] = d.y;
    tan[i * 3 + 2] = d.z;
    huv[i * 2] = (Math.atan2(p.x - top.x, p.z - top.z) / (Math.PI * 2) + 0.5) * 24;
    huv[i * 2 + 1] = Math.min(1, Math.max(0, (bb.max.y - p.y) / height));
    seed[i] = hash(find(i));
  }
  geometry.setAttribute('hairTangent', new BufferAttribute(tan, 3));
  geometry.setAttribute('hairUV', new BufferAttribute(huv, 2));
  geometry.setAttribute('hairSeed', new BufferAttribute(seed, 1));
  return geometry;
}
