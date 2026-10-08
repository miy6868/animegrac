// Apply the style to a real model: drop a .glb/.gltf/.vrm, or ?url=/models/sample.vrm
// Run `node scripts/fetch-sample-model.mjs` once to get the free sample avatar.
import * as THREE from 'three';
import GUI from 'lil-gui';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { AnimeStyle, AnimeStage, addStyleControls, MATERIAL_KINDS } from 'anime-style';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');
if (capture) document.body.classList.add('capture');
const status = (t) => (document.getElementById('status').textContent = t);

const style = new AnimeStyle(q.get('preset') || 'skyPop');
if (q.get('params')) style.setParams(JSON.parse(q.get('params')));
const stage = new AnimeStage({
  style,
  container: document.getElementById('viewport'),
  aspect: Number(q.get('aspect')) || 9 / 16,
  pixelRatio: capture ? 1 : Math.min(2, devicePixelRatio || 1),
});

const view = {
  yaw: Number(q.get('yaw') ?? 28),
  pitch: Number(q.get('pitch') ?? 2),
  fill: Number(q.get('fill') ?? 0.72),
  anchor: Number(q.get('anchor') ?? 0.6),
  fov: Number(q.get('fov') ?? 16),
  zoomHead: q.has('head'),
};
const kindOverrides = q.get('kinds') ? JSON.parse(q.get('kinds')) : {};
let current = null; // { root, vrm, report, source }

async function load(source) {
  status('loading…');
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, '');
  if (current) stage.scene.remove(current.root);

  const vrm = gltf.userData.vrm;
  const root = vrm ? vrm.scene : gltf.scene;
  if (vrm) {
    VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z; make everything face +Z
    relaxPose(vrm);
    vrm.update(0);
  }
  stage.scene.add(root);
  root.updateMatrixWorld(true);

  // ---- the one call that matters
  const report = style.applyTo(root, {
    headBone: vrm?.humanoid?.getRawBoneNode('head') || 'auto',
    forward: [0, 0, 1],
    map: (mesh, m, guessed) => (kindOverrides[m.name] ? { kind: kindOverrides[m.name] } : undefined),
  });
  console.table(report);

  vrm?.springBoneManager?.reset(); // the model was moved: restart hair/cloth physics at rest
  current = { root, vrm, report, source };
  frame();
  buildMaterialFolder();
  status(`${report.length} materials styled · ${vrm ? 'VRM' : 'glTF'}`);
  window.__ready = true;
}

function relaxPose(vrm) {
  const h = vrm.humanoid;
  const set = (name, x, y, z) => {
    const b = h.getNormalizedBoneNode(name);
    if (b) b.rotation.set(x, y, z);
  };
  set('leftUpperArm', 0, 0, -1.2);
  set('rightUpperArm', 0, 0, 1.2);
  set('leftLowerArm', 0, -0.25, 0);
  set('rightLowerArm', 0, 0.25, 0);
  set('head', -0.05, 0.12, 0);
  set('spine', 0.03, 0, 0);
}

function frame() {
  if (!current) return;
  const head = current.vrm?.humanoid?.getRawBoneNode('head');
  if (view.zoomHead && head) {
    const p = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
    stage.frame({ target: p, distance: 1.6, yaw: view.yaw, pitch: view.pitch, fov: view.fov, shiftY: 0 });
    stage.fitShadowTo(current.root);
  } else {
    stage.frameObject(current.root, { yaw: view.yaw, pitch: view.pitch, fill: view.fill, anchor: view.anchor, fov: view.fov });
  }
}

// ---------------------------------------------------------------- UI
let gui = null;
let matFolder = null;
if (!capture) {
  gui = new GUI({ container: document.getElementById('panel'), title: 'Anime Style · Model' });
  const actions = {
    open() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.glb,.gltf,.vrm';
      input.onchange = async () => input.files[0] && load(await input.files[0].arrayBuffer());
      input.click();
    },
    sample() {
      load('/models/sample.vrm');
    },
    savePNG() {
      const a = document.createElement('a');
      a.href = stage.capture();
      a.download = 'anime-style-model.png';
      a.click();
    },
    copyMapping() {
      const json = JSON.stringify({ kinds: Object.fromEntries(current.report.filter((r) => r.material).map((r) => [r.material, r.kind])), params: style.toJSON() }, null, 2);
      navigator.clipboard?.writeText(json);
      console.log(json);
    },
  };
  gui.add(actions, 'open').name('모델 열기 (.glb/.vrm)');
  gui.add(actions, 'sample').name('샘플 VRM 불러오기');
  gui.add(actions, 'savePNG').name('PNG 저장');
  gui.add(actions, 'copyMapping').name('재질 매핑+파라미터 복사');
  const cam = gui.addFolder('Camera 카메라');
  cam.add(view, 'yaw', -180, 180, 1).onChange(frame);
  cam.add(view, 'pitch', -30, 60, 1).onChange(frame);
  cam.add(view, 'fill', 0.2, 1.2, 0.01).onChange(frame);
  cam.add(view, 'anchor', 0.2, 0.9, 0.01).onChange(frame);
  cam.add(view, 'fov', 8, 60, 1).onChange(frame);
  cam.add(view, 'zoomHead').name('head close-up').onChange(frame);
  cam.close();
  addStyleControls(gui, style);
}

function buildMaterialFolder() {
  if (!gui || !current) return;
  matFolder?.destroy();
  matFolder = gui.addFolder('Materials 재질 종류');
  const kinds = Object.keys(MATERIAL_KINDS).filter((k) => k !== 'ground');
  for (const row of current.report) {
    if (!row.material || row.kind.startsWith('source')) continue;
    const obj = { kind: row.kind };
    matFolder
      .add(obj, 'kind', kinds)
      .name(row.material)
      .onChange((k) => {
        kindOverrides[row.material] = k;
        load(current.source); // kinds change shader defines -> rebuild
      });
  }
}

// drag & drop
addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
addEventListener('dragleave', () => document.body.classList.remove('dragging'));
addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (f) load(await f.arrayBuffer());
});

// ---------------------------------------------------------------- loop
// a little life for VRM models: breathing, head drift, blinking (+ spring bones in vrm.update)
const idle = { blinkAt: 2 };
stage._onFrame = (dt, t) => {
  const vrm = current?.vrm;
  if (!vrm) return;
  const chest = vrm.humanoid.getNormalizedBoneNode('chest') || vrm.humanoid.getNormalizedBoneNode('spine');
  if (chest) chest.rotation.x = (chest.userData.baseX ??= chest.rotation.x) + Math.sin(t * 2.1) * 0.012;
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  if (head) {
    head.userData.base ??= head.rotation.clone();
    head.rotation.set(head.userData.base.x + Math.sin(t * 0.7) * 0.02, head.userData.base.y + Math.sin(t * 0.43) * 0.035, head.userData.base.z);
  }
  const blinkT = (t % 4) - idle.blinkAt; // one blink every 4s
  vrm.expressionManager?.setValue('blink', blinkT > 0 && blinkT < 0.15 ? Math.sin((blinkT / 0.15) * Math.PI) : 0);
  vrm.update(dt);
};
// deterministic frame hook used by scripts/render-video.mjs
window.__renderFrame = (t, dt) => {
  stage.renderAt(t, dt);
  return stage.canvas.toDataURL('image/png');
};
const url = q.get('url') || '/models/sample.vrm';
load(url)
  .then(() => {
    if (capture) {
      for (let i = 0; i < 90; i++) current?.vrm?.update(1 / 30); // let spring bones settle
      stage.render(0);
    } else stage.start(stage._onFrame);
  })
  .catch((e) => {
    status(`load failed: ${e.message} — run "node scripts/fetch-sample-model.mjs" or drop a model`);
    console.error(e);
    window.__ready = true;
    if (!capture) stage.start();
  });
Object.assign(window, { THREE, style, stage, get model() { return current; } });
