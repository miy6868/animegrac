// Color helpers. Every color in the style engine is handled as *sRGB* (the
// values you see in a color picker), never linear, so that a palette hex
// such as '#64aaf0' lands on screen as exactly '#64aaf0'.
import { Color, Vector3 } from 'three';

const _c = new Color();

/** Any color input ('#rrggbb', 0xrrggbb, THREE.Color, [r,g,b] 0..1) -> {r,g,b} sRGB 0..1 */
export function toRGB(input) {
  if (Array.isArray(input)) return { r: input[0], g: input[1], b: input[2] };
  if (input && input.isColor) {
    const t = {};
    input.getRGB(t, 'srgb');
    return t;
  }
  if (input && typeof input === 'object' && 'r' in input) return { r: input.r, g: input.g, b: input.b };
  _c.set(input);
  const t = {};
  _c.getRGB(t, 'srgb');
  return t;
}

export function toHex(rgb) {
  const h = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

export function toVec3(input, target = new Vector3()) {
  const c = toRGB(input);
  return target.set(c.r, c.g, c.b);
}

export function rgbToHsv({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max <= 1e-6 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p };
    case 1: return { r: q, g: v, b: p };
    case 2: return { r: p, g: v, b: t };
    case 3: return { r: p, g: q, b: v };
    case 4: return { r: t, g: p, b: v };
    default: return { r: v, g: p, b: q };
  }
}

export function mixRGB(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** shortest-path hue interpolation (hues 0..1) */
function hueToward(h, target, amount) {
  let d = target - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return h + d * amount;
}

/**
 * The "tone shift" used for both shadows and lines. Mirrors `animeTone()` in
 * shaders.js — keep the two in sync.
 *   saturation: fraction of the remaining saturation that is added (0..1)
 *   value:      value multiplier
 *   hueTarget/hueShift: hue rotation toward a target hue (degrees / 0..1)
 *   tint:       multiply color used for near-neutral colors (white/grey/black)
 */
export function toneShift(input, { saturation = 0.36, value = 0.92, hueTarget = 250, hueShift = 0.04, tint = '#b4c2e6' } = {}) {
  const rgb = toRGB(input);
  const hsv = rgbToHsv(rgb);
  const shifted = hsvToRgb({
    h: hueToward(hsv.h, hueTarget / 360, hueShift),
    s: hsv.s + (1 - hsv.s) * saturation,
    v: hsv.v * value,
  });
  const t = toRGB(tint);
  const neutral = { r: rgb.r * t.r * value, g: rgb.g * t.g * value, b: rgb.b * t.b * value };
  // colors with almost no chroma have no meaningful hue: use the tint instead
  const w = 1 - smoothstep(0.02, 0.09, hsv.s);
  return mixRGB(shifted, neutral, w);
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Shadow color for a base color, using style.params.shading */
export function shadowOf(base, shading) {
  return toneShift(base, {
    saturation: shading.shadowSaturation,
    value: shading.shadowValue,
    hueTarget: shading.shadowHue,
    hueShift: shading.shadowHueShift,
    tint: shading.shadowTint,
  });
}

/** Tinted line color for a base color, using style.params.outline */
export function lineOf(base, outline) {
  const shifted = toneShift(base, {
    saturation: outline.saturation,
    value: outline.value,
    hueTarget: outline.hue,
    hueShift: outline.hueShift,
    tint: outline.tint,
  });
  return mixRGB(shifted, toRGB(outline.color), outline.fixedMix);
}

/** Light highlight color (hair band etc.): toward white, slightly desaturated */
export function highlightOf(base, amount = 0.55) {
  const hsv = rgbToHsv(toRGB(base));
  return hsvToRgb({ h: hsv.h, s: hsv.s * (1 - amount * 0.75), v: hsv.v + (1 - hsv.v) * amount });
}
