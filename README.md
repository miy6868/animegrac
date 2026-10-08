# animegrac — Anime Flat Style engine (three.js)

채도 높은 단색 배경, 1~2단계로 딱 끊기는 셀 음영, 면 색 기반의 얇은 틴티드 윤곽선,
뭉치 단위 머리카락 음영 + 하이라이트 띠 — 이 **화풍**을 웹 3D에서 재사용하기 위한 스타일 엔진입니다.

- **엔진**: [`src/anime-style/`](src/anime-style/) — 스타일만 담김(셰이더, 파라미터, 프리셋, 스테이지). 폴더째 복사해서 사용.
- **사용 설명서**: [`STYLE.md`](STYLE.md) — 화풍 규칙, 파라미터, 새 프로젝트 예제 코드. AI는 이 파일만 읽으면 됨.

```js
import { AnimeStyle, AnimeStage } from 'anime-style';
const style = new AnimeStyle('skyPop');
const stage = new AnimeStage({ style, container: document.body });
stage.scene.add(model);
style.applyTo(model);          // glTF / VRM / 직접 만든 메시
stage.frameObject(model);
stage.start();
```

## 실행

```bash
npm install
node scripts/fetch-sample-model.mjs   # 무료 샘플 VRM (pixiv, VRM Public License 1.0) → public/models/
npm run dev
```

| 페이지 | 내용 |
|---|---|
| `/` | 실시간 조절 패널 + 예제 씬(코드로 만든 샘플 캐릭터, 소품) |
| `/examples/model.html` | 내 모델(.glb/.gltf/.vrm) 드래그&드롭 → 화풍 적용, 재질 종류 조정, 매핑/파라미터 JSON 복사 |
| `/examples/minimal.html` | 최소 사용 예 |
| `/examples/custom-loop.html` | AnimeStage 없이 자체 렌더러/게임 루프에 통합 |

## 스크립트

```bash
node scripts/screenshot.mjs out.png "/examples/model.html?preset=sunsetCoral" 736 1308   # 헤드리스 렌더
node scripts/render-video.mjs out.mp4 "/examples/model.html" --seconds 4 --fps 30 --size 1080x1920
node scripts/gen-param-table.mjs                                                          # 파라미터 표
```
