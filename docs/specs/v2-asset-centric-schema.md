# v2 에셋 중심 스키마 사양 (초안)

작성 2026-11-25 · 대상: playground v2 (`.vdoc` · `.outline` · `.vstyle` · `.vasset`)
상태: 사양 초안 — 구현 전 합의용. 코드 변경 없음.

## 0. 한 줄 원칙과 이 문서의 범위

> **양식 · 형식 · 구조에 관한 모든 생산과 재편은 에셋을 거친다.**
> 원천(첨부 그림 · 레퍼런스 · 서식 원문 · 내 문서 블록 · 에이전트 계획) → **해체(에셋 등록)** → 에셋(구조 + 스타일 짝) → **적용(Staged)** → 블록은 `assetRef` 와 스타일 토큰만 가진다.

이 문서는 세 가지를 정한다.

1. 에이전트가 **새 문서**를 에셋 중심으로 짓기 위해 필요한 추가 사양 (§2)
2. 지금 있는 예제를 모두 담기 위한 **구조 · 스타일 각각의 추가 기준** (§3)
3. 지금 있는 요소를 **컴포넌트(에셋)로 재구성**해 일관된 구조를 갖게 하는 사양과 이행 (§4)

구조 태그와 스타일 사양은 앞으로 계속 늘어난다. 그래서 이 문서는 태그 목록을 고정하지 않고 **늘리는 규칙(프리미티브 + 역할 + 등록부)**을 정한다. 특정 예제에 맞춘 규칙은 두지 않는다.

---

## 1. 현재 상태 (2026-11-25 실측)

### 1.1 숫자

볼트 `apps/playground/data/vaults` 전체 스캔.

| 항목 | 값 |
|---|---|
| `.vdoc` | 13개 (출처: import 5 · agent 5 · 미상 3) |
| 블록 | 277개 |
| `assetRef` 가 있는 블록 | 6개 (전부 에셋 패널로 넣은 것 · 표는 0개) |
| 표 | 25개 — 이 중 블록 안에 서식이 박힌 표 23개 |
| `styleRef`(스타일 팩)를 가리키는 문서 | 1개 |
| `outlineRef`(구조 소스)를 가진 문서 | 5개 |
| `.vasset` | 6개 — 전부 기본 시드, 작업 중 생긴 에셋 0개 |
| `.vstyle` | 5개 (standard · gov-rfp · yesform-official · yonhap-news · naver-travel-blog) |

### 1.2 구조를 만드는 길이 따로따로다

| 길 | 코드 | 에셋 | 서식 |
|---|---|---|---|
| 서식 원문 가져오기 | `dc_import` → `docstruct_engine/compile/hwpx_vdoc.py` · `docstruct_vdoc.py` | ✕ | 블록에 박음 |
| 에이전트 초안 | `dc_build` → `vdoc_build.make_block` (`KINDS`) | ✕ | 고정 색 박음, 레퍼런스 서식은 `<span style>` 로 옮기라고 규칙에 적혀 있음 (`harness-packs/editor/rules/compose.md` S5) |
| 레퍼런스 뼈대 | `ref_tools` · `reference/adapters/normalizer.py` | ✕ (비교용으로만) | – |
| Composer 그림 첨부 | `ai-vault/src/media.ts` | ✕ (이미지 첨부) | – |
| outline 컴파일 | `outline-sync/src/bridge.ts` → `ir-compiler` | △ `<<asset:>>` 있을 때만 | `.vstyle` 가능 |
| 에셋 패널 | `VDocAssetPanel.tsx` | ○ | 에셋에 스타일 짝 없음 |

### 1.3 어휘가 넷으로 갈라져 있다

같은 것을 부르는 이름이 층마다 다르다.

| 층 | 어휘 | 위치 |
|---|---|---|
| 구조 문법 | element `table` · `section` · `resource` + 기호 규칙 | `vdoc-schema/src/element-syntax/registry.ts` |
| 렌더 블록 | `LayoutBlock.kind` 16종 (`structured-table`, `callout-box`, `columns-grid` …) | `vdoc-schema/src/blocks` · `block-kit/kinds` |
| 에셋 v2 프리미티브 | `AssetPrimitiveKind` 10종 (`kv-block`, `clause-tree`, `table-grid` …) | `asset-kit/types.ts` |
| 에이전트 빌더 | `KINDS` 9종 (`table`, `callout`, `gallery` …) | `vdoc_build.py` |
| 스타일 합성 | `text` · `frame` · `table` · `media` · `pageChrome` | `style-core/src/core/token-contract.ts` |

`callout` / `callout-box`, `table` / `structured-table`, `gallery` / `columns-grid`, `paragraph` / `text` 처럼 같은 것이 둘씩 있다.

### 1.4 에셋의 스타일은 자연어다

`<<asset:…>>` 의 `시각스타일::` 은 글로 쓰고 `parseTableAssetVisualPreset` 이 정규식으로 키워드("세로선 제거", "네이비" …)를 찾아 프리셋으로 바꾼다. 결정적이지 않고, 표 말고는 없다.

---

## 2. 에이전트가 새 문서를 에셋 중심으로 짓기 위한 추가 사양

### 2.1 짓는 순서

```
계획(IA)  →  에셋 고르기/만들기  →  인스턴스로 놓기  →  채우기  →  점검
outline       assets.recommend          assets.instantiate    slots.*       dc_check
              assets.parse/compose                                         + 에셋 점검
```

1. **계획**: 섹션 골격을 outline 으로 먼저 쓴다 (지금도 outline 이 있는 문서는 그렇다). 블록 종류가 아니라 "여기는 요구사항 정의 표 × N", "여기는 일정 표" 처럼 **무엇이 반복되는가**를 쓴다.
2. **에셋 고르기**: 각 골격 자리에 맞는 에셋을 찾는다. 없으면 만든다 — 레퍼런스 · 첨부에서 해체하거나, 컴포넌트를 조합해 세션 에셋을 만든다.
3. **놓기**: 블록을 직접 짓지 않고 에셋 인스턴스로 놓는다. 같은 모양이 여러 번이면 같은 에셋을 여러 번 놓는다.
4. **채우기**: 칸(slot)만 채운다.
5. **점검**: 지금의 `dc_check` 에 에셋 점검을 더한다 (§2.5).

### 2.2 도구 계약 (추가 · 변경)

| 도구 | 하는 일 | 비고 |
|---|---|---|
| `assets.search` | 있는 것 | 그대로 |
| `assets.recommend {slotIntent, sample?}` | 골격 자리 설명으로 후보 2~3개 | `recommendAssetsViaAi` 를 도구로 |
| `assets.parse {source}` | 원천을 해체해 **세션 에셋** 생성 | source = `attachment:<id>` · `ref:<id>#page` · `hwpx:<path>#page` · `block:<docPath>#<blockId>` |
| `assets.compose {components[], fields[]}` | 컴포넌트를 조합해 세션 에셋 생성 | 원천이 없을 때 (§4 컴포넌트 등록부 사용) |
| `assets.instantiate {assetId, at, bindings?, records?}` | 에셋을 문서에 놓기 | 에이전트 초안이면 바로, 사람 문서면 Staged |
| `assets.apply {assetId, targets[], layers}` | 이미 있는 블록을 에셋 모양으로 재편 | layers = `structure` · `style` (따로 켜고 끔) · 항상 Staged · 편집 깊이 = 고치기 |
| `assets.save {sessionAssetId, title, scope}` | 세션 에셋을 볼트 에셋으로 승격 | 사람이 승인 |

`dc_build` 의 변화:

- 구조 블록(`table`, `callout`, `gallery`, `hero` …)을 `add` 하는 것은 **에셋 없이 허용하되 반드시 세션 에셋으로 자동 등록**한다. 구조가 같으면(§4.4 지문) 기존 세션 에셋에 붙인다. 고아 구조가 남지 않는다.
- 서식 인자(색 · 선 · 굵기 · `<span style>`)는 받지 않는다. 대신 **변형 이름**(`variant`)과 **역할**(§3.1)만 받는다. 색은 스타일 팩이 정한다.
- `dc_new` 는 스타일 팩(`styleRef`)을 고른다. 고를 근거가 없으면 장르 기본 팩.

`dc_import` 의 변화:

- 모양을 옮기는 것은 여전히 코드(`hwpx_vdoc`)가 한다 ([[form-import-route]] 원칙 유지).
- 다만 쪽 · 표마다 **에셋을 먼저 뽑고(`origin.sourceType = "ref-extract"`) 그 인스턴스로 붙인다.** 서식은 원문 스타일 팩 조각(§3.2.4)으로 문서 팩에 합류하고, 블록에는 남지 않는다.

### 2.3 에셋의 수명 세 층

| 층 | 저장 | 만들어지는 때 | 보임 |
|---|---|---|---|
| 세션 에셋 | 세션 메모리 + 문서 사이드카(`<doc>.vdoc.assets.json`) | `assets.parse` · `assets.compose` · `dc_build` 자동 등록 | 그 문서 · 그 세션 |
| 볼트 에셋 | `.vibedoc/assets/*.vasset` | `assets.save` (사람 승인) | 볼트 전체 |
| 기본 시드 | 코드(`seed-assets.ts`) | 배포 | 모두 |

- 인스턴스는 세션 에셋을 가리켜도 된다. 문서를 닫아도 사이드카에 남으므로 깨지지 않는다.
- 승격하면 같은 문서 안 인스턴스의 `assetRef.assetPath` 를 볼트 경로로 바꾼다 (`vault-formats/src/vdoc.ts` 의 경로 갱신과 같은 길).

### 2.4 불변식 (테스트로 지킨다)

1. 구조 블록은 모두 `assetRef` 를 가진다 (text · heading 처럼 구조가 없는 블록은 예외 목록으로 명시).
2. 블록 안에 서식 값이 없다 — 역할 · 변형 이름만 있다. 예외는 Layer 4 인스턴스 덮어쓰기(§3.2.3)뿐이고, 개수가 보고된다.
3. 에셋에는 내용(사용자 글)이 없다 — 고정 글(머리칸 글자 등 구조 글)과 자리표시자만 있다.
4. 같은 지문(§4.4)의 블록은 같은 에셋을 가리킨다.

### 2.5 점검 (`dc_check` 확장)

- 에셋 없는 구조 블록 수, 블록 안 서식 값 수, 같은 지문인데 다른 에셋을 가리키는 블록.
- 에셋이 요구하는 필드 중 빈 칸.
- 스타일 팩에 없는 역할을 쓰는 블록 (팩이 그 역할을 모른다 = 기본 모양으로 그려짐).

### 2.6 편집 깊이와의 관계

[[user-controls-edit-depth]] 의 고정 모드와 그대로 맞물린다.

| 동작 | 깊이 |
|---|---|
| 칸 채우기 | 채우기 |
| 에셋의 반복 단위(§3.1.2) 추가 · 삭제 | 늘리기 |
| `assets.apply` (구조 층) · 다른 에셋으로 갈아 끼우기 | 고치기 |
| `assets.apply` (스타일 층) · 변형 바꾸기 | 서식 (깊이와 별개 축) |

### 2.7 처음 보는 양식도 같은 절차로 분해한다

Composer 에 어떤 양식이 들어와도(처음 보는 서식 그림 · 낯선 hwpx · 남의 블로그) **같은 해체 절차**를 밟는다. 양식 종류 목록이나 "공문이면 …, RFP 면 …" 같은 분기는 두지 않는다 ([[skill-design-thinking-procedure]]). 절차는 무엇을 생각하고 확인할지만 정한다.

1. **격자부터**: 보이는 선 · 정렬 · 반복 간격으로 행 × 열 격자와 병합을 잡는다 (`grid`). 선이 없어도 정렬이 격자다.
2. **고정 글과 채울 자리 가르기**: 여러 장 · 여러 행에 걸쳐 같은 글 = `label`, 장마다 다른 글 = `field`. 한 장뿐이면 "항목명처럼 짧고 끝에 값이 붙는 글"을 `label` 후보로 두고 확신도를 낮게 적는다.
3. **반복 찾기**: 같은 모양이 둘 이상 = `repeat`. 몇 개 올지 모르는 단위인지 표시.
4. **역할 붙이기**: 각 칸에 §3.1.1 역할 어휘 중 하나. 어휘에 없으면 새 역할 후보로 보고하고, 가장 가까운 역할로 임시 매핑.
5. **스타일 떼어 내기**: 색 · 선 · 굵기 · 정렬은 역할별로 모아 `packFragment` 로. 구조에 섞지 않는다.
6. **자기 검증**: 해체한 에셋을 다시 렌더해 원천 그림과 나란히 놓고 격자 · 병합 · 역할이 맞는지 본다. 틀린 곳만 다시 해체 (최대 2회). 남은 불확실은 사람에게 보이는 표시로 남긴다.

결과는 언제나 같은 모양의 세션 에셋(구조 + 스타일 짝 + 필드 + 확신도)이다. 그래서 다음 단계(적용)는 원천이 무엇이었는지 모른다.

### 2.8 새 데이터에도 적용한다

에셋은 원래 내용 없이 모양만 가지므로, **어떤 데이터든** 붙일 수 있어야 한다.

- 입력 데이터(내 글 · 리서치 결과 · CSV · 다른 문서의 칸들)를 에셋 `fields` 에 맞춘 **레코드**로 정리한 뒤 인스턴스화한다 (`assets.instantiate {records}`).
- 레코드 수가 반복 단위(S2)보다 많으면 반복을 늘리고(늘리기), 필드가 모자라면 빈 칸으로 남겨 표시한다. 에셋에 없는 항목이 데이터에 있으면 버리지 않고 "남는 항목"으로 보고한다 — 에셋을 고칠지(고치기) 사람이 정한다.
- 같은 레코드를 다른 에셋으로 다시 인스턴스화하면 모양만 바뀐다. 이것이 "형식 바꾸기"의 기본 동작이다.

---

## 3. 지금 예제를 담기 위한 구조 · 스타일 추가 기준

### 3.0 담아야 할 예제

| 묶음 | 예제 |
|---|---|
| 공공 · 기업 서식 | `05. AI Eval/[입찰 공고서] …제안요청서.vdoc` (요구사항 정의 표 4개 · 일정 · 평가 표) · `01. Architecture/00. System-Proposal.vdoc` · 붙여 넣은 요구사항 표 그림(ECR-05) · `samples/제안요청서_통합AX포탈사이트구축_수정본_1P.ref` · hwpx 서식 원문 |
| 공문 · 양식 | `samples/예스폼_INS2010회의의사록…ref` · 시드 `asset-a4-attach5/6` (v2 프리미티브: header-band · kv-block · clause-tree · signoff) |
| 블로그 · 웹 | 여행(도쿄 · 오사카) · 홈카페 문서 · `samples/…라스베가스…ref` · 시드 `asset-blog-*` |
| 근거 표현 | `06. 근거_인용_쇼케이스` (cite 6종) |
| 스타일 팩 | standard · gov-rfp · yesform-official · yonhap-news · naver-travel-blog |

### 3.1 구조 기준

#### 3.1.1 규칙: 태그가 아니라 프리미티브 + 역할

구조 문법의 기호(`|`, `[<]`, `>`, `::` …)는 표면일 뿐이고, 의미는 아래 **8개 프리미티브**와 **역할**로 정한다. 새 태그는 "어느 프리미티브의 어떤 조합인가"를 등록부에 적는 것으로만 추가한다.

| 프리미티브 | 뜻 | 지금 있는 표면 |
|---|---|---|
| `container` | 묶음 · 영역 (섹션, 프레임, 칸 안 블록) | 들여쓰기, `<<view:section>>`, `>`, `<<cell>>` |
| `grid` | 행 × 열 배치 + 병합 | `|`, `[<]`, `[^]`, 트리 rowspan, `<<view:columns>>`/`<<col>>` |
| `repeat` | 같은 단위의 반복 (행 · 카드 · 조항) | **없음** — 새로 |
| `field` | 채울 자리 (타입 있음) | `[-]`, `{{자리}}` (에셋 안에서만) |
| `label` | 구조에 속한 고정 글 (머리칸 · 항목명) | 암묵적 (`isHeader`) |
| `choice` | 선택지 (□ 참석 □ 불참) | **없음** — 지금은 그냥 글 |
| `media` | 사진 · 임베드 · CTA | `[img]`, `[embed]`, `[cta]` |
| `reference` | 근거 · 인용 · 원천 연결 | `<<cite:*>>`, `<<resource:>>`, `[[ ]]`, `#pN` |

**역할(role)** 은 프리미티브 안의 자리 이름이다. 스타일은 위치가 아니라 역할에 붙는다 (§3.2.1). 기본 역할 어휘:

`title` · `subtitle` · `label` · `group-label` · `sub-label` · `value` · `caption` · `note` · `total` · `marker` · `meta-key` · `meta-value` · `cta` · `byline`

역할도 등록부에 있고 늘릴 수 있다.

#### 3.1.2 추가할 구조 기준

| # | 기준 | 왜 (예제) | 표면 제안 |
|---|---|---|---|
| S1 | 칸 역할 표시 | 요구사항 표의 머리칸(분류/고유번호) · 묶음 머리칸("요구사항 세부내용") · 하위 머리칸("정의")이 지금은 `isHeader` 하나 | `{label}` `{group-label}` … 칸 앞 접두. 생략 시 지금 규칙(form/top-row)으로 추론 |
| S2 | 반복 단위 | 요구사항 표 4개, 일정 행, 평가 항목 행, 블로그 스팟 카드 — "몇 개가 올지 모르는 같은 단위" | `*` 접두: `* {label}요구사항 명칭 | {{name}}` = 이 행이 레코드마다 반복. 블록 단위 반복은 `<<repeat:records>>` |
| S3 | 타입 있는 필드 | 고유번호 · 날짜 · 금액 · 체크 · 리치 글 | `{{id:type!}}` (type = string · date · currency · number · rich · list · image · choice, `!` = 필수). 에셋 `fields` 와 1:1 |
| S4 | 선택지 | 회의록 · 신청서의 □ 칸 | `[ ] 참석 [ ] 불참` → `choice` (단일/복수는 `[ ]` vs `( )`) |
| S5 | 번호 체계 | 제안요청서 1. → 가. → (1), 공문 제1조 · ① | `<<view:clause:legal-kr>>` 처럼 번호 체계를 구조로. 번호 **모양**(괄호 · 굵기)은 스타일 |
| S6 | 영역 | 공문의 머리띠 · 서명란 · 쪽 머리말 | `<<zone:header|body|footer>>` (v2 프리미티브의 zones 를 문법으로) |
| S7 | 캡션 | 표 25개 중 13개가 `caption` 을 블록 속성으로 가짐 | `<<caption>>` 자식 노드 → 역할 `caption` |
| S8 | 표지 · 히어로 · 링크 카드 | 블로그 hero 4개, link-card 7개가 문법에 없음 (블록으로만) | `<<view:cover>>`, `[card:제목 -> url]` |
| S9 | 키-값 묶음 | 콜아웃 `kvItems` 6개, v2 `kv-block`, 블로그 `::` 메타 — 셋이 따로 | 모두 `grid` + 역할 `meta-key`/`meta-value` 하나로. 테두리 유무는 스타일 |
| S10 | 구조 글 vs 내용 글 | 머리칸 글자가 지금 `editable-slot` 으로 저장돼 내용과 섞임 | 프리미티브 `label` 의 글은 **에셋 소유 고정 글**. 문서에는 slot 으로 들어가되 `role: "label"` 로 표시하고 채우기 깊이에서 수정 불가 |

#### 3.1.3 구조에 무엇을 두고 무엇을 빼나

- **구조**: 무엇이 몇 개 · 어떻게 묶이고 병합되는가 · 무엇이 반복되는가 · 어느 칸이 어떤 역할인가 · 고정 글 · 필드 타입.
- **스타일**: 그 밖의 모든 보이는 것. 열 너비도 스타일로 둔다 (같은 구조가 팩마다 다른 비율을 가질 수 있음). 단 "이 열은 좁은 머리칸 열"이라는 사실은 구조(역할)다.
- **내용**: slot 의 글 · 사진 · 근거 연결.

### 3.2 스타일 기준

#### 3.2.1 규칙: 위치가 아니라 역할에 붙인다

지금 `.vstyle` 의 `bindings` 는 "요소/변형 → 합성 스타일" 한 단계뿐이다. 이를 **선택자 = `컴포넌트.변형.역할`** 로 넓힌다.

```jsonc
"bindings": {
  "table.form": { "tableStyle": "form" },
  "table.form.label": { "cellStyle": "formLabel" },
  "table.form.group-label": { "cellStyle": "formGroup" },
  "table.form.value": { "cellStyle": "formValue" },
  "heading.h2": { "textStyle": "sectionTitle", "decorStyle": "underlineBar" },
  "list.l1": { "markerStyle": "circle" }
}
```

블록은 `component · variant` 와 칸 `role` 만 가진다. 팩이 바뀌면 문서 전체 모양이 바뀌고, 구조는 그대로다.

#### 3.2.2 추가할 스타일 기준

실측한 블록 안 서식 값이 모두 팩 토큰으로 갈 자리를 가져야 한다.

| # | 기준 | 지금 블록에 박힌 값 (개수) | 추가 합성 / 필드 |
|---|---|---|---|
| T1 | 칸 스타일 (역할별) | `padding` 290 · `hAlign` 308 · `vAlign` 310 · `backgroundColor` 85 · `fontWeight` 81 · `color` 4 | 새 합성 `cell`: fill · color · font · align(h/v) · padding · letterSpacing |
| T2 | 표 선 체계 | `borderRules` 23 · 칸 `borderTop/Bottom` 8 | `GridBorderMatrix` 에 `labelColumnRight` · `groupBottom` · `footerTop` · 칸 역할별 선 추가 |
| T3 | 표 변형 · 너비 | `tableVariant` 18 · `columnWidths` 25 · `cellPadding` 5 | `table` 합성에 `columnRatios`(역할 열 기준) · `density` |
| T4 | 제목 장식 | heading `decoration` 26 · `accent` 26 | 새 합성 `decor`: underline · bar · pill · number-badge + 번호 모양(S5 와 짝) |
| T5 | 카드 · 다단 | `columns-grid` `cardStyle` 23 · `gap` 23 | 새 합성 `card` (frame 과 분리: 그림자 · 비율 · 사진 위치) |
| T6 | 구분선 | divider `variant` 20 · `spacing` 20 | 새 합성 `divider` |
| T7 | 사진 | image `objectFit` · `width` · `align` 30 · `maxHeight` 7 | 기존 `media` 에 `fit` · `widthPreset` |
| T8 | 콜아웃 톤 | callout `tone` 10 · `variant` 10 · `accentColor` 2 | 기존 `frame.accentPalettes` 를 톤 이름으로 고정 (info · tip · warn · quote) |
| T9 | 글 안 꾸밈 | 글 HTML 안 `text-align` 13 · `background-color` 7 · `color` 5 | 새 합성 `mark`: highlight · emphasis · muted (글엔 `<mark data-mark="highlight">` 만) |
| T10 | 목록 | `listMarker` 6 | `list` 합성: 단계별 기호 · 번호 형식 · 들여쓰기 |
| T11 | 선택지 · 필드 모양 | (S4 새로) | `choice` 합성: 상자 모양 · 체크 기호, `field` 합성: 빈 칸 밑줄 · 자리표시 색 |

#### 3.2.3 덮어쓰기(Layer 4)는 마지막 수단

토큰 계약에 이미 있는 `StyleOverrideDelta` 를 블록 안 서식 값의 유일한 자리로 정한다. `node id → delta` 로 문서 사이드카에 모으고, 개수를 점검 결과에 보인다. 같은 덮어쓰기가 3곳 이상이면 "변형으로 올리기"를 제안한다.

#### 3.2.4 에셋의 스타일 짝

에셋은 두 가지 스타일 정보를 가질 수 있다.

| 필드 | 내용 | 적용 시 |
|---|---|---|
| `style.roles` | 이 에셋이 쓰는 컴포넌트 · 변형 · 역할 목록 | 항상 — 문서 팩이 이 역할을 그린다 |
| `style.packFragment` (선택) | 원천에서 뽑은 구체 토큰 (`StylePack` 의 부분: primitives · cell/table 합성 · bindings) | "구조 + 원본 스타일"로 적용할 때만, 문서 팩에 **이름 있는 변형**으로 합류 (예: `table.ecr-form`) — 블록에 풀어 쓰지 않음 |

`시각스타일::` 자연어는 사람이 읽는 `nuance.visualRules` 로만 남기고, 기계가 쓰는 값은 `packFragment` 로 옮긴다. `parseTableAssetVisualPreset` 은 이전 데이터 변환에만 쓴다.

---

## 4. 지금 있는 요소의 컴포넌트화 (일관된 구조로 재구성)

### 4.1 컴포넌트 등록부 하나

네 어휘(§1.3)를 **컴포넌트 등록부** 하나로 묶는다. 각 항목:

```ts
interface ComponentDef {
  id: string;                    // 정식 이름 (예: "table")
  aliases: string[];             // 옛 이름 ("structured-table", "table" in KINDS …)
  primitives: Primitive[];       // §3.1.1
  roles: RoleDef[];              // 이 컴포넌트가 가지는 역할
  syntax: SyntaxRuleRef[];       // 표면 기호 (element-syntax 등록부 항목)
  block: { kind: string; renderer: string }; // 렌더 블록 (지금 LayoutBlock)
  props: {
    structure: PropSpec[];       // 구조 속성 — 에셋이 소유
    style: PropSpec[];           // 스타일 속성 — 팩/변형이 소유, 블록엔 없음
    content: PropSpec[];         // 내용 — slot
  };
  style: { composite: string; variants: string[] };
  ai: { ops: Record<string, "fill" | "extend" | "reshape" | "style"> }; // 편집 깊이 판정
}
```

이렇게 하면 문법 컴파일러 · 블록 렌더러 · 에셋 드라이버 · 에이전트 빌더 · 스타일 엔진이 모두 같은 표를 읽는다. 새 요소는 이 표에 한 줄 추가하는 것으로 들어온다.

### 4.2 지금 요소 → 컴포넌트 대응

| 정식 컴포넌트 | 지금 이름들 | 프리미티브 | 구조 속성 | 스타일로 옮길 속성 |
|---|---|---|---|---|
| `title` | form-title · v2 title-block | label · field | 수준 | align |
| `heading` | heading | label · field | level · 번호 체계(S5) | decoration · accent · align (T4) |
| `text` | text · paragraph · v2 prose | field | – | align · frame · 글 안 style (T9) |
| `list` | `<<view:list>>` · text `listMarker` | repeat · field | 단계 | listMarker (T10) |
| `table` | structured-table · table · KINDS table · v2 table-grid | grid · label · field · repeat | 격자 · 병합 · 역할 · 반복 · 캡션 | borderRules · headerStyle · cellPadding · tableVariant · columnWidths · 칸 서식 (T1~T3) |
| `kv` | callout `kvItems` · v2 kv-block · `::` | grid · label · field | 행 수 · 반복 | 테두리 유무 · 마커 |
| `frame` | callout-box · callout · `>` · `!` | container | 자식 | tone · variant · accentColor (T8) |
| `columns` | columns-grid · gallery · `<<view:columns>>` · `|` | grid · container | 열 수 · 자식 | widths · gap · cardStyle (T5) |
| `media` | image · `[img]` · `[embed]` | media · field | 캡션 유무 | width · align · objectFit · maxHeight (T7) |
| `cover` | hero · cover · v2 header-band | container · media · field | 슬롯 구성 | height · overlay · align |
| `card` | link-card · `[cta]` | media · field | 링크 · 썸네일 유무 | variant · layout · width · ctaChevron |
| `divider` | divider · `---` · v2 divider-band | – | – | variant · spacing (T6) |
| `clause` | v2 clause-tree | repeat · label · field | 번호 체계 · 단계 | 번호 모양 |
| `signoff` | v2 signoff-block | grid · label · field | 서명 칸 구성 | 정렬 |
| `form` | fillable-group · composite-form-frame · web-form | container · grid · field · choice | 필드 · 선택지 | 필드 모양 (T11) |
| `summary` | summary-list | repeat · field | 항목 | – |
| `cite` | `<<cite:*>>` 6종 · `<<resource:>>` | reference | 표기 방식 | 각주 · 사이드노트 모양 |

### 4.3 에셋의 단계와 합성

| 단계 | 예 | 지금 |
|---|---|---|
| 컴포넌트 에셋 | 요구사항 정의 표, 메타 kv 표 | `asset-table-*` |
| 패턴 에셋 | 블로그 스팟 리뷰(사진 + kv + 팁) | `asset-blog-spot-review` |
| 쪽 · 문서 에셋 | 별지 6호 기술 계획서, 제안요청서 전체 | `asset-a4-attach*` |

상위 에셋은 하위 에셋을 **가리킨다** (`<<asset:id>>` 를 에셋 안에서 사용). 복사하지 않는다. 그래서 "요구사항 정의 표" 모양을 바꾸면 그것을 쓰는 제안요청서 문서 에셋에도 따라 들어간다 (버전 고정은 §4.6).

### 4.4 구조 지문

같은 모양을 알아보는 결정적 키. 내용 · 스타일을 뺀 구조만으로 계산한다.

```
fingerprint = hash( component, grid shape(행·열·병합), 칸 역할 순서, label 고정 글(정규화), repeat 위치, field 타입 )
```

- 요구사항 표 4개는 내용이 달라도 지문이 같다 → 한 에셋.
- 라벨 글이 조금 다르면(오타 · 띄어쓰기) 정규화로 흡수, 글이 아예 다르면 다른 지문 → "비슷한 에셋" 후보로만 제안.

### 4.5 이행 (지금 문서를 일관된 구조로)

한 번에 바꾸지 않고, 되돌릴 수 있는 단계로 간다. 모든 단계는 **렌더 결과 비교(전 · 후 DOM/스크린샷 동일)** 로 검증한다.

1. **이름 정규화**: 별칭 → 정식 컴포넌트 이름. 저장 형식은 읽을 때 변환(구버전 호환), 쓸 때 정식 이름.
2. **서식 분리**: 블록 안 서식 값을 모아 같은 값 묶음 → 문서 팩의 변형으로, 남는 것 → Layer 4 덮어쓰기. 서식 값 0 을 목표로 하고 남은 수를 보고.
3. **역할 부여**: `isHeader` · 위치 규칙으로 칸 역할을 추론해 기록 (S1, S10). 머리칸 글자 slot 은 `role: "label"`.
4. **에셋 묶기**: 지문(§4.4)으로 묶어 세션 에셋 → 사람이 확인해 볼트 에셋으로 승격, 블록에 `assetRef`.
5. **outline 연결**: `extractBoundOutlineFromVDoc` 으로 구조 소스를 만든다. 이후 구조 변경은 outline · 에셋으로.

### 4.6 버전

- 에셋은 `version` 을 가진다. 인스턴스 `assetRef` 는 버전을 고정할 수 있다 (`pin`).
- 에셋이 바뀌면 고정 안 한 인스턴스에 "따라가기" 변경안이 Staged 로 생긴다 (사람 문서면 승인 필요).
- 에셋 스키마는 지금 드라이버 A/B(`v1-dsl` · `v2-primitive`)에 **v3(컴포넌트 기반)** 드라이버를 더하고, 같은 평가 행렬로 비교한 뒤 기본값을 바꾼다.

### 4.7 하나의 정본, 여러 뷰 — 자동 동기화

outline · 캔버스 · 쪽과 요소 패널은 **같은 컴파일 데이터를 다르게 보여 줄 뿐**이다. 따라서 동기화는 "맞추는 작업"이 아니라 "다시 그리기"여야 한다.

```
정본 = 구조 소스(.outline 노드 + 에셋 참조) + 내용(slots) + 스타일(문서 팩 + 덮어쓰기)
          │ 컴파일 (결정적, 증분)
          ▼
     컴파일 데이터 (블록 트리 · sourceNodeId · assetRef · 역할)
     ├─ outline 뷰 (구조 소스 편집)
     ├─ 캔버스 뷰 (A4 / 스크롤 렌더, 내용 편집)
     ├─ 쪽 · 요소 패널 (트리, 선택 · 잠금 · 숨김)
     └─ 에셋 패널 (이 문서가 쓰는 에셋과 인스턴스)
```

규칙:

1. **편집은 자기 층의 정본에만 쓴다.** outline 뷰에서 구조를 바꾸면 구조 소스, 캔버스에서 글을 바꾸면 slot, 디자인 모드에서 모양을 바꾸면 팩 · 덮어쓰기. 블록 트리는 아무도 직접 쓰지 않는다.
2. **모든 뷰는 컴파일 데이터를 구독한다.** 하나가 바뀌면 증분 컴파일 → 모든 뷰가 같은 판을 본다. "outline 에서 컴파일" · "구조에서 컴파일" 같은 수동 버튼은 이행 기간의 안전장치로만 남기고 최종적으로 없앤다.
3. **에셋이 바뀌면 인스턴스가 다시 컴파일된다** (§4.6 의 고정 · 따라가기 규칙 안에서).
4. **식별자는 층을 가로질러 하나**: `sourceNodeId` = outline 노드 = 블록, `assetRef` = 에셋, slot id = 내용. 선택 · 기준점 세션 · 변경안 · 근거가 모두 이 id 로 붙으므로 어느 뷰에서 골라도 같은 대상이다.
5. **에이전트도 같은 길**: 구조 변경안은 outline-patch 또는 `assets.apply`, 내용 변경안은 slot, 스타일 변경안은 팩. 승인되면 2번 규칙으로 모든 뷰에 퍼진다.

지금 outline 이 없는 문서(볼트 13개 중 8개)는 §4.5 5단계(outline 연결)를 거쳐야 이 규칙에 들어온다.

---

## 5. 평가 행렬 (테스트 하나씩 맞추기를 막는 장치)

| 원천 \ 작업 | 등록(해체) | 구조만 적용 | 구조 + 스타일 적용 | 왕복(문서→에셋→문서) | 반복 인스턴스 재편 |
|---|---|---|---|---|---|
| 요구사항 표 그림 (ECR-05) | | | | | |
| gov-rfp `.ref` | | | | | |
| 예스폼 회의록 `.ref` | | | | | |
| hwpx 서식 원문 | | | | | |
| 블로그 `.ref` (라스베가스) | | | | | |
| 에이전트 초안 (도쿄 · 홈카페) | | | | | |
| 근거 쇼케이스 | | | | | |
| **처음 보는 양식** (평가 때마다 새로 추가, 개발 중 본 적 없는 것) | | | | | |

측정: 구조 일치(격자 · 병합 · 역할) · 내용 보존(칸 6/6 같은 비율) · 블록 안 서식 값 수 · `assetRef` 비율 · 지문 묶음 정확도. 특정 칸에 맞춘 규칙이 생기면 다른 칸 점수로 드러나게 한다.

## 6. 진행 순서 (제안)

1. 컴포넌트 등록부 계약 + 역할 어휘 + 지문 함수 (`vdoc-schema`) — 코드 경로 변경 없음, 테스트만.
2. `.vstyle` 확장 (선택자 바인딩 · cell · decor · card · divider · mark · list · choice) + 렌더러가 역할로 그리기 (`style-core`).
3. 에셋 v3 드라이버: 구조(프리미티브 + 역할 + 반복 + 필드) + 스타일 짝 + 세션 수명 (`asset-kit`).
4. 적용 함수 하나 (`applyAsset`) — 에셋 패널 · outline-sync · 에이전트가 같은 함수를 쓴다.
5. 생산 경로 연결: Composer 첨부 → `dc_build` → `dc_import` → 레퍼런스 뼈대.
6. 이행 도구 (§4.5) 를 볼트 13개 문서에 돌리고 평가 행렬 채우기.

패키지 경계: 등록부 · 지문 · 드라이버는 `vdoc-schema` · `style-core`, 에셋 AI 파이프라인은 `ai-vault`, 앱은 연결만 (`pnpm test:arch`).

## 7. 정해야 할 것

1. **열 너비**: 이 문서는 스타일로 두었다 (§3.1.3). 서식 원문의 "정확한 비율"이 구조라고 볼 이유가 있으면 바꾼다.
2. **머리칸 글자의 소유**: 에셋 고정 글(S10)로 두면 사람이 문서에서 머리칸 글자를 바꾸는 것이 "고치기"가 된다. 사람 편집은 자유로 두고 에이전트에게만 적용할지.
3. **세션 에셋 사이드카**: 문서 옆 파일로 둘지, `.vibedoc/assets/_session/` 아래 둘지.
4. **v3 이름**: 새 드라이버로 둘지, v2 를 넓힐지.

---

## 8. 구현 결과 (2026-11-25, 1차)

### 8.1 만든 것

| 층 | 위치 | 내용 |
|---|---|---|
| 에셋 v3 핵심 | `packages/vdoc-schema/src/asset-core/` | 등록부(컴포넌트 11 · 역할 21 · 프리미티브 8 · 필드 종류 10), 골격(`vibe-asset/3`), 검증, 구조 지문, 분해(블록 → 골격 · 스타일 짝 · 레코드), 인스턴스화, 맞추기 · 재편, 채점, 문서에 놓기 |
| 변경안 | `project-manifest.ts` | `asset-blocks` (insert · replace) — 승인 시 `placeAssetBlocks` |
| Composer 도구 | `packages/ai-vault/src/assetV3.ts` | `assets.register` · `capture` · `list` · `instantiate` · `apply`, 라이브러리 `.vibedoc/assets/v3/*.json` (지문이 같으면 한 에셋) |
| 에이전트 규칙 | `harness-packs/editor/rules/assets.md`, `compose.md` S4 · S5 | 해체 6단계(종류 목록 없음), 에셋 JSON 모양, 새 문서 설계 · 유사 데이터 규칙; 되풀이 구조는 dc_build 대신 에셋 |
| 화면 | `V2StagedChangesPanel` | 에셋 변경안에 채움 · 빈 자리 · 옮긴 값 · 못 옮긴 값 |
| 평가 | `evals/asset-forms/` + `scripts/asset_eval.ts` | 처음 보는 양식 10종(그림만 줌) + 정답 골격, 유사 데이터 과제, 새 작업 설계 과제 3종 — 실제 agy Composer 로 실행 |

사양에 더한 것: 묶음 머리칸이 반복 단위를 덮는 `rs: "repeat"` (학력 · 경력처럼 묶음 아래 행 수가 데이터마다 다른 표). 평가에서 드러난 빈틈이다.
고정 글의 문서 표시: 에셋이 놓은 고정 글 칸은 slot label `label:<역할>` — 다시 분해해도 고정 글로 돌아온다.
`{field}` 칸과 `{nodes:[field]}` 칸은 같은 것으로 본다.

### 8.2 실제 에이전트 평가 (gemini-4-hydrogen-medium, agy)

| 항목 | 결과 |
|---|---|
| 처음 보는 양식 분해 | 10종 모두 등록 · 사양 통과. 점수: ECR 스크린샷 0.996, 회의록 0.995, 상품 카드 · 사진+글 · 기사 1.0, 신청서 0.87~0.98, 견적서 0.90, 사양표+사진 0.91~0.93, 학력 · 경력 0.91(묶음 반복 도입 후), 블로그 스팟 0.95 (1회 빈 응답 재실행) |
| 유사 데이터 적용 | 8/8 — 반복 늘리기(안건 4 · 상품 4 · 학력 3 + 경력 2), 남는 항목 보고(이메일 · 전화 · 색상 · 담당 부서) |
| 새 작업 설계 | 3/3 에셋 중심(틀 1개 × N 인스턴스, 되풀이 구조를 dc_build 로 짓지 않음) — 규칙 고치기 전 1~2/3 |
| 화면 확인 | 제안요청서 사본에서 견본 그림을 @ 첨부 → 등록 → 요구사항 표 4개 재편 Staged → 승인 → 캔버스에 병합 구조 · 값 6/6 · 칸 id 유지 |

### 8.3 남은 것

- 코드만으로는 뜻이 같은 다른 이름(총액 ↔ 합계)을 짝짓지 못한다 — 에이전트가 자리 이름에 맞춰 넘긴다(규칙 A4). 짝 없는 값은 `unmapped` 로 보고.
- 에이전트가 같은 인스턴스를 두 번 놓는 경우가 있다(설계 과제에서 8건 = 4 × 2). 중복 놓기 감지는 아직 없다.
- 스타일 짝은 토큰까지만 — `.vstyle` 선택자 바인딩(§3.2)과 팩 합류는 아직. 너비 토큰이 없으면 머리칸 열 1 : 값 열 3 기본.
- outline 연결 문서에는 `assets.apply` 가 경고만 낸다 — 구조 소스(outline) 쪽 반영은 §4.7 단계에서.
- 볼트 문서 이행(§4.5)은 안 했다.
