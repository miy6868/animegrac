// Optional: build live controls for every style parameter on a lil-gui
// (or any object with the same API: addFolder/add/addColor). The engine does
// not import lil-gui itself; pass your own instance.
import { PARAM_SCHEMA, PRESETS } from './presets.js';

export const SECTION_TITLES = {
  background: 'Background 배경',
  ground: 'Ground 바닥',
  light: 'Light 광원',
  shading: 'Shading 음영',
  outline: 'Outline 윤곽선',
  hair: 'Hair 머리카락',
  face: 'Face 얼굴',
  texture: 'Texture 텍스처 평탄화',
  palette: 'Palette 제한 팔레트',
  atmosphere: 'Atmosphere 원근 페이드',
};

/**
 * @param {GUI} gui      lil-gui instance (or folder)
 * @param {AnimeStyle} style
 * @param {object} [o]   { presets: true, closed: ['ground', ...], titles }
 * @returns {{ refresh(): void, folders: object }}
 */
export function addStyleControls(gui, style, o = {}) {
  const titles = { ...SECTION_TITLES, ...(o.titles || {}) };
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());
  if (o.presets !== false) {
    const state = { preset: o.preset || 'skyPop' };
    gui.add(state, 'preset', Object.keys(PRESETS)).name('Preset 프리셋').onChange((n) => {
      style.usePreset(n);
      refresh();
    });
  }
  const folders = {};
  for (const [path, spec] of Object.entries(PARAM_SCHEMA)) {
    const [section, key] = path.split('.');
    const folder = (folders[section] ||= gui.addFolder(titles[section] || section));
    const obj = style.params[section];
    let c;
    if (spec[0] === 'colors') {
      // edit an array of colors as "#aaa,#bbb,..."
      const proxy = { [key]: (obj[key] || []).join(',') };
      c = folder.add(proxy, key);
      c.onFinishChange((v) => {
        obj[key] = String(v).split(/[\s,]+/).filter((x) => /^#?[0-9a-f]{6}$/i.test(x)).map((x) => (x[0] === '#' ? x : '#' + x));
        style.sync();
      });
      c.name(key);
      c.domElement.title = spec[spec.length - 1];
      continue;
    }
    if (spec[0] === 'color') c = folder.addColor(obj, key);
    else if (spec[0] === 'color|auto' || spec[0] === 'bool') c = folder.add(obj, key);
    else c = folder.add(obj, key, spec[0], spec[1], spec[2]);
    c.name(key).onChange(() => style.sync());
    c.domElement.title = spec[spec.length - 1];
  }
  for (const s of o.closed || ['ground', 'face', 'atmosphere', 'light', 'hair', 'texture', 'palette']) folders[s]?.close();
  return { refresh, folders };
}
