// Demo: the engine (`anime-style`) + demo content (a procedural sample character, props).
import * as THREE from 'three';
import { AnimeStyle, AnimeStage, PRESETS } from 'anime-style';
import { createCharacter, CHARACTER_PRESETS } from './character/index.js';
import { createProps } from './props.js';
import { createPanel } from './panel.js';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');
if (capture) document.body.classList.add('capture');

const style = new AnimeStyle(PRESETS[q.get('preset')] ? q.get('preset') : 'skyPop');
const stage = new AnimeStage({
  style,
  container: document.getElementById('viewport'),
  aspect: 9 / 16,
  pixelRatio: capture ? 1 : Math.min(2, devicePixelRatio || 1),
});

// ------------------------------------------------------------------ scenes
const SCENES = {
  stand: { pose: q.get('pose') || 'stand', view: { yaw: 22, pitch: 3, fill: 0.74, anchor: 0.58 } },
  wave: { pose: 'wave', view: { yaw: -18, pitch: 3, fill: 0.74, anchor: 0.58 } },
  closeup: { pose: q.get('pose') || 'stand', camera: { target: [0, 1.42, 0], distance: 2.2, yaw: 18, pitch: 2, fov: 15, shiftY: 0 } },
  props: { pose: null, camera: { target: [0, 0.2, 0], distance: 4.6, yaw: 30, pitch: 14, fov: 22, shiftY: 0 } },
};

const state = {
  scene: SCENES[q.get('scene')] ? q.get('scene') : 'stand',
  character: CHARACTER_PRESETS[q.get('character')] ? q.get('character') : 'mio',
  animate: !capture,
};

let character = null;
let props = null;

function build() {
  for (const o of [character?.root, props]) if (o) stage.scene.remove(o);
  for (const m of [...style.materials]) if (m.name !== 'ground') m.dispose();
  const sc = SCENES[state.scene];

  if (sc.pose) {
    character = createCharacter(style, state.character);
    character.setPose(sc.pose);
    stage.scene.add(character.root);
  } else character = null;

  if (state.scene === 'props') {
    props = createProps(style);
    stage.scene.add(props);
  } else props = null;

  if (sc.view && character) stage.frameObject(character.root, { ...sc.view, fov: 17 });
  else stage.frame(sc.camera);
  stage.fitShadowTo(...[character?.root, props].filter(Boolean));
}

build();

// ------------------------------------------------------------------ panel
if (!capture) {
  createPanel({
    style,
    stage,
    scenes: Object.keys(SCENES),
    characters: Object.keys(CHARACTER_PRESETS),
    state,
    rebuild: build,
    getCharacter: () => character,
  });
}

// ------------------------------------------------------------------ loop
// deterministic frame hook used by scripts/render-video.mjs
window.__renderFrame = (t, dt) => {
  character?.update(dt, t);
  stage.renderAt(t, dt);
  return stage.canvas.toDataURL('image/png');
};
if (capture) {
  if (q.has('time')) stage.time = Number(q.get('time'));
  character?.update(0, stage.time);
  stage.render(0);
  stage.render(0);
  window.__ready = true;
} else {
  stage.start((dt, t) => {
    if (state.animate) character?.update(dt, t);
  });
  window.__ready = true;
}

// handy for debugging from the console
Object.assign(window, { THREE, style, stage, get character() { return character; } });
