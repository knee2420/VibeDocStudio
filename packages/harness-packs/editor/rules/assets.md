[에셋 — 구조 스키마(.vsyntax) + 스타일 스키마(.vstyle) 통합 정본]
양식 · 형식 · 구조에 관한 모든 일(이 양식대로 · 이 서식 가져와 · 이 모양으로 바꿔 · 레이아웃 재편 · 다단 사진 배치)은 원시 HTML 만 땜질하지 말고 **에셋 규칙(`.vsyntax` DSL 선행 변경 → `.vstyle` 스타일 재편)** 을 따른다. 그래야 `.outline` ↔ `.vdoc` ↔ `.vstyle` 전체 데이터 싱크가 깨지지 않는다.
  조회 → schema.inspect (볼트의 최신 .vsyntax 구조 기호 · 역할 · .vstyle 스타일 선택자 실시간 확인)
  일회성 구조 재편 → **assets.propose({ dsl, records, mode, replaceBlockIds, styleKey })** (규칙 검증은 동일하게 통과하되 영구 에셋 파일을 만들지 않음 — "규칙 준수 ≠ 영구 에셋 생성")
  재사용 틀 등록 → assets.register (여러 곳에서 반복 재사용할 틀만 `.vibedoc/assets/v3/` 에 등록, 또는 `assets.propose` 에서 `saveAsset: true`) / assets.capture
  적용 → assets.propose (통합 제안: 인라인 DSL 또는 assetId + 교체/추가 + 기존 이관/새 데이터 보강 + revisionOf 제자리 수정) / assets.instantiate / assets.apply
에셋 = 구조 스키마(고정 글 + 채울 자리 + 병합/반복 규칙) + 스타일 짝(역할 선택자 토큰). 사용자 글(내용)은 절대 에셋 안에 넣지 않는다.

A0 라이브 스키마 · 작업 모드 우선 조회 & 재사용 우선 (하드코딩 · 중복 등록 금지):
   1) 처음 보는 양식을 분해하거나 구조를 바꾸기 전에 `workspace.getState` (`workMode`, `outlineLink`, `modeGuidance`) 와 `schema.inspect` 를 먼저 확인한다.
   2) **Structure(구조) vs Design(디자인) 모드 분기**:
      - **Structure 모드**: `.outline` 에 연결된 문서의 다중 섹션/전체 개편은 `.outline` 의 `<<doc:...>>` DSL 을 먼저 패치(`ol_propose_patch`)→컴파일하고, 국소 블록/이미지 레이아웃 재편은 `assets.propose({ dsl, records, replaceBlockIds, styleKey })` 로 DSL 선행 변경 후 `.vstyle` 을 맞춘다(승인 시 연결된 `.outline` 에도 자동 동기화).
      - **Design 모드**: 기존 구조 골격을 유지하면서 `style.inspect` → `style.upsertVariant` / `style.apply` (`.vstyle` 4축), `blocks.proposeProps`, `slots.proposeBatch` 로 시각·문구 완성도를 높인다.
   3) **불필요한 메타 제목 금지 & 다단 사진 스트립 문법**: 사진·블록 묶음을 넣기 위해 `"오프닝 시각 자료"` 같은 어색한 메타 소제목을 임의로 끼워 넣지 않는다. 사진 2~3장을 가로 나란히 놓을 때는 세로 `[img:...]` 를 쌓지 말고 `[img:{{action_photo|경기 사진}}] | [img:{{news_grid|뉴스 썸네일}}]` 또는 `<<view:columns:strip>>` 아래에 `[img:...]` 를 들여쓰기한다.
   4) **연속 작업 재사용 우선 (Reuse-First)**: 앞선 element에 이미 적용한 양식·스타일을 다음 element에 이어서 적용할 때("레퍼런스 형식처럼 다음 element도 작업해줘" 등)는 레퍼런스를 처음부터 다시 해체해 중복 에셋·중복 변형을 만들지 않는다. 먼저 `workspace.getState` · `document.getOutline` · `assets.list` · `style.inspect` 로 직전 element가 쓴 `assetId` 와 동반 `.vstyle` 변형(`styleKey`)을 확인해 그대로 재사용한다(직전 블록이 에셋으로 아직 등록되지 않았다면 `assets.capture` 로 추출).

A1 처음 보는 양식을 해체할 때 (절차):
   1) 격자: 선 · 정렬 · 반복 간격으로 행 × 열과 병합(`[<]` 가로 · `[^]` 세로 · `^` 동적 동일값 세로 병합)을 잡는다.
   2) 고정 글 vs 채울 자리: 여러 행 · 여러 장에 똑같이 나올 글 = 고정 글. 장마다 달라질 글 = 채울 자리(`{{id:type|힌트}}`).
      예시로 채워진 값(번호 · 이름 · 날짜 · 본문)은 그 글자를 그대로 두지 말고 `{{id|힌트}}` 자리로 바꾼다.
   3) 반복 + 동적 병합: 같은 모양의 행이 여러 개 이어지면 **절대 10행을 seq_1~seq_10 처럼 수동 전개하지 말고**, 한 단위만 `*` 접두로 반복 표시한다.
      - 표 안에서 같은 분류/구분 값이 연속될 때 세로 병합되는 열은 **`{{category:text^|구분}}`** (`^` 접미 = `mergeSame: true`) 한 글자로 선언한다.
      - 반복 단위 전체를 하나의 고정 묶음 머리칸으로 덮을 때는 `rs: "repeat"` 를 쓴다.
   4) 역할: 머리칸·항목명은 고정 역할(`column-header`, `label`, `group-label`, `sub-label`, `meta-key`, `title`, `caption`, `note`), 채울 자리는 채움 역할(`value`, `meta-value`, `body`, `heading`, `image`, `item`, `total`). 필요 시 `{group-label}텍스트` 접두로 명시한다.
   5) 스타일 떼기: 색 · 굵기 · 정렬 · 선은 구조 DSL에 섞지 말고 `style.tokens` 의 역할 선택자(`table.column-header`, `table.label`, `table.value` 등)로만 분리한다.
   6) 자기 검증: 등록 검증 오류가 돌아오면 위치·이유를 보고 고쳐 재등록한다(최대 2회). 확신이 낮은 곳은 `uncertain` 에 적고 답변에서 알린다.

A2 권장 등록 방식 — `.vsyntax` DSL + `style` 짝 (길고 깨지기 쉬운 원시 JSON AST 금지):
   `assets.register` 는 간결한 `.vsyntax` `dsl` 줄 배열과 `style` 짝을 직접 컴파일한다:
   ```json
   {
     "title": "요구사항 목록표",
     "scope": "element",
     "dsl": [
       "<<view:table>> 요구사항 목록표",
       "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
       "  * {{seq:number|순번}} | {{category:text^|구분}} | {{req_id:text|요구사항 고유번호}} | {{req_name:text|요구사항 명}}"
     ],
     "style": {
       "selectors": ["table.column-header", "table.value"],
       "tokens": { "table.column-header": { "backgroundColor": "#e6ecf5", "fontWeight": "bold", "hAlign": "center" } }
     }
   }
   ```
   복합 병합 폼 예시 (`[<]` 가로 병합 · `[^]` 세로 병합):
   - `요구사항 분류 | [<] | {{category|요구사항 분류}}`
   - `{group-label}요구사항 세부내용 | {sub-label}정의 | {{definition|정의}}`
   - `[^] | {sub-label}세부내용 | {{details:rich|세부내용}}`
   *(기존 `asset.nodes` 원시 JSON 방식도 호환되지만, 표·섹션은 항상 3~15줄 `.vsyntax` `dsl` 방식을 최우선 사용한다.)*

A3 새 문서를 설계할 때:
   먼저 무엇이 반복되는지(같은 틀의 표 · 카드 · 섹션)를 찾는다. 같은 틀은 에셋 하나로 등록하고 데이터마다 `assets.propose` / `assets.instantiate` 로 놓는다. 이미 문서에 있는 틀은 `assets.capture` 로 에셋화해 재사용한다.

A4 데이터가 다른 구조일 때 (빈 표 덮어쓰기 방지):
   - `assets.apply` 가 컬럼/항목 불일치로 `staged: false` (`preserved.kept === 0`)를 반환하면, **원본 블록과 문서·리소스에서 실제 내용을 읽어** 에셋의 `validFields` 에 의미 매핑한 뒤 `assets.propose({ assetId, mode: "replace", replaceBlockIds, items 또는 records })` 로 제안한다.
   - 직전 Staged 제안을 고칠 때는 새 카드를 쌓지 말고 `revisionOf: "<diffId>"` 로 제자리 갱신한다.
   - 결과의 `unmapped`(자리 없는 데이터) · `missing`(데이터 없는 자리)을 답변에서 짧게 알린다.

A5 스타일 유사도 극대화 (4축 범용 시각 분해 · 동반 `.vstyle` 정본 · 자가 점검 루프):
   1) **1문서 = 1단일 동반 `.vstyle` 원칙**: 개별 `.vdoc`의 스타일은 문서 바로 옆의 `<문서명>.vstyle` 단일 파일로 관리한다. `style.upsertVariant`를 호출하면 자동으로 현재 문서 옆의 단일 동반 `.vstyle`에 변형을 등록·병합하고 `doc.styleRef`를 연결한다(다른 폴더의 공유 샘플 `.vstyle`을 오염시키지 않음).
   2) **4축 범용 시각 분해 (본문·제목·프레임·표·미디어·지면 공통)**: 견본 이미지나 문서의 스타일을 맞출 때는 색·선만 흉내 내고 멈추지 말고, `style.inspect`의 `orthogonalPrimitives`와 `inheritedBaseline`(생략 시 상속되는 문서 기본값)을 확인한 뒤 아래 **4대 직교 축을 빠짐없이 분해·매핑**한다:
      - **① 면·선 (Surface & Stroke)**: 배경·4변/내부 선·라운드·장식·제목 앞장식(`prefix`). 같은 경계에 선을 중복 선언하지 않는다(예: `outerTop`이 있으면 `headerTop` 생략, `border`와 동일한 개별 변 선 중복 금지).
      - **② 타이포·행간 (Typography)**: 크기(`fontSize`)·굵기(`fontWeight`)·자간(`letterSpacing`)·**행간(`lineHeight`)**·줄바꿈(`whiteSpace`). 변형이나 역할에서 `fontSize`/`lineHeight`를 비워두면 문서 본문 기본값(`inheritedBaseline.bodyFontSize` / `bodyLineHeight`)이 그대로 상속되므로, 견본의 글자 크기·줄 간격 밀도가 본문과 다르면 반드시 명시한다.
      - **③ 공간·밀도 (Spacing & Density)**: 안쪽 여백(`padding`/`cellPadding`), 바깥 여백(`marginY`/`margins`/`imagePaddingY`), 요소 간격(`blockGap`/`stripGap`). 견본이 촘촘한 고밀도인지 여유로운 편집형인지 먼저 판별하고, 색·선과 동일한 비중으로 여백·행간 수치를 맞춘다.
      - **④ 비례·위계 (Proportion & Hierarchy)**: 폭 비율(`columnWidths`/`maxWidth`), 정렬(`align`/`vAlign`), 역할 간 강약 대비(제목/본문/캡션, 헤더/소계/합계 등 열린 역할 키 활용).
   3) **도구 자가 점검 루프**: `style.upsertVariant`가 반환하는 `axisCoverage`와 `diagnostics`를 반드시 확인한다. `diagnostics`에 경고(`warn`, 예: 행간·폰트 크기 암묵 상속, 안쪽 여백 누락, 중복 테두리, 열 폭 합계 오차)가 있으면 **사용자에게 보고하기 전에 견본과 대조해 `style.upsertVariant`로 즉시 보정**한다.
   4) `.vsyntax` DSL 에서 변형과 열린 역할을 바로 선언할 수 있으며, 고정 텍스트의 `{total.subtotal}소계` / `{total}합계`와 채움 슬롯의 `{group-label}{{major}}` 역할 모두 그대로 보존된다:
      - `<<view:title:list-heading>> 요구사항 목록표`
      - `<<view:table:eval-rubric>> 평가항목 및 배점 기준표`
      - `[^] | [^] | {total.sub}소계 | [<] | {total.sub}{{sub_total:number|소계}}`
   5) 이미 배치된 블록이나 방금 `assets.propose` 로 Staged 대기열에 올린 블록에 스타일을 바인딩할 때는 인라인 hex 를 덮어쓰지 말고 `style.apply({ blockIds, styleKey, cellRoleMap, clearInlineCellStyles: true })` (또는 `assets.propose` 의 `styleKey`/`cellRoleMap` 옵션)로 제안한다. `style.upsertVariant` 와 `style.apply` 는 디스크를 즉시 덮지 않고 캔버스 2D Unified Diff(`staged: true`)로 적재되어 사용자가 직접 `승인` · `거절`할 수 있다.

A6 복합 · 모호 요청의 다중 도구 완결 루프 (Complete-First Multi-Tool Chain):
   "레퍼런스 표/형식처럼 다음 element도 작업해줘", "앞 블록처럼 여기도 맞춰줘" 같은 요청은 요구 범위가 모호하므로 **단일 도구 1회(구조만 또는 스타일만)로 끝내지 말고** 아래 세 축을 한 턴에 모두 완결한다:
   1) **대상 특정**: `workspace.getState` · `document.getOutline` 으로 직전 작업/선택 블록의 다음 element가 이미 캔버스에 있는 교체 대상(`mode: "replace"`)인지, 아래에 새로 배치할 다음 항목(`mode: "insert"`)인지 판별한다.
   2) **구조 + 데이터 완결**: 기존 또는 신규 에셋으로 `assets.propose` 를 호출해 격자·병합·역할을 맞추고, 대상 element의 기존 내용(필요 시 리소스/아웃라인)을 `items`/`records` 로 빠짐없이 이관한다. `styleKey` · `cellRoleMap` 을 함께 넘기면 생성되는 Staged 블록에 즉시 바인딩된다.
   3) **시각 스타일 완결**: 동반 `.vstyle` 에 해당 변형이 없거나 `diagnostics` 경고가 있으면 `style.upsertVariant` 로 4축(면·선 / 타이포·행간 / 공간·밀도 / 비례·위계)을 보정한 뒤, `style.apply` 로 대상 블록(`stagedBlockIds` 또는 `replaceBlockIds` 모두 자동 연결)에 바인딩해 구조+데이터+스타일이 한 번에 일치하도록 마감한다.
   4) **깎아내기 쉬운 축별 보고 (Subtractive Directing)**: 답변 끝에 이번 Staged 제안에 포함한 축(① 대상 블록 및 교체/추가 방식 ② 적용한 에셋·구조 ③ 이관/매핑한 데이터 ④ 바인딩한 `.vstyle` 변형)을 짧게 항목별로 밝혀, 사용자가 화면을 보며 "스타일은 유지하고 구조만 원래대로"처럼 원하지 않는 축만 바로 디렉팅할 수 있게 한다.
