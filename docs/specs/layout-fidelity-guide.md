# 작업 가이드 — 가져온 문서의 레이아웃 일치도 개선 (docstruct → vdoc → 화면)

- 작성일: 2026-11-12 · 기준 브랜치 `bigbang-patch-by-mang`
- 선행 조건: **파싱 모듈 단일화(통합) 작업이 끝난 뒤 착수한다.** 이 가이드가 고치는 파일(`tables/props.py`, `compile/docstruct_vdoc.py`, `verify/*`, `blocks/*`)을 통합 작업이 지금 고치고 있다.
- 읽는 사람: 이 작업을 맡는 코딩 에이전트. **§0 과 §2(점검 체계)를 먼저 읽는다.**
- 상위 문서: [doc-structure-engine.md](doc-structure-engine.md). 이 문서와 다르면 §0.3 에 적은 항목만 이 문서가 우선한다.

---

## 0. 전제

### 0.1 현재 상태

| 항목 | 상태 |
|---|---|
| 내용(글자 · 표 구조) | PDF 종류(벡터 · 스캔 · 이미지 전용 · hwpx)와 상관없이 약 80% 정확. **이 수준을 떨어뜨리면 안 된다.** |
| 시각 · 레이아웃 | 크게 떨어진다. 실측: 테스트 문서 14쪽 중 **10쪽이 원본 쪽 높이를 넘침**(최대 +33%), 같은 줄 좌우 배치 소실, 스캔 쪽 글자 크기 축소, 배경 · 색 상자 소실 |
| 검증 | 모든 쪽이 `PASS` 였지만 레이아웃은 아무것도 재지 않았다. `spanScore` 는 항상 `null`, 선 F1 은 자기 출력끼리 비교해 항상 1.0 |

### 0.2 목표

**내용 정확도는 유지하고, 레이아웃 일치도를 숫자로 재고 올린다.** "눈으로 보니 비슷하다"는 완료가 아니다. §2 의 지표가 기준을 넘어야 완료다.

### 0.3 상위 명세에서 바꾸는 것 (사용자 승인 2026-11-12)

| 상위 명세 | 바꾸는 내용 | 이유 |
|---|---|---|
| §12.1 `paragraph` 행: "이어진 문단들을 블록 하나에" | **논리 단위(문단 · 조항 · 목록 묶음 · 표 제목 · 주석)마다 `text` 블록 하나.** 블록 종류는 그대로 `text` | IR 은 문단을 구분해 내는데 변환기가 다시 합쳐서, 쪽 전체가 칸 하나가 된다 (POSRI 13쪽: IR 14블록 → vdoc 5블록) |
| §12.1 "새 블록 종류를 만들지 않는다" | **그대로 지킨다.** 같은 줄 좌우 배치는 기존 `columns-grid`, 색 상자는 기존 1×1 `structured-table`(칸 배경)로 낸다 | |
| vdoc 스키마 | **선택 필드 2개만 추가**: `VDocPageLayout.background?: string`(쪽 배경색), `LayoutBlockBase.spaceBefore?: number`(흐름 배치에서 앞 블록과의 간격 px) | 지금은 쪽 배경을 담을 곳이 없고, 블록 사이 간격이 쪽 전체에서 `blockGap` 하나라 원본의 세로 간격을 따를 수 없다 |

### 0.4 바꾸지 않는 것 (어기면 작업 무효)

1. **흐름 배치 유지.** 블록에 `frame` 좌표를 쓰지 않는다. 쪽 바탕 그림 + 좌표 글 상자(page-IR)는 폐기된 방식이다 (상위 §1.1).
2. **px 위치 오차를 주 지표로 쓰지 않는다** (상위 §10.8). 이 가이드의 주 지표는 **비율 · 줄 수 · 묶음 보존**이다. 위치는 정규화된 거친 띠로만 보조 지표로 본다.
3. **글자 크기를 줄여서 쪽에 끼워 맞추지 않는다.** 모든 보정은 "원본에서 잰 값 쪽으로"만 움직인다.
4. 상위 §10 의 규칙 전부: git 인덱스 금지(`git add/mv/rm` 금지), agy 가 도는 동안 엔진 · API 코드 수정 금지(서버 재시작), `harness_kit` 한글 리터럴 금지, 과적합 금지(문서 이름 · 특정 문구 분기 금지), 사람 문서에 AI 구조 작업 금지.

---

## 1. 진단 — 무엇이 왜 틀리는가

근거: 테스트 문서(`vdoc-1a1cf087f25-89cbeb89`, 4개 서식 14쪽) 실측, POSRI · LGBR 리포트 시험 변환(2026-11-12).

| # | 증상 | 실측 | 원인 (위치) | 다룰 작업 |
|---|---|---|---|---|
| S1 | 쪽 높이 넘침 | 계약서 2쪽 1495px / 원본 1121px (+33%). 14쪽 중 10쪽 | 칸 여백을 "글자 ↔ 테두리 거리, 상한 12pt"로 잡아 **가운데 정렬 칸은 양쪽 16px** (`tables/props.py` `_infer_alignment_and_padding`). 칸 줄 간격 `1.3` 고정. 블록 간격 쪽 전체 4px 고정 | WP1 · WP2 |
| S2 | 같은 줄 좌우 배치가 위아래로 쌓임 | "초 등 학 교 … 제 학년 반", "POSRI 이슈리포트 … 4", 로고 + 제목 머리말 | 같은 기준선의 떨어진 글 조각을 묶는 단계가 없다 (`blocks/reflow.py`, `blocks/order.py`) | WP3 |
| S3 | 쪽 전체가 칸 하나 | 계약서 4쪽: 본문 칸 1개 3,418자 | 변환기가 연속된 paragraph · caption · note · listItem 을 하나로 합친다 (`compile/docstruct_vdoc.py` 비-hwpx 흐름 블록 묶음) | WP1 |
| S4 | 목차 줄이 찢어짐 | "2. 주요 변화와…" → [`2.`│`주요`] 2칸 표 + 표 밖 제목 | 선 없는 2열 "표" 오탐 (`tables/candidates.py`) | WP3 |
| S5 | 배경 · 색 상자 소실 | POSRI 표지 하늘색 배경, 목차 상자 | 쪽 배경 필드 없음, 큰 채움 사각형을 블록으로 내보내지 않음 | WP4 |
| S6 | 반복 머리말이 본문에 섞임 | POSRI 본문 쪽 상단 제목이 첫 문단에 합쳐짐 | 머리말 판정이 한 쪽 안의 위치만 본다. 로고(그림)와 같은 띠에 있으면 놓친다 | WP4 |
| S7 | 글자 크기 · 글꼴 차이 | 스캔 쪽 글이 쪽의 70%만 차지. 굴림 → 맑은 고딕 | OCR 글자 크기를 단어 상자 높이로 추정. 글꼴 별칭 부족 | WP5 |
| S8 | 스캔 · 이미지 PDF 글자 조각 | `\|수집하는\| \|개인정보의\|` | OCR 단어를 줄 · 문단으로 다시 묶지 않고 단어마다 span 으로 낸다 | WP6 |
| S9 | 이미지 PDF 의 사진 미분리 | LGBR: 사진 속 간판이 OCR 되어 제목 "WaImart, 1" 생성 | 래스터 쪽에서 사진 영역을 찾지 않는다 (`acquire/figures.py` 는 이미지 XObject 만) | WP6 |
| S10 | OCR 오인식 | AI → 시/치/A1, AX → AⅩ | 교정 단계 없음. 재판독은 검증 신호가 없어 한 번도 안 돈다 | WP6 · WP7 |
| S11 | 검증이 아무것도 못 잡음 | 14쪽 전부 PASS, `rounds 0` | 레이아웃 지표 없음. 선 F1 은 만든 표 영역 안의 선만 비교(표 없으면 1.0). 통합 작업에서 화면 검증 루프(`fidelity_loop.py`, `image_parity`, `browser_measure`)가 삭제됨 | **WP0** · WP7 |

---

## 2. 점검 체계 (이 가이드의 핵심)

### 2.1 원칙

1. **정답은 엔진 출력이 아니라 원본에서 따로 뽑는다.** 엔진이 만든 IR 과 엔진이 만든 vdoc 을 비교하면 "자기가 놓친 것"은 영원히 안 보인다(S11 의 선 F1 이 그 예다). 레이아웃 정답(`truth`)은 원본 PDF 의 글자층 · 그림 · 선 · 채움에서 **엔진과 다른 코드 경로로** 만든다.
2. **같은 지표를 여러 구간에서 잰다.** 그래야 차이가 **처음 생긴 구간**을 짚을 수 있다. 예: 줄 수가 IR 에서는 맞는데 화면에서 틀리면 변환기나 렌더러 문제다.
3. **모든 변경은 기준선(baseline)과 비교해 보고한다.** 기준선은 WP0 이 끝난 시점의 숫자다. 좋아진 지표와 나빠진 지표를 둘 다 적는다.
4. **내용 지표는 회귀 감시로 함께 돈다.** 레이아웃을 맞추다 글자 · 표 구조가 틀어지면 실패다.

### 2.2 점검 구간 (C0 ~ C5)

```
원본 PDF ─┬─▶ C0 정답 truth (독립 경로)
          │
          └─▶ C1 확보 acquire ─▶ C2 IR (블록 · 표 · 기하) ─▶ C3 vdoc 변환 ─▶ C4 화면 렌더 ─▶ C5 채운 뒤
                  │                    │                        │                 │
                  └──── 각 구간의 측정값을 C0 과 비교 ────────────┴─────────────────┘
```

| 구간 | 무엇을 재나 | 어떻게 (도구) | 브라우저 | 운영 / 평가 |
|---|---|---|---|---|
| **C0 정답** | 원본 쪽의 레이아웃 사실: 줄(기준선 · 높이 · 글자 크기 · 글꼴), 논리 단위 상자, 같은 줄 묶음, 선, 채움(배경 · 칸 음영 · 색 상자), 그림 영역, 내용 높이(첫 줄 위 ~ 마지막 줄 아래) | `verify/layout_truth.py` [NEW]. 벡터 쪽: 글자층(`acquire/pdf/char_normalizer`)과 도형(`acquire/pdf/drawings`)에서 직접 계산. 스캔 · 이미지 쪽: **잉크 투영(가로 · 세로 투영 곡선)으로 줄 띠를 잡는다. OCR 결과를 정답으로 쓰지 않는다** | ✗ | 둘 다 |
| **C1 확보** | 단어 · 줄 · 글자 크기 · 그림 · 채움이 원본만큼 나왔는가 | `verify/layout_checks.py` [NEW] 의 `check_acquire()` | ✗ | 둘 다 |
| **C2 IR** | 블록이 논리 단위로 나뉘었는가, 블록마다 기하(상자 · 줄 수 · 줄 간격 · 앞 간격)를 가졌는가, 같은 줄 묶음 · 머리말 · 목차가 보존됐는가 | `check_ir()` | ✗ | 둘 다 |
| **C3 vdoc** | IR 의 기하 속성이 vdoc 필드로 빠짐없이 옮겨졌는가(보존율). 글꼴 지표로 **예측한** 줄 수 · 블록 높이 · 쪽 높이 | `check_emit()` + `verify/layout_predict.py` [NEW] (`acquire/pdf/metrics.FontMetrics` 로 줄바꿈 계산) | ✗ | 둘 다 |
| **C4 화면** | 실제로 그려진 쪽 높이 · 블록 상자 · 칸별 줄 수 · 계산된 글자 크기 · 실제 그린 글꼴 · 색 | `verify/layout_measure.py` [NEW]. CDP 로 `data-block-id` · `data-slot-id` 요소를 잰다. 줄 수는 `Range.getClientRects()` 의 서로 다른 줄 띠 개수 | ✓ | **평가 전용** (상위 §12.4) |
| **C5 채운 뒤** | 빈 칸을 예시 값으로 채웠을 때 쪽이 넘치는가 | C4 와 같은 측정. 빈 편집 칸마다 라벨 길이 기준 예시 글을 넣고 다시 잰다 | ✓ | 평가 전용 · 보조 |

- C4 의 측정 JS 는 `docstruct_engine/verify/` 안에 둔다. `harness-packs/form-scaffold/tools/visual_fidelity/browser_measure.py` 는 **읽고 가져다 쓰기만** 한다.
- **구간 간 id 대응이 필요하다.** C3 변환 보고(`CompiledPageReport`)에 `irBlockId → vdoc blockId / slotId` 대응표를 추가한다. 이게 없으면 C2 와 C4 를 블록 단위로 맞대지 못한다.

### 2.3 지표

모든 기준값은 `harness-packs/docstruct/thresholds.json` 의 새 `layout` 절에 둔다. 아래 숫자는 **시작값**이다. WP0 기준선을 본 뒤 사용자와 확정한다.

**주 지표 (게이트)**

| ID | 지표 | 정의 | 재는 구간 | 시작 기준 |
|---|---|---|---|---|
| L1 | 쪽 높이 비율 | (마지막 블록 아래 − 첫 블록 위) ÷ C0 내용 높이 | C3(예측) · C4(실측) | 0.95 ~ 1.03, **넘침(쪽 밖으로 밀림) 0쪽** |
| L2 | 줄 수 일치율 | 글 그릇(문단 블록 · 표 칸)마다 줄 수가 C0 과 같은 비율. ±1 허용 비율도 함께 | C2 · C3 · C4 | 정확 ≥ 0.90, ±1 ≥ 0.98 |
| L3 | 같은 줄 묶음 보존율 | C0 에서 한 기준선에 떨어져 놓인 조각 묶음이 결과에서도 같은 줄(기준선 차 ≤ 줄 높이 0.5)이고 좌→우 순서가 같은 비율 | C2 · C4 | ≥ 0.95 |
| L4 | 글자 크기 일치율 | 글자 수 가중으로, 결과 글자 크기가 원본 pt × 96/72 의 ±5% 안인 비율 | C1 · C3 · C4 | 벡터 ≥ 0.95, 스캔 ±10% 기준 ≥ 0.90 |
| L5 | 채움 회수율 | C0 의 채움(쪽 배경 · 칸 음영 · 색 상자) 면적 중, 결과에서 같은 자리가 색 거리 ≤ 24 로 칠해진 면적 비율 | C3 · C4 | ≥ 0.90 |
| L6 | 그림 회수 · 오염 | C0 그림 영역과 결과 그림의 IoU ≥ 0.8 인 비율. **그림 안 글자가 본문 글로 나온 수**(오염)는 0 이어야 함 | C1 · C2 | 회수 ≥ 0.90, 오염 0 |
| L7 | 논리 단위 보존 | C2 블록 수 대비 C3 `text` 블록 수 비율, 그리고 글 그릇 하나의 최대 글자 수 | C2 · C3 | 비율 ≥ 0.95, 최대 글자 수 ≤ `layout.maxSlotChars`(시작 1,200) |

**보조 지표 (진단용, 게이트 아님)**

| ID | 지표 | 정의 |
|---|---|---|
| A1 | 세로 띠 일치 | 블록 위쪽 y 를 쪽 높이로 나눈 값의 차이. 0.03 넘는 블록 목록을 낸다. **주 지표로 올리지 않는다** (§0.4-2) |
| A2 | 글꼴 계열 일치 | 고딕 · 명조 · 굴림 계열이 같은가. 다르면 WARN |
| A3 | 잉크 겹침 | 원본과 화면을 50dpi 로 줄이고 ±8px 흐린 뒤의 잉크 F1. 전체 인상 확인용 (`image_parity.image_metrics` 재사용) |
| A4 | 구간 낙차 | 같은 지표의 구간 간 차이 (예: L2 의 C2 값 − C4 값). §2.4 판정에 쓴다 |

**회귀 감시 (내용)**

| ID | 지표 | 기준 |
|---|---|---|
| R1 | 칸 글자 NED (표 평균) | 기준선 + 0.005 이하 |
| R2 | 표 구조 TEDS-S | 기준선 − 0.005 이상 |
| R3 | 블록 글자 총량 | 쪽마다 C0 글자 수 대비 ±1% (글자가 사라지거나 중복되지 않음) |

### 2.4 차이가 처음 생긴 구간 찾기

지표가 기준 미달이면 **앞 구간부터** 본다. 고칠 곳은 처음 틀린 구간이다.

| 지표 | C1 이 틀림 | C2 가 틀림 (C1 은 맞음) | C3 예측이 틀림 (C2 는 맞음) | C4 만 틀림 (C3 예측은 맞음) |
|---|---|---|---|---|
| L1 쪽 높이 | — | 블록 기하 누락 | 변환기가 속성을 버림 (행 높이 · 줄 간격 · 앞 간격 · 여백) | 렌더러 CSS (slot-canvas 기본 여백 · 최소 높이 · 편집기 문단 여백) |
| L2 줄 수 | 글자 크기 · 단어 폭 오측정 | 칸 여백 · 정렬 추정 | 여백 · 줄 간격 · 글꼴 스택을 vdoc 에 잘못 씀 | 실제 그린 글꼴이 다름(대체 글꼴), 자간 · 커닝 |
| L3 같은 줄 | 기준선 오차 | 묶음 판정 누락 | `columns-grid` 로 안 냄 | 그리드 폭 · 정렬 CSS |
| L4 글자 크기 | 크기 추정(OCR) | 블록 크기 다수결 오류 | span 스타일 누락 | 편집기 기본 글자 크기가 덮어씀 |
| L5 채움 | 채움 추출 누락 | 채움 → 블록 · 쪽 배경 귀속 누락 | 필드 없음 · 미기록 | 렌더러가 필드를 무시 |
| L6 그림 | 사진 영역 미검출 | 그림 위 단어를 그림에 귀속 못 함 | 이미지 블록 누락 | — |

보고서에는 지표마다 **"처음 틀린 구간"** 을 적는다 (§2.6).

### 2.5 무엇으로 점검하나 — 점검 세트

**(가) 합성 단위 픽스처** — 개인 파일이 필요 없고, 특정 문서에 맞추는 과적합을 막는다.
`packages/docstruct-engine/tests/fixtures/layout/` [NEW] 에서 PyMuPDF 로 **코드가 PDF 를 만들어** 쓴다. 한 픽스처는 한 현상만 담는다.

| 픽스처 | 담는 현상 | 확인 지표 |
|---|---|---|
| `narrow_center_cell` | 좁은 칸의 가운데 정렬 글 (원본 1줄) | L2 = 1줄 |
| `left_right_same_line` | 한 줄 왼쪽 "초등학교", 오른쪽 "제 학년 반" | L3 |
| `toc_lines` | "1. 배경", "2. 주요 변화와 트렌드", 점선 리더 + 쪽 번호 | 표 0개, L3, 글자 보존 |
| `running_header_logo` | 3쪽, 상단 띠에 그림 + 같은 제목 반복 | 머리말 분리 3/3 |
| `page_background_panel` | 쪽 전체 배경색 + 색 상자 안 글 | L5 |
| `clause_paragraphs` | 제1조 ~ 제4조, ①② 항 | L7 (블록 ≥ 4) |
| `mixed_spacing` | 문단 사이 간격 6pt · 18pt · 30pt | L1, A1 |
| `raster_text_photo` | 글 + 사진을 한 장 그림으로 굽고 PDF 에 이미지로만 넣음 | L6 오염 0, S8 조각 0 |
| `font_sizes_mix` | 8 · 9 · 10 · 14pt, 굴림 · 맑은 고딕 | L4, A2 |

**(나) 평가 세트** — 실제 문서. 경로는 `eval/paths.local.json` 에만 둔다 (상위 §12.6).
`eval/manifest.json` 에 아래를 추가하고 **특성 태그**로 고르게 덮는다.

| docId | 특성 태그 | 새로 추가 |
|---|---|---|
| `lease-910` | 벡터 · 채운 서식 · 조항 문단 · 좁은 칸 | — |
| `kids-council` | 벡터 · 빈 서식 · 같은 줄 좌우 · 세로쓰기 | — |
| `posri-report` | 벡터(Word) · 표지 배경 · 목차 · 반복 머리말 · 색 표 | ✓ |
| `lgbr-report` | 이미지 전용(jsPDF) · 사진 · 글머리 목록 | ✓ |
| `privacy-consent-scan` | 스캔 · 가로줄 · 체크박스 | ✓ |
| `brochure-scan-a/b`, `welfare-minutes`, `review-minutes`, `daily-minutes`, `rfp-hwpx` | 기존 | — |

**(다) 사람 눈 확인** — 숫자를 대신하지 않고 **숫자가 이상할 때 원인을 보기 위해** 쓴다.
`run_eval.py --render` 가 실패한 쪽마다 `원본 | 화면 | 잉크 차이` 세 장을 나란히 붙인 PNG 를 만든다. 화면 캡처는 **1920×1080, 확대율 1** 에서 한다. 레이아웃을 창 크기에 맞춰 줄이지 않는다. 편집 도구 모양(버튼 · 손잡이)이 찍히면 측정 무효다.

### 2.6 점검 절차 (변경마다)

1. **단위 테스트**: `packages/docstruct-engine` 에서 `python -m pytest -q`, `apps/api` 에서 `python -m pytest -q`, 바꾼 파일에 `python -m ruff check`.
2. **브라우저 없는 평가 (C0~C3)**: `python eval/run_eval.py --layout` → `eval/out/<시각>/layout.json`, `layout.md`.
3. **화면 평가 (C4 · C5)**: 디버그 크롬(`--remote-debugging-port=9222`)과 스튜디오(5180)를 띄운 뒤 `python eval/run_eval.py --layout --render`. 전제가 없으면 경고 후 C4 만 건너뛴다 (상위 §12.4).
4. **기준선 비교**: `python eval/run_eval.py --compare eval/baseline/layout.json` 이 지표별로 `기준선 → 지금 (차이)` 표를 낸다. 나빠진 지표가 하나라도 있으면 원인을 적는다.
5. **보고**: 아래 형식으로. 실패는 실패로 적는다.

```
## 레이아웃 점검 — <변경 이름>
| 문서(태그) | L1 넘침 쪽 | L2 정확/±1 | L3 | L4 | L5 | L6 회수/오염 | L7 | R1 | R2 |
|---|---|---|---|---|---|---|---|---|---|
| lease-910 (벡터·채운서식) | 3→0 | 0.71/0.90 → 0.93/0.99 | … |
처음 틀린 구간: lease-910 p4 L2 = C3 (칸 여백), kids-council p6 L3 = C2 (묶음 판정)
남은 실패: …
```

`layout.json` 은 쪽마다 다음 형식이다.

```jsonc
{ "doc": "lease-910", "page": 2, "tags": ["pdf-vector", "filled-form"],
  "metrics": {
    "L1": { "C3": 1.04, "C4": 1.33, "pass": false },
    "L2": { "C2": { "exact": 0.97 }, "C3": { "exact": 0.95 }, "C4": { "exact": 0.71, "within1": 0.90 }, "pass": false },
    "L3": { "C2": 1.0, "C4": 1.0, "pass": true } },
  "firstFailingStage": { "L1": "C4", "L2": "C4" },
  "worst": [ { "metric": "L2", "slotId": "s_tc_…", "truthLines": 1, "C4Lines": 3, "irBlockId": "p2t1" } ],
  "evidence": "eval/out/…/lease-910_p2_side_by_side.png" }
```

### 2.7 운영 경로의 판정 (`verdict`)

- 운영(`dc_verify` · `dc_import` · 서식 가져오기 작업)은 브라우저를 쓰지 않으므로 **C3 예측값**으로 판정한다.
- `verdict = PASS` 는 **내용(기존 D7) 합격 AND 레이아웃(L1 · L2 · L3 · L7, C3 예측) 합격**일 때만이다.
- 작업 보고의 `spanScore` 자리에 레이아웃 요약 점수(주 지표 합격 비율)를 채운다. 더 이상 `null` 로 두지 않는다.
- 레이아웃 불합격은 `needsReview` 와 사유(지표 · 처음 틀린 구간 · 블록 id)로 보고한다.

---

## 3. 개발 범위

표시: `[NEW]` 새로 만듦 · `[MOD]` 고침 · `[REUSE]` 그대로 가져다 씀

```
VibeDocStudio/
├─ docs/specs/layout-fidelity-guide.md                     [NEW] 이 문서
├─ packages/docstruct-engine/
│  ├─ docstruct_engine/
│  │  ├─ verify/
│  │  │  ├─ layout_truth.py        [NEW] WP0  C0 정답 (벡터: 글자층·도형 / 스캔: 잉크 투영)
│  │  │  ├─ layout_checks.py       [NEW] WP0  check_acquire / check_ir / check_emit, 지표 L1~L7·A1~A4
│  │  │  ├─ layout_predict.py      [NEW] WP0  글꼴 지표로 줄 수·높이 예측 (C3)
│  │  │  ├─ layout_measure.py      [NEW] WP0  CDP 측정 JS·호출 (C4·C5, 평가 전용)
│  │  │  ├─ report.py              [MOD] WP0  레이아웃 항목·firstFailingStage
│  │  │  └─ verify.py              [MOD] WP7  verdict 에 레이아웃 반영
│  │  ├─ ir/model.py               [MOD] WP1·3 블록 기하(lineCount·linePitch·spaceBefore), LineGroupBlock(IR 전용)
│  │  ├─ tables/props.py           [MOD] WP2  여백·줄 간격 규칙
│  │  ├─ tables/candidates.py      [MOD] WP3  선 없는 한 줄짜리 2열 오탐 거르기
│  │  ├─ blocks/reflow.py          [MOD] WP3·4 같은 줄 묶음, 머리말·꼬리말, 채움 귀속
│  │  ├─ blocks/order.py           [MOD] WP3  묶음 읽기 순서
│  │  ├─ blocks/markers.py         [MOD] WP6  OCR 단어 → 줄·문단 재조립
│  │  ├─ acquire/figures.py        [MOD] WP6  래스터 쪽 사진 영역 검출
│  │  ├─ acquire/ocr.py            [MOD] WP5·6 줄 간격 기반 글자 크기, 혼동 교정 표
│  │  ├─ compile/docstruct_vdoc.py [MOD] WP1·3·4 블록 분할·속성 보존·id 대응표·columns-grid·배경
│  │  └─ reread/plan.py            [MOD] WP7  레이아웃·OCR 신뢰도 신호로 재판독 대상 선정
│  ├─ tests/fixtures/layout/       [NEW] WP0  합성 픽스처 생성기 (§2.5 가)
│  ├─ tests/test_layout_*.py       [NEW] 각 WP
│  └─ eval/
│     ├─ run_eval.py               [MOD] WP0  --layout, --compare, 나란히 붙인 증거 그림
│     ├─ manifest.json             [MOD] WP0  새 문서 3개 + 태그
│     └─ baseline/                 [NEW] WP0  기준선 (원문 글이 들어가므로 .gitignore)
├─ packages/harness-packs/docstruct/
│  ├─ thresholds.json              [MOD] layout 절
│  └─ registry.ko.json             [MOD] fontAliases 계열, ocrConfusions, tocPatterns, runningHeader
├─ packages/vdoc-schema/src/
│  ├─ types.ts                     [MOD] WP4  VDocPageLayout.background?
│  └─ base-block.ts                [MOD] WP1  LayoutBlockBase.spaceBefore?
├─ packages/slot-canvas/src/
│  ├─ VDocPageSheet.tsx            [MOD] WP1·4 spaceBefore·배경 렌더, exactText 쪽의 편집기 기본 여백 제거
│  └─ InteractiveTable.tsx         [MOD] WP2  exactText 쪽에서 칸 최소 높이·기본 여백 덮어쓰기 제거 (필요 시)
├─ packages/harness-packs/form-scaffold/tools/visual_fidelity/  [REUSE] browser_measure·image_parity·fidelity_core
└─ apps/api/app/form_scaffold/adapters/docstruct_scaffold_agent.py [MOD] WP7 verdict·spanScore 채우기
```

---

## 4. 작업 묶음 (WP)

각 WP 는 **§2.6 절차를 통과하고, 기준선 대비 표를 보고해야** 끝난다.

### WP0 — 측정 기반 (반드시 먼저, 동작 변경 없음)

- C0 ~ C4 도구, 지표 L1 ~ L7 · A1 ~ A4 · R1 ~ R3, `run_eval.py --layout / --render / --compare`, 합성 픽스처 생성기, `CompiledPageReport` 의 id 대응표.
- `layout_truth.py` 는 엔진의 `blocks/*` · `tables/*` 를 import 하지 않는다 (**독립 경로**). 글자층 정규화(`acquire/pdf/char_normalizer`)와 도형 추출(`acquire/pdf/drawings`)만 쓴다.
- 스캔 정답: 쪽 그림을 이진화하고 가로 투영으로 줄 띠, 줄 띠 안 세로 투영의 큰 틈으로 같은 줄 묶음을 잡는다. 글자 크기는 줄 띠 높이 중앙값 × 비율(레지스트리 값)로 추정한다.
- **완료 조건**
  - 픽스처마다 "지금 엔진이 틀리는 것"을 지표가 잡는다 (예: `narrow_center_cell` 에서 C3 L2 실패, `toc_lines` 에서 표 1개 오탐).
  - 평가 세트 전체 기준선(`eval/baseline/layout.json`)을 만들고 표로 보고한다.
  - 테스트 문서에서 실측한 넘침(계약서 2쪽 약 +33%)이 C4 L1 로 재현된다.

### WP1 — 보존: 버리던 기하를 vdoc 까지 옮긴다

1. **블록 분할**: 비-hwpx 흐름 블록 묶음을 없애고 **IR 블록 하나 = `text` 블록 하나**로 낸다. 예외: 같은 머리표 계열의 연속 `listItem`(①②③ 처럼)은 한 블록에 `<p>` 여러 개로 둘 수 있다. 판정은 레지스트리 `clauseMarkers` 수준으로만 한다.
2. **앞 간격**: IR 블록마다 `spaceBefore`(앞 블록 아래 ~ 이 블록 위, pt → px)를 계산해 vdoc `spaceBefore` 로 낸다. 쪽 `blockGap` 은 0 으로 두고 간격은 전부 `spaceBefore` 가 맡는다.
3. **줄 간격**: 문단 · 칸마다 **기준선 간격 중앙값 ÷ 글자 크기**를 `lineHeight` 로 낸다. 줄이 하나뿐이면 같은 쪽의 같은 글자 크기 문단 값을 빌리고, 없으면 레지스트리 기본값을 쓴다.
4. **행 높이**: `TableIR.rowYs` → `rows[].height` 가 실제로 나가는지 C3 보존율로 확인한다 (통합 후 변환기에 코드는 있다).
5. **렌더러**: `spaceBefore` 를 블록 위 여백으로 쓴다. `exactText` 쪽에서는 편집기 문단 기본 여백 · 최소 높이를 0 으로 둔다.
- **완료 조건**: L7 비율 ≥ 0.95 · 최대 글자 수 기준 통과. 벡터 문서 L1 넘침 쪽이 기준선의 절반 이하. R1 ~ R3 회귀 없음.

### WP2 — 여백 · 줄바꿈 규칙

1. **칸 여백**
   - 왼쪽 정렬이면 왼쪽만 실측 거리, 오른쪽은 최소값.
   - 오른쪽 정렬이면 그 반대.
   - **가운데 정렬은 양쪽을 같은 최소값**(레지스트리 `cellPaddingMinPt`)으로 둔다.
   - 위 · 아래도 세로 정렬 기준으로 같은 규칙을 쓴다.
   - 상한은 고정 12pt 대신 **칸 폭의 비율**(`cellPaddingMaxRatio`)로 둔다.
2. **줄바꿈 예측 일치**: 칸 안 글이 원본에서 N 줄이면, 예측(C3) 줄 수가 N 이 되도록 여백만 조정할 수 있다(최소값까지). **글자 크기 · 자간은 건드리지 않는다.** 그래도 N 을 넘으면 `needsReview` 로 남긴다.
3. **글꼴 스택**: 레지스트리 `fontAliases` 에 계열(고딕 · 명조 · 굴림)과 대체 순서를 둔다. C4 에서 실제 그린 글꼴을 재서 A2 로 확인한다.
- **완료 조건**: 픽스처 `narrow_center_cell` C4 L2 = 1줄. 평가 세트 L2 정확 ≥ 0.90. 벡터 문서 L1 넘침 0쪽.

### WP3 — 같은 줄 묶음 · 목차

1. **묶음 판정**: 같은 기준선(허용 = 줄 높이 × 0.3)에서 **글자 크기의 k배를 넘는 가로 틈**으로 갈라진 조각들을 IR `LineGroupBlock`(IR 전용 종류)으로 묶는다.
   - 조각마다 정렬(왼쪽 · 가운데 · 오른쪽)과 x 비율을 기록한다.
   - k 는 레지스트리 값이다.
2. **변환**: `LineGroupBlock` → 기존 `columns-grid`. `widths` 는 조각 x 비율로 정하고, 칸마다 정렬 스타일을 준다. `cardStyle: "plain"`, `gap: 0`.
3. **목차 · 리더 줄**: 선이 없고 모든 행이 한 줄짜리인 2열 표 후보는 행마다 "번호 · 제목 · (리더) · 쪽번호" 패턴(레지스트리 `tocPatterns`)을 검사한다. 맞으면 **표가 아니라 줄 묶음**으로 돌린다.
4. 머리말 · 꼬리말 안의 좌우 배치도 같은 규칙으로 처리한다 (WP4 와 맞물림).
- **완료 조건**: 픽스처 `left_right_same_line` · `toc_lines` 통과. 평가 세트 L3 ≥ 0.95. 목차 쪽의 표 오탐 0.

### WP4 — 쪽 장식: 머리말 · 꼬리말 · 배경 · 색 상자

1. **반복 머리말**: 같은 원본에서 **2쪽 이상의 같은 띠(위 · 아래)에 반복되는 글 · 그림**을 머리말 · 꼬리말로 판정한다.
   - 한 쪽만 들어오는 가져오기 작업이 대부분이라, 쪽 단위 처리 전에 **원본 전체를 한 번 훑는 가벼운 단계**(글자층 · 그림 위치만)를 둔다.
   - 결과는 상위 §12.3 캐시(`acquire.json`)에 둔다.
2. **로고 + 제목 띠**: 머리말 띠 안의 그림과 글을 함께 머리말로 귀속한다. 좌우 배치는 WP3 묶음으로 처리한다.
3. **쪽 배경**: 쪽 면적의 `pageBgCoverRatio`(시작 0.8) 이상을 덮는 채움 → `layout.background`.
4. **색 상자**: 글을 담은 큰 채움 사각형은 1×1 `structured-table`(칸 `backgroundColor`, 테두리는 원본대로)로 낸다. 안의 글은 그 칸 슬롯에 넣는다.
- **완료 조건**: 픽스처 `running_header_logo` · `page_background_panel` 통과. POSRI L5 ≥ 0.90, 반복 머리말 분리 100%.

### WP5 — 글자 크기 · 글꼴

1. **벡터**: 글자층 크기를 그대로 쓰고, 블록 다수결 크기와 다른 span 은 span 스타일로 남긴다 (L4 C3 보존율 확인).
2. **스캔 · 이미지**: 단어 상자 높이 대신 **줄 기준선 간격과 x-높이**로 크기를 추정한다. 비율은 레지스트리 값이다.
3. 원본 글꼴 이름 → 레지스트리 계열 → CSS 스택. 원본에 굴림이 있으면 굴림을 먼저 쓴다.
- **완료 조건**: L4 벡터 ≥ 0.95, 스캔 ≥ 0.90(±10%). `privacy-consent-scan` L1 0.95 ~ 1.03.

### WP6 — 스캔 · 이미지 전용 PDF

1. **줄 · 문단 재조립**: OCR 단어를 기준선으로 줄을 만들고, 줄 간격 · 들여쓰기로 문단을 만든다(`blocks/markers.group_words_into_lines` 를 OCR 에도 적용).
   - 변환기는 줄 안 단어를 **공백 하나로 이은 글**로 낸다. 단어마다 span 을 만들지 않는다.
   - 글자 크기 · 굵기가 바뀌는 곳에서만 span 을 연다.
2. **사진 영역**: 래스터 쪽에서 글자 줄 띠가 아닌 큰 영역 중 색 분산 · 경계 밀도가 높은 것을 사진 후보로 잡는다.
   - 후보는 그림으로 잘라 내고(상위 §12.1 `figure` 규약) **그 영역은 OCR 하지 않는다.**
   - 사진 바로 아래 한두 줄은 `caption` 후보로 둔다.
3. **OCR 교정**: 레지스트리 `ocrConfusions`(예: 라틴 `AI` ↔ 한글 `시` · `치` · `A1`, `Ⅹ` ↔ `X`)를 **문맥 조건과 함께** 둔다. 교정은 `fixes` overlay(`by: ocr-rule`)로만 넣는다. 원문 단어는 덮지 않는다.
4. **재판독 대상**: OCR 신뢰도가 낮은 문단만 `pendingReads`(`kind: paragraph_reread`, 쪽 그림 crop 포함)로 낸다. agy 가 읽은 결과는 `fixes` 로만 들어간다 (상위 §10.6).
- **완료 조건**: 픽스처 `raster_text_photo` L6 오염 0 · 조각 0. `lgbr-report` 의 사진 회수율 ≥ 0.9, 사진 속 글자에서 나온 제목 · 문단 0, 문자 오류율(CER) ≤ 3%.

### WP7 — 검증 루프 재연결

1. `verify.py`: §2.7 판정. 레이아웃 불합격은 블록 id · 지표 · 처음 틀린 구간을 남긴다.
2. `reread/plan.py`: L2 · L4 불합격 그릇 중 **C1 이 원인인 것**(크기 · 단어 폭 오측정)만 재판독 대상으로 넣는다. C3 · C4 원인은 재판독으로 고칠 수 없으므로 넣지 않는다.
3. 가져오기 작업 보고(`docstruct_scaffold_agent.py`)에 레이아웃 요약을 채운다 (`spanScore` 자리, 지표별 합격 수).
4. **망친 입력 테스트**: 정상 vdoc 에서 칸 여백을 2배로, 블록 간격을 0 으로, 배경을 지운 변형을 만들어 검증이 각각 잡는지 확인한다.
- **완료 조건**: 망친 입력 3종을 모두 잡는다. 테스트 문서를 다시 가져오면 PASS 쪽은 실제로 L1 ~ L3 · L7 을 통과한 쪽뿐이다.

---

## 5. 진행 순서와 관문

| 단계 | 내용 | 관문 (다음 단계로 가는 조건) |
|---|---|---|
| **G0** | WP0 | 기준선 표를 사용자에게 보고하고 기준값을 확정받는다 |
| **G1** | WP1 → WP2 | 벡터 문서 L1 넘침 0쪽, L2 ≥ 0.90, L7 통과, R 회귀 없음 |
| **G2** | WP3 · WP4 (서로 독립, 병행 가능) | L3 ≥ 0.95, L5 ≥ 0.90, 머리말 분리 100% |
| **G3** | WP5 → WP6 | 스캔 · 이미지 문서 L4 · L6 통과, CER ≤ 3% |
| **G4** | WP7 | 망친 입력 3종 검출, 운영 verdict 가 레이아웃을 반영 |

- 각 관문에서 **평가 세트 전체**를 다시 돌린다. 앞 단계에서 통과한 지표가 떨어지면 다음으로 가지 않는다.
- 숫자가 기준에 못 미치면 **"미달 · 원인(처음 틀린 구간) · 다음 조치"**로 보고한다. 기준을 낮춰서 통과시키지 않는다. 기준 변경은 사용자 승인 사항이다.

---

## 6. 레지스트리 · 기준값 추가

`registry.ko.json`
- `fontAliases`: 글꼴 이름 → `{ class: "gothic" | "myeongjo" | "gulim" | …, stack: [...] }`
- `ocrConfusions`: `{ from, to, when }` (`when` = 앞뒤 글자 종류 조건. 문서 이름 · 특정 문구 금지)
- `tocPatterns`: 번호 · 리더 · 쪽번호 정규식
- `runningHeader`: `{ minPages: 2, bandRatio: 0.08 }`
- `lineGroup`: `{ gapEm: 2.5, baselineTolRatio: 0.3 }`
- `scanFontScale`: 줄 띠 높이 → pt 비율

`thresholds.json` 의 `layout` 절: L1 ~ L7 기준, `maxSlotChars`, `cellPaddingMinPt`, `cellPaddingMaxRatio`, `pageBgCoverRatio`, 사진 검출 기준.

**새 문서가 실패하면 레지스트리 · 기준값 · 일반 규칙을 고친다. 문서 이름이나 특정 글로 분기하는 코드는 쓰지 않는다.**

---

## 7. 범위 밖

- 픽셀 단위 일치, 절대 좌표 배치, 쪽 바탕 그림
- 차트 · 도식의 데이터 복원 (그림으로 둔다)
- 다단(2단 이상 본문) 흐름 재현 — `columns-grid` 로 가능하지만 이번 지표 · 픽스처에 넣지 않는다. 필요하면 다음 작업으로
- docx 내보내기
- 레퍼런스 라이브러리의 이미지 전용 PDF 지원 (`apps/api/app/reference/adapters/pdf_extractor.py` 는 글자층만 읽는다) — 별도 작업. WP6 의 줄 재조립을 가져다 쓰면 된다

---

## 부록 A. 레이아웃 밖의 별도 작업 (같은 진단에서 나온 것, 이 가이드의 관문과 무관)

| 항목 | 내용 | 위치 |
|---|---|---|
| 칸 이름 | 제목 칸을 1행에서만 찾지 말고 행 · 열 제목 관계도로 찾는다 ('총무부 · 계획'). 채운 서식이면 칸 글이 제목인지 값인지 분류해, 값은 이름으로 쓰지 않는다. 제목 칸은 편집 칸으로 만들지 않는다 | `tables/props.py` |
| 원본 쪽 번호 | 쪽을 잘라 1쪽 PDF 로 돌려도 `sourcePage` 에는 원래 번호를 넣는다 | 가져오기 작업 · 변환기 |
| 작업 제목 | 파일 이름의 URL 인코딩을 푼다 (`%EA%B0%95…` → 한글) | 가져오기 작업 생성 |
| 개정 이력 | 가져오기로 채운 저장은 `{author: "import", jobId}` 로 기록한다. 쪽 추가 같은 구조 변경도 이력에 남긴다 | `apps/api/app/documents/revisions.py`, 스튜디오 저장 경로 |
