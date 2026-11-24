# playground-v2 AI Composer 이식 + 리서치 에이전트 — 이어받기 가이드

브랜치 `ideation-outline-integrate` (작성 2026-11-23 밤). **커밋하지 않았다** — 사용자 index 를 건드리지 않는다
([[keep-user-index-untouched]]: `git add` · `git mv` 금지, 커밋은 사용자에게 묻고 내 파일만 경로로).

**이전 세션 대화 기록 (반드시 참고)**:
`C:\Users\knee2\.claude\projects\C--AI-Projects-WebNovelAssistant-VibeDocStudio\c66a8702-bcf1-441f-b2b8-a642909ee5a5.jsonl`
— 설계 판단 · 화면 실행 중 발견한 결함 · 사용자 요청 원문이 다 들어 있다. 특히 사용자 마지막 요청(아래 §0)과
"화면에서 시키고 화면에서 확인" 원칙([[agent-upgrade-via-ui-loop]]).

---

## 0. 사용자 요청 (원문 요지)

1. studio `ai-composer` 의 UI/UX 전부 + 백엔드 에이전트를 playground-v2 로 이식하고, '변경된 스펙'(볼트 파일 모델)에서도
   모든 에이전트 인텔리전스가 동작 · 목표치 달성하는지 테스트케이스를 만들고 **9222 Chrome 에서 직접 에이전트 동작을 보며** 완수.
2. 이어서: research 에이전트 레벨업 + 디렉토리 생성 인텔리전스 →
   (1) 도쿄 여행 레퍼런스 블로그 2개 수집해 .ref 등록 (2) 도쿄 여행 이미지 50개 수집 (3) 레퍼런스를 참고한 도쿄 여행 블로그 작성
   → **에이전트 스스로 수행**하도록 구현하고, 직접 수행하는 걸 보면서 레벨업.

## 1. 작업 방식 (그대로 따른다)

- **실행은 화면에서, 스크립트는 재기만.** 9222 원격 디버깅 Chrome(사용자가 띄움)을 CDP 로 조작한다:
  `scripts/v2_screen/cdp.py` (open · eval · click · clicktext · type · key · shot), `scripts/v2_screen/wait_idle.py`(Composer 가
  멈출 때까지 기다렸다 대화 덤프). 파이썬: `../VibePatchNote/apps/api/venv/Scripts/python.exe`. 첫 사용: `cdp.py open http://localhost:5181/`
  (탭 id 를 `cdp_tab.json` 에 기억 — 스크립트와 같은 폴더). 화면은 1920×1080 으로 고정된다.
- 개발 중 화면 검증용 핸들: `window.__v2ai` (DEV 에서만) — `env.activeDocPath()`, `controller.getState()`, `store.getState()`,
  `runtime.contexts.autoContexts()`. 화면 요소 test-id: `composer-input` · `composer-new-session` · `v2-slot-references|resources|scope` ·
  `v2-scope-{selection,page,document,off}` · `v2-ref-row-N` · `v2-res-vault-root` · `v2-res-external-input/add` · `v2-staged-approve(-all)` ·
  탐색기 행 `[data-vault-path="..."]` · 오른쪽 도크 탭 `clicktext "AI" "[role=tab]"`.
- **실행 중에는 코드를 고치지 않는다.** 프론트 파일(하네스 팩 JSON 포함 — playground 가 import) 수정 → Vite HMR 이 AI 런타임을
  다시 만들어 진행 중 세션이 끊긴다. 파이썬 수정 → API 재시작. (L5 1회차를 이것으로 날렸다.)
- 기다리기: 긴 실행(5~10분)은 `wait_idle.py <max초> <정지초> > out.json` 을 백그라운드로, 진행은 `apps/api/state/assistant/workspace/hook.jsonl` 로 본다.
- 셸 heredoc 안 파이썬에서 `\` 이스케이프가 깨진다 → 소스 수정은 Edit 도구로.
- 서버: API 8090 은 사용자 `dev_server.py` (오전부터 떠 있음, 파일 바뀌면 재시작) — 내가 띄운 api 미리보기는 포트 경쟁이라 멈췄다.
  playground 5181 은 사용자 Vite. 볼트: `apps/playground/data/vaults/default-vault`.
- 원칙 메모: [[skill-design-thinking-procedure]] (스킬 = 사고 절차 + 통과 기준, 유형 분기 금지) · [[avoid-overfitting-harness]] ·
  [[ai-no-structure-ops]] · [[resource-reference-document-split]] · [[main-behavior-is-the-spec]].

## 2. 만든 것 (파일 지도)

명세 · 테스트케이스: `docs/specs/v2-composer-port-testcases.md` (변경된 스펙 C1~C11, UB/UF/L1~L8).

### 백엔드 (apps/api)
- `app/assistant/workspace/service.py` — 작업대 **볼트 모드**: `vaultId`+`docVaultPath` → 볼트 루트 안 절대 경로(밖 거부),
  `projectDocs[].vaultPath`, `draftFolder`, `readOnly`, `referencesRoot`. `app/bootstrap/container.py` 가 `vault_roots` 주입(볼트 블록을 assistant 앞으로 옮김).
- `app/assistant/use_cases/assistant_service.py` — @문서 지정 시 볼트 경로도 맞춤.
- `vibefs/doc_tools.py` — 볼트 모드면 `/api/vaults/{id}/file` 로 읽고/쓰기, `dc_new(folder=)` 로 초안 위치 지정, RO 면 쓰기 거부, 출력에 `vault://경로`.
- `vibefs/research_tools.py` (신규) — `rs_folder` · `rs_page`(블로그 iframe 따라감) · `rs_ref_import`(라이브러리 등록 → .ref 저장 → 작업대 켜기) ·
  `rs_image_search`/`rs_image_save` (Wikimedia Commons 자유 라이선스만 — NC/ND 제외, 형식 · 크기 검사, `_사진 출처.md` 에 `![[파일]]`+라이선스 · 작가 · 원본,
  저장 폴더를 세션 마운트에 추가). `vibefs/server.py` 에 등록.
- `vibefs/hook.py` — `search_web`(agy 내장) 은 볼트 모드 · 쓰기 가능 작업대에서만 허용; 마운트 안이어도 앱 문서(.vdoc · .outline · .ref …) 읽기 거부.
- `vibefs/index.py` — 앱 문서는 리소스 색인에서 제외; `vault:<폴더>` 로 마운트된 파일에 리소스 id `vault:<볼트 상대 경로>` (→ 문서엔 `resource:vault:…`).
- `app/assistant/workspace/citations.py` — 줄 범위 없는 읽기를 READ_WINDOW 만큼 읽은 것으로 (인용 검증 오탐 수정).
- `evals/doc_fidelity.py --doc-file` (볼트 파일 채점), `evals/research_eval.py` (신규, R1~R3).
- 하네스 팩: `packages/harness-packs/research/` (신규 — tools.json · messages.json · rules/workspace.md 사고 절차), core `pack.json` 조립에 추가,
  `core/sandbox/policy.json` (`documentExtensions` · `researchTools` · 메시지), `editor/tools.compose.json` (dc_new.folder).
- 테스트: `tests/test_vault_workbench.py`(15) · `tests/test_research_tools.py`(8).

### 프론트 (apps/playground/src/mocks/v2-ide)
- `model/ai/` (신규): `scope.ts`(studio 복사) · `v2AiStore.ts`(범위 · 레퍼런스 · 리소스 설정, 변경안 대기열 — localStorage 보존) ·
  `v2AiContexts.ts`(작업대 · 레퍼런스 · resource-mount · 범위 · 선택 · @문서/@파일/@칸… 제공자) · `v2AiTools.ts`(클라이언트 도구 18종, 범위 가드, 변경안 적용) ·
  `v2AiWorkspace.ts`(런타임 · 컨트롤러 · `start()`(StrictMode 안전) · 대화 키 `vaultId:경로` · 에이전트 초안 열기(출력 · doc 인자 · 새 파일 감시) ·
  wb_propose → 대기열 · 리서치 결과 자동 켜기 · `resource:vault:` 사진 해석기 · [AI] 배지).
- `ui/ai/` (신규): `V2ComposerView.tsx`(공용 `ComposerPanel`) · `V2ComposerSettingsBar.tsx` · `V2StagedChangesPanel.tsx`.
- `ui/IdeWorkbenchPage.tsx` — AI 탭을 진짜 Composer 로 교체, 캔버스 2D 디렉팅 → `sendFromCanvas`. `ui/VDocTabEditor.tsx` — 목업 동작 칩 제거.
- `packages/slot-canvas/src/mediaSrc.ts` — `setMediaSrcResolver` (앱별 사진 주소 해석 훅).
- `package.json` 에 ai-composer · ai-react · harness-packs 의존 추가 (pnpm-lock 9줄). 테스트: `__tests__/v2-composer.test.ts`(14).

## 3. 결과

전체 회귀: 플레이그라운드 70건 (perf M3/M6 은 전체 실행 부하 때만 흔들림 — 단독 통과), API 관련 스위트 통과.
API 전체의 기존 실패: handoff R6 의 7건 + 사용자 미커밋 assets/outline/vault 도메인 때문에 생긴 architecture · health · no_long_prompt(assets/use_cases.py).

화면 실행 (실제 agy, gemini-3.8-flash) — 결과 덤프 · 캡처: `apps/api/evals/results/v2-port/`
| id | 결과 |
|---|---|
| L1 문서 파악 | 통과 — 읽기 도구만, 실제 slotId 9개 지목, 파일 그대로 |
| L2 선택 칸 채우기 | 통과 — 그 칸만 변경안, 승인 시 그 칸만 반영(fill.author=ai), 구조 그대로 |
| L3 범위 밖 | 통과 — 범위 밖 변경안 0, 범위 전환 안내 |
| L4 구조 보호 | 통과 — dc_build 거부, 초안 대안 제시 |
| L5 입찰 공고서 ×2 | run1: A1 5 · A4 .875 · S2 통과 · C1/C2/E1 1.0 · C4 8 · D1/D2 0 · D3 9 / run2: A1 10 · A4 .833 · C4 8 · D3 4 (studio 기록 범위 안: s4-run5 C4 3 · run6/7 C4 9) |
| L7 @멘션 | 통과 — 첨부 파일만 근거, 쓰기 0 |
| L8 대화 보존 | 통과 (2026-11-24 화면 확인, `L8-result.json` · `L8-conversation-preserve.png`) — 탭 전환 후 복귀 시 문서별 대화 복원 + 우측 `AI` 탭 유지 보정(`IdeWorkbenchPage.tsx`) |
| 리서치 rs-run1 (도쿄) | 13개 목표 중 12 — 레퍼런스 2(사이트 2) · 사진 50/50 라이선스 100% 중복 0 · 글 8절 사진 16/16 로드 · 출처 표기 · 복사 0. **미달: R1_min_blocks 15 (japan-guide)** |
| 리서치 rs-run2-osaka (오사카 · 레벨업 2회차) | 15개 목표 중 14 — **역할 폴더 분리(`여행/오사카/{레퍼런스,사진,글}`)** · **한국어 개인 블로그 2편(블록 146/85 · 한글 88%/88%)** · 사진 51/50 라이선스 100% 중복 0 · 글 6절 사진 15/15 캔버스 로드(`brokenImgs: []`) · 출처 · 복사 0. 유일 미달 `R1_distinct_hosts: 1` 원인(Google Grounding 리다이렉트 주소 미해제) 진단 및 `research_tools.py` 수정 |
| 리서치 rs-run3-coffee (홈카페 핸드드립 · 비여행) | 15개 목표 중 14 — **역할 폴더 분리(`홈카페/핸드드립/{레퍼런스,사진,글}`)** · **한국어 개인 블로그 2편(`minhy3038.tistory.com` 블록 35 한글 98%, `ssindong24.tistory.com` 블록 39 한글 96%) · 서로 다른 호스트 2/2 통과** · 사진 50/50 라이선스 100% 중복 0 · 글 6절(표 2 포함) 사진 8장(수집분 100%) · 출처 · 복사 0 (`R3_image_blocks` 8 vs 10) |
| M1 다중 선택 칸 채우기 (2026-11-24) | 통과 — 디자인 모드 Ctrl+클릭으로 칸 2개(`slot-p1-col1/col2`) → 인스펙터 [AI 에 첨부] → `@선택1` 대상, 범위 "이번 메시지만 · 2개 선택". 에이전트 `slots.proposeBatch` 2건(그 두 칸만), 승인 전 파일 해시 그대로, 승인 후 바뀐 칸 2개뿐(`fill.author=ai`) · 쪽 구조 그대로. 시험 사본: `05. AI Eval/multi-select-check.vdoc`. 발견 · 수정: 칸만 고르면 [AI 에 첨부] 버튼이 숨던 결함(`MultiSelectionInspector.tsx`) |
| M2 에이전트 `canvas.select` | 통과 — "표의 '역할 및 핵심 포인트' 열 칸을 짚어줘" → `document.getOutline` → `canvas.select {slotIds: [slot-t-h3, slot-t-13, slot-t-23]}`, 캔버스에 3칸 테두리, 파일 쓰기 0 |
| M3 탐색기 다중 선택 → 첨부 | 통과 — 탐색기 Ctrl+클릭 2파일 → Composer 추천 첨부 "선택 …" → `@첨부1/2`(file) → 각 파일 용도 한 줄씩, 도구 · 쓰기 0 |

## 4. 남은 일 · 사용자 결정 대기

1. **완료됨 (2026-11-24)**:
   - `rs_page` 언어(한글 비율)·작성자/날짜·형식 신호(`BlogPosting`/`<article>`/문단 평균 길이/링크 밀도) 및 리다이렉트 원주소 해제(`_resolve_canonical_url`) 구현.
   - `rs_ref_import` 얇은 레퍼런스(20블록 미만) 경고 + 한글 비율 출력 보강.
   - `packages/harness-packs/research/rules/workspace.md` 사고 절차(역할 폴더 분리 · 언어/형식 기준 · `dc_new(folder=)`) 보강 및 `evals/research_eval.py`에 `R0_role_folders` · `--lang ko` 지표 추가.
   - 새 여행 주제(`rs-run2-osaka`) 및 비여행 주제(`rs-run3-coffee`) 2회 화면 검증 완료 + L8(대화 보존) 화면 통과 확인.
2. **이미지 수집 출처 (사용자 결정 필요)**: 현재 Wikimedia Commons 자유 라이선스만 사용 — Unsplash/Pexels API 키 등 다른 출처 확장을 원하는지 결정 필요.
3. **평가용 볼트 파일 정리 (사용자 확인 후)**:
   - L2 승인으로 `01. Architecture/00. System-Proposal.vdoc` 의 `slot-p1-col1` 이 바뀌었다 — 원본: `apps/api/evals/results/v2-port/00. System-Proposal.before-L2-approve.vdoc`.
   - 평가로 만든 볼트 파일: `01. Architecture/제안서 작성(가제목) v2-L5.vdoc` · `입찰 공고서 — …vdoc`, `05. AI Eval/`, `여행/도쿄/`, `여행/오사카/`, `홈카페/핸드드립/`. 지울지 유지할지 결정 필요.
   - 브라우저 localStorage 의 v2 AI 설정(`vibe.playground.v2ide.ai.default-vault.*`).
4. **알려진 한계**: `resource:vault:` 사진 주소는 파일 이름 변경 시 다시 쓰지 않는다(링크카드 `vault://` 만 rewriter 가 처리) · v2 새 A4 문서엔 시작 블록 2개가 있어
   에이전트가 '빈 문서'로 보지 않고 옆에 초안을 만든다(studio 와 다름 — 사용자 결정 필요) · 변경안 다중 후보(1안 · 2안) 전환 미이식 ·
   레퍼런스 해석 카드(rf_interpret) 패널 미이식(알림만).
