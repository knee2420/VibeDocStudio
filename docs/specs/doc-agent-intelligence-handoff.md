# 문서 에이전트 인텔리전스 업그레이드 — 이어받기 가이드

브랜치 `feat/doc-agent-intelligence` (main 위 7커밋: `96010a3` S1 → `098211f` S2 → `b785c41` S3 → `e6dd4df` S4 →
`e1d3b59` 값 · 글머리는 짓기 전에 → `6c6ab8d` 제목 단계 · 측정 오탐 → `d982157` D3 원장 집계).
push · main 병합은 하지 않았다. 이 문서는 남은 작업을 다른 에이전트가 같은 방식으로 이어 가기 위한 것이다.

**현재 (s4-run5, `6c6ab8d`)**: S1 · S2 · S3 통과, D1 · D2 = 0 (s4-run3 ~ run7 다섯 번 연속). 남은 미달은 D3(읽은 리소스 6개, 목표 15)와
분량(10쪽 → 5쪽 — 지어내지 않게 된 뒤 근거 없는 내용을 빼서 얇아짐). 실행 간 오염(R5)이 실제로 결과를 망가뜨리기 시작했다.

### 지금까지 배운 것 (가장 중요)
- **agy 는 짓기 전에 받은 정보는 따르고, 다 지은 뒤 점검(dc_check)은 쉬운 추가만 고친다.** 뼈대(rf_skeleton) · 값 출처 · 글머리 단계는
  설계(S4) · 짓기(S5) 규칙으로 옮겼을 때 처음 효과가 났다. 사후 점검에만 넣은 것(글머리 힌트 · 지어낸 값 목록)은 무시됐다.
- **도구가 저절로 해 주는 기본기가 가장 확실하다** — 문단 스타일 자동 부여, 마커 목록 → 스타일 문단, 제목 단계 자동(번호로) 은 agy 가 아무것도 안 해도 맞는다.
- **"레퍼런스 개수에 맞춰라"는 지어내기를 부른다** — 레퍼런스 표 31개(요구사항 31개의 카드)에 맞추라는 '얇은 절' 검사는 넣었다가 되돌렸다.
- **읽기를 늘리는 규칙은 구조를 무너뜨렸다** — 절마다 원천을 읽으라는 S3 규칙: 읽은 파일 6→9 지만 표 8→5 · 요구사항 표 밖 · C4 3→9 (s4-run6). 되돌림.

---

## 0. 왜 하는가

사용자 요청(그대로): *"다음 레페런스의 23페이지까지를 레퍼런스로 활용하여. 현재 리소스에 첨부한 우리 프로젝트에 대한 종합적인 '입찰 공고서'를 작성해줘"*
를 agy(Antigravity CLI · ACP)가 Composer 에서 처리한 결과가 나빴고, 사용자 피드백은 네 가지였다.

1. 블로그와 달리 **한 글자가 중요한 '문서' 레퍼런스 분석**이 약하다 → S3
2. **리소스를 찾고 쓰는 인텔리전스**가 약하다 → S4
3. **표를 그릴 도구가 없다** → S1
4. **한글 · 워드식 미묘한 조판(개조식 단계 · 내어쓰기)** 표현력이 약하다 → S2

목표: 단계마다 수치 목표를 두고, 화면에서 시키고 화면 결과를 재서, 목표에 닿을 때까지 스펙을 올린다.

---

## 1. 반드시 지킬 것

| 규칙 | 이유 · 방법 |
|---|---|
| **실행은 반드시 화면에서** | 스크립트로 agy 를 부르지 않는다. 브라우저(1920×1080)에서 새 문서 → Composer 입력 → 결과를 캔버스에서 확인. 스크립트는 **재기만** 한다 (`evals/doc_fidelity.py`). |
| **하네스 과적합 금지** | 이 요청 · 이 레퍼런스 전용 규칙을 만들지 않는다. 기본기(harness-kit 함수) + 데이터 레지스트리(harness-packs JSON) + 규칙 문장만 늘린다. 입찰 공고 전용 처리는 `authoring:genres.json` 의 한 항목일 뿐이다. |
| **Resource · Reference · Document 분리** | 리소스 = 사실, 레퍼런스 = 결정의 궤적(모양 · 리듬 · 뼈대, 사실 아님), 문서 = 쓰는 곳. 레퍼런스의 수치 · 고유명사를 사실로 쓰면 누출(D2). |
| **AI 는 사람 문서 구조를 바꾸지 않는다** | 구조 조작(dc_build page · add · move · remove)은 에이전트가 만든 초안에서만. |
| **채점기와 dc_check 는 같은 자** | 지표 정의(기호 · 뼈대 · 장르 · 근거 값)는 harness-kit 함수 하나를 함께 쓴다. 한쪽만 고치지 않는다. 채점기를 고쳐 숫자를 올리지 말 것 — 고칠 때는 "같은 것끼리 비교하고 있었나"만 따지고, 커밋 메시지에 밝힌다. |
| **git** | 사용자 index 를 건드리지 않는다 (사용자가 stage 해 둔 게 있으면 `git add` 금지 — 지금은 비어 있다). 커밋은 내 파일만 경로로. `apps/api/data/knowledge/projects/.../project.vproj.json` 은 앱 데이터라 커밋하지 않는다. push 는 사용자에게 묻는다. |
| **main 동작이 명세** | 기존 동작을 바꾸지 말 것. 사용자가 다시 설명하게 만들지 않는다. |

---

## 2. 지금까지 한 것 (파일 지도)

```
packages/
├─ harness-kit/harness_kit/patterns.py
│    section_lines · skeleton_diff · title_similarity   장 · 절 뼈대(번호 · 단계 · 자리 'Ⅱ/가')와 비교
│    genre_of · genre_items                              장르 표로 필수 구성 점검
│    fact_values · unsourced_values                      근거가 있어야 하는 값(금액 · 기간 · 비율 · 공고번호)
│    marker_patterns · _kind_alias · measure.marker_scheme
├─ harness-packs/
│    core/lexicon/ko.json      measure.markers(+glyph) · sections · factValue
│    editor/paragraph-styles.json   한글식 문단 스타일 레지스트리 (sec 가. · sub 1) · b1 ❏ · b2 ○ · b3 - · b4 · · note ※ …)
│    editor/messages.json      dc_check 출력 문장 (skeleton · genre · provenance · markerHint · problems)
│    editor/tools.compose.json dc_build(표 · 문단 스타일 · 표 set) · dc_check(pages · doctype) 명세
│    editor/rules/compose.md   S4 서식 문서 예외(뼈대 = rf_skeleton) · S6 점검 항목
│    reference/layers.json     D5 marker_scheme · kindAliases · countMetrics
│    reference/tools.json · messages.json   rf_skeleton(pages) + [장 · 절 뼈대]
│    authoring/genres.json     장르별 필수 구성 (bid-notice 하나)
├─ docstruct-engine/.../compile/vdoc_build.py
│    table 블록(_table: rows/fields · 병합 · 머리 · 너비 · 테두리) · <table> HTML 거부 · 무음 삭제 보고(drain_dropped)
│    assign_paragraph_styles · _marker_lists_to_paragraphs (<ul><li>❏ → 스타일 문단)
│    _section_level (heading 단계를 장 · 절 번호로: Ⅰ → 1, 가. → 2)
└─ slot-editor/src/ ParagraphStyle(data-style 왕복) · paragraph-styles.ts(CSS 생성) — apps/studio/src/main.tsx 에서 주입
apps/api/
├─ vibefs/doc_tools.py   dc_build(표 set 다시 짓기 · 빈 set 거부) · dc_check(뼈대 · 장르 · 근거 · 글머리 힌트 · 범위 측정)
├─ vibefs/ref_tools.py   rf_skeleton(pages) → _section_tree
├─ vibefs/server.py      DocTools 에 reads(읽은 원천 원장) 전달
├─ evals/doc_fidelity.py + doc_fidelity_targets.json   채점기 · 단계 목표
├─ evals/results/doc-fidelity/<label>.json|.md          실행별 결과
└─ tests/test_compose_tools.py                          위 기능 테스트
```

---

## 3. 측정

### 채점 명령 (apps/api 에서)

```bash
../../../VibePatchNote/apps/api/venv/Scripts/python.exe evals/doc_fidelity.py --doc <docId> --ref ref-1a1cfbc6842-abd78415 --pages 1-23 --resources "C:/망고독 관련 자료/프로젝트_매니지먼트/What-s-in-my-head/1.🎯(Project) 프로젝트" --genre bid-notice --label <label>
```

결과는 `evals/results/doc-fidelity/<label>.json|.md`. 채점기를 고치면 **이전 실행 전부를 다시 채점**해 표를 맞춘다 (아래 문서 id 표 참고).

### 지표 · 목표

| 단계 | 지표 | 목표 |
|---|---|---|
| S1 표현력 | A1 표 블록 수 · A2 320자 넘는 문단(문단 단위) · A4 요구사항 번호가 표 안 | ≥8 · ≤2 · ≥0.9 |
| S2 조판 | B1 글머리 체계 일치(번호 제외) · B2 이름 있는 스타일 비율 · B3 내어쓰기(레지스트리상 hanging 스타일 대상만) | ≥0.7 · ≥0.6 · ≥0.8 |
| S3 레퍼런스 구조 | C1 장 · 절 갖춤 · C2 번호 체계 · C4 30% 넘게 다른 층위 지표(분량 지표 제외) · E1 장르 필수 구성 | ≥0.8 · ≥0.8 · ≤3 · ≥0.8 |
| S4 근거 | D1 리소스 어디에도 없는 값 · D2 그중 레퍼런스 값 · D3 읽은 리소스 파일 수(agy 대화 db) | 0 · 0 · ≥15 |

### 실행 기록 (같은 요청 · 같은 설정, 현재 채점기로 재채점 — `d982157` 기준)

| label | docId | A1 | A4 | B1 | B2 | B3 | C1 | C4 | E1 | D1 | D2 | D3 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s0-baseline | vdoc-1a1cfbc25a0-c8e38e06 | 0 | 0 | 0.4 | 0 | 0 | 0.357 | 7 | 0 | 6 | 2 | 6 | 원래 결과 |
| s1-run1 | vdoc-1a1d0a23f9b-dabef4e6 | 20 | 1.0 | 0 | 0 | 0 | 0.357 | 8 | 0 | 5 | 1 | 2 | 표 블록 |
| s2-run1 | vdoc-1a1d165c506-d359966d | 15 | 1.0 | 0.8 | 0.964 | 1.0 | 0.857 | 4 | 0 | 3 | 2 | 2 | 문단 스타일 |
| s3-run3 | vdoc-1a1d18c305a-55ac28a1 | 18 | 1.0 | 0.6 | 0.922 | 1.0 | 1.0 | 8 | 1.0 | 7 | 1 | 1 | 뼈대 · 장르 |
| s4-run2 | vdoc-1a1d1a37c40-34b20b44 | 19 | 1.0 | 0.6 | 0.92 | 1.0 | 1.0 | 8 | 1.0 | 5 | 2 | 7 | 근거 점검(사후) |
| s4-run3 | vdoc-1a1d26a2472-b0d87591 | 8 | 1.0 | 0.8 | 0.959 | 1.0 | 1.0 | 6 | 1.0 | 0 | 0 | 9 | 값은 짓기 전에 |
| s4-run4 | vdoc-1a1d278f459-5c7b8b6f | 8 | 1.0 | 0.833 | 0.959 | 1.0 | 1.0 | 2 | 1.0 | 0 | 0 | 6 | 확인 실행 |
| **s4-run5** | vdoc-1a1d28797f1-59578173 | 8 | 1.0 | 0.8 | 0.95 | 1.0 | 1.0 | 3 | 1.0 | 0 | 0 | 6 | 제목 단계 자동 — **S1~S3 통과** |
| s4-run6 | vdoc-1a1d2912489-8143d5a3 | 5 | 0 | 0.667 | 0.94 | 1.0 | 1.0 | 9 | 1.0 | 0 | 0 | 9 | 절마다 읽기 규칙 → 되돌림 |
| s4-run7 | vdoc-1a1d29b4066-64d67948 | 5 | 0 | 0.667 | — | — | 1.0 | 9 | 1.0 | 0 | 0 | 5 | s4-run6 문서를 열어 베낌 (오염) |

실행 하나는 흔들린다 — **바꾼 것마다 2회 이상 돌려 보고, 그 사이 agy 가 앞 실행 문서를 열었는지(hook.jsonl) 확인한다**.

---

## 4. 화면 실행 절차 (그대로 따른다)

1. 서버: 미리보기 `studio`(5180) · `api`(8090). **파이썬 · 팩 JSON 을 고쳤으면 api 를 재시작**하고 `GET /api/documents/<아무 id>` 가 200 이 될 때까지 기다린 뒤 화면을 새로고침한다 (먼저 새로고침하면 "작업 공간을 불러오지 못했습니다" 화면이 뜬다).
2. 화면 1920×1080 (`resize_window`). 레이아웃을 줄여 맞추지 않는다.
3. 새 문서: `window.prompt = () => "제안서 작성(가제목) <label>"` 로 제목 입력만 대신하고, Documents & Pages 의 `+`(testid `outline-new-doc-menu-btn`) → "새 문서 (A4)" 를 **클릭**한다. URL 의 `doc=` 이 새 docId.
4. Composer 조건 확인 (`composer-settings-bar`): 레퍼런스 1/8(참조8) · 리소스 340/801 · **범위가 새 문서마다 '이 페이지'로 돌아가므로** "범위 세부 설정 열기" → "문서 전체 (빼 둔 페이지 제외)". 모델 `composer-engine-model` = gemini-3.8-flash.
5. `composer-input` 을 클릭하고 요청 문장을 정확히 그대로 타이핑 → Enter.
6. 끝 기다리기: **문서 revision 과 agy 대화 파일 `~/.gemini/antigravity-cli/conversations/<conv>.pb`(+ .db · .db-wal) 수정 시각이 둘 다 3분 넘게 그대로**일 때 끝. 문서만 보면 agy 가 생각하는 동안 멈춘 것을 끝으로 착각한다 (s4-run3 · run6 에서 빈 문서를 채점했다). 백그라운드 스크립트로 기다리고, 끝나면 화면에서 Composer 가 "응답 중"이 아닌지 본다.
7. 채점 → 캔버스에서 표 · 개조식 · 장르 쪽을 직접 본다 (숫자가 놓치는 것: 예 s4-run2 의 지어낸 날짜 "2026년 11월 30일").
8. 원인 추적: `apps/api/state/assistant/workspace/workbench.json` 에서 docId → 세션 → `conversationIds`.
   - 도구 호출 순서 · 인자: `state/assistant/workspace/hook.jsonl` (`ev: pre|mcp`, `conv`) — 앞 실행 문서를 열었는지도 여기서 본다.
   - 읽은 원천: `state/assistant/workspace/reads.jsonl` (채점기 D3 도 이것을 센다).
   - 도구 결과 · 마지막 보고: 예전엔 대화 `.db` 의 `steps.step_payload`, 지금 agy 는 `.pb` 에만 쓴다(.db 비어 있음) — 화면 Composer 를 읽는 게 확실하다.

---

## 5. 남은 작업 (우선순위 순)

### R1. 지어낸 값 — **해결** (D1 · D2 = 0, s4-run3 ~ run7 다섯 번 연속)
- 사후 dc_check 목록(블록 id 까지)으로는 agy 가 고치지 않았다. **설계 · 짓기 규칙**(compose.md S4 · S5: 값마다 출처 파일:줄, 없으면 처음부터 '[확인 필요]')
  과 S7(마지막 dc_check 의 남은 문제를 보고에 그대로) 로 해결. 보고도 정직해졌다.
- 남은 틈: **날짜**는 근거 점검(`measure.factValue`) 밖이다. 지금은 agy 가 날짜를 '[확인 필요]' 로 두고 있지만 점검이 막아 주는 건 아니다.
  더하려면 표지 작성 연월("2026. 10.")처럼 정상인 날짜와 구분할 규칙부터 정하고, 채점기도 같은 패턴이므로 재채점.

### R2. 리소스를 넓게 찾지 않고 문서가 얇다 — D3 6 (목표 ≥15) · 5쪽 (전 10쪽)
- 지어내지 않게 된 뒤, 근거를 못 찾은 내용은 빼거나 빈칸으로 둔다 → 정직하지만 얇다. 근거를 더 찾게 해야 한다.
- **실패한 시도**: S3 에 "서식 문서는 절마다 원천을 따로 찾아 읽는다" 규칙 → 읽은 파일 6→9 였지만 표 8→5 · 요구사항 표 밖 · C4 3→9 로 구조가 무너졌다 (s4-run6). 되돌림 (`d982157`).
  규칙을 늘리면 agy 의 주의가 분산된다 — 다음은 **규칙이 아니라 도구**로.
- 다음 후보 (도구 쪽): `ws_plan(sections)` — 설계한 절 제목마다 후보 원천 파일 · 줄을 한 번에 돌려준다 (rf_skeleton 이 뼈대를 짓기 전에 주듯이).
  agy 가 찾는 수고를 줄여 읽기만 하면 되게. resource 팩 tools.json + `vibefs/tools.py`, 결과 문장은 팩 messages (harness-kit 에 한글 금지).
- 15 는 임의 목표다. "문서 사실 문장 중 읽은 줄로 뒷받침되는 비율" 같은 지표로 바꾸는 것도 검토 (바꾸면 targets · 채점기 · 이 문서 함께).
- 하지 말 것: 레퍼런스의 개수(요구사항 31개 · 표 31개)에 맞추라고 하기 — 지어내기를 부른다 ('얇은 절' 검사 넣었다 되돌림).

### R3. 층위 차이 C4 — **목표 안** (s4-run4 2 · s4-run5 3)
- 판정해 고친 것: meta_approval('협조부서') · meta_version('신규 버전 출시') · source('조치 기준)') 은 **어휘 오탐** → 패턴을 좁힘.
  heading_levels · bullet_ratio 는 **측정 불일치**(채점기가 제목을 <p> 로, 글머리를 <li> 만) → dc_check 와 같게.
  제목이 모두 2단계였던 건 **진짜 구조 문제** → 제목 단계를 번호로 자동 (`vdoc_build._section_level`).
- 남은 것: bold_per_para (레퍼런스 0.01 — 블록 264개 중 굵게 3개, PDF 추출 손실 의심 · 레퍼런스 PDF 를 화면으로 열어 확인 필요),
  callouts, heading_levels([1,2] vs [1,2,3]).

### R4. 글머리 단계 — **목표 안** (B1 0.8 ~ 0.833)
- dc_check 의 markerHint 는 agy 가 받고도 무시했다. S4 설계 표에 절마다 글머리 단계를 적게 한 규칙으로 해결.

### R5. 실행이 서로 독립이 아니다 — **지금 가장 큰 방해**
- agy 가 앞 실행 문서를 dc_outline · wb_read 로 열어 베낀다. s4-run7 은 s4-run6 의 무너진 구조를 그대로 베꼈다 → 비교가 무의미해진다.
- 사용자 데이터라 지우거나 옮기지 말 것. 방법(별도 평가 프로젝트 · 지난 평가 문서 보관 처리 · Composer 의 문서 목록에서 빼기 등)은 **사용자에게 묻는다**.
- 그 전까지는 실행마다 hook.jsonl 에서 다른 vdoc 를 열었는지 확인하고, 열었으면 그 실행은 확인용으로 치지 않는다.

### R6. 손대지 않은 기존 실패 테스트 7개 (이 작업 이전부터, HEAD 스냅샷에서도 실패 확인)
`test_block_kinds_contract::test_server_code_only_emits_registered_block_kinds` ·
`test_docstruct_scaffold_adapter` ×2 · `test_docstruct_vdoc` ×2 (`hwpx_to_doc_ir…`, `pdf_doc_ir_to_vdoc…`) ·
`test_docstruct_vdoc_flow::test_header_footer_isolation…` · `test_resource_workspace::test_prepare_sandbox_writes_agy_config`.
회귀 판단 기준은 "이 7개 외 실패 없음". 전체: `../../../VibePatchNote/apps/api/venv/Scripts/python.exe -m pytest -q -p no:cacheprovider` (apps/api).
studio: `npx tsc --noEmit` 0 오류, oxlint 의 FSD 오류 3개는 기존 것.

### R7. 끝낼 때 정리
- 평가용으로 바꾼 화면 설정 되돌리기 (사용자에게 확인 후): Reference Manager 참조7 켬 · 참조8 끔, Resource Manager "여행 블로그 포스팅/3번째 포스팅" 켬 · "1.🎯(Project) 프로젝트" 끔, Composer 범위.
- 로컬 main 은 origin/main 보다 9커밋 앞 (사이드바 작업), 이 브랜치는 main 보다 7커밋 앞 — push · 병합은 사용자가 정한다.

---

## 6. 함정

- **셸 heredoc 안의 파이썬에서 `\n` · `\s` · `\b`** 가 깨진다 (실제 줄바꿈 · 백슬래시 소실). 소스 수정은 Edit 도구로, 스크립트는 스크래치 파일로.
- **JSON 을 `json.dumps` 로 다시 쓰면** 파일 전체 서식이 바뀌어 diff 가 커진다. 팩 JSON 은 문자열 삽입으로 고치고 `json.loads` 로 검증만.
- harness-kit 에 한글 문자열(정규식 포함)을 쓰면 테스트가 막는다 → 어휘 · 메시지 팩으로.
- Windows 콘솔 cp949: 출력에 `PYTHONIOENCODING=utf-8` 또는 `sys.stdout.reconfigure(encoding="utf-8")`.
- `html_to_text` 는 굵게를 `**` 로 남긴다 — 줄 머리 기호 판정 전에 지운다 (`section_lines` 참고).
- agy 는 고치기 쉬운 것만 고친다 (페이지 하나 더하기 O, 9개 절 재구성 X). **짓기 전에** 줄 정보(rf_skeleton · 설계 규칙)가 사후 점검(dc_check)보다 훨씬 잘 듣는다.
- agy 는 dc_use 전에 dc_build 를 먼저 불러 '사람이 만든 문서' 오류를 한 번 받는다 (화면에서 만든 빈 문서). 호출 하나 버리는 정도라 정책은 그대로 둔다.
- 파이썬 파일을 고치면 dev 서버(api)가 자동으로 다시 뜬다 — 그동안 화면은 'Failed to fetch'. 200 을 확인하고 새로고침.
- 도구가 "저장했다"고 해도 믿지 말 것 — s4-run1 의 표 set 은 첫 칸을 비우고 성공이라 했다. 화면 · 문서 JSON 으로 확인.
