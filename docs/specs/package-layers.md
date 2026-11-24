# 패키지 역할 층 · 경계 규칙

목업(playground)도 패키지 경계를 지킨다. 층 표는 `tests/architecture/package-layers.json` 이 정본이고,
`pnpm test:arch` (`tests/architecture/package-boundaries.test.mjs`)가 코드가 그것을 지키는지 검사한다.

## 층

| 층 | 역할 | 패키지 |
|---|---|---|
| foundation | 순수 기반 (형식 · React 모름) | `vault-core` · `style-core` · `selection-core` · `harness-packs`(데이터) |
| schema | 문서 모델 · 순수 편집 연산 | `vdoc-schema` |
| domain | 도메인 엔진 · 상태 (React 모름) | `vault-formats` · `outline-sync` · `canvas-state` · `ai-scope` · `ai-kernel` |
| ui | 화면 컴포넌트 | `slot-editor` · `slot-canvas` · `file-explorer` · `markdown-editor` · `ref-canvas` · `workspace-layout` · `outliner`(외부) · `ai-react` · `ai-composer` · `ai-inline` · `agent-core` |
| adapter | AI ↔ 볼트 문서 잇기 | `ai-vault` |
| app | 조립 · 배선만 | `studio` · `playground` |

`ui` 패키지의 순수 입구(`file-explorer/core` · `ref-canvas/core` · `workspace-layout/core` · `outliner/core|dto`)는 domain 으로 친다.

## 규칙 (검사함)

1. 낮은 층은 높은 층을 import 하지 않는다.
2. 쓰는 `@vibe/*` 는 package.json 에 선언하고, 선언한 것은 실제로 쓴다.
3. `ai` 태그 패키지(`ai-*`)는 어댑터 · 앱 · AI 패키지만 import 한다 — 캔버스 · 탐색기 같은 화면은 AI 를 모른다.
4. foundation · schema · domain 은 React 를 import 하지 않는다.
5. 패키지는 자기 폴더 밖 상대 경로 · 앱을 import 하지 않는다. 앱은 패키지 내부 경로(`@vibe/x/src/…`)를 쓰지 않는다.
6. 앱 목업은 볼트 파일 형식을 직접 파싱하지 않는다 (`JSON.parse(vault.read(…))` 금지 → `@vibe/vault-formats`).

새 패키지는 층 표에 역할을 적어야 검사를 통과한다.

## 이번에 옮긴 것 (playground `v2-ide/model` → 패키지)

| 전 | 후 |
|---|---|
| `vdocCodec` · `outlineCodec` · `assetCodec` · `settingsRegistry`(형식 부분) · 인스펙터 스타일 목록 | `@vibe/vault-formats` (+ 경로별 문서 캐시 `createVDocStore` · 구조 공유) |
| `outlineVDocBridge` · `outlineRevealBus` | `@vibe/outline-sync` |
| `vdocUiBridge` | `@vibe/canvas-state` (+ 다중 선택 · `describeCanvasSelection`) |
| `ai/scope.ts` (studio 사본) · studio `entities/ai-scope/model/scope.ts` | `@vibe/ai-scope` (한 벌) |
| `ai/v2Ai*` · `assetAiClient` | `@vibe/ai-vault` |
| `vdocInspectorModel`(블록 변환 · 프리셋) | `@vibe/vdoc-schema` `inspector-presets` |
| (신규) 다중 선택 모델 · 마키 적중 | `@vibe/selection-core` |
| (신규) 마키 훅 · 오버레이 | `@vibe/slot-canvas` `useMarqueeSelection` |

앱에 남긴 것: 화면 조립(`editorAdapters` · `useIdeWorkbench`) · 목업 데이터(`sampleVault` · `sampleProposalVDoc`) · 백엔드 클라이언트(`refClient` · `localVaultMount`) ·
패키지 사이 배선(`outlineFileHost`) · 화면 투영(`vdocStructure`) · 설정 화면 레지스트리(`settingsSectionRegistry`).

## 다중 선택 (화면 공통 규칙 — `@vibe/selection-core`)

- 클릭 = 하나, Ctrl/⌘+클릭 = 토글, Shift+클릭 = 범위(읽는 순서), Ctrl+Shift = 범위 더하기, Esc = 해제, Ctrl/⌘+A = 전부.
- 캔버스: 빈 곳에서 끌면 마키(Alt = 완전히 들어온 것만, Shift/Ctrl = 더하기). 디자인 모드 Ctrl+클릭은 칸, 구조 모드는 최상위 블록. 표 안 Shift 는 표 칸 범위(표가 처리).
- 구조 모드 Delete = 고른 블록 지우기 (잠긴 블록 제외). 인스펙터는 여러 개일 때 공통 속성(블록 종류 레지스트리 `editableProps`)과 일괄 잠금 · 숨기기 · 지우기 · AI 첨부.
- 탐색기: Ctrl/⌘+클릭 = 토글 (예전: 새 탭), 새 탭은 Alt+클릭 · 가운데 클릭.
- 구조 패널(장면 트리) · 아웃라인 불릿도 같은 규칙.

## Composer 연계

- 캔버스 여러 개 → "현재 선택" 첨부 후보가 `slot-range` 하나 (범위 = 고른 칸 · 블록), 작업대 페이로드 `selection`(칸) · `selectionBlocks`(블록).
- 탐색기 여러 파일 → "탐색기에서 고른 파일" 첨부 후보. 아웃라인 불릿 → "선택한 글" 후보 (`outline-nodes`).
- 에이전트 핸들 `canvas.select {slotIds, blockIds}` — 여러 칸 · 블록을 캔버스에서 함께 가리킨다 (범위 밖 · 없는 것은 건너뛰고 알린다).

## 성능 측정

`pnpm perf:v2` (`scripts/v2_perf.py`, 헤드리스 Chrome 1920×1080, 메모리 볼트 · 20쪽 문서). API(8090)를 끈 상태로 잰다.
기계 부하에 따라 실행 간 2~5배 흔들리므로 같은 세션의 중앙값끼리만 비교한다.
