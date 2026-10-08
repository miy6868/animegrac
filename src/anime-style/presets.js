// Style parameters. DEFAULT_PARAMS *is* the reference look ("skyPop").
// Every key is documented in PARAM_SCHEMA (ranges are used by the control panel
// and by STYLE.md). Presets are partial overrides merged on top of the defaults.

export const DEFAULT_PARAMS = {
  background: {
    color: '#64aef0', // saturated flat backdrop
  },
  ground: {
    visible: true,
    color: 'auto', // 'auto' = same as background (seamless floor)
    shadowStrength: 0.6, // how strongly cast shadows show on the floor
  },
  light: {
    azimuth: 50, // degrees; 0 = from the camera, +90 = from screen right
    elevation: 35, // degrees above the horizon
    followCamera: true, // azimuth is relative to the camera (true) or world +Z (false)
    castShadows: true,
    shadowSoftness: 0.12, // width of the cast-shadow edge before thresholding
  },
  shading: {
    steps: 2, // 1 = flat fill, 2 = lit/shadow, 3 = lit/shadow/deep shadow
    threshold: 0.47, // where the terminator falls on the half-lambert ramp (0..1)
    softness: 0.008, // edge blur of each step (0 = razor sharp)
    stepSpread: 0.2, // distance between the steps when steps = 3
    shadowSaturation: 0.36, // shadow = base with this fraction of missing saturation added
    shadowValue: 0.93, // shadow brightness multiplier
    shadowHue: 250, // hue (deg) that shadows lean toward
    shadowHueShift: 0.04, // how far shadows lean toward shadowHue (0..1)
    shadowTint: '#c5d3f1', // shadow multiply color for white/grey/black surfaces
    castStrength: 1, // 0 = ignore cast shadows on characters/props
    highlightStrength: 0, // optional extra bright step on the lit side
    highlightThreshold: 0.93,
    highlightLighten: 0.35,
    rimStrength: 0, // flat rim light on the lit edge
    rimWidth: 0.22,
    rimColor: '#ffffff',
  },
  outline: {
    enabled: true,
    width: 1.5, // px at a 1000px tall canvas (scales with resolution)
    saturation: 0.45, // line = base color with this fraction of missing saturation added
    value: 0.8, // line brightness multiplier (lower = darker lines)
    hue: 345, // hue (deg) lines lean toward
    hueShift: 0.06,
    tint: '#aec0ee', // line multiply color for white/grey/black surfaces
    color: '#1b1726', // fixed line color, used with fixedMix
    fixedMix: 0, // 0 = tinted lines, 1 = classic single-color lines
    depthAttenuation: 0.5, // thinner lines on far objects (0 = constant pixel width)
    zOffset: 0.004, // metres the hull is pushed back
  },
  hair: {
    highlightStrength: 1,
    highlightThreshold: 0.9, // higher = thinner band
    highlightShift: -0.32, // moves the band along the strands (toward roots < 0 < toward tips)
    highlightJag: 0.22, // zig-zag of the band edge, per clump
    highlightJagFrequency: 2.0,
    highlightSoftness: 0.012,
    highlightPower: 18,
    highlightLighten: 0.4, // band color = base pushed toward white
    sway: 0, // shader-only idle hair motion (for hair without physics); 0 = off
  },
  face: {
    flatten: 0.85, // bends face normals toward the face direction -> clean, mostly lit faces
  },
  texture: {
    detail: 1, // 1 = textures as painted, 0 = only their big color areas (hair kind uses x0.45)
    blur: 4, // mip LOD bias used for the flattened texture (higher = bigger color areas)
  },
  palette: {
    snap: 0, // 0..1 pull every shaded color to the nearest palette color
    colors: [], // up to 16 hex colors, e.g. ['#64aef0', '#f6e2de', '#ee9887', ...]
  },
  atmosphere: {
    strength: 0.5, // things behind the subject fade toward `color`
    start: 0.0, // metres behind the focus point where the fade starts
    end: 0.6, // metres behind the focus point where the fade reaches `strength`
    color: 'auto', // 'auto' = background color
  },
};

// [min, max, step, description]
export const PARAM_SCHEMA = {
  'background.color': ['color', 'Backdrop color. Pick a saturated mid-light color.'],
  'ground.visible': ['bool', 'Show the seamless floor that receives cast shadows.'],
  'ground.color': ['color|auto', "Floor color. 'auto' matches the background."],
  'ground.shadowStrength': [0, 1, 0.01, 'Opacity of cast shadows on the floor.'],
  'light.azimuth': [-180, 180, 1, 'Key light horizontal angle (deg).'],
  'light.elevation': [-10, 90, 1, 'Key light height (deg).'],
  'light.followCamera': ['bool', 'Light direction is relative to the camera.'],
  'light.castShadows': ['bool', 'Cast shadows (hair on face, body on floor).'],
  'light.shadowSoftness': [0.01, 0.5, 0.01, 'Cast shadow edge width before thresholding.'],
  'shading.steps': [1, 3, 1, 'Number of tones: 1 flat, 2 lit/shadow, 3 lit/shadow/deep.'],
  'shading.threshold': [0, 1, 0.005, 'Where light turns into shadow. Higher = more shadow.'],
  'shading.softness': [0, 0.2, 0.001, 'Blur of tone edges. Keep tiny for the flat look.'],
  'shading.stepSpread': [0.02, 0.5, 0.01, 'Gap between shadow and deep shadow (3 steps).'],
  'shading.shadowSaturation': [0, 1, 0.01, 'Saturation boost of shadows.'],
  'shading.shadowValue': [0.3, 1, 0.01, 'Brightness of shadows.'],
  'shading.shadowHue': [0, 360, 1, 'Hue shadows lean toward.'],
  'shading.shadowHueShift': [0, 1, 0.01, 'Amount of hue lean.'],
  'shading.shadowTint': ['color', 'Shadow color for white/grey surfaces (multiply).'],
  'shading.castStrength': [0, 1, 0.01, 'Strength of cast shadows on objects.'],
  'shading.highlightStrength': [0, 1, 0.01, 'Extra bright step on lit areas (0 = off).'],
  'shading.highlightThreshold': [0.5, 1, 0.005, 'Size of the bright step.'],
  'shading.highlightLighten': [0, 1, 0.01, 'How bright the bright step is.'],
  'shading.rimStrength': [0, 1, 0.01, 'Flat rim light on silhouettes (0 = off).'],
  'shading.rimWidth': [0.02, 0.6, 0.01, 'Rim width.'],
  'shading.rimColor': ['color', 'Rim color.'],
  'outline.enabled': ['bool', 'Draw outlines.'],
  'outline.width': [0, 6, 0.05, 'Line width in px per 1000px of canvas height.'],
  'outline.saturation': [0, 1, 0.01, 'Line saturation boost relative to the surface color.'],
  'outline.value': [0, 1, 0.01, 'Line brightness relative to the surface (lower = darker).'],
  'outline.hue': [0, 360, 1, 'Hue lines lean toward.'],
  'outline.hueShift': [0, 1, 0.01, 'Amount of hue lean.'],
  'outline.tint': ['color', 'Line color for white/grey surfaces (multiply).'],
  'outline.color': ['color', 'Fixed line color (see fixedMix).'],
  'outline.fixedMix': [0, 1, 0.01, '0 = tinted per-surface lines, 1 = one fixed color.'],
  'outline.depthAttenuation': [0, 1, 0.01, 'Thinner lines for far objects.'],
  'outline.zOffset': [0, 0.02, 0.0005, 'Depth push of the outline hull (m).'],
  'hair.highlightStrength': [0, 1, 0.01, 'Hair highlight band opacity.'],
  'hair.highlightThreshold': [0.3, 0.99, 0.005, 'Band thinness.'],
  'hair.highlightShift': [-1.5, 1.5, 0.01, 'Band position along the strands.'],
  'hair.highlightJag': [0, 1.5, 0.01, 'Zig-zag of the band edge.'],
  'hair.highlightJagFrequency': [0.5, 8, 0.1, 'Zig-zag teeth per clump.'],
  'hair.highlightSoftness': [0, 0.1, 0.001, 'Band edge blur.'],
  'hair.highlightPower': [2, 80, 1, 'Anisotropic exponent (band sharpness).'],
  'hair.highlightLighten': [0, 1, 0.01, 'Band color brightness.'],
  'hair.sway': [0, 3, 0.01, 'Idle hair motion.'],
  'face.flatten': [0, 1, 0.01, 'Flatten face shading (1 = always lit).'],
  'texture.detail': [0, 1, 0.01, 'Texture detail kept (lower = flatter, bigger color areas).'],
  'texture.blur': [0, 8, 0.1, 'How much detail is flattened (mip level bias).'],
  'palette.snap': [0, 1, 0.01, 'Snap shaded colors to the palette (limited palette look).'],
  'palette.colors': ['colors', 'Palette (comma separated hex, up to 16).'],
  'atmosphere.strength': [0, 1, 0.01, 'Fade of far parts toward the background.'],
  'atmosphere.start': [-0.5, 1, 0.01, 'Fade start behind the focus point (m).'],
  'atmosphere.end': [0.05, 3, 0.01, 'Fade end behind the focus point (m).'],
  'atmosphere.color': ['color|auto', "Fade color. 'auto' = background."],
};

export const PRESETS = {
  // The reference look: sky-blue backdrop, pale cool shadows, soft tinted lines.
  skyPop: {},

  // Warm sunset backdrop, warmer shadows, slightly bolder lines.
  sunsetCoral: {
    background: { color: '#f58a6c' },
    light: { azimuth: -55, elevation: 25 },
    shading: { shadowHue: 300, shadowHueShift: 0.08, shadowTint: '#e3b5c9', shadowValue: 0.88 },
    outline: { width: 1.7, hue: 330, tint: '#b88aa0' },
    atmosphere: { strength: 0.35 },
  },

  // Fresh mint, very soft and light.
  mintSoda: {
    background: { color: '#5fd3b6' },
    shading: { shadowTint: '#b7d7e4', shadowHue: 210, shadowValue: 0.94, shadowSaturation: 0.3 },
    outline: { width: 1.3, value: 0.78, tint: '#93b4c4' },
  },

  // Night: deep backdrop, 3 tones, rim light.
  neonNight: {
    background: { color: '#2b2f6b' },
    light: { azimuth: 75, elevation: 20 },
    shading: { steps: 3, threshold: 0.5, stepSpread: 0.22, shadowTint: '#8d8fd6', shadowValue: 0.78, shadowHue: 255, shadowHueShift: 0.15, rimStrength: 0.9, rimWidth: 0.2, rimColor: '#9ef0ff' },
    outline: { width: 1.6, value: 0.55, hue: 260, hueShift: 0.2, tint: '#5d5f9a' },
    ground: { shadowStrength: 1 },
    atmosphere: { strength: 0.5 },
  },

  // Classic TV-anime: dark uniform lines, harder shadow.
  classicInk: {
    background: { color: '#f2d24b' },
    shading: { threshold: 0.5, shadowValue: 0.85, shadowSaturation: 0.42 },
    outline: { width: 2.0, fixedMix: 0.85, color: '#231c26' },
    atmosphere: { strength: 0.15 },
  },

  // No lines at all, three soft-ish tones: poster / flat vector look.
  posterFlat: {
    background: { color: '#ff7aa8' },
    shading: { steps: 3, softness: 0.004, shadowValue: 0.9, shadowTint: '#d6b6dd' },
    outline: { enabled: false },
    atmosphere: { strength: 0.3 },
  },
};

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function mergeDeep(target, src) {
  if (!src) return target;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && target[k] !== null) {
      mergeDeep(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

/** Full parameter object for a preset name (or a partial params object). */
export function resolveParams(presetOrParams) {
  const base = clone(DEFAULT_PARAMS);
  if (!presetOrParams) return base;
  if (typeof presetOrParams === 'string') {
    if (!PRESETS[presetOrParams]) throw new Error(`Unknown anime-style preset "${presetOrParams}"`);
    return mergeDeep(base, clone(PRESETS[presetOrParams]));
  }
  return mergeDeep(base, clone(presetOrParams));
}
