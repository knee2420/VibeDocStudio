# v2 섹션 · 컨테이너 중심 구조 — 단계별 구현 계획과 체크포인트

작성 2026-11-26 · 브랜치 `ideation-outline-integrate` · 대상: playground v2 (`.outline` · `.vdoc` · `.vsyntax` · 에이전트)
상태: 진행 중 — 각 단계 끝의 체크포인트를 통과해야 다음 단계로 간다. 결과는 §9 기록부에 남긴다.
커밋하지 않는다 (사용자 index 보존, `git add` 금지).

## 0. 목표 한 줄

> outline 범위를 고르고 "이 부분의 .vdoc 초안 + 필요한 리소스는 알아서 수집"을 시키면, 에이전트가
> **outline 안에 섹션 중심 `<<doc>>` 컴파일 가지를 세우고(컨테이너 먼저 → 배치), 인용 태그로 근거를 달고, 컴파일 · 바인딩까지**
> 해서 outline ↔ vdoc 이 섹션 · 컨테이너 단위로 같은 모양(동형)이 되게 한다.

## 1. 확정된 결정 (사용자 2026-11-26 "다 권장 사항으로")

| # | 결정 |
|---|---|
| D1 | 섹션 = 구조 단위(모든 프로필). A4 의 쪽 = 출력 결과. 서식 원문 가져오기만 원문 쪽 고정(예외). |
| D2 | `<<doc>>` 패치가 승인되면 에이전트가 도구로 컴파일 · 바인딩한다 (사람의 관문 = Staged 승인). |
| D3 | 강제는 경고 → 거부 순. 이번 범위에서 새 문법 위반은 **에이전트 도구에선 거부**, 기존 문서 렌더 · 컴파일에선 **경고**. |
| D4 | 조합 패턴(사진 좌+설명 우, 그림+캡션)은 에셋. 레지스트리에는 '무엇이 무엇을 담는가'(문법)만. |

## 2. 원칙 (어기면 실패)

- outline 이 정본: 스토리라인 · 구조 · 리소스 연결이 뼈대. vdoc 은 컴파일 결과 + 역동기화.
- 사용자 불릿은 다시 쓰지 않는다 — 하위에 컴파일 가지를 덧붙인다 (Staged).
- 컨테이너 먼저: document → section → container(stack · columns/col · repeat) → block → slot.
- 근거는 `<<resource: 경로 | 발췌>>` / `<<cite:…>>` 하위 불릿, 읽은 것만.
- 장르 분기 금지 — 층 · 담기 관계 · 프로필 데이터로만 일반화 ([[avoid-overfitting-harness]]).
- 라야 부상 데이터셋은 사용자가 직접 손보는 중 — **건드리지 않는다**.

## 3. 단계

### P0 기준선
- 회귀 기준: vdoc-schema 기존 실패 3건(블록 키트 스냅샷 · 블록 추가 메뉴 · 라스베가스 e2e), outline-sync 1/1, ai-vault 4/4.
- **CP0**: 이 문서 작성 + 기준선 기록. (통과 2026-11-26)

### P1 계층 문법 레지스트리 (`vdoc-schema/src/element-syntax`)
- `contract.ts`: 층 `StructureLayer = document | section | container | block | slot | inline`,
  규칙 · 요소에 `layer` · `parents`(허용 부모 규칙 id/층), 프로필에 `structureUnit: "section"` · `outputUnit: "scroll" | "page"`.
- `registry.ts`: 기본 규칙 전부에 층 부여, 볼트 `.vsyntax` 에 필드가 없으면 기본값을 규칙 id 로 병합.
- `hierarchy.ts`(신규): `validateOutlineHierarchy(roots, docNodeId, registry)` · `validateVDocHierarchy(doc)` — 문제 목록(코드 · 심각도 · 노드).
- `outline.getSyntax` 에 층 · 담기 규칙 노출.
- **CP1**: 단위 테스트 — 층이 모든 기본 규칙에 있음 · 볼트 파일 병합 · outline 검증기가 (a) 섹션 없는 `<<doc>>`, (b) `<<col>>` 이 columns 밖, (c) 섹션이 열 안 을 잡고
  좋은 예는 0건 · vdoc 검증기가 도쿄형(납작 1쪽 · heading 흉내)을 잡고 미국 여행형(섹션 8)은 0건. 기존 테스트 회귀 없음.

### P2 컴파일러 · 파생 · 렌더 · 점검
- 컴파일러: `<<view:section>>` → `unitKind: "section"` (D1). 섹션 없이 감싸는 폴백 · 모르는 view 태그 폴백은 그대로 하되 경고 수집.
- `deriveCompileSubtreeInOutline` A4: 1단계 가지마다 `<<view:section>>` (지금은 한 쪽 + h2 흉내).
- 렌더: paged 표면의 섹션 단위는 이어 흐르게(섹션마다 빈 A4 한 장 금지) + 쪽 나눔 표시.
- `outline.compileCheck`: `hierarchyIssues` · 동형 측정(섹션/컨테이너 노드 ↔ vdoc `sourceNodeId`).
- **CP2**: 테스트 — A4 파생이 섹션 N개 · 컴파일 결과 섹션 단위 · compileCheck 가 위반/동형을 보고.
  화면(1920×1080) — A4 3섹션 문서가 섹션마다 빈 장 없이 이어 보이고 본문+이미지 columns 가 나란히.

### P3 에이전트 도구 · 하네스 규칙
- 새 도구 `outline.compileDoc {path, docNodeId}`: 계층 오류가 있으면 거부(목록 반환), 없으면 구체화 · 바인딩 · 재컴파일, 결과에 vdoc 경로 · 섹션 수 · 동형.
- 가드 공백: `ol_propose_patch` 린트 오류(인용 형식 위반 · 읽지 않은 근거) 거부, 다른 파일 탭 범위 우회 거부, 패치 결과에 계층 검사.
- 규칙: outline 규칙에 '섹션 우선 컴파일 가지' 사고 절차, compose 규칙에 'outline 범위가 있으면 outline 경로', 보고 정합성.
- **CP3**: 도구 · 가드 단위 테스트, 하네스 조립(팩 JSON) 검사 통과.

### P4 실제 에이전트 실행 · 개선 루프
- 데이터셋 (라야 제외): Blog — `홈카페/핸드드립`(레퍼런스 .ref 2 · 사진), A4 — `07. 리소스_통합_테스트`(md · csv · png · pdf).
  각 데이터셋에 사용자가 쓴 것 같은 1차 구체화 `.outline` 을 만들고 범위를 골라 Composer 에 지시한다.
- 화면에서 시키고 화면에서 판정, 스크립트는 측정만 ([[agent-upgrade-via-ui-loop]]).
- **CP4 통과 기준 (실행마다)**: 계층 오류 0 · 섹션 ≥ 3 이고 `sourceNodeId` 100% · 동형 100% · 사용자 불릿 변경 0 ·
  인용 린트 오류 0 · 근거 있는 인용 ≥ 섹션 수 · (A4) 본문+이미지 columns ≥ 1 · 보고의 Staged/수집 숫자 = 실제.
  미달이면 원인을 도구 · 규칙에서 고치고 다시 실행 (최대 3회/데이터셋).

## 9. 기록부
(단계마다 날짜 · 결과 · 발견 · 고친 것)

### CP0 — 2026-11-26 통과
기준선: vdoc-schema 84 통과 / 기존 실패 3 · outline-sync 1/1 · ai-vault 4/4.

### CP1 — 2026-11-26 통과
- `contract.ts`: `STRUCTURE_LAYERS` · 규칙/요소 `layer` · `parents` · `children`, 프로필 `structureUnit` · `outputUnit`.
- `registry.ts`: `DEFAULT_STRUCTURE_GRAMMAR` + `withStructureGrammarDefaults` (옛 볼트 `.vsyntax` 보충, 사용자 값 보존). `vault-formats/settings.ts` 파싱에도 적용, 설정 화면 기호 행에 '층 · 담길 곳 · 담는 것' 표시.
- `hierarchy.ts`(신규): `classifyOutlineStructureNode` · `validateOutlineHierarchy` · `validateVDocHierarchy` · `measureOutlineVDocIsomorphism`.
- `outline.getSyntax` 에 `hierarchy` 규칙 · 층 · 담기 규칙 노출.
- 테스트 `vdoc-schema/tests/structure-hierarchy.test.ts` 9/9. 전체 vdoc-schema 회귀 없음(기존 실패 3 그대로).

### CP2 — 2026-11-26 통과
- 컴파일러: `<<view:section>>` (및 감싸는 폴백) → `unitKind: "section"` (D1). `<<col>>` 열에 `sourceNodeId`.
- `deriveCompileSubtreeInOutline`: A4 도 1단계 가지마다 섹션 (h2 흉내 제거), 섹션 아닌 명시 view 는 섹션 안으로.
- 렌더: paged + 섹션 단위 문서 → `A4SectionFlow` (섹션이 한 줄기 A4 지면에 이어 흐르고 1123px 마다 쪽 표시).
- `outline.compileCheck`: `hierarchyPassed` · `hierarchyIssues` · `structure`(섹션 · 컨테이너 · 블록 · 인용 · 동형).
- 화면 확인(`08. 섹션중심_시험/CP2_섹션흐름_A4.outline`): compileCheck 섹션 3 · 컨테이너 3 · 동형 6/6 · 린트 0 → compileDoc 결과
  섹션 3개가 1장(171/297/171px)에 이어짐, 다단 컨테이너 안 글 · 그림 나란히, evidenceLinks 2.

### CP3 — 2026-11-26 통과
- 새 도구 `outline.compileDoc` (계층 오류면 거부 · 승인 전 노드 거부 · 구체화 + 바인딩 + 동형 보고).
- `ol_propose_patch` · `ol_create`: 실제 서버(`enforce_reads=True`)에서 읽지 않은 글 원천 인용 차단(PDF · .ref · 앱 문서 제외), 다른 아웃라인에 걸린 선택 범위 우회 차단(`outOfScopeFile`).
- 에이전트 초안(`dc_new` · `dc_build page`)의 단위 = 섹션(`role` 인자), `dc_check` 에 `unitNotSection` · `sectionCollapsed`.
- 규칙: outline 규칙 O1~O8 (섹션 · 컨테이너 먼저 절차), compose S0 (outline 범위면 outline 경로).
- 테스트: outline AI 도구 9 · compose · research · webclip 통과. 기존 실패(내 변경 무관, 되돌려 확인): `test_no_long_prompt_text_in_code`(assets/use_cases.py) ·
  `test_frontend_client_tools_come_from_packs`(studio 목록) · `test_vault_workbench` dc_new 경로 4건.
- 주의: 하네스 JSON 은 원래 서식 그대로 최소 치환으로만 고친다 (통째 재직렬화 금지 — 사용자 미커밋 변경 보존).

### P4 — A4 데이터셋 (`07. 리소스_통합_테스트/Q3 중간 보고 구상.outline`, 사용자식 1차 구체화 12불릿)
채점: `scripts/section_structure_eval.ts` (측정만).

**run A4-1 (중단)** — 화면 결함 2건 발견:
1. 닫은 `.vdoc` 을 '마지막으로 본 문서'로 계속 붙잡아 작업대 · 범위가 엉뚱한 문서(라야)를 가리킴 → `ai-vault/workspace.ts` 열린 탭에 없으면 놓음.
2. 고른 리소스 폴더가 없으면 아무것도 마운트되지 않아 `ws_*` 가 빈손 → 에이전트가 `ws_glob` 을 말만 바꿔 103회 반복.
   → `resourceMountPayload` 기본 마운트 = 작업 문서의 프로젝트 폴더(`.vproj` 또는 문서 폴더), `ws_glob` 빈 결과에 마운트 상태를 밝힘.

**run A4-2 (통과)** — 지시: "이 구상 메모 범위로 A4 보고서 .vdoc 초안 … 부족하면 알아서 수집".
- 에이전트: getSyntax → ol_propose_patch(린트 거부 7회 후 통과) → 승인 전 컴파일 보류 · 보고 → (사용자 승인 · "컴파일해줘") → compileDoc.
- 결과: 사용자 불릿 변경 0/12 · 계층 오류 0 · 섹션 5(사용자 5갈래와 1:1) · 컨테이너 3(columns + col 2: 글 ↔ 아키텍처 도면) ·
  KPI 표 · 인용 13 · vdoc 섹션 단위 5/5 바인딩 · 동형 8/8 · 외부 수집 없이 폴더 자료(md · csv · pdf · png)로 충족 · `[확인 필요]` 1건 명시.
- 발견 · 수정:
  3. 인용이 표의 모든 칸(38) · 섹션의 모든 블록에 복제돼 evidenceLinks 87 → 대표 칸 하나에만 (`ir-compiler.ts`) → 13 = 인용 13.
  4. `compileDoc` 을 ui 위험도로 둬서 결과를 못 보고 턴 종료 → read (결과를 받아 확인).
  5. `compileCheck` 를 diffId 없이 불러 승인 전 파일을 잼(에이전트는 proposalId 만 앎) → diffId 없으면 그 파일의 대기 패치 전부 가상 적용.
  6. 알림 "Staged 에 0개 슬롯 변경안" (사용자 스크린샷의 그 문구) — 아웃라인 패치를 칸 수로 셈 → "아웃라인 패치 1건".
  7. PDF 인용에 '읽지 않음' 경고(ws_read_pdf 로 읽음) → 글 원천에만 경고.

### P4 — Blog 데이터셋 1 (`홈카페/핸드드립/핸드드립 입문 글 구상.outline`, 16불릿) — 통과
- 지시: "이 구상 메모 범위로 블로그 .vdoc 초안 … 리소스(사실 근거, 사진)는 알아서 수집".
- 에이전트: search_web 4 → rs_clip 6(얇은 1건 스스로 휴지통 → 다른 출처로 보충) → rs_audit → ol_propose_patch → 승인 대기.
- 결과: 사용자 불릿 변경 0/16 · 계층 오류 0 · 섹션 6(사용자 6갈래) · 컨테이너 24(글 ↔ 사진 다단 8) · 인용 24 = evidenceLinks 24 ·
  동형 30/30 · 폴더의 자유 라이선스 사진 11장(깨진 이미지 0) · `[확인 필요]` 1건.
- 발견 · 수정: 8. 모델이 워크스페이스 도구(`outline.compileDoc` · `compileCheck`)를 엔진 내장 도구로 불러 'unknown tool' 로 끝나고 "도구가 없다"고 보고
  → API 가 이름이 워크스페이스 도구인 내장 호출을 정식 도구 호출로 옮김 (`assistant_service._misrouted_workspace_call`, 단위 테스트). 이후 실행에서는 재현되지 않아 화면 검증은 못 함.

### P4 — Blog 데이터셋 2 (`여행/오사카/오사카 혼자 여행 글 구상.outline`, 13불릿, 힌트 없는 짧은 지시) — 수정 후 통과
- 지시: "이 부분 블로그 .vdoc 초안 써줘. 필요한 리소스는 알아서 수집해." (1회차는 엔진 ACP 180초 무응답 — 인프라, 재실행)
- 1차 결과: 섹션 7 · 컨테이너 15 · 동형 22/22 · .vclip 14건(차단 2건 정직하게 보고 · 다른 도메인으로 보충)인데 **인용 0 · 표 빈칸**.
- 발견 · 수정:
  9. 인용 16개가 모두 닫는 `>>` 없이 작성됨 → 린트를 그대로 통과하고 컴파일에서 사라지며 `|` 가 다단 분할로 오인됨.
     → 서버 린트 `LINT_UNTERMINATED_TAG`(차단) · compileCheck 린트 · 계층 검사 `UNTERMINATED_EVIDENCE_TAG`(compileDoc 거부).
  10. 표 머리행 · 행을 한 불릿에 `\n` 으로 몰아 넣어 행 0개 표가 됨(목록도 같은 문제).
     → 규칙 '한 불릿 = 한 줄' — 서버 린트 `LINT_MULTILINE_BULLET`(차단) · 계층 검사 `MULTILINE_BULLET` · `TABLE_WITHOUT_ROWS`, O4 절차에 명시.
- 사용자식 후속 지시("인용이 하나도 안 붙었어 고쳐줘" → "표가 비어 있어 고쳐줘" → "체크리스트도 고치고 컴파일")에
  에이전트가 compileCheck 로 원인을 찾고 · 읽기 관문에 막혀 원천을 다시 읽고 · Staged 패치 → 미리보기 측정 → 승인 후 compileDoc.
  compileDoc 은 남은 오류(체크리스트) 때문에 한 번 거부했고, 에이전트가 이를 그대로 보고했다.
- 최종: 사용자 불릿 변경 0/13 · 계층 오류 0 · 섹션 7/7 바인딩 · 동형 22/22 · 인용 16 → evidenceLinks 16 · 표 5행 · 깨진 이미지 0.

### P4 종합 (3 데이터셋 × CP4 기준)
| 기준 | A4 (Q3) | Blog 핸드드립 | Blog 오사카 |
|---|---|---|---|
| 사용자 불릿 변경 0 | ✓ | ✓ | ✓ |
| 계층 오류 0 | ✓ | ✓ | ✓ (수정 후) |
| 섹션 ≥ 3 · 바인딩 100% | 5/5 | 6/6 | 7/7 |
| 동형 100% | 8/8 | 30/30 | 22/22 |
| 인용 → 근거 링크 손실 0 | 13/13 | 24/24 | 16/16 (수정 후) |
| 본문+그림 다단 | 1 | 8 | 5 |
| 보고 숫자 = 실제 | ✓ | ✓ | ✓ |

### 남은 것 (이번 범위 밖 · 다음 단계)
- `dc_build` 경로의 컨테이너(columns · col) 작업 — 지금은 섹션 단위만. outline 경로가 주 경로.
- 편집 깊이(채우기 · 늘리기 · 고치기) 가드 (S11) — 미구현.
- 기존 문서 이행(도쿄 · 오사카 · 홈카페 에이전트 블로그, 입찰공고서 등) — 지금은 검사기가 오류로 보고만 한다 (D3: 경고 단계).
- 워크스페이스 도구 내장 호출 우회(8)의 화면 재현 검증.
- (확인함) 설정 › 요소 규격 › 섹션 화면에 기호마다 '층 container/block/inline' 배지와 '담길 곳' 줄이 보인다.
