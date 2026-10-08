// anime-style: flat cel-shaded anime illustration look for three.js.
// This folder contains ONLY the style (shaders, parameters, presets, staging).
// Content (characters, props) lives in your project; see /demo for an example.
// Read STYLE.md (repo root) for the art rules, parameters and recipes.
export { AnimeStyle, CelMaterial, OutlineMaterial, MATERIAL_KINDS, prepareHairAttributes, findHeadBone } from './AnimeStyle.js';
export { AnimeStage } from './stage.js';
export { DEFAULT_PARAMS, PARAM_SCHEMA, PRESETS, resolveParams, mergeDeep } from './presets.js';
export { toRGB, toHex, toneShift, shadowOf, lineOf, highlightOf, rgbToHsv, hsvToRgb } from './color.js';
export { computeOutlineNormals, useNormalsAsOutline, createHull } from './outline.js';
export { addStyleControls, SECTION_TITLES } from './gui.js';
