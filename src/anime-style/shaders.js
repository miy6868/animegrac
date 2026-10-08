// GLSL for the flat anime style. All color math happens in sRGB space and the
// result is written to the canvas without further color conversion.

export const GLSL_COLOR = /* glsl */ `
vec3 as_rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 as_hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
// Mirrors toneShift() in color.js
vec3 as_tone(vec3 rgb, float sat, float val, float hueTarget, float hueShift, vec3 tint) {
  vec3 hsv = as_rgb2hsv(rgb);
  float d = hueTarget - hsv.x;
  d -= floor(d + 0.5);
  vec3 shifted = as_hsv2rgb(vec3(fract(hsv.x + d * hueShift), hsv.y + (1.0 - hsv.y) * sat, hsv.z * val));
  vec3 neutral = rgb * tint * val;
  float w = 1.0 - smoothstep(0.02, 0.09, hsv.y);
  return mix(shifted, neutral, w);
}
vec3 as_srgbFromLinear(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

// Uniforms shared by the cel and the outline shader for hair motion.
const GLSL_HAIR_ATTRS = /* glsl */ `
#ifdef HAIR
  attribute vec3 hairTangent;
  attribute vec2 hairUV;
  attribute float hairSeed;
  uniform float uTime;
  uniform float uHairSway;
#endif
`;

const GLSL_HAIR_SWAY = /* glsl */ `
#ifdef HAIR
  {
    float hang = hairUV.y * hairUV.y;
    float sw = uHairSway * hang;
    transformed.x += sin(uTime * 1.4 + hairSeed * 6.283) * sw * 0.010;
    transformed.z += sin(uTime * 1.1 + hairSeed * 4.1 + 1.3) * sw * 0.007;
  }
#endif
`;

export const CEL_VERTEX = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
${GLSL_HAIR_ATTRS}

uniform vec3 uFlattenAxis;        // object space
uniform vec4 uFlattenAxisWorld;   // xyz world axis, w = 1 to use it (tracked head bone)

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec3 vFlattenAxisW;
varying vec2 vUv;
varying float vViewDepth;
#ifdef HAIR
  varying vec3 vWorldTangent;
  varying vec2 vHairUV;
  varying float vHairSeed;
#endif

void main() {
  vUv = uv;
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${GLSL_HAIR_SWAY}
  vObjPos = transformed;
  vObjNormal = objectNormal;
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>

  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
  vFlattenAxisW = uFlattenAxisWorld.w > 0.5 ? normalize(uFlattenAxisWorld.xyz) : normalize((modelMatrix * vec4(uFlattenAxis, 0.0)).xyz);
  vViewDepth = -mvPosition.z;
  #ifdef HAIR
    vec3 hairT = hairTangent;
    #ifdef USE_SKINNING
      hairT = (skinMatrix * vec4(hairT, 0.0)).xyz;
    #endif
    vWorldTangent = normalize((modelMatrix * vec4(hairT, 0.0)).xyz);
    vHairUV = hairUV;
    vHairSeed = hairSeed;
  #endif
}
`;

export const CEL_FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${GLSL_COLOR}

// --- shared style uniforms (one object per AnimeStyle) ---
uniform vec3 uLightDir;
uniform float uSteps;
uniform float uThreshold;
uniform float uSoftness;
uniform float uStepSpread;
uniform float uShadowSat;
uniform float uShadowVal;
uniform float uShadowHue;
uniform float uShadowHueShift;
uniform vec3 uShadowTint;
uniform float uCastStrength;
uniform float uCastSoftness;
uniform float uHiStrength;
uniform float uHiThreshold;
uniform float uHiLighten;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimWidth;
uniform vec3 uFadeColor;
uniform float uFadeStrength;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uFocusDist;
uniform float uFaceFlatten;
uniform float uHairHiStrength;
uniform float uHairHiThreshold;
uniform float uHairHiShift;
uniform float uHairHiJag;
uniform float uHairHiJagFreq;
uniform float uHairHiSoftness;
uniform float uHairHiPower;
uniform float uTexDetail;
uniform float uTexBlur;
uniform float uPaletteSnap;
uniform int uPaletteCount;
uniform vec3 uPalette[16];

// --- per material ---
uniform vec3 uColor;
uniform vec4 uShadowOverride;   // rgb + flag
uniform vec4 uShadowOverride2;  // deep shadow (3-step) rgb + flag
uniform float uThresholdBias;
uniform float uFlatten;
uniform float uFadeMul;
uniform float uRimMul;
uniform float uHiMul;
uniform float uCastMul;
uniform float uCastAbs;  // >= 0 overrides uCastStrength * uCastMul (floor)
uniform float uNoLambert;
uniform float uInnerDarken;
uniform float uOpacity;
uniform float uAlphaTest;
uniform float uTexDetailMat;   // >= 0 overrides the global texture detail for this material
uniform float uTexDetailMul;   // multiplies the global texture detail (hair: flatter by default)
#ifdef USE_CEL_MAP
  uniform sampler2D uMap;
#endif
#ifdef FACE_PAINT
  uniform sampler2D uFaceMap;
  uniform vec4 uFaceRect;
#endif
#ifdef HAIR
  uniform vec4 uHairHiColor;   // rgb + flag (1 = explicit color, 0 = derive from albedo)
  uniform float uHairHiLighten;
  varying vec3 vWorldTangent;
  varying vec2 vHairUV;
  varying float vHairSeed;
#endif

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec3 vFlattenAxisW;
varying vec2 vUv;
varying float vViewDepth;

vec3 shadowOf(vec3 c) {
  return as_tone(c, uShadowSat, uShadowVal, uShadowHue, uShadowHueShift, uShadowTint);
}

void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>

  vec3 albedo = uColor;
  vec3 tex = vec3(1.0);
  float alpha = uOpacity;
  #ifdef USE_CEL_MAP
    vec4 texel = texture2D(uMap, vUv);
    float detail = uTexDetailMat >= 0.0 ? uTexDetailMat : uTexDetail * uTexDetailMul;
    if (detail < 0.999) {
      // flatten painted detail into big color areas: blend toward a blurred mip level
      vec4 blurred = texture2D(uMap, vUv, uTexBlur);
      texel.rgb = mix(blurred.rgb, texel.rgb, detail);
    }
    #ifdef CEL_MAP_SRGB
      texel.rgb = as_srgbFromLinear(texel.rgb);
    #endif
    tex = texel.rgb;
    albedo *= tex;
    alpha *= texel.a;
  #endif
  if (alpha < uAlphaTest) discard;

  #ifdef FACE_PAINT
    // optional painted face projected along the object's +Z (procedural heads)
    vec2 fuv = (vObjPos.xy - uFaceRect.xy) / uFaceRect.zw;
    float facing = smoothstep(0.15, 0.45, normalize(vObjNormal).z);
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      vec4 f = texture2D(uFaceMap, fuv);
      albedo = mix(albedo, f.rgb, f.a * facing);
    }
  #endif

  vec3 N = normalize(vWorldNormal);
  bool inner = !gl_FrontFacing;
  if (inner) N = -N;
  #ifdef FACE
    float flatten = uFaceFlatten;
  #else
    float flatten = uFlatten;
  #endif
  N = normalize(mix(N, vFlattenAxisW, flatten));

  float ndl = dot(N, uLightDir);
  float x = mix(ndl * 0.5 + 0.5, 1.0, uNoLambert) + uThresholdBias;

  float castLit = 1.0;
  #ifdef USE_SHADOWMAP
    float m = getShadowMask();
    castLit = smoothstep(0.5 - uCastSoftness, 0.5 + uCastSoftness, m);
  #endif

  float castAmt = uCastAbs >= 0.0 ? uCastAbs : uCastStrength * uCastMul;
  float castTerm = mix(1.0, castLit, castAmt);
  float s0 = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, x);
  s0 = min(s0, castTerm);
  if (inner) s0 *= 1.0 - uInnerDarken;

  vec3 shadow = uShadowOverride.w > 0.5 ? uShadowOverride.rgb * tex : shadowOf(albedo);
  vec3 col;
  if (uSteps < 1.5) {
    // 1 step = flat fill; only cast shadows remain
    col = mix(shadow, albedo, castTerm);
  } else if (uSteps < 2.5) {
    col = mix(shadow, albedo, s0);
  } else {
    vec3 deep = uShadowOverride2.w > 0.5 ? uShadowOverride2.rgb * tex : shadowOf(shadow);
    float t1 = uThreshold - uStepSpread;
    float s1 = smoothstep(t1 - uSoftness, t1 + uSoftness, x);
    s1 = min(s1, castTerm);
    col = mix(mix(deep, shadow, s1), albedo, s0);
  }

  vec3 V = normalize(cameraPosition - vWorldPos);

  // optional bright step on the lit side
  if (uHiStrength * uHiMul > 0.0) {
    float hs = smoothstep(uHiThreshold - uSoftness, uHiThreshold + uSoftness, x) * s0;
    vec3 hcol = albedo + (vec3(1.0) - albedo) * uHiLighten;
    col = mix(col, hcol, hs * uHiStrength * uHiMul);
  }

  #ifdef HAIR
  {
    // Anisotropic "angel ring": Kajiya-Kay term on a shifted, jagged tangent,
    // then hard-thresholded into a flat band. Each clump gets its own jag phase.
    vec3 T = normalize(vWorldTangent);
    vec3 H = normalize(uLightDir + V);
    float tri = abs(fract(vHairUV.x * uHairHiJagFreq + vHairSeed * 7.13) - 0.5) * 2.0;
    float jag = (tri - 0.5) * uHairHiJag + (vHairSeed - 0.5) * uHairHiJag * 0.8;
    vec3 Ts = normalize(T + normalize(vWorldNormal) * (uHairHiShift + jag));
    float th = dot(Ts, H);
    float spec = pow(sqrt(max(0.0, 1.0 - th * th)), uHairHiPower);
    float band = smoothstep(uHairHiThreshold - uHairHiSoftness, uHairHiThreshold + uHairHiSoftness, spec);
    band *= s0 * (inner ? 0.0 : 1.0);
    // the ring lives on the head, not on hanging hair (hairUV.y: 0 on the head .. 1 at tips)
    band *= 1.0 - smoothstep(0.08, 0.3, vHairUV.y);
    vec3 hsvA = as_rgb2hsv(albedo);
    vec3 hiAuto = as_hsv2rgb(vec3(hsvA.x, hsvA.y * (1.0 - uHairHiLighten * 0.75), hsvA.z + (1.0 - hsvA.z) * uHairHiLighten));
    vec3 hiCol = uHairHiColor.w > 0.5 ? uHairHiColor.rgb * tex : hiAuto;
    col = mix(col, hiCol, band * uHairHiStrength);
  }
  #endif

  // rim (lit side only)
  if (uRimStrength * uRimMul > 0.0) {
    float fres = 1.0 - max(dot(normalize(vWorldNormal) * (inner ? -1.0 : 1.0), V), 0.0);
    float rim = smoothstep(1.0 - uRimWidth - 0.015, 1.0 - uRimWidth + 0.015, fres) * s0;
    col = mix(col, uRimColor, rim * uRimStrength * uRimMul);
  }

  // limited palette: snap to the nearest palette color
  if (uPaletteSnap > 0.0 && uPaletteCount > 0) {
    vec3 best = col;
    float bd = 1e9;
    for (int i = 0; i < 16; i++) {
      if (i >= uPaletteCount) break;
      vec3 d = (uPalette[i] - col) * vec3(0.9, 1.2, 0.7);
      float dd = dot(d, d);
      if (dd < bd) { bd = dd; best = uPalette[i]; }
    }
    col = mix(col, best, uPaletteSnap);
  }

  // atmospheric fade toward the background for things behind the subject
  float f = smoothstep(uFocusDist + uFadeStart, uFocusDist + uFadeEnd, vViewDepth) * uFadeStrength * uFadeMul;
  col = mix(col, uFadeColor, f);

  gl_FragColor = vec4(col, alpha);
}
`;

export const OUTLINE_VERTEX = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
${GLSL_HAIR_ATTRS}

attribute vec3 outlineNormal;
#ifdef USE_OUTLINE_WIDTH
  attribute float outlineWidth;
#endif
uniform float uOutlineWidth;
uniform float uPxScale;
uniform vec2 uResolution;
uniform float uOutlineDepthRef;
uniform float uOutlineDepthAtten;
uniform float uOutlineZOffset;
uniform float uWidthMul;
varying float vViewDepth;
varying vec2 vUv;

void main() {
  vUv = uv;
  #include <batching_vertex>
  vec3 objectNormal = outlineNormal;
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${GLSL_HAIR_SWAY}
  #include <project_vertex>

  // push the hull slightly away from the camera so it never covers the surface
  vec4 mv = mvPosition;
  mv.xyz += normalize(mv.xyz) * uOutlineZOffset;

  vec3 nView = normalize(normalMatrix * objectNormal);
  #ifdef USE_INSTANCING
    nView = normalize(normalMatrix * mat3(instanceMatrix) * objectNormal);
  #endif
  float d = max(-mvPosition.z, 1e-4);
  vec4 c0 = projectionMatrix * mvPosition;
  vec4 c1 = projectionMatrix * vec4(mvPosition.xyz + nView * d * 0.01, 1.0);
  vec2 dir = (c1.xy / c1.w - c0.xy / c0.w) * uResolution;
  float len = length(dir);
  dir = len > 1e-6 ? dir / len : vec2(0.0);

  float w = uOutlineWidth * uWidthMul * uPxScale;
  #ifdef USE_OUTLINE_WIDTH
    w *= outlineWidth;
  #endif
  w *= mix(1.0, clamp(uOutlineDepthRef / d, 0.3, 1.6), uOutlineDepthAtten);

  gl_Position = projectionMatrix * mv;
  gl_Position.xy += dir * w * 2.0 / uResolution * gl_Position.w;
  vViewDepth = d;
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
}
`;

export const OUTLINE_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
${GLSL_COLOR}
uniform vec3 uBaseColor;      // the paired cel material's color
uniform vec4 uLineOverride;   // rgb + flag (1 = explicit line color)
uniform float uLineSat;
uniform float uLineVal;
uniform float uLineHue;
uniform float uLineHueShift;
uniform vec3 uLineTint;
uniform vec3 uLineFixed;
uniform float uLineFixedMix;
uniform vec3 uFadeColor;
uniform float uFadeStrength;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uFocusDist;
uniform float uFadeMul;
varying float vViewDepth;
varying vec2 vUv;
#ifdef USE_CEL_MAP
  uniform sampler2D uMap;
  uniform float uAlphaTest;
#endif
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  vec3 base = uBaseColor;
  #ifdef USE_CEL_MAP
    vec4 t = texture2D(uMap, vUv);
    #ifdef OUTLINE_CUTOUT
      if (t.a < max(uAlphaTest, 0.5)) discard;
    #endif
    #ifdef CEL_MAP_SRGB
      t.rgb = as_srgbFromLinear(t.rgb);
    #endif
    base *= t.rgb;
  #endif
  vec3 line = uLineOverride.w > 0.5 ? uLineOverride.rgb
    : mix(as_tone(base, uLineSat, uLineVal, uLineHue, uLineHueShift, uLineTint), uLineFixed, uLineFixedMix);
  float f = smoothstep(uFocusDist + uFadeStart, uFocusDist + uFadeEnd, vViewDepth) * uFadeStrength * uFadeMul;
  gl_FragColor = vec4(mix(line, uFadeColor, f), 1.0);
}
`;
