# Anime Flat Style — 스타일 설명서

> **이 파일만 읽고 이 화풍을 재현할 수 있도록 쓴 문서입니다.**
> 엔진 코드: `src/anime-style/` (three.js 전용, 스타일만 들어 있음 — 캐릭터/소품 같은 콘텐츠 없음)
> 데모·예제: `index.html`(+`demo/`), `examples/model.html`, `examples/minimal.html`

---

## 0. AI를 위한 요약 (먼저 읽기)

```js
import * as THREE from 'three';
import { AnimeStyle, AnimeStage } from 'anime-style';      // = src/anime-style/index.js

const style = new AnimeStyle('skyPop');                     // 기본 화풍 (프리셋 이름 또는 파라미터 객체)
const stage = new AnimeStage({ style, container: document.body });  // 렌더러+카메라+광원+배경+바닥
stage.scene.add(model);
style.applyTo(model);                                       // glTF/VRM/직접 만든 메시 → 화풍 적용
stage.frameObject(model);                                   // 자동 프레이밍
stage.start((dt, t) => { /* 애니메이션 */ });
```

지켜야 할 규칙:

1. **엔진 파일(`src/anime-style/*`)은 고치지 말고 파라미터로 조절한다.** `style.set('outline.width', 2)`, `style.setParams({...})`, `style.usePreset('neonNight')`.
2. **모델은 `style.applyTo(root)` 한 번이면 된다.** 원본의 색·텍스처·알파는 유지되고, 조명/그림자/선만 화풍으로 바뀐다. 결과 표(`report`)를 확인하고, 재질 종류가 틀리면 `kinds` 규칙으로 고친다 (§4.3).
3. **매 프레임 `style.update(renderer, camera)`** (AnimeStage 사용 시 자동).
4. 화면 구성은 §1.3 연출 규칙을 따른다: 채도 높은 단색 배경 + 이음매 없는 바닥, 망원 렌즈, 넓은 여백, 3~5개의 큰 색면.
5. 결과는 직접 렌더링해서 확인한다: `node scripts/screenshot.mjs out.png "/examples/model.html" 736 1308` (§9).

---

## 1. 화풍 정의 (Look Bible)

참조 일러스트에서 측정한 값과, 엔진이 그걸 어떻게 재현하는지.

### 1.1 시각 규칙

| 요소 | 규칙 | 엔진 구현 / 기본값 |
|---|---|---|
| 음영 | **2톤**(밝음/그림자), 경계는 칼같이 끊김. 그라데이션·반사광·스페큘러 없음 | `shading.steps=2`, `softness=0.008`, half-lambert 임계값 `threshold=0.47` |
| 그림자 색 | 검게 하지 않는다. **원래 색의 채도를 올리고 명도를 조금 내린 색.** 흰색/회색은 **차가운 라벤더 블루** | HSV: 채도 += 남은 채도×0.36, 명도×0.93, 색상 250°로 4% 이동. 무채색은 `#c5d3f1` 곱 |
| 윤곽선 | **검정이 아니라 면 색보다 살짝 어둡고 진한 색(tinted line).** 얇고 균일 | 역(inverted) 헐 방식. 선 색 = 면 색(텍스처 포함, 픽셀 단위) 채도 +45%, 명도×0.8. 두께 1.5px / 캔버스 높이 1000px |
| 배경 | **채도 높은 단색**. 그라데이션·텍스처 없음. 바닥과 배경의 경계가 보이지 않음 | `background.color='#64aef0'`, 바닥 = 배경색, 그림자만 표시 |
| 얼굴 | 거의 항상 밝게. 그림자는 앞머리가 드리운 그림자와 턱 아래(목) 정도 | `face` 종류: 노멀을 얼굴 정면으로 85% 평탄화, 머리 본 추적 |
| 머리카락 | **뭉치 단위로 끊기는 음영 + 지그재그 하이라이트 띠(엔젤링)**, 띠는 머리 윗부분에만 | `hair` 종류: 이방성(Kajiya-Kay) 하이라이트를 임계값으로 끊고 뭉치별 지그재그 위상. 텍스처 결은 0.45배로 평탄화 |
| 깊이 | 피사체 뒤쪽(먼 다리, 뒤 소품)은 **배경색 쪽으로 옅어짐** | `atmosphere.strength=0.5`, 초점 뒤 0~0.6m |
| 디테일 | 최소화. 큰 색면과 깔끔한 실루엣이 핵심 | 텍스처 평탄화 `texture.detail`, 제한 팔레트 `palette.snap`(선택) |

### 1.2 참조에서 측정한 색 쌍 (엔진 공식 검증)

| 재질 | 밝은 면 | 참조 그림자 | 엔진이 파생한 그림자 |
|---|---|---|---|
| 흰 양말 | `#fefdf9` | `#b5c2de` | `#b6c3db` |
| 피부 | `#f6e2de` | `#ee9887` | `#e58d84` |
| 분홍 머리 | `#f5bfcc` | `#d87a9a` | `#e47294` |
| 파란 소품 | `#63b3fa` | `#3d86e8` | `#3b92e9` |
| 검은 셔츠 | `#1a1822` | `#141219` | `#120e20` |

배경 `#64aaf0 ~ #64b6f1` → 기본값 `#64aef0`. 흰색 위 선: 참조 `≈#8b9ac1`, 엔진 `#8b98ba`.
(값 재확인: `shadowOf('#f6e2de', style.params.shading)`, `lineOf(...)` — `color.js`)

### 1.3 연출 규칙 (장면을 만들 때)

- **배경**: 채도 높은 중명도 단색 하나. 바닥은 같은 색(이음매 없음), 그림자만 살짝.
- **카메라**: 망원(세로 FOV 15~25°)으로 원근 왜곡을 줄여 일러스트처럼. 인물은 화면 아래쪽, 위쪽은 넓은 여백.
- **팔레트**: 배경 1색 + 인물 주요색 2~4색. 배경과 보색/명도 대비가 나는 색을 인물에 배치해 "튀게".
- **광원**: 하나. 얼굴과 정면이 대부분 밝게 보이는 방향(카메라 기준 ±60° 이내, 고도 30~45°).
- **하지 말 것**: 검은 선, 부드러운 그라데이션 그림자, 포토리얼 텍스처, 여러 개의 광원, 배경 그라데이션/패턴, 블룸·DOF 같은 후처리.

---

## 2. 구조

```
src/anime-style/        ← 엔진(이 폴더만 복사하면 다른 프로젝트에서 사용 가능)
  index.js              공개 API
  AnimeStyle.js         파라미터·공유 유니폼·재질 생성·applyTo·프레임 업데이트
  shaders.js            셀 셰이더 / 윤곽선(헐) 셰이더 GLSL
  presets.js            DEFAULT_PARAMS(=참조 화풍), PARAM_SCHEMA(범위·설명), PRESETS
  color.js              그림자/선/하이라이트 색 파생(셰이더와 동일한 공식, sRGB)
  outline.js            헐 생성, 윤곽선용 스무스 노멀
  stage.js              AnimeStage: 렌더러+카메라+키라이트+바닥+프레이밍+영상 프레임
  gui.js                (선택) lil-gui에 모든 파라미터 슬라이더 자동 생성
demo/                   데모 전용 콘텐츠(코드로 만든 샘플 캐릭터, 소품, 패널)
examples/               minimal.html(최소 사용), model.html(glTF/VRM 적용), custom-loop.html(자체 렌더러/게임 루프)
scripts/                screenshot.mjs, render-video.mjs, fetch-sample-model.mjs, gen-param-table.mjs
```

의존성: `three`(필수, r180에서 검증). `lil-gui`, `@pixiv/three-vrm`은 데모/예제에서만 사용.

---

## 3. 새 프로젝트에서 쓰기

### 3.1 설치

```bash
npm i three            # r180 이상
cp -r <this-repo>/src/anime-style ./src/anime-style
```

Vite라면 `vite.config.js`에 별칭을 두면 `import ... from 'anime-style'`로 쓸 수 있다(이 저장소 설정과 동일).

```js
// vite.config.js
resolve: { alias: { 'anime-style': '/src/anime-style/index.js' } }
```

번들러 없이 쓸 때는 importmap으로 `three`와 `three/addons/`를 지정하고 상대 경로로 import 하면 된다.

### 3.2 가장 간단한 장면 (AnimeStage)

```js
import * as THREE from 'three';
import { AnimeStyle, AnimeStage } from 'anime-style';

const style = new AnimeStyle('skyPop');
const stage = new AnimeStage({ style, container: document.getElementById('app'), aspect: 9 / 16 });

// 직접 만든 메시: stylize = 셀 재질 + 틴티드 윤곽선
const ball = style.stylize(new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32)), { kind: 'prop', color: '#ffd166' });
ball.position.y = 0.2;
stage.scene.add(ball);

stage.frameObject(ball, { yaw: 25, pitch: 5, fill: 0.5 });
stage.start();
```

### 3.3 실제 모델 (glTF / VRM)

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';   // VRM이 아니면 생략 가능

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));
const gltf = await loader.loadAsync('/models/character.vrm');
const vrm = gltf.userData.vrm;
const root = vrm ? vrm.scene : gltf.scene;
if (vrm) VRMUtils.rotateVRM0(vrm);            // 모든 모델이 +Z를 보도록
stage.scene.add(root);

const report = style.applyTo(root, {
  headBone: vrm?.humanoid?.getRawBoneNode('head') ?? 'auto', // 얼굴 음영이 머리를 따라감
  forward: [0, 0, 1],                                          // 지금 모델이 바라보는 방향(월드)
  kinds: { 'Hair|Bangs': 'hair', 'Face|Brow|Eyeline|Mouth': 'face', 'Eye': 'eye' },  // 이름 규칙(정규식, 선택)
});
console.table(report);                         // mesh / material / kind / color / outline 확인

stage.frameObject(root, { yaw: 25, fill: 0.75, anchor: 0.6 });
stage.start((dt) => vrm?.update(dt));          // 스프링본/표정은 VRM 쪽에서
```

- 원본 재질에서 **색, 텍스처(map), opacity/transparent/alphaTest, side**를 읽는다. MToon(three-vrm)도 지원하며 MToon 자체 외곽선 패스는 숨기고 엔진 선을 쓴다.
- 반투명 재질(눈 하이라이트, 속눈썹 오버레이 등)은 윤곽선을 그리지 않는다. 알파 테스트(컷아웃) 재질은 선도 같이 잘린다.
- 재질 종류 추정이 틀리면 `kinds` 규칙이나 `map` 콜백으로 고친다:
  `map: (mesh, mat, guessed) => mat.name === 'Ribbon' ? { kind: 'cloth', color: '#ff5577' } : undefined`
- `examples/model.html`에서 파일을 끌어다 놓고 패널에서 재질 종류를 바꿔본 뒤 **"재질 매핑+파라미터 복사"**로 JSON을 받아 코드에 넣으면 된다.

### 3.4 게임 루프 / 자체 렌더러에 통합 (AnimeStage 없이)

```js
const style = new AnimeStyle('skyPop');
style.bindScene(scene);                                   // scene.background를 화풍과 동기화
renderer.shadowMap.enabled = true;                        // 캐스트 섀도를 쓸 때만
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const key = new THREE.DirectionalLight(0xffffff, 1);      // 그림자 전용(밝기는 셰이더가 결정)
key.castShadow = true;
scene.add(key, key.target);

style.applyTo(level);                                     // 레벨/캐릭터 전부
const floor = style.stylize(new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2)),
  { kind: 'ground', color: 'auto', followBackground: true });   // 배경색과 같은 바닥
scene.add(floor);

function tick(t, dt) {
  style.update(renderer, camera, { time: t, focusDistance: camera.position.distanceTo(player.position) });
  key.position.copy(player.position).addScaledVector(style.lightDirection, 10);   // 광원 방향 동기화
  key.target.position.copy(player.position);
  renderer.render(scene, camera);
}
```

- `focusDistance`는 원근 페이드 기준점(주인공까지의 거리). 기본 페이드 범위(`atmosphere.start/end` = 0~0.6m)는 **캐릭터 스케일**이다. 레벨처럼 큰 장면은 `style.setParams({ atmosphere: { start: 1.5, end: 9, strength: 0.4 } })`처럼 넓힌다(`examples/custom-loop.html`).
- 화면 크기가 바뀌어도 선 두께는 캔버스 높이에 비례해 유지된다(`update`가 해상도를 읽음).
- 런타임에 색 변경: `material.setColors({ color: '#ff8899' })` (그림자/선은 자동 재파생).

### 3.5 영상 만들기

모든 데모 페이지는 `window.__renderFrame(time, dt)`를 제공한다. 같은 방식으로 자기 페이지에도 넣으면 된다:

```js
window.__renderFrame = (t, dt) => {
  mixer?.update(dt);               // 애니메이션을 시간 t로
  stage.renderAt(t, dt);           // 결정적(deterministic) 렌더
  return stage.canvas.toDataURL('image/png');
};
```

```bash
node scripts/render-video.mjs out.mp4 "/examples/model.html" --seconds 4 --fps 30 --size 1080x1920
```

PNG 한 장: `stage.capture()` 또는 `node scripts/screenshot.mjs out.png "/경로?쿼리" 1080 1920`.

---

## 4. API

### 4.1 `new AnimeStyle(presetOrParams?)`

| 메서드 | 설명 |
|---|---|
| `params` | 현재 파라미터(평범한 JSON). 직접 바꾼 뒤 `sync()` 호출 가능 |
| `set(path, value)` / `get(path)` | `'shading.steps'`처럼 점 경로로 읽기/쓰기(자동 반영) |
| `setParams(partial)` | 부분 객체 깊은 병합 후 반영 |
| `usePreset(name \| params)` | 프리셋으로 전환(같은 객체를 유지하므로 UI 바인딩 안전) |
| `sync()` | `params` → 셰이더 유니폼/재질 반영 |
| `toJSON()` | 현재 파라미터 복사본(저장/공유용) |
| `onChange(fn)` | 파라미터 변경 콜백, 해제 함수 반환 |
| `createMaterial(opts)` | 셀 재질 생성(§4.2) |
| `stylize(mesh, opts)` | 메시에 셀 재질 + 윤곽선. `opts`는 createMaterial 옵션 + `outline`, `outlineWidth`, `castShadow`, `receiveShadow`, `material` |
| `applyTo(root, opts)` | 하위 모든 메시 변환, 결과 표 반환(§4.3) |
| `addOutline(mesh, {width})` / `removeOutline(mesh)` | 윤곽선만 붙이기/떼기 |
| `update(renderer, camera, {time, focusDistance})` | 매 프레임: 해상도·광원 방향·얼굴 추적·시간 |
| `lightDirection` | 광원 쪽을 향하는 월드 벡터(update 후 갱신) |
| `bindScene(scene)` | `scene.background` 동기화 |
| `AnimeStyle.presets` | 프리셋 이름 목록 |

### 4.2 `createMaterial(opts)` 옵션

| 옵션 | 기본 | 설명 |
|---|---|---|
| `kind` | `'default'` | 재질 종류(§5) |
| `color` | `'#ffffff'` | 밝은 면 색(sRGB hex). 텍스처가 있으면 곱해짐 |
| `shadow` / `shadow2` | 자동 | 그림자 색 / 3단계일 때 깊은 그림자 색을 직접 지정(아트 디렉팅) |
| `line` | 자동 | 윤곽선 색 직접 지정 |
| `highlight` | 자동 | 머리카락 하이라이트 띠 색 직접 지정 |
| `map` | – | 베이스 컬러 텍스처 |
| `opacity`, `transparent`, `alphaTest`, `depthWrite`, `side` | – | 일반 three.js와 동일 |
| `thresholdBias` | 종류별 | +면 더 밝게, −면 더 그늘지게(예: 목 −0.3) |
| `flatten`, `flattenAxis` | 0, `[0,0,1]` | 노멀을 축 방향으로 평탄화(얼굴 외에도 사용 가능) |
| `faceObject`, `faceForward` | – | 평탄화 축이 이 오브젝트(머리 본)를 따라가게 |
| `fade` | 1 | 원근 페이드 배율(0이면 페이드 안 함) |
| `rim`, `castMul`, `noLambert` | 1, 1, 0 | 림라이트 배율, 캐스트 섀도 배율, 1이면 조명 무시(평면 채색) |
| `textureDetail` / `textureDetailMul` | 종류별 | 텍스처 평탄화 절대값 / 배율 |
| `faceMap`, `faceRect` | – | (절차적 머리 전용) 얼굴 그림을 +Z 방향으로 투영 |

재질 메서드: `setColors({color, shadow, line, highlight})`, `trackFace(object, forwardWorld)`, `describe()` → `{base, shadow, line, hairHighlight}` hex.

### 4.3 `applyTo(root, opts)` 옵션

| 옵션 | 설명 |
|---|---|
| `kinds` | `{ '정규식': kind }` 이름 규칙(재질명+메시명에 대해, 내장 추정보다 먼저) |
| `kind` | 규칙에 안 걸린 모든 재질의 종류(지정 안 하면 이름으로 추정) |
| `map(mesh, mat, guessed)` | 재질별 옵션 객체 / `false`(건너뜀) / `undefined`(자동) |
| `headBone` | 얼굴이 따라갈 오브젝트, `'auto'`(이름에 head가 들어간 본), `null`(추적 안 함) |
| `forward` | 지금 모델이 보는 월드 방향(기본 `[0,0,1]`) |
| `outline`, `outlineWidth` | 윤곽선 끄기 / 두께 배율 |
| `outlineFromVertexColor` | 정점 색 R 채널을 선 두께로 사용(애니 모델 관례) |
| `castShadow`, `receiveShadow`, `useSourceShade` | 그림자 설정, MToon의 shade 색을 그림자 색으로 사용 |

이름 추정 규칙(대소문자 무시): `hair|bang|ahoge|ponytail|髪`→hair, `eyeline|lash|brow|mouth|teeth`→face, `eye|iris|pupil|highlight`→eye, `face|head`→face, `skin|body|arm|leg|hand`→skin, `cloth|top|shirt|skirt|pant|shoe|…`→cloth, 나머지 default.

### 4.4 `new AnimeStage(opts)`

옵션: `style`(필수), `container` 또는 `canvas`, `width`/`height`(고정 크기), `aspect`(예: `9/16` 고정), `pixelRatio`, `fov`(기본 22), `shadowMapSize`(2048).

| 멤버 | 설명 |
|---|---|
| `scene`, `camera`, `renderer`, `keyLight`, `ground`, `canvas` | three.js 객체 |
| `frame({target, distance, yaw, pitch, fov, shiftY})` | 궤도 카메라. `shiftY`>0이면 피사체가 아래로(위쪽 여백) |
| `frameObject(obj, {yaw, pitch, fill, anchor, fov})` | 바운딩 박스로 자동 프레이밍(`fill`=화면 높이 대비 크기, `anchor`=세로 위치) |
| `fitShadowTo(...objs)` | 그림자 카메라를 물체에 맞춤 |
| `start(onFrame)` / `stop()` / `render(dt)` | 렌더 루프 |
| `renderAt(time, dt)` | 영상용 결정적 렌더 |
| `capture()` | PNG data URL |

### 4.5 기타

- `addStyleControls(gui, style, {presets, closed})` — lil-gui에 전체 파라미터 패널 생성(스키마 기반).
- 색 유틸: `shadowOf(color, params.shading)`, `lineOf(color, params.outline)`, `highlightOf(color, amount)`, `toneShift`, `toHex`, `toRGB`.
- `prepareHairAttributes(geometry)`, `findHeadBone(skinnedMesh)`, `computeOutlineNormals(geometry)`.

---

## 5. 재질 종류 (kind)

| kind | 용도 | 기본 동작 |
|---|---|---|
| `default` / `cloth` / `prop` | 옷, 소품, 건물 | 2톤 셀 + 선 |
| `skin` | 피부 | 살짝 더 밝게(`thresholdBias +0.04`) |
| `face` | 얼굴 피부, 얼굴 위 오버레이(눈썹·아이라인·입) | 노멀 평탄화 `face.flatten`, 머리 본 추적, 텍스처 디테일 유지 |
| `hair` | 머리카락 | 뭉치 음영 + 지그재그 하이라이트 띠, 텍스처 결 0.45배 평탄화. 필요한 정점 데이터가 없으면 자동 추정(§7) |
| `eye` | 눈동자, 흰자, 눈 하이라이트 | 조명 무시(평면), 선 없음, 디테일 유지 |
| `flat` | 로고, 발광체, UI성 물체 | 조명 무시, 캐스트 섀도만 |
| `ground` | 바닥 | 배경색과 동일, 캐스트 섀도만(`ground.shadowStrength`) |

---

## 6. 파라미터 레퍼런스

진짜 기본값은 `src/anime-style/presets.js`의 `DEFAULT_PARAMS`이며 이것이 곧 참조 화풍이다. 범위/설명 원본은 `PARAM_SCHEMA` (`node scripts/gen-param-table.mjs`로 표 재생성).

### background / ground
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `background.color` | `#64aef0` | 배경 단색. **채도 높고 중간 밝기**가 핵심(너무 어두우면 다른 화풍이 됨) |
| `ground.visible` | `true` | 그림자를 받는 이음매 없는 바닥 |
| `ground.color` | `'auto'` | `'auto'` = 배경색. 다른 색이면 지평선이 생김 |
| `ground.shadowStrength` | `0.6` | 바닥 그림자 진하기(0이면 그림자 없음) |

### light
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `light.azimuth` | `50` | 수평 각도(°). 0=카메라 쪽, +90=화면 오른쪽 |
| `light.elevation` | `35` | 높이(°) |
| `light.followCamera` | `true` | 카메라 기준 방향(카메라가 돌아도 같은 쪽이 밝음). false면 월드 +Z 기준 |
| `light.castShadows` | `true` | 앞머리→얼굴, 몸→바닥 그림자 |
| `light.shadowSoftness` | `0.12` | 캐스트 섀도 경계를 임계 처리하기 전 폭(작을수록 딱딱) |

### shading
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `steps` | `2` | 톤 수. 1=평면 채색(그림자만), 2=참조 화풍, 3=명/암/깊은암 |
| `threshold` | `0.47` | 그림자 경계 위치. ↑ 그림자 면적 증가 |
| `softness` | `0.008` | 톤 경계 흐림. 0.03 이상이면 부드러운(다른) 화풍 |
| `stepSpread` | `0.2` | 3단계일 때 두 경계 사이 간격 |
| `shadowSaturation` | `0.36` | 그림자 채도 증가량(남은 채도 대비). ↑ 진하고 선명한 그림자 |
| `shadowValue` | `0.93` | 그림자 명도 배율. ↓ 대비 강해짐 |
| `shadowHue` / `shadowHueShift` | `250` / `0.04` | 그림자가 기우는 색상과 정도(차갑게=200~260, 따뜻하게=0~40) |
| `shadowTint` | `#c5d3f1` | 흰/회/검정 표면의 그림자 곱 색(참조: 차가운 라벤더) |
| `castStrength` | `1` | 물체가 받는 캐스트 섀도 세기 |
| `highlightStrength` / `Threshold` / `Lighten` | `0` / `0.93` / `0.35` | (선택) 밝은 면 위 3번째 밝은 톤 |
| `rimStrength` / `rimWidth` / `rimColor` | `0` / `0.22` / `#fff` | (선택) 평면 림라이트. 참조 화풍에선 끔 |

### outline
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `enabled` | `true` | 윤곽선 표시 |
| `width` | `1.5` | 캔버스 높이 1000px 기준 픽셀 두께(해상도 비례) |
| `saturation` | `0.45` | 선 채도 증가량(면 색 대비) |
| `value` | `0.8` | 선 명도 배율. ↓ 진한 선(0.55 정도면 TV 애니 느낌) |
| `hue` / `hueShift` | `345` / `0.06` | 선 색상이 기우는 방향(붉은 기) |
| `tint` | `#aec0ee` | 흰/회색 면의 선 곱 색(푸른 회색 선) |
| `color` / `fixedMix` | `#1b1726` / `0` | 고정 선 색과 혼합량. 1이면 고전적인 단색(검정) 선 |
| `depthAttenuation` | `0.5` | 멀리 있는 물체 선을 가늘게 |
| `zOffset` | `0.004` | 헐을 뒤로 미는 거리(m). 선이 표면을 뚫고 나오면 ↑ |

### hair
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `highlightStrength` | `1` | 하이라이트 띠 불투명도(0=끔) |
| `highlightThreshold` | `0.9` | ↑ 띠가 가늘어짐 |
| `highlightShift` | `-0.32` | 띠 위치(음수=정수리 쪽, 양수=끝 쪽) |
| `highlightJag` / `highlightJagFrequency` | `0.22` / `2` | 띠 가장자리 지그재그 크기 / 뭉치당 톱니 수 |
| `highlightSoftness` | `0.012` | 띠 경계 흐림 |
| `highlightPower` | `18` | 이방성 지수(띠의 선명도) |
| `highlightLighten` | `0.4` | 띠 색 = 머리색을 흰색 쪽으로 이만큼 |
| `sway` | `0` | 물리 없는 머리카락용 셰이더 흔들림(VRM 스프링본 등 물리가 있으면 0 유지) |

### face / texture / palette / atmosphere
| 키 | 기본 | 의미 · 튜닝 |
|---|---|---|
| `face.flatten` | `0.85` | 얼굴 노멀 평탄화. 1=항상 밝음, 0=일반 음영 |
| `texture.detail` | `1` | 텍스처 디테일 유지량. 0.3~0.6이면 손그림 텍스처가 큰 색면으로(머리카락은 ×0.45) |
| `texture.blur` | `4` | 평탄화 정도(밉맵 단계) |
| `palette.snap` | `0` | 0~1, 최종 색을 팔레트의 가장 가까운 색으로 |
| `palette.colors` | `[]` | 최대 16색 hex 배열 |
| `atmosphere.strength` | `0.5` | 초점 뒤쪽이 배경색으로 옅어지는 최대량 |
| `atmosphere.start` / `end` | `0` / `0.6` | 초점 뒤 페이드 시작/끝 거리(m). 장면 스케일에 맞춰 조절 |
| `atmosphere.color` | `'auto'` | `'auto'`=배경색 |

---

## 7. 머리카락 / 얼굴 데이터 규약

**머리카락(`kind: 'hair'`)** 셰이더는 정점 속성 3개를 쓴다. 없으면 `applyTo`가 `prepareHairAttributes()`로 추정한다(정수리에서 방사형으로 내려가는 결, 연결된 조각=한 뭉치).

| 속성 | 타입 | 의미 |
|---|---|---|
| `hairTangent` | vec3 | 머리 결 방향(뿌리→끝), 지오메트리 공간. 스킨드 메시면 스키닝 적용됨 |
| `hairUV` | vec2 | x = 결을 가로지르는 좌표(지그재그 위상), y = 정수리 0 → 끝 1 (y > 0.3이면 띠 없음) |
| `hairSeed` | float | 뭉치마다 다른 난수(뭉치별로 띠가 끊기는 이유) |

직접 만든 머리카락이면 이 값을 넣어주면 가장 깔끔하다(`demo/character/hair.js` 참고). 선 두께를 정점별로 바꾸려면 `outlineWidth`(float, 1=기본) 속성을 넣는다(머리 끝에서 가늘게).

**얼굴(`kind: 'face'`)**: 노멀을 얼굴 정면으로 `face.flatten`만큼 평탄화한다. 스킨드 모델은 `applyTo`가 머리 본을 찾아 정면 방향을 매 프레임 추적한다. 얼굴이 어둡게 나오면 `forward`가 실제 모델 정면과 맞는지 확인.

---

## 8. 비슷한 다른 스타일 만들기

프리셋(`style.usePreset(name)`):

| 이름 | 느낌 | 핵심 차이 |
|---|---|---|
| `skyPop` | **참조 화풍(기본)** | 하늘색 배경, 차가운 그림자, 부드러운 틴티드 선 |
| `sunsetCoral` | 노을 | 코랄 배경, 그림자가 보라·핑크로, 선 조금 굵게 |
| `mintSoda` | 청량 | 민트 배경, 옅은 그림자, 가는 선 |
| `neonNight` | 밤 | 남색 배경, 3톤, 시안 림라이트, 진한 선 |
| `classicInk` | TV 애니 | 노랑 배경, 거의 검은 단색 선(`fixedMix 0.85`), 굵은 선 |
| `posterFlat` | 포스터/벡터 | 선 없음, 3톤 |

직접 만들 때 손대는 순서: **배경색 → 그림자 틴트/색상(`shadowTint`, `shadowHue`) → 선 진하기(`outline.value`, `fixedMix`) → 톤 수(`steps`) → 선 두께**. 예:

```js
style.setParams({
  background: { color: '#ffb84d' },                      // 오렌지 배경
  shading: { shadowTint: '#d9c2e8', shadowHue: 290, shadowHueShift: 0.1 },  // 보랏빛 그림자
  outline: { width: 2.2, value: 0.6 },                   // 굵고 진한 선
});
console.log(JSON.stringify(style.toJSON()));             // 새 프리셋으로 저장
```

새 프리셋은 `presets.js`의 `PRESETS`에 부분 객체로 추가한다(엔진 다른 부분은 손대지 않음).

---

## 9. 검증 / 확인 방법

```bash
npm install
node scripts/fetch-sample-model.mjs        # 무료 샘플 VRM(pixiv, VRM Public License 1.0) → public/models/
npm run dev                                # http://localhost:5173 (데모), /examples/model.html, /examples/minimal.html
node scripts/screenshot.mjs shot.png "/examples/model.html?preset=skyPop" 736 1308
node scripts/screenshot.mjs face.png "/examples/model.html?head=1" 600 800
```

`examples/model.html` 쿼리: `url`(모델 경로), `preset`, `params`(JSON), `kinds`(JSON), `yaw`, `pitch`, `fill`, `anchor`, `fov`, `head`(얼굴 클로즈업), `capture`(패널 숨김).

체크리스트 — 렌더 결과가 이 화풍인지:
- [ ] 그림자가 1단계로 딱 끊기고 그라데이션이 거의 없다
- [ ] 흰 면의 그림자가 회색이 아니라 **푸른 라벤더**다, 피부 그림자는 **따뜻한 연어색**이다
- [ ] 선이 검정이 아니라 **면 색 계열**이고 얇다
- [ ] 얼굴이 거의 전부 밝다(목 아래만 그늘)
- [ ] 머리카락에 뭉치별로 끊기는 음영과 지그재그 띠가 머리 윗부분에 있다
- [ ] 배경은 단색이고 바닥과의 경계가 보이지 않는다
- [ ] 뒤쪽 물체가 배경색 쪽으로 살짝 옅다

## 10. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 선이 끊기거나 모서리에서 벌어짐 | 하드 엣지 메시. `applyTo`/`stylize`가 자동으로 `outlineNormal`을 만들지만, 지오메트리를 나중에 바꿨다면 `computeOutlineNormals(geo, {force:true})` |
| 선이 표면 위에 비쳐 보임 | `outline.zOffset` ↑ (장면 스케일이 크면 특히) |
| 선이 너무 굵거나 가늘다 | `outline.width`는 캔버스 높이 1000px 기준. 멀리 있는 물체는 `depthAttenuation` |
| 얼굴에 이상한 그림자 | 재질이 `face` 종류인지(`report` 확인), `forward`가 맞는지, `face.flatten` ↑, 앞머리 그림자가 싫으면 그 재질에 `castMul: 0` |
| 머리 하이라이트가 안 보임/이상한 위치 | 재질이 `hair`인지 확인, `hair.highlightShift`로 위치, `highlightThreshold`로 두께 조절 |
| 반투명 부분에 네모난 선 | 해당 재질 `outline: false` (map 콜백) — 반투명은 기본으로 선이 꺼져 있음 |
| 텍스처 결이 너무 많아 일러스트 같지 않음 | `texture.detail` 0.3~0.6 |
| 색이 원본과 미묘하게 다름 | 모든 계산은 sRGB. 원본 텍스처의 colorSpace가 sRGB면 자동 변환됨 |
| 그림자가 지글거림 | `light.shadowSoftness` ↑, `stage.fitShadowTo(대상)`으로 그림자 범위를 좁힘 |

## 11. 기술 선택

- **three.js (WebGL2)**: 웹 3D 표준, glTF/VRM 로더 생태계, 커스텀 셰이더 자유도.
- **커스텀 ShaderMaterial(셀) + 역 헐 윤곽선**: 후처리 없이 재질 단위로 동작 → 어느 렌더러/게임 루프에도 그대로 들어가고, 선 색을 재질(텍스처 픽셀)별로 정할 수 있어 "틴티드 라인"이 정확하다.
- **모든 색 계산을 sRGB HSV에서**: 팔레트 hex 값이 화면에 그대로 나오고, 그림자/선 규칙을 사람이 이해할 수 있는 "채도↑·명도↓·색상 이동"으로 표현 가능.
- **파라미터 = JSON**: 저장/공유/프리셋/AI 수정이 쉬움. 스키마에서 UI 자동 생성.
- **Vite + Playwright(헤드리스 Chromium/SwiftShader)**: 개발 서버와 자동 스크린샷·영상 렌더.
