# playground-v2 AI Composer 이식 — 변경된 스펙 · 시나리오 · 테스트케이스

- 대상: studio `features/ai-composer` · `features/ai-workspace` · 백엔드 에이전트(agy ACP + vibefs MCP `wb_*` · `rf_*` · `ws_*` · `dc_*`)를
  `apps/playground` v2-ide 로 옮긴다.
- 기준: studio 에서 이미 되는 동작이 명세다 ([[main-behavior-is-the-spec]]). 아래 "변경된 스펙"만 바뀐다.
- 실행 · 판정: 에이전트 품질은 **화면에서 시키고 화면에서 본다**. 스크립트는 저장된 결과를 재기만 한다
  (`docs/specs/doc-agent-intelligence-handoff.md` §1 · §4).

---

## 1. 변경된 스펙 (studio → v2)

| # | 항목 | studio | v2 (이식 후) |
|---|---|---|---|
| C1 | 문서 식별 | DB 문서 `docId` (`data/knowledge/documents/<docId>/document.vdoc.json`) | 볼트 파일 `vaultId` + 볼트 상대 경로 (`…/이름.vdoc`). `docId` 는 파일 안 메타일 뿐 |
| C2 | 문서 읽기 · 쓰기 | `/api/documents` (GET · PUT · POST) | `/api/vaults/{id}/file` (GET · PUT · POST). 쓰면 볼트 감시(SSE)로 화면이 갱신된다 |
| C3 | 프로젝트 · 형제 문서 | `projectId` 의 `docIds` | 활성 문서를 품은 `.vproj` 폴더, 없으면 같은 폴더의 `.vdoc` |
| C4 | 리소스(사실 근거) | RM 체크 트리 (`resource-mount`) | 설정바에서 고른 **볼트 폴더** + **외부 폴더(절대 경로)** → 같은 `resource-mount` 페이로드 |
| C5 | 레퍼런스(결정 궤적) | Reference Manager 라이브러리 `refId` | 볼트 `.ref` 파일. `source.serverRefId` 가 있으면 라이브러리 항목으로 이어 `wb_read(ref:…)` · `rf_*` 가 그대로 동작, 없으면 `.ref` 본문을 첨부로 싣는다 |
| C6 | 작업 범위 | 설정바(문서 · 페이지 · 선택 · 끔) + 이번 메시지 `@선택` | 같다. 선택은 v2 `vdocUiBridge`(블록 · 칸 · 페이지)에서 온다 |
| C7 | 변경안(Staged) | 서버 staging 대기열 | 볼트 문서 경로별 로컬 대기열. 승인하면 그 칸만 볼트 파일에 쓴다 |
| C8 | 에이전트 초안 | `POST /api/documents` (`origin.createdBy=agent`) | 활성 문서 폴더(없으면 `AI Drafts/`)에 새 `.vdoc` 파일. 탐색기 `[AI]` 배지 · 탭 열기 |
| C9 | 대화 보존 키 | `projectId:docId` | `vaultId:볼트 경로` |
| C10 | 사람 문서 구조 | AI 는 읽기 · 채우기만 | 같다. v2 의 `[구조]`·`[디자인]` 모드와 무관하게 구조 조작은 에이전트 초안에서만 ([[ai-no-structure-ops]]) |
| C11 | 2D 디렉팅 목업 | — | 키워드 if 분기 목업(`executeAiDirective`) 대신 진짜 Composer 로 보낸다. 목업 함수는 테스트 호환용으로만 남긴다 |

## 2. 대상 에이전트 · 능력

| 에이전트 | 능력 (원시 기능) | 이식 후 확인할 것 |
|---|---|---|
| Composer (agy ACP) | 지도 · 읽기(`wb_*`) · 계획 · 채우기 제안(`slot(s).propose*`) · 화면 조작(`canvas.selectSlot`) | 볼트 문서를 읽고, 범위 안 칸만 제안하고, 승인 전엔 파일이 그대로다 |
| 문서 짓기 (vibefs `dc_*`) | 초안 만들기 · 쪽/블록/표 짓기 · 점검(`dc_check`) | 초안이 볼트 파일로 생기고, 사람 문서에는 구조 조작이 거부된다 |
| 레퍼런스 해석 (`rf_*`, `wb_read ref:`) | 뼈대 · 층위 · 핀 | `.ref` → 라이브러리 항목으로 이어진다 |
| 리소스 탐색 (`ws_*`, `read_file`) | 지도 · 수집 · 근거 | 볼트 폴더 · 외부 폴더가 마운트되고 읽은 파일이 원장(reads.jsonl)에 남는다 |
| 에셋 AI (`/api/assets/*`) | 블록 → 에셋 추상화 · 적용 프리뷰 | 이식으로 깨지지 않는다 (회귀) |

## 3. 자동 테스트 (계약)

### 3.1 백엔드 — `apps/api/tests/test_vault_workbench.py`

| id | 내용 | 기대 |
|---|---|---|
| UB1 | `set_workbench` 에 `vaultId` + `docVaultPath` | `docPath` = 볼트 루트 아래 절대 경로, `wb_overview` 가 그 문서 제목 · 쪽 · 칸을 보인다 |
| UB2 | `docVaultPath` 가 `../` 로 볼트 밖 | 거부 (`docPath` 없음) |
| UB3 | 볼트 모드 `dc_new` | 활성 문서 폴더에 `.vdoc` 생성, `origin.createdBy == "agent"`, 작업대 문서가 그 파일로 바뀐다 |
| UB4 | 볼트 모드 `dc_build` 로 블록 쌓기 | 볼트 파일 내용이 바뀐다 (쪽 · 블록 · 칸) |
| UB5 | 사람 문서(블록 있음)에 `dc_build` | 거부, 파일 그대로 |
| UB6 | `dc_use(doc=제목)` | `projectDocs` 의 `vaultPath` 로 찾아 전환 |
| UB7 | `dc_outline` · `wb_read(slot:…)` | 볼트 파일 기준으로 읽는다 |
| UB8 | studio 경로(`vaultId` 없음) | 기존 `/api/documents` 동작 그대로 (기존 테스트 통과) |

### 3.2 프론트 — `apps/playground/src/mocks/v2-ide/__tests__/v2-composer.test.ts`

| id | 내용 | 기대 |
|---|---|---|
| UF1 | 작업대 제공자 | `vaultId` · `docVaultPath` · `docId` · 범위 · 선택 · 형제 문서(`vaultPath`) · 켠 `.ref` 의 `serverRefId` |
| UF2 | 리소스 제공자 | 고른 볼트 폴더 → 절대 경로 `roots`, 외부 폴더 그대로, 끄면 첨부 없음 |
| UF3 | 레퍼런스 제공자 | `.ref` 라이브러리 연결 시 `ref:<serverRefId>`, 아니면 본문 요약 |
| UF4 | `slot.proposeContent` | 대기열에만 오르고 볼트 파일은 그대로 |
| UF5 | 변경안 승인 | 그 칸만 볼트 파일에 반영, 쪽 · 블록 수 그대로 |
| UF6 | 잠긴 칸 · 범위 밖 칸 | 거부 (범위 가드) |
| UF7 | `document.getOutline` · `slot.read` · `slots.listByState` | 볼트 문서 기준 값 |
| UF8 | 에이전트 초안 동기화 | `dc_new` 결과의 경로를 탭으로 연다 |
| UF9 | 대화 키 | `vaultId:경로` 로 바인딩 |

## 4. 화면 시나리오 (9222 Chrome · 1920×1080 · 실제 agy)

공통 절차: API(8090) · playground(5181) 기동 → 9222 Chrome 에서 열기 → 문서 탭 열기 → 우측 도크 `AI` 탭 →
설정바(레퍼런스 · 리소스 · 범위) 확인 → 입력창에 요청을 그대로 입력 → 끝날 때까지 기다림(Composer 상태 idle +
agy 대화 파일 3분 정지) → 캔버스 · 탐색기에서 결과 확인 → 측정 스크립트.

| id | 요청 (그대로) | 조건 | 통과 기준 |
|---|---|---|---|
| L1 문서 파악 | "이 문서 구조를 요약하고, 내용이 비어 있거나 부족한 슬롯을 찾아줘." | `00. System-Proposal.vdoc`, 범위 문서 전체 | 읽기 도구만 호출 · 답에 실제 칸 이름 3개 이상 · 파일 해시 그대로 |
| L2 빈칸 채우기 | "선택한 칸을 리소스를 근거로 채워서 변경안으로 올려줘." | 칸 1개 선택(@선택) | 변경안 ≥1 · 모두 선택 칸 · 승인 전 파일 그대로 · 승인 후 그 칸만 바뀜 · 블록 수 그대로 |
| L3 범위 지키기 | "3쪽 내용도 같이 다듬어줘." | 범위 = 이 페이지(1쪽) | 범위 밖 칸 변경안 0 (가드 거부 또는 에이전트가 범위를 밝힘) |
| L4 구조 보호 | "이 문서에 페이지를 하나 추가하고 표를 넣어줘." | 사람 문서 | 사람 문서 쪽 · 블록 수 그대로 (거부하거나 초안으로 돌림) |
| L5 종합 문서 (handoff 시나리오) | "다음 레페런스의 23페이지까지를 레퍼런스로 활용하여. 현재 리소스에 첨부한 우리 프로젝트에 대한 종합적인 '입찰 공고서'를 작성해줘" | 레퍼런스 = `제안요청서_통합AX포탈사이트구축_수정본_1P.ref`, 리소스 = 외부 폴더 `1.🎯(Project) 프로젝트`, 새 빈 A4 `.vdoc` 에서 | 초안 `.vdoc` 가 볼트에 생김 · `doc_fidelity.py` S1~S3 목표 · D1 = D2 = 0 (handoff 표의 s4-run5 와 같은 수준) |
| L6 다른 장르 | "다음 레퍼런스처럼, 리소스의 내용으로 블로그 글을 써줘." | 레퍼런스 = 라스베가스 블로그 `.ref`, 리소스 = 볼트 폴더 | 초안 생김 · 블록 ≥ 8 · 레퍼런스 고유명사 · 수치 누출 0 |
| L7 @멘션 | "@01. Vault-Contract.md 의 규칙을 세 줄로 요약해줘." | `.md` 를 @ 첨부 | 답이 그 파일 내용에 근거 · 쓰기 0 |
| L8 대화 보존 | 탭 전환 후 돌아오기 | — | 문서별 대화가 되살아난다 |

L5 · L6 은 한 번 실행이 흔들리므로 바꾼 것마다 2회 이상, 앞 실행 문서를 열었는지 `state/assistant/workspace/hook.jsonl` 로 확인한다 (handoff R5).
