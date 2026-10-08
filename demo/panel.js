// Live control panel. Style sliders are generated from PARAM_SCHEMA, so any
// parameter added to the engine shows up here automatically.
import GUI from 'lil-gui';
import { PRESETS, addStyleControls } from 'anime-style';
import { POSES } from './character/index.js';

export function createPanel({ style, stage, scenes, characters, state, rebuild, getCharacter }) {
  const gui = new GUI({ container: document.getElementById('panel'), title: 'Anime Flat Style' });
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());

  // ---- top
  const top = {
    preset: 'skyPop',
    scene: state.scene,
    character: state.character,
    pose: '',
    animate: state.animate,
    savePNG() {
      const a = document.createElement('a');
      a.href = stage.capture();
      a.download = `anime-style-${top.preset}.png`;
      a.click();
    },
    copyParams() {
      const json = JSON.stringify(style.toJSON(), null, 2);
      navigator.clipboard?.writeText(json);
      console.log(json);
      alert('Style params copied to the clipboard (also printed in the console).');
    },
    resetPreset() {
      style.usePreset(top.preset);
      refresh();
    },
  };
  gui.add(top, 'preset', Object.keys(PRESETS)).name('프리셋 Preset').onChange((n) => {
    style.usePreset(n);
    refresh();
  });
  gui.add(top, 'scene', scenes).name('예제 씬 Scene').onChange((v) => {
    state.scene = v;
    rebuild();
    buildCharacterFolder();
  });
  gui.add(top, 'character', characters).name('캐릭터 Character').onChange((v) => {
    state.character = v;
    rebuild();
    buildCharacterFolder();
  });
  gui.add(top, 'pose', ['', ...Object.keys(POSES)]).name('포즈 Pose').onChange((v) => v && getCharacter()?.setPose(v));
  gui.add(top, 'animate').name('애니메이션 Idle').onChange((v) => (state.animate = v));
  gui.add(top, 'savePNG').name('PNG 저장');
  gui.add(top, 'copyParams').name('파라미터 JSON 복사');
  gui.add(top, 'resetPreset').name('프리셋으로 리셋');

  // ---- style params (generated from the engine's PARAM_SCHEMA)
  addStyleControls(gui, style, { presets: false });

  // ---- character (colors + face) — rebuilt when the character changes
  let charFolder = null;
  function buildCharacterFolder() {
    charFolder?.destroy();
    const ch = getCharacter();
    if (!ch) return;
    charFolder = gui.addFolder('캐릭터 색 / 표정 Character');
    const colors = {};
    for (const [k, v] of Object.entries(ch.design.palette)) {
      colors[k] = typeof v === 'string' ? v : v.color;
      charFolder.addColor(colors, k).onChange((c) => ch.setPalette({ [k]: { ...(typeof v === 'string' ? {} : v), color: c, shadow: undefined } }));
    }
    const face = { expression: ch.design.face.expression || 'neutral', lookX: 0, lookY: 0, blush: ch.design.face.blush ?? 0.35 };
    charFolder.add(face, 'expression', ['neutral', 'smile', 'open', 'pout']).onChange((e) => ch.setExpression({ expression: e }));
    charFolder.add(face, 'lookX', -1, 1, 0.01).onChange((v) => ch.setExpression({ lookX: v }));
    charFolder.add(face, 'lookY', -1, 1, 0.01).onChange((v) => ch.setExpression({ lookY: v }));
    charFolder.add(face, 'blush', 0, 1, 0.01).onChange((v) => ch.setExpression({ blush: v }));
    charFolder.close();
  }
  buildCharacterFolder();
  return gui;
}
