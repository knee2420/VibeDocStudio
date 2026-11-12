# 작업 명세서 — 문서 구조 엔진 (OCR · VLM → 표 IR → vdoc → 검증 · 부분 재판독)

- 작성일: 2026-11-12 · 기준: 브랜치 `bigbang-patch-by-mang`, HEAD `41586d7` + **스테이지된 hwpx 루트 변경분** (`hwpx.py` · `hwpx_vdoc.py` · `doc_text.py` 등)
- 성격: **새 엔진 패키지 + 기존 hwpx 루트의 표 변환을 공용 IR 로 합치기 + agy 도구 추가**
- 읽는 사람: 이 작업을 맡는 코딩 에이전트. §10(지켜야 할 규칙)을 먼저 읽을 것.

---

## 1. 왜 하는가

### 1.1 폐기된 방식 (다시 만들지 말 것)

PDF 쪽마다 **글을 지운 원본 그림을 잠근 바탕으로 깔고**, 그 위에 **원래 좌표에 글 상자를 올리는** 방식(page-IR)을 만들었다가 사용자가 전부 롤백했다.

- 표가 표가 아니다. 칸 · 행이 없고 테두리 · 음영은 바탕 그림의 픽셀이다.
- 문단이 흐르지 않는다. 한 줄이 상자 하나다.
- "편집 가능한 문서"가 아니라 "검색 가능한 PDF"(OCRmyPDF · ABBYY *Exact copy*)와 같은 물건이다.
- 줄 위치 오차(px)를 지표로 삼은 것이 근본 실수였다.

`packages/harness-kit/harness_kit/page_ir/` 에는 `__pycache__` 만 남아 있다. 쓰지 않는다 (지울지는 사용자에게 묻는다).

### 1.2 이번에 만드는 것

다른 문서 엔진(Azure Document Intelligence Layout, AWS Textract, Docling, PP-Structure, Upstage Document Parse)과 같은 계열이다. **논리 문서**를 만든다.

- 표 = 행 · 열 · 병합 · 칸 속성을 가진 진짜 표 (vdoc `structured-table`)
- 문단 = 줄바꿈된 줄을 합친 흐르는 글
- 제목 · 조항 번호 · 목록 · 빈칸 필드 · 체크박스
- 그림 블록은 진짜 그림(사진 · 로고 · 도장)에만 쓴다

원본 모양은 **근사치**로 따른다: 쪽 나눔 · 글자 크기 · 굵게 · 정렬 · 들여쓰기 · 열 폭 비율 · 테두리 · 음영. 픽셀 일치는 목표가 아니다.

### 1.3 합의된 결정 (사용자 승인: "다 권고 기준으로")

| # | 결정 |
|---|---|
| D1 | 가운데에 **표 IR 하나**를 둔다. 주소 방식은 **칸 주소 + 병합 범위**(HWPX `cellAddr`/`cellSpan`, HTML `colspan`/`rowspan`과 같음). 속성 이름은 OpenXML 어휘를 빌린다(`tblGrid`, `trHeight` 규칙, `tcBorders`, `shd`, `tblHeader`, `vAlign`). |
| D2 | **좌표와 글자는 코드만 만든다.** VLM 은 구조(행 · 열 · 병합 · 역할)만 낸다. VLM 출력 형식에는 좌표 칸이 없다. 칸 글자는 측정된 단어 id 로 채운다. |
| D3 | VLM 의 표 출력 형식은 **HTML 표**(`colspan`/`rowspan`)다. 칸 안에는 단어 id 를 적는다. |
| D4 | hwpx · PDF(벡터) · PDF(스캔) 모두 **같은 IR → 같은 변환기** 로 vdoc 이 된다. |
| D5 | 검증 지표: 표 구조 **TEDS-S**, 칸 글자 **NED**, 선 **선 F1**, 빈칸 **회수율**. 임베딩 의미 유사도는 쓰지 않는다(숫자 · 부정을 못 가린다). |
| D6 | 다시 읽는 단위: **구조가 틀린 것은 표 단위**, **글자가 틀린 것은 칸 단위**. 최대 2회, 그래도 미달이면 `needsReview`. |
| D7 | 통과 기준: TEDS-S ≥ 0.95 (표마다), 칸 NED ≤ 0.02 (표 평균, 칸마다 ≤ 0.10), 선 F1 ≥ 0.95, 빈칸 회수율 ≥ 0.90. |
| D8 | 평가 세트: 계약서 7쪽, 근로복지기금 회의록 2쪽, 어린이회 6쪽, 경영검토 · 일일평가 회의록 각 1쪽, 스캔 브로셔 2장. 정답 IR 은 사람이 확인한다. |

---

## 2. 이미 있는 자산 (새로 만들지 말고 가져다 쓸 것)

| 자산 | 위치 | 쓸 부분 |
|---|---|---|
| 글자층 정규화 | `packages/pdf-fidelity-engine/pdf_fidelity_engine/extract/char_normalizer.py` | `atoms_from_rawdict`, `deduplicate_faux_bold`(겹쳐 찍은 가짜 굵게 → bold), `normalize_chars_to_spans`(좌표 틈 → 띄어쓰기), `is_cjk_garbled_token` |
| 글꼴 이름 · cp949 복원 | `pdf_fidelity_engine/fonts/registry.py` | 깨진 글꼴 이름 복원, 글꼴 별칭 |
| 점선 · 실선 잇기 | `pdf_fidelity_engine/layout/rule_stitcher.py` | `stitch_dashed_rules`, `vertical_walls_from_rules` |
| 선 → 표 후보 | `pdf_fidelity_engine/layout/table_grid.py` | `detect_tables`(연결된 선 묶음 → 칸 사각형, 병합, 칸 음영 `_match_cell_fill`) |
| 벡터 격자 | `packages/pdf-vdoc-engine/pdf_vdoc_engine/measure/vector_grid_extractor.py` | `cluster_coordinates`, `snap_to_closest` |
| 격자 불변식 | `pdf_vdoc_engine/validate/visual_parity_scorer.py` | `_validate_table_matrix` (Σ colSpan == 열 수, rowSpan 이월) |
| 화면 실측 · 그림 비교 | `pdf_fidelity_engine/verify/browser_measure.py`, `verify/image_parity.py` | CDP 렌더 · 캡처, `merge_rules`, `unmatched_ink_regions` |
| hwpx 파서 | `packages/harness-kit/harness_kit/hwpx.py` | `Table`(grid, column_widths, row_heights, header_rows, split), `Cell`, `Styles.fills` |
| hwpx → vdoc | `packages/harness-kit/harness_kit/hwpx_vdoc.py` | `_table_block` (칸 테두리 · 배경 · 글꼴 → `structured-table`) — **IR 변환기로 일반화할 대상** |
| VLM 하네스 원칙 | `VibePatchNote/packages/scaffold-engine` (읽기 전용 참고) | "좌표는 측정 단계에서만" 원칙, 형식 위반 시 힌트 붙여 재시도. `outline` 쪽이 LLM 에게 `box_2d` 를 받는 부분은 **따라 하지 말 것** |

손대지 않는 기존 경로: `apps/api/app/form_scaffold/**`, `apps/api/app/catalog/adapters/pdf_vdoc_engine_adapter.py`. 새 경로는 이들과 독립이다. 폐기 여부는 이 작업이 끝난 뒤 사용자가 정한다.

---

## 3. 전체 흐름

```
                      ┌───────────────────── 코드 (결정적) ─────────────────────┐
 PDF ─▶ ① 확보 acquire : 쪽 판정 · 단어(글자층/OCR) · 선 · 채움 · 그림
                      │
                      ├─▶ ② 표 후보 candidates : 선 → 격자 (선 있는 표)
                      │
 쪽/표 그림 ─▶ ③ 구조 판독 (agy = VLM) : 표 HTML(칸에 단어 id) · 블록 역할 · 빈칸 · 그림 영역
                      │
                      ├─▶ ④ 맞붙임 snap · 조정 reconcile : VLM 격자를 선/단어 틈에 붙이고 후보와 대조
                      │
                      ├─▶ DocIR (쪽 · 블록 · 표 IR · 단어층)   ◀── hwpx 어댑터 (코드가 바로)
                      │
                      ├─▶ ⑤ vdoc 변환 emit (하나의 변환기)
                      │
                      └─▶ ⑥ 검증 verify : TEDS-S · NED · 선 F1 · 빈칸 → 불합격 표/칸
                                   │
                                   └─▶ ⑦ 부분 재판독 reread (표: VLM 재판독 / 칸: 고해상도 OCR) → ④ 로, 최대 2회
```

---

## 4. 개발 범위 (파일 탐색기)

표시: `[NEW]` 새로 만듦 · `[MOD]` 고침 · `[REUSE]` 그대로 가져다 씀(수정 금지) · `[KEEP]` 건드리지 않음

```
VibeDocStudio/
├─ docs/specs/
│  └─ doc-structure-engine.md                         [NEW] 이 문서
│
├─ packages/
│  ├─ docstruct-engine/                               [NEW] 호스트 비의존 엔진 (app · vibefs · harness_kit 를 import 하지 않음)
│  │  ├─ pyproject.toml                               [NEW] deps: pymupdf, numpy, pillow, pydantic>=2,
│  │  │                                                     pdf-fidelity-engine, pdf-vdoc-engine (새 외부 의존 없음 — §12.6)
│  │  ├─ README.md                                    [NEW] 단계 · 불변식 · 사용법
│  │  ├─ docstruct_engine/                            (모듈 이름 = 기존 엔진과 같은 규칙: pdf_vdoc_engine · pdf_fidelity_engine)
│  │  │  ├─ __init__.py                               [NEW] 공개 API: acquire_pages, build_doc_ir, verify_doc, reread_plan
│  │  │  ├─ ir/
│  │  │  │  ├─ model.py                               [NEW] DocIR · PageIR · Word · Block(Paragraph/Heading/ListItem/Table/Figure/Field/Checkbox) · TableIR · CellIR (pydantic)
│  │  │  │  ├─ schema.json                            [NEW] model.py 에서 생성한 JSON Schema (도구 명세 · 정답 파일 검증용)
│  │  │  │  └─ validate.py                            [NEW] 격자 불변식 · 단어 귀속 불변식 (§5.4). pdf_vdoc_engine `_validate_table_matrix` 재사용
│  │  │  ├─ acquire/
│  │  │  │  ├─ page_mode.py                           [NEW] vector / garbled / scanned / mixed 판정 (글자층 품질 · 그림 면적)
│  │  │  │  ├─ words.py                               [NEW] 글자층 → Word[] (pdf-fidelity char_normalizer 감싸기, 단어 id 부여)
│  │  │  │  ├─ ocr.py                                 [NEW] OcrPort 프로토콜 + WindowsOcr(Windows.Media.Ocr, ko) 어댑터 · 영역(crop) OCR · DPI 인자
│  │  │  │  ├─ ocr_windows.ps1                        [NEW] WinRT OcrEngine 호출 (줄 · 단어 · 좌표 JSON 출력)
│  │  │  │  ├─ rulings.py                             [NEW] 벡터 선(get_drawings) + 점선 잇기(rule_stitcher) + 그림 선(스캔: 형태학 연속 구간) + 채움 사각형
│  │  │  │  ├─ figures.py                             [NEW] 이미지 XObject · 큰 그림 영역 후보
│  │  │  │  └─ render.py                              [NEW] 쪽 그림 · 영역 crop PNG (DPI 지정, 캐시 경로 반환)
│  │  │  ├─ tables/
│  │  │  │  ├─ candidates.py                          [NEW] 선 → TableIR 후보 (pdf-fidelity `detect_tables` 사용, 신뢰도 부여)
│  │  │  │  ├─ html_io.py                             [NEW] VLM 표 HTML ⇄ 논리 격자(행렬 + 병합) 파싱 · 직렬화. 칸 내용 = 단어 id 목록
│  │  │  │  ├─ snap.py                                [NEW] 논리 격자 → 실측 경계: 선에 붙이고, 선 없으면 단어 틈 중앙선. VLM 좌표 미사용
│  │  │  │  ├─ assign.py                              [NEW] 단어 → 칸 귀속 (단어 중심이 칸 안), 칸 안 줄 → 문단
│  │  │  │  ├─ props.py                               [NEW] 칸 속성: 변별 테두리(종류 · 굵기 · 색), 음영, 가로 · 세로 정렬, 글자 크기 · 굵기, 머리행
│  │  │  │  ├─ reconcile.py                           [NEW] 선 후보 vs VLM 구조 대조 (TEDS-S) → 채택 규칙 (§6.4)
│  │  │  │  └─ continuation.py                        [NEW] 쪽을 넘는 표 잇기 (같은 열 경계 · 머리행 반복 → continued.from/to)
│  │  │  ├─ blocks/
│  │  │  │  ├─ reflow.py                              [NEW] 표 밖 줄 → 문단 (줄 간격 · 들여쓰기 · 문장 끝 · 조항 머리표 기준)
│  │  │  │  ├─ markers.py                             [NEW] 조항 · 목록 머리표 인식 — 패턴은 팩 데이터(§8)에서 읽음, 코드에 하드코딩 금지
│  │  │  │  ├─ fields.py                              [NEW] 빈칸(밑줄 · 빈 값 칸 · "( )" · "년 월 일") · 체크박스(□ ☐ [ ] √ ✓) 후보
│  │  │  │  └─ order.py                               [NEW] 읽는 순서 (단 · 펼침면 분리 포함)
│  │  │  ├─ build.py                                  [NEW] 확보 결과 + VLM 판독 + 후보 → DocIR (④ 단계 오케스트레이션)
│  │  │  ├─ verify/
│  │  │  │  ├─ teds.py                                [NEW] TEDS / TEDS-S (자체 구현 Zhang–Shasha 트리 편집거리, 칸 병합 포함 HTML 트리 — §12.6)
│  │  │  │  ├─ ned.py                                 [NEW] 정규화 편집거리 · CER (공백 정규화 규칙 명시)
│  │  │  │  ├─ lines.py                               [NEW] 선 F1 (렌더 결과의 선 마스크 vs 원본 선, 허용 2px@150DPI)
│  │  │  │  ├─ fields.py                              [NEW] 빈칸 · 체크박스 회수율
│  │  │  │  ├─ report.py                              [NEW] 쪽 · 표 · 칸 판정 JSON (§7.3)
│  │  │  │  └─ verify.py                              [NEW] verify_doc(): 독립 판독 · 렌더 비교 묶기
│  │  │  └─ reread/
│  │  │     ├─ plan.py                                [NEW] 불합격 → 재판독 작업 목록 (표 단위 / 칸 단위, 회차 · 상한)
│  │  │     └─ apply.py                               [NEW] 재판독 결과를 IR 에 덧대기 (원본 단어층 보존, 고침은 overlay)
│  │  ├─ eval/
│  │  │  ├─ manifest.json                             [NEW] 평가 문서 목록 (문서 id · 쪽 범위 · 특성 태그. 경로 없음)
│  │  │  ├─ paths.local.example.json                  [NEW] 문서 id → 절대경로 예시 (값은 비움)
│  │  │  ├─ paths.local.json                          [로컬] 사용자 파일 경로 — .gitignore 에 추가, 커밋 금지 (§12.6)
│  │  │  ├─ gold/<doc-id>/p<N>.json                   [NEW] 정답 IR (schema.json 검증 통과 필수, 사람 확인 표시 `reviewedBy`)
│  │  │  └─ run_eval.py                               [NEW] 평가 실행 → 문서 · 쪽 · 표별 점수표 (markdown + json)
│  │  └─ tests/
│  │     ├─ test_ir_validate.py                       [NEW]
│  │     ├─ test_html_io.py                           [NEW]
│  │     ├─ test_snap_assign.py                       [NEW]
│  │     ├─ test_candidates.py                        [NEW] pymupdf 로 만든 합성 PDF (선 있는 표 · 병합 · 점선)
│  │     ├─ test_reflow_markers.py                    [NEW]
│  │     ├─ test_teds_ned.py                          [NEW]
│  │     └─ test_reread_plan.py                       [NEW]
│  │
│  ├─ pdf-fidelity-engine/                            [REUSE] char_normalizer · fonts · rule_stitcher · table_grid · verify
│  ├─ pdf-vdoc-engine/                                [REUSE] vector_grid_extractor · visual_parity_scorer
│  │
│  ├─ harness-kit/harness_kit/
│  │  ├─ docstruct_vdoc.py                            [NEW] DocIR → vdoc 쪽 · 블록 · 슬롯 (유일한 변환기). TableIR → structured-table
│  │  ├─ docstruct_hwpx.py                            [NEW] hwpx.Table/Para → TableIR/블록 어댑터
│  │  ├─ hwpx_vdoc.py                                 [MOD] _table_block · _text_block 을 docstruct_hwpx + docstruct_vdoc 경유로 교체 (출력 동일성 유지, §9 P1)
│  │  ├─ hwpx.py                                      [KEEP] (필요하면 IR 에 넘길 속성 접근자만 추가)
│  │  ├─ vdoc_build.py                                [MOD 최소] 공용 슬롯 · 블록 도우미만 필요 시 추가
│  │  ├─ doc_text.py                                  [MOD] .pdf 도 DocIR 기반 텍스트 렌더(표는 `[표 pN-K]` 행 단위) — 색인 · 인용용
│  │  └─ page_ir/                                     [KEEP] 잔재(__pycache__). 사용 금지, 삭제는 사용자 확인 후
│  │
│  └─ harness-packs/
│     ├─ docstruct/                                   [NEW] 팩
│     │  ├─ pack.json                                 [NEW]
│     │  ├─ registry.ko.json                          [NEW] 조항 · 목록 머리표, 빈칸 패턴, 체크박스 글리프, 글꼴 별칭, 문장 끝 패턴 (데이터 레지스트리)
│     │  ├─ thresholds.json                           [NEW] D7 기준값 · 재판독 상한 · DPI · 허용오차 (코드 상수 대신)
│     │  └─ prompts/
│     │     ├─ table_read.md                          [NEW] 표 crop + 단어 목록 → HTML 표 (칸에 단어 id, role 속성) 지침
│     │     ├─ table_reread.md                        [NEW] 불합격 사유를 받은 재판독 지침 (구조만, 다른 해상도)
│     │     └─ page_blocks.md                         [NEW] 쪽 그림 → 블록 역할 · 빈칸 · 그림 영역 · 읽는 순서 지침
│     ├─ editor/
│     │  ├─ tools.compose.json                        [MOD] §7.1 도구 명세 추가 (배열 파라미터에 items 필수, 기존 서식 유지하고 끝에 덧붙임)
│     │  ├─ messages.json                             [MOD] docstruct 섹션 (도구 응답 · 오류 문구)
│     │  └─ rules/compose.md                          [MOD] F1~F4(hwpx) 는 그대로 두고, 그 아래에 "G 절차(PDF · 스캔)" 를 §7.2 로 **새로 추가** (§12.5)
│     ├─ core/rules/composer.md                       [MOD] 도구 목록 문구
│     └─ resource/index/lexicon.ko.json               [MOD 최소] doc_text 라벨이 필요할 때만
│
├─ .gitignore                                         [MOD] packages/docstruct-engine/eval/paths.local.json 추가
│
└─ apps/api/
   ├─ pyproject.toml                                  [MOD] 의존 · 로컬 경로 · pytest pythonpath 에 docstruct-engine 추가,
   │                                                        import-linter 계약 "Docstruct Engine is independent" 추가 (§12.6)
   ├─ dev_server.py                                   [MOD] WATCH_DIRS 에 packages/docstruct-engine/docstruct_engine 추가
   ├─ vibefs/
   │  ├─ doc_tools.py                                 [MOD] §7.1 도구 구현, IMPORTERS 에 .pdf 추가 (DocIR 경유)
   │  ├─ hook.py                                      [MOD] 파생 폴더(docstruct 캐시)의 PNG read_file 허용
   │  └─ index.py                                     [MOD 최소] .pdf 파생 텍스트 색인 (doc_text 경유)
   └─ tests/
      ├─ test_docstruct_tools.py                      [NEW] DocTools 흐름: open → propose → import → verify → reread (가짜 VLM · 가짜 OCR)
      ├─ test_docstruct_vdoc.py                       [NEW] TableIR → structured-table 필드 단위 검증
      └─ test_doc_text_hwpx.py                        [MOD 금지·통과 유지] hwpx 회귀 기준
```

---

## 5. IR 명세

단위는 원본 좌표계의 **pt**. px 변환은 변환기(`docstruct_vdoc.py`)만 한다.

### 5.1 단어층 — 글자의 유일한 출처

```jsonc
// PageIR.words[]
{ "id": "p3w0142", "text": "임대보증금", "bbox": [101.7, 420.1, 168.1, 431.0],
  "font": "Batang", "size": 9.0, "bold": false, "color": "#000000",
  "src": "pdf" | "ocr", "conf": 1.0 }
```

- 표 칸 · 문단 · 필드는 글자를 **단어 id 로만** 가리킨다. 글자를 복사하지 않는다.
- 고침은 원본을 덮지 않는다. `PageIR.fixes[] = { wordIds, text, by: "vlm"|"ocr-reread", reason }`.
- 변환기는 고침을 반영한 글을 내보낸다. 검증기는 고침 전과 후를 모두 볼 수 있다.

### 5.2 표 IR

```jsonc
{
  "id": "p3t1", "page": 3, "bbox": [42.7, 380.0, 750.0, 560.0],
  "grid": {                          // OpenXML tblGrid 대응: 경계 좌표 (열 n+1, 행 m+1)
    "cols": [42.7, 120.4, 300.2, 750.0],
    "rows": [380.0, 398.5, 420.0, 560.0]
  },
  "rowProps": [                      // OpenXML trHeight + tblHeader 대응
    { "height": 18.5, "rule": "atLeast", "header": true },
    { "height": 21.5, "rule": "atLeast", "header": false },
    { "height": 140.0, "rule": "exact",  "header": false }
  ],
  "repeatHeaderRows": 1,
  "cells": [                         // 칸 주소 + 병합 (HWPX cellAddr/cellSpan · HTML 과 같음). 가려진 칸은 목록에 없음
    { "r": 0, "c": 0, "rs": 1, "cs": 2,
      "role": "header" | "label" | "value" | "blank" | "checkbox",
      "words": ["p3w0140", "p3w0141"],
      "paras": [["p3w0140", "p3w0141"]],          // 칸 안 문단 나눔 (단어 id 묶음)
      "borders": { "top": {"style": "solid", "pt": 0.5, "color": "#000000"},
                   "right": {...}, "bottom": {...}, "left": {"style": "none"} },   // OpenXML tcBorders 대응
      "fill": "#E6E6E6",                                                            // OpenXML shd 대응
      "hAlign": "left" | "center" | "right" | "justify", "vAlign": "top" | "middle" | "bottom",
      "font": { "size": 9.0, "bold": true },
      "src": { "structure": "rulings" | "vlm" | "hwpx", "text": "pdf" | "ocr" | "hwpx" },
      "conf": 0.97 }
  ],
  "continued": { "from": "p2t3" | null, "to": "p4t1" | null },
  "caption": { "words": [...] } | null,
  "needsReview": false,
  "provenance": { "candidate": "rulings", "vlmRead": 1, "rereads": 0 }
}
```

### 5.3 블록 (표 밖)

| type | 필드 | 비고 |
|---|---|---|
| `heading` | `level`, `paras` | 크기 · 굵기 · VLM 역할로 판정 |
| `paragraph` | `paras`, `indent`, `firstLineIndent`, `align` | `reflow.py` 가 줄을 합침 |
| `listItem` | `marker`(원문 머리표), `level`, `paras` | 제N조 · ① · 1. · 가. · - · ※ · ■ 등은 레지스트리 |
| `field` | `label`(가까운 라벨 단어 id), `bbox`, `kind: line\|box\|date\|sign` | 손으로 채울 자리 |
| `checkbox` | `checked: bool`, `labelWords` | □ ☐ [ ] / √ ✓ ■ |
| `figure` | `bbox`, `kind: photo\|logo\|stamp\|chart\|other`, `keepText: bool` | 그림 안 글자는 그림으로 둔다 |
| `table` | 5.2 | |

쪽은 `PageIR = { page, size, mode, words, rulings, blocks(읽는 순서), fixes }` 다. `DocIR = { source, pages, tables(쪽 넘김 링크) }` 다.

### 5.4 불변식 (`ir/validate.py`, 위반하면 변환 금지)

1. `grid.cols` 와 `grid.rows` 는 순증가한다. 각 칸은 `0 ≤ r`, `r + rs ≤ 행 수` 이고 열도 같다.
2. 격자의 모든 단위 칸은 **정확히 한 번** 덮인다. 병합 이월을 포함한다(`_validate_table_matrix` 와 같은 규칙).
3. 단어 하나는 많아야 한 곳(칸 / 블록 / 그림 keep)에 속한다. 표 bbox 안의 단어가 아무 칸에도 없으면 오류다.
4. 칸에 귀속된 단어의 중심은 그 칸 사각형 안에 있다. 허용치는 `thresholds.json`.
5. `fixes` 의 `wordIds` 는 존재하는 단어다.

---

## 6. 단계별 지침

### 6.1 ① 확보 (acquire) — 코드

- **쪽 판정**: 글자층 품질(깨진 글자 비율. 정상 문자 범위표는 `registry.ko.json` 의 `okChars`)과 그림 면적으로 vector / garbled / scanned / mixed 를 정한다.
- **단어**
  - vector 쪽: pdf-fidelity `char_normalizer` 로 만든다. 겹쳐 찍은 가짜 굵게는 bold 하나로, 좌표 틈은 띄어쓰기로, 글꼴 이름은 cp949 로 복원한다.
  - scanned · garbled 쪽: OCR 로 만든다. 기본 300 DPI, 한국어, `OcrPort` 뒤에 Windows OCR.
  - mixed 쪽: 영역별로 고른다.
- **선**
  - 벡터 쪽은 `get_drawings` 의 가는 사각형과 선분에 점선 잇기를 더한다.
  - 스캔 쪽은 이진화 후 가로 · 세로 연속 구간(길이 ≥ 글자 높이 × k)을 쓴다.
  - 채움 사각형은 칸 음영 후보다.
- **그림**: 이미지 XObject 와 큰 비글자 영역.
- **렌더**: 쪽 그림(VLM 용 긴 변 1600px)과 영역 crop(재판독용 2배 · 400 DPI)을 만든다. 캐시 경로는 `doc_text.derived_dir()/docstruct/<hash>/`.

### 6.2 ② 표 후보 — 코드

- 선 묶음에서 칸 사각형을 만들고 TableIR 후보로 바꾼다(`table_grid.detect_tables` 재사용).
- 신뢰도: 닫힌 격자 비율, 선 굵기 일관성, 칸 안 단어 분포.
- 선 없는(borderless) 표는 여기서 만들지 않는다. ③ 에서 VLM 이 표라고 하면 그때 만든다.

### 6.3 ③ 구조 판독 — agy (VLM)

**입력** (도구가 준다)
- 쪽 그림 경로, 표 후보 영역 crop 경로.
- 영역 안 단어 목록: `id · text · 대략 위치(행 순)`.
- 선 후보의 HTML. "이 후보가 맞는지 보고 고쳐라"로 준다.

**출력**
- **표**: `<table>` HTML. `td`/`th` 에 `colspan` · `rowspan` · `data-role` 을 붙이고, 내용은 공백으로 나눈 단어 id 를 쓴다(예: `<td data-role="label">p3w0140 p3w0141</td>`).
- **블록**: 단어 id 묶음 + 역할(heading · paragraph · listItem · caption · note), 빈칸 · 체크박스 위치는 근처 단어 id 기준, 그림 영역은 그림 위 단어 id 를 keep 으로.
- **고침**: 확실할 때만 `fixes`. 원문을 덮지 않는다.

**금지**: 좌표 · 크기 · 글자 내용을 HTML 에 쓰는 것. 파서(`html_io.py`)는 단어 id 가 아닌 토큰을 거부하고 사유를 돌려준다.

### 6.4 ④ 맞붙임 · 조정 — 코드

1. `html_io` 가 HTML 을 논리 행렬(행 × 열 + 병합)로 바꾼다. 행 길이가 안 맞는 HTML 은 거부하고 사유를 돌려준다.
2. `snap`: 논리 경계를 실측 좌표로 바꾼다.
   - 각 경계는 그 경계를 사이에 둔 단어들 사이에 있어야 한다.
   - 그 구간에 선이 있으면 선 좌표를 쓰고, 없으면 단어 틈의 중앙을 쓴다.
3. `assign`: 단어를 칸에 넣는다. VLM 이 적은 단어 id 와 기하 귀속이 다르면 기하를 따르고 불일치를 기록한다(검증 입력).
4. `props`: 칸마다 네 변의 선(있음 · 종류 · 굵기), 채움, 정렬(칸 안 단어의 위치), 글자 크기 · 굵기(다수결)를 정한다.
5. `reconcile`:
   - 선 후보와 VLM 구조의 TEDS-S ≥ 0.98 → 선 후보 격자를 채택하고 VLM 의 role 만 입힌다.
   - 그 미만 → VLM 구조를 맞붙여 채택하고 `provenance` 에 불일치를 기록한다. ⑥ 에서 우선 검증한다.
   - 선 후보가 없으면 VLM 구조를 채택한다.
6. `continuation`: 앞 쪽 마지막 표와 열 경계가 같고(허용치 이내) 머리행이 반복되면 잇는다.
7. `reflow` · `markers` · `fields` · `order`: 표 밖 블록을 만든다. 규칙의 패턴은 전부 `registry.ko.json` 에서 읽는다.

### 6.5 ⑤ vdoc 변환 — `harness_kit/docstruct_vdoc.py`

| IR | vdoc (`packages/vdoc-schema/src/types.ts`) |
|---|---|
| `grid.cols` 간격 | `StructuredTableSectionDef.columnWidths` (% 문자열) |
| `rowProps[i].height` | `rows[i].height` (px). `rule: atLeast` 는 최소 높이로 |
| 칸 `r,c,rs,cs` | `cells[]` 순서 + `colSpan` / `rowSpan` (가려진 칸은 내보내지 않음) |
| `borders.top/right/bottom/left` | `borderTop/Right/Bottom/Left` (CSS 약식, 없음 = `hidden`) |
| `fill` | `backgroundColor` |
| `hAlign` / `vAlign` | `hAlign` / `vAlign` |
| `font` | `fontSize`, `fontWeight` (+ 칸 슬롯 HTML 의 span) |
| `role = header` | `isHeader: true` |
| `role = blank` | 칸 슬롯을 빈 편집 슬롯으로 (`editable-slot`) |
| `paras` | 칸 슬롯 HTML `<p>` 들 (고침 반영) |

변환 규칙
- 블록은 **흐름 배치**(frame 좌표 없음)로 내보낸다. 쪽 나눔은 원본 쪽을 따른다. 쪽 여백은 원본 내용 bbox 에서 잡는다.
- **쪽 전체 바탕 그림은 만들지 않는다.** 그림 블록은 `figure` 만.
- 쪽을 넘는 표는 쪽마다 따로 내보낸다. 머리행 반복은 원본대로 한다.
- hwpx 도 같은 변환기를 쓴다. `hwpx_vdoc.py` 의 기존 출력과 **필드 단위로 같아야** 한다(P1 완료 조건).

### 6.6 ⑥ 검증 — 코드

| 검사 | 비교 대상 | 지표 · 기준 |
|---|---|---|
| 변환 무결성 | IR → vdoc → (vdoc 에서 다시 읽은) IR′ | 구조 완전 일치 (아니면 변환기 버그) |
| 표 구조 | IR ↔ **독립 판독** | TEDS-S ≥ 0.95 |
| 칸 글자 | 칸 글(고침 반영) ↔ 칸 crop 고해상도 OCR (스캔) / 글자층 귀속 완전성 (벡터) | 표 평균 NED ≤ 0.02, 칸마다 ≤ 0.10 |
| 선 | 운영: IR 격자 · 칸 테두리 → 쪽 좌표 선 ↔ 원본 선 / 평가: 렌더된 표의 선 마스크 ↔ 원본 선 (§12.4) | 선 F1 ≥ 0.95 (허용 2px @150DPI) |
| 빈칸 · 체크박스 | IR ↔ 정답(평가 때) / VLM 블록 판독(운영 때) | 회수율 ≥ 0.90 |

- **독립 판독**은 IR 을 만든 경로와 다른 경로여야 한다.
  - IR 이 VLM 구조를 채택했다면: 선이 있는 표는 선 후보, 선이 없는 표는 2배 해상도 crop 의 VLM 재판독(`table_reread.md`, 이전 답 미제공).
  - IR 이 선 후보를 채택했다면: VLM 판독 결과가 독립 판독이다.
- **렌더**는 pdf-fidelity `verify/browser_measure.py`(CDP)로 vdoc 쪽을 캡처한다. 비교는 **선과 칸 경계만** 한다. 글자 픽셀은 비교하지 않는다.
- **결과**는 `verify/report.py` 형식(§7.3)이다. 표 · 칸마다 합격 / 불합격과 사유를 남긴다.

### 6.7 ⑦ 부분 재판독 — 코드 + agy

- **구조 불합격 (표 단위)**: 그 표를 2배 해상도로 crop 해서 `table_reread.md` 로 agy 에게 다시 묻는다. 불합격 사유(어느 행 · 열에서 어긋났는지)를 함께 준다. 결과는 ④ 로 보낸다.
- **글자 불합격 (칸 단위)**: 칸 crop 을 400 DPI 로 다시 OCR 한다.
  - OCR 결과와 기존 글이 다르면 `fixes` 에 `by: ocr-reread` 로 넣는다.
  - OCR 신뢰도가 낮으면 agy 에게 그 칸 그림만 보여주고 확인받는다.
- 회차는 최대 2회다. 그래도 불합격이면 `needsReview: true` 로 남기고 import 결과 요약에 목록으로 보고한다.
- 재판독은 **불합격 영역만** 한다. 합격한 표 · 칸은 다시 묻지 않는다(토큰 · 시간 절약이 목적).

---

## 7. agy 연동

### 7.1 도구 (vibefs `doc_tools.py`, 명세는 `editor/tools.compose.json`)

| 도구 | 입력 | 출력 |
|---|---|---|
| `dc_pdf_open` | `path`, `pages` | 쪽별 mode, 쪽 그림 경로, 표 후보 목록(id · 영역 · crop 경로 · 후보 HTML), 그림 후보 |
| `dc_pdf_words` | `path`, `page`, `region?` | 단어 목록 (id · text · 행 순서) |
| `dc_table_propose` | `path`, `page`, `table` (후보 id 또는 새 영역), `html`, `purpose`: `read` \| `reread` \| `verify` | 파싱 · 맞붙임 결과 요약, 거부 사유. `verify` 는 IR 을 바꾸지 않고 독립 판독으로만 저장 (§12.4) |
| `dc_blocks_annotate` | `path`, `page`, `blocks[]`, `fields[]`, `checkboxes[]`, `figures[]`, `fixes[]` | 반영 요약, 검증 오류 |
| `dc_import` | `path`, `pages`, `doc` (F1 규칙의 대상 문서), hwpx 만 `start_at` · `end_before` | vdoc 반영 + ⑥ 검증 요약 (합격 · 불합격 표/칸 수) |
| `dc_verify` | `path`, `page` | 불합격 목록 + 재판독 crop 경로 + 사유, 아직 없는 독립 판독 요청(`pendingReads`) |

- 배열 파라미터는 **모두 `items` 스키마를 가진다**. 없으면 Gemini 가 즉시 실패한다.
- 문구는 `editor/messages.json` 의 `docstruct` 섹션에서 가져온다.
- hwpx 의 `dc_import` 는 지금처럼 코드가 바로 IR 을 만든다. VLM 단계는 없다.

### 7.2 절차 (compose.md 의 PDF 절차를 교체)

1. 대상 문서를 정한다 — F1 과 같다 (지정 문서는 `dc_use`, 없으면 `dc_new(surface="paged", genre="document")`).
2. `dc_pdf_open` 을 부르고, 쪽 그림을 `read_file` 로 **직접 본다**.
3. 표 후보마다 crop 을 보고 `dc_pdf_words` 를 부른 뒤 `dc_table_propose` 로 HTML 을 낸다. 선 없는 표를 보면 새 영역으로 낸다.
4. 표 밖은 `dc_blocks_annotate` 로 낸다: 역할 · 빈칸 · 체크박스 · 그림 영역 · 확실한 고침만.
5. `dc_verify` 를 부른다 (문서에 쓰기 전, IR 만으로 검증).
   - `pendingReads` 가 있으면 그 crop 을 보고 `dc_table_propose(purpose="verify")` 로 독립 판독을 낸다.
   - 불합격 표는 crop 을 보고 `dc_table_propose(purpose="reread")` 로 다시 낸다. 최대 2회.
6. `dc_import` 를 부른다. 같은 원문 쪽을 같은 문서에 다시 부르면 이전에 넣은 그 쪽들을 **제자리에서 바꾼다** (중복 생성 금지).
7. 끝나면 문서별로 쪽 수 · 표 수 · 불합격(needsReview) 목록 · 고친 글자 수를 보고한다.

### 7.3 검증 보고 형식 (`verify/report.py`)

```jsonc
{ "page": 3, "verdict": "pass" | "fail",
  "tables": [ { "id": "p3t1", "tedsS": 0.97, "nedMean": 0.004, "nedMax": 0.03, "lineF1": 0.98,
                "failing": [ { "cell": [4, 2], "metric": "ned", "value": 0.18, "crop": "…/p3t1_r4c2@400.png" } ],
                "verdict": "pass", "round": 1, "needsReview": false } ],
  "blocks": { "paragraphs": 12, "fields": 6, "checkboxes": 4, "figures": 1 },
  "fieldRecall": null }
```

---

## 8. 데이터 레지스트리 (코드에 문서별 규칙을 넣지 않는다)

`packages/harness-packs/docstruct/registry.ko.json`:
- `clauseMarkers`: 제N조, ①~⑳, 1. 1), (1), 가. 나), -, ·, ※, ■ ▪ ◆ ◈ 등 (정규식 + 수준)
- `fieldPatterns`: 연속 밑줄, `(   )`, `년 월 일`, `(인)` `(서명)`, 빈 값 칸 판정 조건
- `checkboxGlyphs`: 빈칸 / 체크 글리프 목록
- `sentenceEnds`: 문단 합치기 판정용 끝맺음 패턴
- `fontAliases`: 한글 글꼴 이름 → 열쇠 (굴림 · 굴림체 · 돋움 · 바탕 · 함초롬 등)
- `okChars`: 글자층 품질 판정용 정상 문자 범위 (한글 음절 · 자모 · 기본 라틴 · 숫자 · 문장부호 · 자주 쓰는 기호, 코드 포인트 범위로)

`thresholds.json`: D7 기준, 재판독 상한, DPI, 맞붙임 허용치, 후보 채택 TEDS-S 기준.

새 문서가 실패하면 **레지스트리나 기준값을 고치고, 문서 이름 · 특정 문자열로 분기하는 코드를 쓰지 않는다.**

---

## 9. 단계별 진행 (각 단계는 완료 조건을 만족해야 다음으로)

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| **P0** | `ir/` (model · schema · validate), `verify/teds.py` · `ned.py`, `eval/` 골격, 정답 IR 2쪽(근로복지기금 p1, 계약서 p2) **초안** | 단위 테스트 통과. 정답 IR 은 사용자에게 보여주고 확인받음 |
| **P1** | `docstruct_hwpx.py` + `docstruct_vdoc.py`, `hwpx_vdoc.py` 를 이 경로로 교체 | RFP hwpx(Ⅳ장 + 붙임 서식) 변환 결과가 교체 전과 **같다** (스냅숏 비교). `test_doc_text_hwpx.py` 통과 |
| **P2** | 벡터 PDF: acquire · candidates · assign · props · reflow · fields · `dc_import(.pdf)` (VLM 없이 선 후보만) | 근로복지기금 · 계약서 정답 대비 선 있는 표 TEDS-S ≥ 0.95. 문단이 흐름(줄 수 > 문단 수) |
| **P3** | VLM 판독: `html_io` · `snap` · `reconcile` · 도구 · 팩 프롬프트 · compose 절차. 스캔 OCR · 선 없는 표 · 펼침면 | agy 로 평가 세트 전체 import 성공. 스캔 브로셔 글자 CER ≤ 3% |
| **P4** | 검증 · 재판독 (`verify/` · `reread/` · `dc_verify`) | 의도적으로 망친 IR(병합 하나 제거, 칸 글자 바꿈)을 검증이 잡고, 재판독 뒤 합격 |
| **P5** | 평가 세트 전체 실행, 점수표 | D7 기준 충족 또는 미달 항목 · 원인 · 다음 조치를 보고서로 |

정답 IR 작성: 에이전트가 초안을 만들고(엔진 출력에서 출발해도 됨), **사용자가 확인한 뒤** `reviewedBy` 를 채운다. 확인 전 정답으로 점수를 매겨 "합격"이라 보고하지 않는다.

---

## 10. 지켜야 할 규칙 (어기면 작업이 무효)

1. **git 인덱스를 건드리지 않는다.** `git add` / `git mv` / `git rm` 금지. 사용자가 스테이징을 체크포인트로 쓴다. 파일 이동은 일반 `mv`. 커밋은 사용자가 시킬 때만.
2. **dev 서버 재시작 주의.** `apps/api/app`, `apps/api/vibefs`, `packages/harness-kit/harness_kit` (그리고 추가할 `docstruct-engine/docstruct_engine`) 를 고치면 API 가 재시작되어 **실행 중인 agy 세션이 죽는다.** agy 가 도는 동안 코드 수정 금지.
3. **`harness_kit` 에는 한글 문자열 리터럴 금지** (`test_harness_packs` 가 검사). 사용자 문구와 패턴은 팩으로. `harness_kit` 는 `app` · `vibefs` 를 import 하지 않는다. `docstruct-engine` 도 같은 규칙(호스트 비의존)을 따른다.
4. **Gemini 도구 명세**: array 파라미터에 `items` 필수. `tools.compose.json` 은 기존 서식을 유지하고 새 명세만 덧붙인다(전체 재포맷 금지).
5. **AI 는 사람 문서에 구조 작업을 하지 않는다.** import 대상은 기존 F1 규칙을 따른다: 사용자가 지정한 문서(`dc_use`, 채울 대상으로 원문 쪽을 들이는 것은 허용)이거나, 지정이 없으면 `dc_new` 로 만든 자기 초안. 그 밖의 사람 문서의 표 · 블록을 고치거나 지우지 않는다.
6. **좌표 · 글자는 코드만.** VLM 출력에 좌표가 들어오면 거부한다. VLM 글자 고침은 `fixes` overlay 로만 넣는다.
7. **과적합 금지.** 평가 문서 이름 · 특정 문구로 분기하는 코드 금지. 실패는 레지스트리 · 기준값 · 일반 규칙으로 고친다. 평가 세트는 특성(벡터 / 가짜 굵게 / 스캔 / 펼침면 / 선 없는 표 / 쪽 넘김 표)으로 태깅해 다양성을 확인한다.
8. **폐기된 방식 재도입 금지.** 쪽 바탕 그림 + 좌표 글 상자, px 위치 오차를 주 지표로 쓰는 것.
9. **기존 경로 보존.** `form_scaffold`, `catalog` 의 pdf-vdoc 어댑터, `pdf-fidelity-engine`, `pdf-vdoc-engine` 코드는 수정하지 않는다(가져다 쓰기만). 고쳐야 하면 사용자에게 먼저 묻는다.
10. **확인.**
    - 작업 끝마다 `apps/api` 에서 `python -m pytest -q`, 새 패키지에서 `python -m pytest -q`, 저장소 루트에서 `python -m ruff check` (바꾼 파일).
    - 화면 확인은 브라우저 1920×1080 에서 한다(레이아웃을 창에 맞춰 줄이지 말 것).
    - 결과는 수치(§6.6)로 보고한다. 실패는 실패로 보고한다.
11. **평가 원본 파일은 저장소에 복사하지 않는다.** 경로는 gitignore 된 `eval/paths.local.json` 에만 둔다(사용자 개인 파일, §12.6).

---

## 11. 범위 밖

- 픽셀 일치 배치, 쪽 바탕 그림
- docx 내보내기 · 들여오기 (IR 이 OpenXML 어휘를 따르므로 다음 작업으로 남김)
- 외부 OCR · 문서 API (Upstage · Azure 등). `OcrPort` · 구조 판독 포트로 나중에 꽂을 수 있게만 둔다
- 스튜디오 UI 의 `needsReview` 표시 · 검토 패널 (보고서 · 도구 응답까지만)
- 수식 · 차트 데이터 복원

---

## 12. 확정 사항 — 착수 전 검토 질의에 대한 답 (2026-11-12)

이 절이 앞 절과 다르면 **이 절이 우선**이다.

### 12.1 표 밖 블록 → vdoc 매핑 (새 블록 종류를 만들지 않는다)

`LAYOUT_BLOCK_KINDS`(`packages/vdoc-schema/src/base-block.ts`)는 바꾸지 않는다. 종류를 늘리면 block-kit 정의 · slot-canvas 뷰 · 계약 테스트가 함께 필요해 이번 범위를 넘는다.

| DocIR | vdoc | 규칙 |
|---|---|---|
| `heading` | `heading` (`level` 1~4, `align`) | 슬롯 HTML 에 원문 글. 쪽 맨 위 서식 제목도 `heading` level 1 (`form-title` 은 쓰지 않음) |
| `paragraph` | `text` | 이어진 문단들(사이에 표 · 그림 · 제목이 없는 묶음)을 **블록 하나**에 `<p>` 여러 개로. 들여쓰기 · 정렬 · 글자 크기는 `<p style>` · `<span style>` |
| `listItem` | `text` 안의 `<p>` | 원문 머리표(제3조 · ① · 가.)를 **글자로 보존**. 자동 번호 목록(`<ol>`) 금지. 내어쓰기는 `padding-left` + 음수 `text-indent` |
| `caption` · `note` | `text` | |
| `field` (표 칸 안) | 그 칸 슬롯 `role: editable-slot` | hwpx 루트의 빈 칸과 같다 |
| `field` (한 줄 · 영역을 차지) | `fillable-group` | `kind: line\|box → text-area`, `date → date`, `sign → signature`. `assigneeName` 은 라벨 글 |
| `field` (문장 속 밑줄 몇 칸) | 그 `text` 블록 안 원문 그대로 (밑줄 · 공백 유지) | 새 인라인 노드를 만들지 않는다. import 보고에 위치를 적는다 |
| `checkbox` | 원문 글리프 그대로 (□ · ☐ · [ ] / ☑ · √ · ■) | IR 의 `checked` 는 평가 · 보고용. 새 블록 · 슬롯 없음 |
| `figure` | `image` | `src` = 그림 영역 crop 의 **data URI JPEG** (150 DPI, 긴 변 ≤ 1600px, 품질 82). 리소스로 등록하지 않는다 (Resource · Document 분리 원칙). 그림 위 글자(`keepText`)는 그림에 남긴다 |

문구 출처:
- 블록 · 슬롯 라벨(칸 라벨, 표 제목, 그림 제목, 빈칸 라벨)은 hwpx 루트가 쓰는 `labels()`, 곧 `resource:index/lexicon.ko.json` 의 `docText` 를 그대로 쓴다. 없는 라벨만 거기에 추가한다. P1 동일성 때문에 출처를 하나로 둔다.
- 도구 응답 · 오류 문구는 `editor/messages.json` 의 `docstruct` 섹션.
- VLM 지침은 `harness-packs/docstruct/prompts/`.

### 12.2 P1 동일성을 위한 IR 확장 · hwpx 규약

**`TableIR`** 에 다음을 추가한다 (모두 선택 필드, PDF 경로는 비워도 된다):

| 위치 | 필드 | 대응 (현행 `hwpx_vdoc._table_block`) |
|---|---|---|
| 표 | `widthRatio` | `tableWidthRatio` |
| 표 | `borderRules` | `borderRules` (현행은 항상 `none` 셋) |
| 표 | `title` | `title` |
| 칸 | `padding: {t, r, b, l}` (pt) | `padding` |
| 칸 | `font.family`, `font.color` | `fontFamily` (`_font_stack`), `color` |
| 칸 | `lineHeight` (배수) | `lineHeight` |
| 칸 | `nested: TableIR[]` | 칸 안 표. 변환은 현행 `_cell_html` 과 같이 **행마다 `칸 · 칸` 한 줄 `<p>`** |
| 칸 | `continued: bool` | 쪽 넘김으로 이어진 칸 (빈칸 판정에서 제외 — 현행 `fillable = not text and not cell.continued`) |

hwpx 규약:
- **단어층**: hwpx 의 단어는 run 단위다. `bbox: null`, `src: "hwpx"`, 글꼴 · 크기 · 굵기 · 색은 run 스타일에서 가져온다. 좌표 불변식(§5.4 #4)은 `src == "hwpx"` 이면 건너뛴다.
- **`start_at` · `end_before` 자르기, 쪽 추정, `PageReport`**: hwpx 어댑터(`docstruct_hwpx.py`)가 IR 을 만들기 전에 처리한다. `fill_cells` 는 `role == blank` 칸 수, `pictures` 는 그림 수로 IR 에서 다시 센다.
- **동일성 비교 방법**: 같은 입력으로 교체 전 · 후 vdoc JSON 을 만들고, 생성 id(`uid`)를 등장 순서 번호로 치환한 뒤 **완전 일치**를 본다. 기준 입력은 RFP hwpx (Ⅳ장 + 붙임 2~11호 서식)이다. 경로는 `paths.local.json` 의 `rfp-hwpx`, 쪽 범위는 `test_doc_text_hwpx.py` 와 같다. 스냅숏 파일은 원문 글이 들어가므로 `.gitignore` 된 로컬 폴더에 둔다. 원본이 없으면 skip.

### 12.3 중간 상태 저장 규약

- **저장 위치**: 원본 파일 기준이다(문서 기준이 아님). 한 원본을 여러 문서에 넣을 수 있기 때문이다. `derived_dir()/docstruct/<srcHash>/` 아래에 둔다. `srcHash` 는 파일 내용 sha256 앞 16자다.

  ```
  <srcHash>/
    acquire.json            ① 확보 결과 (쪽 mode · 단어 · 선 · 채움 · 그림 후보) + 엔진 버전
    p<N>.png, p<N>_*.png    쪽 그림 · 표 crop · 칸 crop
    p<N>.candidates.json    ② 표 후보
    p<N>.reads.json         ③ agy 제출 기록 (append-only: table html · blocks · fixes, purpose, round, 시각)
    p<N>.ir.json            ④ 최신 PageIR
    p<N>.verify.json        ⑥ 최신 검증 보고
  ```

- **갱신 규칙**: 엔진 버전이나 원본 해시가 바뀌면 그 폴더를 새로 만든다. `reads.json` 은 지우지 않고 쌓는다. `ir.json` 은 reads 와 candidates 에서 언제든 다시 만들 수 있어야 한다.
- **`dc_import(path, pages, doc)`**:
  - 쪽마다 `ir.json` 이 없거나 오래됐으면 만든다. reads 가 없으면 **후보와 규칙만으로** 만든다. P2 는 이 경로로만 돈다.
  - 그다음 vdoc 에 반영한다.
  - 문서 `origin.imports[]` 에 `{engine: "docstruct", srcHash, sourcePages, docPageIds, irVersion}` 를 남긴다. 다시 import 할 때는 이것으로 이전 쪽을 찾아 바꾼다.
- `start_at` · `end_before` 는 hwpx 만 받는다. PDF 는 `pages` 만 받는다.

### 12.4 검증 실행 경계

| 검사 | 운영 (`dc_verify` · `dc_import`) | 평가 (`run_eval.py`) |
|---|---|---|
| 변환 무결성 | ✓ (vdoc 를 만든 뒤 다시 읽어 IR 과 구조 비교) | ✓ |
| 표 구조 TEDS-S | ✓ (독립 판독이 있을 때) | ✓ (정답 IR 대비) |
| 칸 글자 NED | ✓ (스캔: 칸 crop 고해상도 OCR / 벡터: 귀속 완전성) | ✓ (정답 대비) |
| 선 F1 | ✓ **IR 기하** — 격자 · 칸 테두리를 쪽 좌표의 선으로 바꿔 원본 선과 비교 (브라우저 불필요) | ✓ **렌더** — CDP 로 실제 화면의 선 비교 |
| 빈칸 회수율 | — (정답 없음, VLM 판독 개수만 보고) | ✓ |

- **CDP 렌더는 평가 전용이다.** `run_eval.py --render` 일 때만 쓴다.
  - 전제: 디버그 크롬(`--remote-debugging-port=9222`)과 스튜디오(5180) 실행. `run_eval.py` 가 평가용 문서 URL 로 탭을 직접 이동시키고 `browser_measure.py` 로 잰다.
  - 전제가 없으면 경고를 내고 렌더 항목만 건너뛴다.
  - `browser_measure.py` 는 고치지 않는다. 필요한 측정 JS 는 `docstruct_engine` 쪽에 둔다.
- **독립 판독의 주체는 agy 다.** 엔진은 VLM 을 부르지 않는다. 대신 "판독 요청"(crop 경로 · 단어 목록 · 프롬프트 id)을 만들고, 제출 결과를 받는다.
  - `dc_verify` 가 `pendingReads` 로 요청을 돌려준다.
  - agy 는 crop 을 보고 `dc_table_propose(purpose="verify")` 로 낸다. 이 판독은 IR 을 바꾸지 않고 `reads.json` 에 독립 판독으로만 저장한다.
  - 도구 응답에 이전 HTML 을 다시 보여주지 않는다. 다만 같은 대화 안이라 완전한 독립은 아니다.
  - 이 한계는 `StructurePort` 인터페이스로 열어 둔다. 나중에 호스트(apps/api)의 LLM 게이트웨이로 별도 호출하는 어댑터를 꽂을 수 있게 한다. 구현은 범위 밖이다.
- 선 후보를 채택한 표는 ③ 의 `read` 판독 자체가 독립 판독이다. 추가 요청이 없다.

### 12.5 `compose.md`

현재 `editor/rules/compose.md` 에는 S1~S7(새로 쓰기)과 F1~F4(hwpx 원문 가져오기)만 있다. 예전 G 절차는 롤백으로 없어졌다.

- F1~F4 는 **그대로 둔다**. P1 뒤에도 hwpx 는 코드가 바로 IR 을 만들므로 agy 절차가 같다.
- 그 아래에 `[PDF · 스캔 원문 가져오기 — …일 때]` 머리글로 **G1~G7** 을 새로 추가한다. 내용은 §7.2 다.
- `core/rules/composer.md` 의 도구 목록에 새 `dc_*` 도구 이름을 더한다.

### 12.6 환경 · 의존 · 저장소 규약

- **TEDS 는 자체 구현한다.** `apted` 를 설치하지 않는다(새 외부 의존 · 설치 승인 불필요).
  - `verify/teds.py` 에 Zhang–Shasha 트리 편집거리를 구현한다. 표가 수백 칸 이하라 충분하다.
  - TEDS = 1 − TED / max(노드 수). TEDS-S 는 글자 노드를 비교하지 않는다.
  - 테스트: 같은 표 = 1.0, 병합 하나 차이, 행 하나 누락, 열 순서 바뀜의 기대값을 손으로 계산해 단언한다.
- **평가 파일 경로**:
  - `manifest.json` 은 문서 id · 쪽 범위 · 특성 태그만 가진다.
  - 실제 경로는 `eval/paths.local.json`(`{ "<doc-id>": "<절대경로>" }`, gitignore)에서 읽는다. `$DOCSTRUCT_EVAL_ROOT` 는 쓰지 않는다. 평가 파일이 여러 폴더에 흩어져 있기 때문이다.
  - 문서 id: `lease-910`, `welfare-minutes`, `kids-council`, `review-minutes`, `daily-minutes`, `brochure-scan-a`, `brochure-scan-b`, `rfp-hwpx`.
  - 경로 값은 사용자가 채운다. 에이전트는 예시 파일만 만들고 채팅으로 경로를 묻는다. 파일이 없으면 그 문서만 skip 하고 보고한다.
- **`apps/api/pyproject.toml`**:
  - `dependencies` 에 `docstruct-engine`, 로컬 경로 소스에 `../../packages/docstruct-engine` 를 추가한다(pdf-vdoc-engine 과 같은 방식).
  - `[tool.pytest.ini_options].pythonpath` 에도 같은 경로를 추가한다.
  - import-linter 계약 `"Docstruct Engine is independent"` 를 추가한다: `source_modules = ["docstruct_engine"]`, `forbidden_modules` 는 "Pdf Fidelity Engine is independent" 와 같은 목록(`app.*` 전부 + `harness_kit` + `vibefs`). `pdf_fidelity_engine` · `pdf_vdoc_engine` import 는 허용한다.
- **새 팩 `harness-packs/docstruct/pack.json`**:
  - `name: "docstruct"`, `dependsOn: ["core"]`. 도구는 editor 팩의 `tools.compose.json` 에 두므로 `tools` 항목이 없다.
  - 프롬프트 파일을 manifest 에 선언하면 실제로 있어야 한다(`test_compose_recipes_and_declared_files_resolve`).
  - 메시지 틀의 `{이름}` · `{{ }}` 이스케이프 규칙을 지킨다(`test_message_templates_are_valid_format_strings`).
  - 도구 이름은 팩 전체에서 유일해야 한다.
- **Windows OCR**: `ko` · `en-US` 언어팩이 설치돼 있다(확인됨). 기본은 `ko` 다. 숫자 · 영문 위주 칸은 재판독 때 `en-US` 로 한 번 더 읽어 신뢰도가 높은 쪽을 쓴다.

### 12.7 좌표 · 고침 · 불변식 세부

- **좌표계**: PyMuPDF 쪽 좌표다. **원점은 좌상단, y 는 아래로**, 단위는 pt. 회전된 쪽은 `page.rotation_matrix` 로 회전을 푼 표시 좌표를 쓴다. 크기는 `PageIR.size = {"width": pt, "height": pt}` 이고 회전을 반영한 표시 크기다.
- **여러 단어 고침(`fixes`)**:
  - `wordIds` 는 **한 그릇(한 칸 또는 한 블록) 안에서 읽는 순서로 연속**이어야 한다. 아니면 거부한다.
  - 렌더할 때는 첫 단어 id 자리에 고친 글 전체를 쓰고, 나머지 id 는 빈 글로 낸다.
  - 띄어쓰기는 고친 글 안의 것을 따른다.
  - 검증(NED)은 그릇 단위로 "고침을 반영한 글"과 비교한다.
  - 같은 단어에 고침이 여럿이면 마지막 것이 이긴다. 기록은 모두 남긴다.
- **불변식 위반 처리 (§5.4 를 덮어씀)**:
  - **#1 · #2 · #5 (격자 · 덮임 · 고침 대상)**: 위반이면 **그 표만** 변환하지 않는다. 사유를 도구 응답으로 돌려 agy 가 다시 제출하게 한다. 2회 실패하면 그 표 영역을 그림(`image`, data URI)으로 내보낸다. 이 그림은 `needsReview` 이고 보고에 적는다.
  - **#3 · #4 (단어 귀속)**:
    - "표 안 단어" 는 **단어 중심이 표 bbox 를 안쪽으로 1pt 줄인 사각형 안**에 있는 단어다. 테두리에 걸친 바깥 단어는 해당되지 않는다.
    - `figure.keepText` 영역에 든 단어는 그림에 귀속된 것으로 본다.
    - 그래도 남는 단어는 **가장 가까운 칸에 붙이고** 그 표를 `needsReview` 로 표시한다. 변환은 진행한다.
