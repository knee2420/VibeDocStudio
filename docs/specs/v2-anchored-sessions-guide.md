# playground-v2 무마찰 디렉팅 — 기준점 세션 · Composer 탭 · 세션 대시보드 통합 가이드

작성 2026-11-24 · 브랜치 `ideation-outline-integrate` 기준 · 대상: 이 기능을 구현할 에이전트.
**이 문서만 읽고 작업을 시작할 수 있게 썼다.** 판단이 갈리는 곳은 §9 "정해 둔 기본값"을 따른다. 거기에도 없으면 멈추고 사용자에게 묻는다.

---

## 0. 한 줄 요약

> 화면에서 **고른 것(다중 선택)에 AI 지시를 던지면, 그 선택에 붙은 세션이 뒤에서 돈다.**
> 선택 옆 작은 표시를 누르면 그 세션이 Composer 탭으로 열리고, 항목을 "완료" 하면 세션도 닫힌다.
> 왼쪽 대시보드는 모든 세션의 현황을 보여 준다. 사용자는 기다리지 않고 계속 쓴다.

사용자 원문 요지:

1. "작업 던져놓고 백그라운드 실행 → 완료(또는 승인 필요) 시 알림". 지시는 아웃라인 노드 근거 조사, 레퍼런스 리스트업, 에셋 추천, 폴더에 소스 모으기, 마크다운 생성, vdoc 작성 등 **playground 에이전트가 하는 모든 지시**다. 이를 "**무마찰 directing**"이라 부른다.
2. "대화 세션을 작게 표시해서, 지시 내역을 누르면 여기 붙은 세션이 열리도록. 완료 처리하면 아예 닫히도록."
3. "왼쪽 대시보드에 세션 작업 현황과 상태가 뜨게."
4. "outline 은 예시일 뿐. **선택이 가능한(multi-select) + inline-ai 붙은 전체 화면**에 같은 시나리오."
5. "ai-composer 는 탭 전환이 가능해야 한다. 다른 세션의 대화가 끼면 원래 하던 대화로 돌아갈 방법이 필요하다."

---

## 1. 용어

| 용어 | 뜻 |
|---|---|
| **표면(surface)** | 다중 선택과 인라인 AI가 있는 화면. 지금은 `outline`(아웃라인 불릿) · `vdoc`(캔버스 칸 · 블록) · `explorer`(탐색기 파일 · 폴더)이고, 앞으로 에셋 패널 등이 늘어난다. |
| **기준점(anchor)** | 지시를 던진 대상. `{ surface, path, itemIds[], label }`. **텍스트가 아니라 id** 로 가리킨다. |
| **기준점 세션(anchored session)** | 기준점에 붙은 Composer 세션 하나. 지시 한 번에 하나가 생긴다. |
| **메인 세션** | 기준점 없는 기존 Composer 대화 (볼트당 하나, `${vaultId}:workspace` 키). **지금 동작 그대로 유지한다.** |
| **세션 레지스트리** | 메인과 기준점 세션 전부를 담는 단일 저장소. 표시 · 탭 · 대시보드는 모두 이것을 보여 주는 화면일 뿐이다. |
| **앞 세션(foreground)** | 지금 Composer 탭에서 보고 있는 세션. 나머지는 뒤 세션(background)이다. |
| **결과 두 통로** | ① 서버 `vf_*` 파일 쓰기(묶음 기록 · 되돌리기) ② 변경안(Staged, `baseHash` · `runId` 포함). **새 쓰기 경로를 만들지 않는다.** |

---

## 2. JTBD → UI/UX (우선순위 순)

| # | 할 일 (사용자 관점) | 화면 | 통과 기준 |
|---|---|---|---|
| J1 | **흐름을 끊지 않고 일을 맡긴다** | 각 표면의 기존 진입점(아웃라인 `AI Direct`, vdoc 2D Directing 팝오버, 다중 선택 인스펙터 "AI 에 첨부", 탐색기 다중 선택)에서 지시를 보내면 **새 기준점 세션**이 생긴다 | 보낸 뒤 에디터 포커스 · 선택 · 스크롤이 그대로다. 오른쪽 도크가 AI 탭으로 강제 전환되지 않는다. 추가 클릭이 없다. |
| J2 | **맡긴 일이 무엇에 대한 것인지 보고 되찾는다** | 기준점 옆 **세션 표시(chip)**: 상태 점 + 짧은 제목. 같은 항목에 여럿이면 쌓고 개수를 보인다 | 표시를 누르면 그 세션이 Composer 탭으로 열리거나 그 탭으로 간다. 항목이 옮겨지면 표시도 따라간다. |
| J3 | **내 손이 필요한 순간만 안다** | 상태 점, 탭 점, 대시보드 배지. 토스트는 **승인 대기 · 검토 필요 · 오류 · 완료**일 때만 | 진행 중 이벤트마다 알림이 뜨지 않는다. 앞 세션의 일은 토스트를 띄우지 않는다. |
| J4 | **결과를 검토하고 반영한다** | 세션 탭 안에서 그 세션의 변경안 · 파일 묶음만 보인다 (기존 `V2StagedChangesPanel` 을 세션 필터로) | 승인 · 거절 · 되돌리기가 **그 세션 id** 로 동작한다. 사람이 그사이 고친 대상은 "오래됨"(`isStale`)으로 표시된다. |
| J5 | **원래 하던 대화로 돌아간다** | Composer 탭 줄: **메인 탭 고정(맨 앞, 닫기 없음)** + 세션 탭들 + "직전 탭" 이동 | 메인 탭은 한 번에 돌아온다. 직전 탭 이동 단축키가 있다. |
| J6 | **끝난 일을 치운다** | 표면의 "완료"(아웃라인 선택 막대 `완료` 등) = 항목 완료 + 세션 종료 | 세션 탭 · 표시가 사라지고 서버 세션(agy)이 닫힌다. 대시보드에는 완료 이력으로 접혀 남는다. |
| J7 | **전체 현황을 본다** | 왼쪽 **세션 대시보드** (탐색기와 같은 자리, 왼쪽 리본 버튼으로 전환) | 상태별 묶음. 행을 누르면 기준점으로 이동하고 세션 탭이 열린다. |

### 2.1 화면 상세

**세션 표시(chip)**
- 위치: 기준점 항목들의 **마지막 행 오른쪽 끝**에 둔다 (사용자 스크린샷의 빨간 박스 자리). 여러 행이면 묶음의 첫 행 기준.
- 내용: 상태 점 · 지시 앞부분 12자 안팎 · (여러 개면) `+N`. 마우스를 올리면 지시 전문, 경과 시간, 변경안 수가 보인다.
- 상태 점 색: 진행 중(파랑, 맥동) · 승인 대기(주황) · 검토 필요(보라) · 오류(빨강) · 대기열(회색) · 멈춤/끊김(회색 테두리).
- 기준점 항목이 화면에 없으면(접힘 · 스크롤 밖) 표시하지 않는다. 대시보드에서는 보인다.

**Composer 탭**
- `[메인] [세션A •] [세션B]` 형태. 이름은 기준점 라벨(예: `볼트_재편_계획 · 3개 항목`)이고, 상태 점과 안 읽음 점이 붙는다.
- 탭 닫기(×)는 **화면에서만 치운다.** 세션은 계속 돌고, 표시와 대시보드에 남는다.
- 완료는 표면의 완료 동작으로만 한다 (탭 메뉴에 "세션 완료"를 둘 수는 있다. 같은 경로를 탄다).
- 열린 탭 상한은 8개(§9). 넘으면 오래 안 본 탭부터 화면에서 치운다. 세션은 그대로다.
- 직전 탭: 탭 전환 이력 스택. 단축키는 `Alt+[`(§9). "표시를 눌러 잠깐 봤다가 돌아오기"가 핵심 동선이다.

**세션 대시보드 (왼쪽)**
- 묶음 순서: **내 손 필요**(승인 대기 · 검토 필요 · 오류) → 진행 중 → 대기열 → 기준점 없음 → 완료(접힘).
- 행: 상태 · 지시 요약 · 기준점(`파일명 · N개 항목`) · 경과 · 변경안 수 · 파일 묶음 수.
- 행 동작: 열기(탭) · 기준점으로 이동(파일 열고 항목 선택 · 스크롤) · 멈추기 · 완료.
- 메인 세션도 맨 위 고정 행으로 보인다.

---

## 3. 구현의 중점 (어기면 실패로 본다)

1. **작업 = 기준점.** 기준점 세션 안의 도구 · 범위 · 첨부 · 결과는 전부 그 기준점의 문서 경로로 해석한다. 기준점 세션 코드 경로에서 `activeDocPath()` · `activeTabPath()` · 현재 캔버스 선택을 읽으면 안 된다.
2. **포커스를 뺏지 않는다.** 뒤 세션은 화면 조작 도구(`risk: "ui"`)를 실행하지 않고, 탭을 열지 않고, 도크를 바꾸지 않는다. 그 의도는 "열어 볼 것" 힌트로 세션에 남긴다.
3. **메인 동작이 곧 스펙이다.** 메인 탭은 지금 Composer와 한 글자도 다르지 않게 동작해야 한다. 기존 테스트(`v2-composer*.test.ts`, `v2-outline-ai.test.ts` 등)가 그대로 통과해야 한다.
4. **화면 패키지는 AI를 모른다.** `outliner`(외부 저장소) · `slot-canvas` · `file-explorer` 에 AI 코드를 넣지 않는다(`pnpm test:arch` 규칙 3). 기준점 위치는 이미 있는 DOM 속성(`[data-node-id]` · `[data-slot-id]` · `[data-block-id]` · `[data-vault-path]`)과 어댑터로 찾는다.
5. **상태는 한 곳.** 세션 레지스트리가 유일한 원본이다. 표시 · 탭 · 대시보드 · 토스트가 각자 상태를 들고 있으면 안 된다.
6. **기본 동작 + 레지스트리. 표면별 분기 금지.** 커널에 `if (surface === "outline")` 를 쓰지 않는다. 표면은 어댑터 레지스트리에 등록한다. 새 표면 추가 = 어댑터 하나 추가.
7. **새 쓰기 경로 금지.** 결과는 `vf_*` 묶음과 변경안 두 통로로만 돌아온다. 변경안은 반드시 `baseHash` 를 채운다.
8. **자원 한도.** 세션마다 agy 프로세스가 하나씩 뜬다(170MB 이상). 동시 실행 상한과 대기열을 둔다 (§9: 3개).

---

## 4. 지금 코드 (출발점) — 사실 확인 완료

| 무엇 | 어디 | 지금 상태 | 이번에 바뀌는 점 |
|---|---|---|---|
| Composer 상태 기계 | `packages/ai-kernel/src/composerSession.ts` `ComposerSessionController` | 컨트롤러 = 대화 하나. `bindConversation(key)` 와 `ComposerPersistence` 로 키별 저장, 서버 404면 요약을 붙여 새 세션으로 잇는다(`isExpired`) | 그대로 쓴다. 레지스트리가 여러 개를 만들고 들고 있는다 |
| 도구 실행 문맥 | `ToolRunContext { callId, sessionId, signal }` (ai-kernel) | 도구가 **서버 세션 id** 를 받는다 | 이 id 로 레지스트리에서 기준점을 찾는다 |
| v2 AI 조립 | `packages/ai-vault/src/workspace.ts` `createV2AiWorkspace` | 컨트롤러 **하나**, 대화 키 `${vaultId}:workspace` 고정. 주석에 "세션 전환은 향후 별도 Session Manager 에서 제어" | 레지스트리 · 세션별 env 로 확장 |
| 대상 문서 | `ai-vault/src/contexts.ts` `requireDoc` · `activeOutlinePath` → `env.activeDocPath()` · `activeTabPath()` | 활성 탭 기준 | 기준점 세션은 기준점 경로 기준 |
| 문서 읽기 | `readVDoc`(공유 `VDocStore`, 편집 중 상태 포함) · `readOutline`(`getLiveOutlineSession` 스냅샷 우선) | 이미 경로로 읽고, 열린 에디터의 편집 중 상태를 본다 | 그대로 쓴다. 경로만 기준점에서 준다 |
| 도구 범위 가드 | `ai-vault/src/tools.ts` `V2ToolHost.controller` · `messageScope` · `fromOtherSession` · `toolScope` | 컨트롤러 하나. 다른 세션의 호출이면 범위 `null` | `controllerFor(ctx.sessionId)` 로 바꾼다 |
| 화면 조작 도구 | 하네스 팩 `tools.client.json` (`editor` · `outline` · `reference` · `resource`) | `risk: ui` = `canvas.selectSlot` · `canvas.select` · `layout.openPanel` · `outline.selectNodes` · `outline.previewCompile` · `references.open` · `resource.cite`. 권한은 `permissionFor` 에서 `auto` | 뒤 세션이면 실행하지 않는다 |
| 메시지 범위 | `ai-vault/src/store.ts` `turn`(볼트당 **하나**) · `setTurn` | 전역 | 세션별 `turnBySession` |
| 변경안 큐 | `store.ts` `queue: V2StagedChange[]`(`StagedAiChange & {path}`, localStorage) · `dedupeQueue` | 세션 구분 없음 | `sessionKey` 필드 추가 |
| 파일 묶음 | `store.fsBatches` · `undoFsBatch` 가 `controller.getState().sessionId` 사용 | 세션 하나 가정 | 세션별 |
| 변경안 안전장치 | `vdoc-schema/src/project-manifest.ts` `StagedAiChangeBase.baseHash` · `runId` · `isStale` | **이미 있다** | 기준점 세션의 변경안도 반드시 채운다 |
| Composer UI | `packages/ai-composer/src/ComposerPanel.tsx` (props 에 `controller`) · `apps/playground/.../ui/ai/V2ComposerView.tsx` | 컨트롤러 하나를 물림 | 탭 줄을 두고 활성 탭의 컨트롤러를 물린다 |
| 진입점 | `OutlineTabEditor.tsx` `onAiDirect` · `VDocTabEditor.tsx` `handleRunAiDirective`→`dispatchAiDirective` · `MultiSelectionInspector.tsx` "AI 에 첨부" · `workspace.ts` `directFromCanvas` · `sendFromCanvas` · `directFromOutline` · `sendFromOutline` | 전부 메인 컨트롤러로 | 기준점 세션 생성으로 (§6.2) |
| 아웃라인 선택 막대 | 외부 `../VibePatchNote/packages/outliner/src/editor/ui/OutlineSelectionBar.tsx` `완료` → `setNodesCompleted` (노드 `completedAt`) | AI 모름 | **고치지 않는다.** 완료는 스냅샷의 `completedAt` 변화로 감지 (§6.5) |
| 아웃라인 실시간 세션 | `packages/outline-sync/src/sessionRegistry.ts` `OutlineLiveSessionHandle` | `applyPatch` · `undo` · `selectNodes` · `getSnapshot`. **변경 구독 없음** | `subscribe` 추가 |
| 인라인 표면 어댑터 | `packages/ai-kernel/src/inline.ts` `InlineAiSurface` | 단발 인라인 실행용 (대상 이름 · 첨부 변환 · 반영) | 같은 발상으로 `AnchorSurface` 를 새로 둔다 (§6.1) |
| 왼쪽 사이드바 | `IdeWorkbenchPage.tsx` 왼쪽 리본(`<aside>`) + `showExplorer` 영역의 `<FileExplorer>` | 탐색기만 | 대시보드 뷰 추가 |
| 서버 세션 | `apps/api/app/assistant/use_cases/assistant_service.py` `_Session` · `_drive` · `release_idle` | 세션마다 잠금 · 작업대 · 마운트가 따로라 **여러 세션 동시 실행이 이미 된다**. 30분 놀면 닫고 10분 놀면 프로세스를 내린다 | 유지(retain) 플래그 · 목록 · 동시 실행 상한 |
| 서버 작업대 | `workspace/service.py` `set_workbench` · `vibefs/store.py` `workbench_for(session_id)` | 세션별 | 그대로. 프론트가 **기준점 기준 작업대**를 보내면 된다 |
| `vf_*` 실행 위치 | `apps/api/vibefs/server.py` — agy 가 **세션마다 띄우는 MCP 프로세스** | 프로세스 여러 개가 같은 볼트 · `fs_journal.jsonl` 에 쓴다. `store.py` `_WRITE_LOCK` 은 프로세스 안 잠금뿐 | 프로세스 사이 잠금 (§7.4) |

---

## 5. 구조 — 무엇을 어느 패키지에

층 규칙은 `docs/specs/package-layers.md` 와 `tests/architecture/package-layers.json` 이 정본이다. 새 파일도 층을 지킨다.

```
ai-kernel (domain, React 없음)
  ├─ sessionRegistry.ts   SessionRegistry · SessionEntry · SessionAnchor · 상태 파생 · 스케줄러 · 저장
  └─ anchor.ts            AnchorSurface 인터페이스 · AnchorSurfaceRegistry (표면 지식 없음)
ai-vault (adapter)
  ├─ sessions.ts          v2 레지스트리 조립: 세션별 env · 작업대 · 범위 · 변경안 · 파일 묶음 배선
  ├─ anchors/outline.ts   outline 표면 어댑터 (outline-sync 사용)
  ├─ anchors/vdoc.ts      vdoc 표면 어댑터 (canvas-state · vault-formats)
  ├─ anchors/explorer.ts  explorer 표면 어댑터
  └─ tools.ts · contexts.ts · store.ts · workspace.ts   세션 인식으로 수정
outline-sync (domain)
  └─ sessionRegistry.ts   OutlineLiveSessionHandle.subscribe 추가
ai-react (ui, ai 태그)
  ├─ SessionStatusDot.tsx · SessionChip.tsx
  └─ AnchorChipLayer.tsx  표시를 DOM 위에 띄우는 겹층 (위치 찾기 함수는 주입받는다)
ai-composer (ui, ai 태그)
  ├─ ComposerTabs.tsx     탭 줄 + 활성 컨트롤러로 ComposerPanel 렌더
  └─ SessionDashboard.tsx 대시보드 목록 (데이터는 레지스트리)
apps/playground (app = 배선만)
  └─ v2-ide/ui/*          진입점 연결 · 왼쪽 리본 전환 · 표면별 DOM 위치 함수 · 토스트
apps/api (python)
  └─ assistant/* · vibefs/*   §7
```

- `ai-react` · `ai-composer` 는 ai 태그라서 화면 패키지(`slot-canvas` 등)를 import 하지 않는다. 표시 위치는 앱이 `locate(anchor) → HTMLElement[]` 함수를 넘겨 준다.
- 새 파일은 각 패키지 `index.ts` 에서 내보낸다. 새 `@vibe/*` 의존이 생기면 `package.json` 에 선언한다.

---

## 6. 프론트 구현 상세

### 6.1 ai-kernel — 레지스트리와 표면 계약

```ts
// anchor.ts
export interface SessionAnchor {
  readonly surface: string;            // "outline" | "vdoc" | "explorer" | … (커널은 의미를 모른다)
  readonly path: string;               // 볼트 상대 경로 (explorer 는 공통 부모 폴더 또는 첫 경로)
  readonly itemIds: readonly string[]; // 노드 id · 칸/블록 id · 볼트 경로
  readonly label: string;              // "볼트_재편_계획 · 3개 항목"
}

export interface AnchorSurface<TSelection = unknown> {
  readonly id: string;
  /** 지금 선택 → 기준점 (선택이 없으면 null) */
  fromSelection(selection: TSelection): SessionAnchor | null;
  /** 기준점 항목이 아직 있는가 — 없는 id 목록을 돌려준다 */
  missing(anchor: SessionAnchor): readonly string[];
  /** 기준점 항목이 모두 완료됐는가 (완료 개념이 없는 표면은 항상 false) */
  isCompleted(anchor: SessionAnchor): boolean;
  /** 표면 쪽 완료 처리 (아웃라인: setNodesCompleted 에 해당하는 패치. 없으면 생략) */
  complete?(anchor: SessionAnchor): void;
  /** 이 기준점을 세션 첫 메시지의 첨부로 */
  toContexts(anchor: SessionAnchor): ContextRef[];
  /** 기준점 변화 구독 (완료 · 삭제 · 이동 감지). 반환 = 해제 */
  watch(anchor: SessionAnchor, onChange: () => void): () => void;
}
```

```ts
// sessionRegistry.ts
export type SessionLifecycle = "active" | "completed" | "anchor-lost";
export type SessionStatus =
  | "queued" | "running" | "awaiting_approval" | "needs_review" | "idle" | "error" | "interrupted" | "completed";

export interface SessionEntry {
  readonly key: string;                 // 로컬 키 (대화 저장 키 겸용). 메인은 `${vaultId}:workspace`
  readonly kind: "main" | "anchored";
  readonly anchor: SessionAnchor | null;
  readonly instruction: string;         // 첫 지시 원문
  readonly createdAt: string;
  readonly lifecycle: SessionLifecycle;
  readonly completedAt?: string;
  readonly unread: boolean;
  readonly revealHints: readonly { tool: string; args: Record<string, unknown> }[]; // 뒤에서 막힌 ui 도구
}

export interface SessionRegistry {
  list(): readonly SessionEntry[];
  get(key: string): SessionEntry | null;
  controller(key: string): ComposerSessionController;          // 지연 생성
  byServerSessionId(sessionId: string): SessionEntry | null;   // ToolRunContext.sessionId → 기준점
  status(key: string): SessionStatus;                          // 파생 (아래)
  createAnchored(input: { anchor: SessionAnchor; instruction: string; contexts: ContextRef[] }): SessionEntry;
  foreground(): string;  setForeground(key: string): void;
  markRead(key: string): void;
  complete(key: string, options?: { discardStaged?: boolean }): Promise<void>;
  setLifecycle(key: string, lifecycle: SessionLifecycle): void;
  subscribe(listener: () => void): () => void;
}
```

- **상태 파생 규칙** (원본 값을 따로 두지 않는다):
  `completed`(lifecycle) > `error`(마지막 항목이 오류 notice) > `awaiting_approval`(컨트롤러 status) > `running`(`connecting|streaming|running_tools`) > `queued`(스케줄러 대기) > `needs_review`(이 세션의 변경안이 남음. 개수는 어댑터가 주입하는 `pendingReviewCount(key)`) > `interrupted`(새로고침 등으로 끊긴 실행이 저장 스냅샷에 있음) > `idle`.
- **스케줄러:** 실행 중(`running`·`awaiting_approval`) 세션 수가 상한 이상이면 새 기준점 세션의 첫 `send` 를 미루고 `queued` 로 둔다. 하나가 끝나면 다음을 보낸다. 상한 값은 `@vibe/harness-packs/core/settings.json` 의 `sessions.maxConcurrentRuns` 에 둔다 (코드 상수 금지).
- **저장:** 레지스트리 메타(`SessionEntry[]`)는 `ComposerPersistence` 와 같은 저장소에 볼트별 키로 둔다. 대화 본문은 기존대로 컨트롤러가 키별로 저장한다.
- **컨트롤러 수명:** `complete` = 실행 중이면 `stop()` → 서버 `closeSession` → 저장 스냅샷 정리 → lifecycle `completed`. 메인은 complete 할 수 없다.
- **새로고침:** 지금처럼 `closeOnPageExit` 가 메인의 서버 세션을 닫는다. 기준점 세션은 `retain` 이라 닫지 않는다 (§7.1). 다시 열면 엔트리를 복원하고, 끊긴 실행은 `interrupted` 로 보인다. 사용자가 이어 보내면 기존 404 복구 경로가 요약을 붙여 잇는다.
- 단위 테스트: `packages/ai-kernel` 에 테스트가 없으면 `ai-vault` 테스트에서 레지스트리를 검증한다 (§8).

### 6.2 ai-vault — 세션별로 해석하기

1. **세션별 env.** `V2AiEnv` 를 세션 키로 만든다. 메인은 지금 env 그대로 쓴다.
   기준점 세션의 env:
   - `activeDocPath()` = 기준점이 `.vdoc` 면 그 경로, `.outline` 이면 `outlineRef` 로 묶인 `.vdoc`(없으면 null).
   - `activeTabPath()` = `anchor.path`.
   - `textSelection()` = 기준점 항목 (아웃라인이면 `nodeIds = itemIds`).
   - `explorerSelection()` = explorer 기준점이면 `itemIds`, 아니면 `[]`.
   이렇게 하면 `requireDoc` · `activeOutlinePath` · `readOutline` · `readVDoc` 을 고치지 않고도 기준점을 본다.
2. **도구 호스트.** `V2ToolHost.controller` 를 `controllerFor(ctx?.sessionId)` 로 바꾼다. 레지스트리의 `byServerSessionId` 로 찾고, 못 찾으면 메인이다. `messageScope` · `toolScope` · `toolSourcesOff` 는 그 컨트롤러와 그 세션의 `turn` 을 본다. `fromOtherSession` 은 "레지스트리에 없는 세션"일 때만 참이 된다.
   도구 구현(`createV2Tools`)은 매 호출에서 `envFor(ctx)` 로 env 를 골라 쓴다.
3. **뒤 세션의 화면 조작 도구.** 위험도가 `ui` 이고 호출한 세션이 앞 세션이 아니면, 실행하지 않고 `{ ok: true, output: { deferred: true, note: "사용자가 이 세션을 열면 보여 준다" } }` 를 돌려준다. 호출 내용은 `revealHints` 에 쌓는다.
   판단 위치는 **ai-vault 의 도구 래퍼 한 곳**이다 (커널 `permissionFor` 에 넣지 않는다. 커널은 앞/뒤를 모른다).
   세션 탭을 열 때 `revealHints` 의 마지막 것을 한 번 실행한다.
4. **범위.** `store.turn` 을 `turnBySession: Record<key, turn>` 으로 바꾼다. `setTurn(key, turn)`. 기존 `turn` 읽기는 메인 키로 이어 준다 (메인 동작 유지).
5. **작업대 · 범위 첨부.** `scopeForSend` 와 workbench 첨부를 세션 env 로 계산한다. 기준점 세션의 첫 메시지 첨부 = `surface.toContexts(anchor)` + 기준점 env 로 만든 workbench + 범위 첨부.
   범위는 기본으로 **기준점 항목에 고정**(pinned)한다. 아웃라인은 `pinOutlineNodes`, vdoc 은 `targetFromSlots` · `targetFromBlock` 과 같은 의미.
   리소스 · 레퍼런스 설정(`referencePaths` · `resourceFolders`)은 볼트 공통 설정을 그대로 쓴다.
6. **변경안.** `V2StagedChange` 에 `sessionKey?: string` 을 추가한다. `workbench_proposals` · 슬롯 변경안을 만드는 곳(`buildSlotHtmlChange` · `buildOutlinePatchChange` · 서버 이벤트 수신)에서 그 이벤트를 받은 컨트롤러의 세션 키를 넣는다.
   `dedupeQueue` 의 키에 `sessionKey` 를 포함할지는 §9 를 따른다 (포함하지 않는다: 같은 대상의 새 변경안이 이긴다). `pendingReviewCount(key)` 를 레지스트리에 주입한다.
7. **파일 묶음.** `fs_batches` 이벤트를 세션 키별로 저장한다. `undoFsBatch(batchId)` 는 그 묶음을 만든 세션의 **서버 세션 id** 로 호출한다 (지금은 `controller.getState().sessionId`).
8. **진입점 교체.**
   `directFromCanvas` · `directFromOutline`(첨부만 하고 입력창 채우기)은 **메인 동작 그대로 둔다.**
   **보내기**(`sendFromCanvas` · `sendFromOutline`, 팝오버 · `AI Direct` 에서 실제 전송)를 `sendAnchored(surfaceId, prompt)` 로 바꾼다. 이 함수는 표면 어댑터로 기준점을 만들고 → `registry.createAnchored` → 스케줄러를 거쳐 그 컨트롤러로 `send` 한다.
   메인으로 보내는 기존 경로는 "Composer 에서 계속" 같은 보조 동작으로 남긴다.
   선택이 없으면 기준점 세션을 만들지 않고 메인으로 보낸다.
9. **이벤트 배선.** `createV2AiWorkspace` 안의 `controller.onServerEvent(...)` · `controller.subscribe(...)` 구독(`workbench_proposals` · `fs_batches` · 리서치 동기화 `syncResearch` 등)은 **모든 컨트롤러에 건다.** 레지스트리가 컨트롤러를 만들 때 호출하는 `onControllerCreated(key, controller)` 훅을 두고 거기서 건다.
10. **`V2AiWorkspace` 공개 면.** `controller` 는 메인을 가리키게 두고(호환), `sessions: SessionRegistry` · `sendAnchored` · `surfaces: AnchorSurfaceRegistry` 를 더한다.

### 6.3 표면 어댑터 (ai-vault/anchors)

| 표면 | `fromSelection` | `missing` / `watch` | `isCompleted` / `complete` |
|---|---|---|---|
| outline | 열린 `.outline` 의 선택 노드 id (`env.textSelection().nodeIds`) | `getLiveOutlineSession(path)` 스냅샷 + **새 `subscribe`**. 닫혀 있으면 볼트 파일 변경 구독 | 모든 노드 `completedAt` 있음. complete = 완료 패치 적용 (`applyOutlinePatchSafely` 경로) |
| vdoc | 캔버스 다중 선택 (`canvas-state` 의 선택 · `describeCanvasSelection`) → 칸/블록 id | `VDocStore` 의 문서에 id 가 있는가. 문서 변경 구독 | 완료 개념 없음 → false. 완료는 선택 막대 · 인스펙터 · 대시보드의 "세션 완료"로 |
| explorer | `explorer.selectedPaths` | `vault.exists`. 볼트 이벤트(이름 바꾸기 → `remapPath` 와 같은 방식으로 기준점 경로 갱신) | false. 완료는 대시보드 · 표시 메뉴로 |

- 새 표면을 추가할 때 이 표에 한 줄 더하고 어댑터 파일 하나를 만든다. 다른 코드는 바꾸지 않는다.
- 항목 일부가 지워지면 남은 id 로 계속 간다. **전부** 지워지면 lifecycle 을 `anchor-lost` 로 바꾼다. 세션은 닫지 않는다.

### 6.4 UI 패키지

- `ai-react/SessionStatusDot` · `SessionChip`: 순수 표시 컴포넌트 (props: status, title, count, unread, onClick).
- `ai-react/AnchorChipLayer`: props `{ entries, locate(anchor): HTMLElement[], container: HTMLElement, onOpen(key) }`.
  `ResizeObserver` · 스크롤 · 레지스트리 구독으로 위치를 다시 잰다. 프레임당 한 번만 잰다 (`requestAnimationFrame` 묶기). 성능 기준은 §8.4.
- `ai-composer/ComposerTabs`: props `{ registry, renderPanel(controller, entry) }`. 탭 줄과 직전 탭 스택, 단축키, 넘침 처리를 한다.
  `ComposerPanel` 자체는 바꾸지 않는다. 활성 탭이 바뀌면 `controller` prop 만 바뀐다. 컨트롤러별 입력 초안(`draft`)은 컨트롤러가 이미 들고 있다.
- `ai-composer/SessionDashboard`: props `{ registry, onOpen, onReveal, onStop, onComplete }`.

### 6.5 앱 배선 (apps/playground/src/mocks/v2-ide)

- `V2ComposerView.tsx`: `ComposerPanel` 을 `ComposerTabs` 로 감싼다. 설정바 · 변경안 패널(`V2StagedChangesPanel`)은 활성 탭의 세션 키로 거른다. 메인 탭은 지금과 같다.
- `IdeWorkbenchPage.tsx`: 왼쪽 리본에 대시보드 버튼을 추가하고, 탐색기 자리를 `explorer | sessions` 로 전환한다. 토스트(J3 조건)와 오른쪽 도크 AI 탭 강제 전환 금지(J1)도 여기서 처리한다.
- 표면별 `locate`:
  - outline = 편집기 컨테이너 안 `[data-node-id="…"]`
  - vdoc = `[data-slot-id]` · `[data-block-id]`
  - explorer = `[data-vault-path]`
  화면 패키지는 고치지 않는다.
- `OutlineTabEditor.tsx`: `registerLiveOutlineSession` 에 넘기는 핸들에 `subscribe` 를 구현한다 (에디터 store 변경 → 리스너 호출). 아웃라인 완료 감지는 이 구독으로 한다. **외부 `outliner` 저장소는 고치지 않는다.**
- vdoc 선택 막대 · `MultiSelectionInspector`: 기준점 세션이 붙은 선택이면 "세션 완료" 버튼을 보인다. 완료는 레지스트리 `complete` 로 간다.
- 개발 핸들 `window.__v2ai` 에 `sessions` 를 노출한다 (DEV 만).

### 6.6 완료 흐름 (J6)

1. 표면에서 완료 신호가 온다: 아웃라인은 `isCompleted` 가 참이 됨, 그 밖의 표면은 "세션 완료" 클릭.
2. 그 기준점에 붙은 세션들을 찾는다 (같은 항목에 여러 개면 **전부**).
3. 검토 안 한 변경안이 있으면 확인창을 띄운다: "검토하지 않은 변경안 N개를 버리고 닫을까요?" → [버리고 완료] / [취소].
   아웃라인에서 취소하면 완료 표시는 그대로 두고 세션도 그대로 둔다. 완료 해제는 하지 않는다.
4. `registry.complete(key, { discardStaged: true })`. 탭과 표시가 사라지고, 대시보드 "완료"에 이력이 남는다.
5. 완료한 노드를 다시 미완료로 돌려도 세션은 되살리지 않는다.

---

## 7. 백엔드 구현 상세 (apps/api)

서버는 이미 세션별 잠금 · 작업대 · 마운트를 갖고 있어 여러 세션이 동시에 돈다. 이번 범위에서 필요한 것은 아래 다섯 가지뿐이다.
**SSE 연결과 실행 수명을 분리하는 일(새로고침 뒤에도 실행이 살아남기)은 이번 범위가 아니다** (§10).

### 7.1 유지(retain) 세션
- `schemas.py` `CreateSessionRequest` 에 `retain: bool = False` 와 `label: Optional[str] = None` 을 추가한다.
- `_Session` 에 `retained` · `label` 을 둔다.
- `release_idle`: `retained` 세션은 30분이 지나도 **닫지 않는다.** 10분 프로세스 내리기는 그대로 한다 (다음 턴에 `--conversation` 으로 잇는다).
- 프론트 `AssistantClient.createSession` 에 옵션을 전달하고, 기준점 세션은 `retain: true` 로 만든다.

### 7.2 세션 목록
- `GET /api/assistant/sessions` → `{ sessions: [{ sessionId, label, retained, running: lock.locked(), pendingCalls: len(pending_calls), idleSeconds, provider, model }] }`.
- 용도: 새로고침 뒤 대시보드가 서버에 아직 있는 세션 · 실행 중인 세션을 맞춰 본다. 서버에 없으면 프론트는 404 복구 경로를 탄다.
- `AssistantClient.listSessions()` 를 추가한다.

### 7.3 동시 실행 상한
- `AssistantService` 에 실행 세마포어(`threading.BoundedSemaphore(maxConcurrentRuns)`)를 둔다. 값은 하네스 `core:settings.json` `sessions.maxConcurrentRuns` 에서 읽는다 (프론트와 같은 값).
- `_drive` 는 세션 잠금을 잡은 뒤 세마포어를 기다린다. 기다리는 동안에는 `{"type":"status","state":"queued","message":"앞선 작업이 끝나면 시작합니다."}` 를 한 번 보내고, `session.cancel` 을 0.5초 간격으로 확인한다. `finally` 에서 반납한다.
- 프론트 스케줄러가 1차로 막고, 서버는 자원 보호용 2차 장치다.

### 7.4 같은 볼트에 여러 세션이 쓸 때
- `vf_*` 는 **agy 마다 뜨는 vibefs MCP 프로세스**(`vibefs/server.py`)에서 실행된다. 그래서 프로세스 사이 보호가 필요하다.
  - `FsJournal.append` 와 `vf_*` 쓰기 묶음 실행을 **프로세스 사이 파일 잠금**으로 감싼다. 상태 폴더 아래 `fs.lock`. Windows 는 `msvcrt.locking`, 그 밖은 `fcntl.flock`. 작은 헬퍼를 `vibefs` 안에 둔다. `vibefs` 는 `app` 을 import 하지 않는다는 규칙을 지킨다.
  - 같은 경로를 두 세션이 쓰려 하면 나중 것은 잠금을 기다린다. 기다림 상한은 10초이고, 넘으면 도구 오류 "다른 작업이 이 파일을 쓰는 중"을 낸다.
- `vibefs/store.py` 의 상태 파일 쓰기(`mounts.json` · 작업대)가 임시 파일 → 바꿔치기로 원자적인지 확인한다. 아니면 그렇게 고친다.

### 7.5 기준점 정보 전달
- 서버는 기준점을 해석하지 않는다. 프론트가 보내는 workbench 첨부(기준점 기준 작업대)와 범위 첨부로 충분하다.
- 다만 로그 · 장부용으로 `SendMessageRequest` 에 선택 필드 `anchorLabel` 을 받아 hook 로그에 남긴다 (선택 사항).

### 7.6 테스트
- `pnpm --filter @vibe/api test` (기존 pytest 묶음)에 추가한다:
  - retain 세션이 `release_idle` 에서 닫히지 않는다
  - 목록 API 응답
  - 세마포어 상한 + `queued` 이벤트 + 대기 중 취소
  - 두 프로세스가 같은 저널에 동시에 써도 줄이 깨지지 않는다 (`multiprocessing`)

---

## 8. 개발 방식

### 8.1 단계 (각 단계 끝에 테스트 통과 → 다음)

| 단계 | 내용 | 통과 기준 |
|---|---|---|
| 0 | 기준선 | `pnpm test` · `pnpm test:arch` · `pnpm typecheck` 현재 결과를 기록한다 (이미 실패하는 것은 목록으로 남긴다) |
| 1 | 백엔드 §7.1~7.4 | §7.6 테스트 통과. 기존 api 테스트 통과 |
| 2 | ai-kernel 레지스트리 · 표면 계약 · 스케줄러 | 단위 테스트: 지연 생성, 상태 파생 우선순위, 상한 대기열, complete, 저장 · 복원 |
| 3 | ai-vault 세션별 env · 도구 호스트 · turn · 변경안 · 파일 묶음 | **두 세션이 서로 다른 문서를 기준점으로 동시에 돌 때 도구가 각자의 문서를 읽고 쓴다**(활성 탭이 제3의 문서여도). 뒤 세션의 ui 도구는 실행되지 않고 힌트로 쌓인다. 메인 관련 기존 테스트 전부 통과 |
| 4 | Composer 탭 | 메인 탭 동작이 기존과 같다. 탭 전환 시 각 대화 · 초안 · 진행 표시가 유지된다. 직전 탭 이동이 된다 |
| 5 | 표면 어댑터 + 표시 겹층 (outline → vdoc → explorer 순) | 표시가 항목 옆에 뜨고, 스크롤 · 접기 · 이동을 따라가고, 누르면 탭이 열린다 |
| 6 | 완료 흐름 | §6.6 시나리오 전부 |
| 7 | 대시보드 + 토스트 | J3 · J7 통과 기준 |
| 8 | 화면 검증 (§8.3) | 시나리오 매트릭스 전부 |

### 8.2 자동 테스트 위치
- 커널 · 어댑터: `packages/ai-vault/tests/ai-vault.test.ts` 에 이어 쓰거나, 새 테스트 파일을 만들고 그 패키지 `test` 스크립트에 추가한다.
- 앱 통합: `apps/playground/src/mocks/v2-ide/__tests__/` 에 `v2-anchored-sessions.test.ts` 를 새로 만들고 `apps/playground/package.json` 의 `test` 목록에 추가한다. 기존 `v2-composer.test.ts` 의 가짜 클라이언트(fetch 주입) 패턴을 따른다.
- 매 단계: `pnpm test` (끝에 `test:arch` 포함) · `pnpm typecheck`.

### 8.3 화면 검증 (필수)
- 실행은 화면에서 하고, 스크립트는 측정에만 쓴다. 기존 도구 `scripts/v2_screen/cdp.py` · `wait_idle.py` 와 `docs/specs/v2-composer-research-handoff.md` §1 의 방식을 따른다.
- 화면은 **1920×1080** 으로 검증한다. 레이아웃을 창에 맞춰 줄이지 않는다.
- **에이전트가 실행 중일 때 프론트 · 하네스 팩 파일을 고치지 않는다.** Vite HMR 이 AI 런타임을 다시 만들어 세션이 끊긴다. 파이썬을 고치면 API 가 재시작된다.
- 시나리오 매트릭스 (주제를 섞는다. 한 주제에만 맞추지 않는다):

| # | 표면 | 지시 예 | 확인 |
|---|---|---|---|
| S1 | outline | 노드 3개 골라 "각 항목의 근거 자료를 조사해 리스트업" | 표시 · 뒤 실행 · 결과가 변경안/노드 근거로 옴 · 그사이 다른 노드를 편집해도 안 깨짐 |
| S2 | outline | 노드 2개 골라 "레퍼런스를 찾아 `.ref` 로 등록" | `vf_*` 묶음이 세션 기준으로 기록되고 되돌리기가 된다 |
| S3 | vdoc | 칸 4개 골라 "리소스를 근거로 채워 변경안으로" | 그사이 사람이 칸 하나를 고치면 그 변경안만 "오래됨" |
| S4 | explorer | 파일 5개 골라 "`research/` 폴더에 정리하고 요약 md 생성" | 폴더 · 파일 생성, 기준점 경로 갱신(이름 바꾸기 시) |
| S5 | 혼합 | S1~S4 를 연달아 던지고 메인 탭에서 계속 대화 | 동시 실행 상한 · 대기열, 메인 대화가 섞이지 않음, 직전 탭 이동 |
| S6 | outline | S1 진행 중 노드 전부 삭제 | `anchor-lost` 로 이동, 세션 유지 |
| S7 | outline | 검토 안 한 변경안이 있는 상태에서 `완료` | 확인창 → 버리고 닫힘 → 대시보드 완료 이력 |
| S8 | 전체 | 실행 중 새로고침 | 엔트리 복원, 끊긴 것은 `interrupted`, 이어 보내기가 된다 |
| S9 | vdoc | 뒤 세션이 `canvas.select` 를 부르게 되는 지시 | 화면이 움직이지 않는다. 탭을 열면 그때 한 번 이동한다 |

### 8.4 성능
- 표시 겹층을 켠 상태에서 `pnpm perf:v2` 의 아웃라인 · 캔버스 측정이 기준선 중앙값 대비 10% 넘게 나빠지면 안 된다. 같은 세션의 중앙값끼리 비교한다.
- 브라우저 창이 숨겨진 상태의 측정은 5~10배 왜곡되므로 쓰지 않는다. 헤드리스 스크립트로 잰다.

### 8.5 하지 말 것
- `git add` · `git mv` · `git rm` 금지. 사용자가 index 를 체크포인트로 쓴다. 파일 이동은 일반 `mv`.
- 커밋 · 푸시는 사용자가 시킬 때만, 내 파일만 경로로 지정해서 한다.
- 외부 저장소 `../VibePatchNote` (outliner) 수정 금지. 꼭 필요하면 멈추고 묻는다.
- 표면별 if 분기, 특정 시나리오 맞춤 규칙, 하네스 프롬프트에 이 기능 전용 문구를 넣지 않는다. 기본 동작 + 레지스트리로 푼다.
- 메인 Composer 동작 변경 금지 (진입점 "보내기"를 기준점 세션으로 돌리는 것만 예외. 선택이 없으면 메인으로 간다).
- 새 결과 쓰기 경로를 만들지 않는다 (§3-7).

---

## 9. 정해 둔 기본값 (다르게 하려면 사용자에게 묻는다)

| 항목 | 기본값 |
|---|---|
| 동시 실행 상한 | 3 (`core/settings.json` `sessions.maxConcurrentRuns`) |
| Composer 열린 탭 상한 | 8 (`sessions.maxOpenTabs`) |
| 직전 탭 단축키 | `Alt+[` (Composer 포커스 무관, 전역 — `Alt+←` 는 에디터 뒤로 가기가 이미 쓴다) |
| 완료 시 미검토 변경안 | 확인 후 버리고 닫는다 |
| 닫힌 세션 | 서버 세션 · agy 를 정리한다. 대시보드 "완료"에 접어서 이력을 남긴다 (최근 50개) |
| 같은 항목에 여러 세션 | 표시를 쌓고 `+N`. 완료하면 전부 닫는다 |
| 기준점 전부 삭제 | `anchor-lost`, 세션 유지 |
| 같은 대상의 변경안 중복 | 세션 구분 없이 마지막 것이 이긴다 (기존 `dedupeQueue` 규칙) |
| 선택 없이 보낸 지시 | 메인 세션 |
| 토스트 | 승인 대기 · 검토 필요 · 오류 · 완료일 때만, 앞 세션은 제외 |
| 기준점 세션의 기본 범위 | 기준점 항목에 고정 |

---

## 10. 이번 범위가 아닌 것 (다음 단계)

- **새로고침 · 창 닫기 뒤에도 실행 유지.** 서버에서 실행(Run)과 SSE 구독을 분리하고(이벤트 seq 버퍼, 다시 붙기), 프론트 도구가 결과를 기다리는 동안 `pending_calls` 로 멈춰 두는 방식이다. 지금 구조에서 `turn_done(tool_calls)` + 서버 `pending_calls` 가 자연스러운 멈춤 지점이다. 그때는 문서 도구를 브라우저 없이 실행할 곳(Node 실행기)을 정해야 한다.
- **승인 정책의 서버 이전.** 지금은 `permissionFor`(프론트)에 있다.
- **세션이 다른 세션을 자동으로 깨우기** (워커 완료 → 부모 세션 재개). 제품 결정이 필요하다.

---

## 11. 파일 지도 (새로 · 수정)

| 구분 | 파일 |
|---|---|
| 새 | `packages/ai-kernel/src/sessionRegistry.ts` · `packages/ai-kernel/src/anchor.ts` |
| 새 | `packages/ai-vault/src/sessions.ts` · `packages/ai-vault/src/anchors/{outline,vdoc,explorer}.ts` |
| 새 | `packages/ai-react/src/{SessionStatusDot,SessionChip,AnchorChipLayer}.tsx` |
| 새 | `packages/ai-composer/src/{ComposerTabs,SessionDashboard}.tsx` |
| 새 | `apps/playground/src/mocks/v2-ide/__tests__/v2-anchored-sessions.test.ts` |
| 수정 | `packages/ai-kernel/src/{index,client,types}.ts` (내보내기 · `createSession` 옵션 · `listSessions`) |
| 수정 | `packages/ai-vault/src/{workspace,tools,contexts,store,index}.ts` |
| 수정 | `packages/outline-sync/src/sessionRegistry.ts` (`subscribe`) |
| 수정 | `packages/harness-packs/core/settings.json` (`sessions.*`) |
| 수정 | `apps/playground/src/mocks/v2-ide/ui/{IdeWorkbenchPage,OutlineTabEditor,VDocTabEditor,MultiSelectionInspector}.tsx` · `ui/ai/{V2ComposerView,V2StagedChangesPanel}.tsx` |
| 수정 | `apps/api/app/assistant/{schemas,router}.py` · `use_cases/assistant_service.py` · `apps/api/vibefs/{fs_tools,store}.py` (+ 잠금 헬퍼) |
| 수정 | 각 패키지 `package.json` (새 `@vibe/*` 의존이 생기면) · `tests/architecture/package-layers.json` (새 패키지를 만들 때만. 이 계획은 새 패키지를 만들지 않는다) |

---

## 12. 구현 결과 (2026-11-24) — 가이드와 달라진 점 · 화면에서 확인한 것

**가이드와 달라진 점**
- 직전 탭 단축키는 `Alt+[`. `Alt+←`(Ctrl 포함)는 에디터 '뒤로'가 이미 쓴다. Composer 가 접혀 있어도 되도록 앱 전역 키 처리(`IdeWorkbenchPage`)에 둔다.
  물리 키(`code === "BracketLeft"`)와 `key === "["` 를 둘 다 받는다.
- 아웃라이너는 트리 밖을 누르면(창 `mousedown`) 불릿 선택을 푼다. 그래서 `AI Direct` 는 자기 `onMouseDown` 에서 선택 id 를 먼저 잡아 둔다.
  이 id 는 지시와 함께 넘어가고(`EditorAiDirective.selection.nodeIds`) `ai.sendAnchored(surface, prompt, anchor)` 의 명시 기준점이 된다. 외부 outliner 는 고치지 않았다.
- 실행 슬롯은 `connecting · streaming · running_tools` 만 센다. 승인 대기는 슬롯을 쓰지 않는다 (사용자가 자리를 비워도 다른 작업이 막히지 않게).
- 완료 확인창에서 "변경안 남기고 완료"를 고르면 그 변경안은 메인 탭으로 옮겨 검토한다 (세션 꼬리표를 뗀다).

**테스트**
- `packages/ai-kernel/tests/sessionRegistry.test.ts` (20): 동시 실행 · 대기열 · 승인 대기 슬롯 · 탭 · 안 읽음 · 완료 · 저장/복원 · 끊김 · 404 복구
- `apps/playground/.../__tests__/v2-anchored-sessions.test.ts` (8): 기준점 문서로 도구 실행 · 뒤 세션 화면 이동 보류 · 변경안/파일 묶음 꼬리표 · 아웃라인 완료 = 세션 완료 · 기준점 없음 · 확인 요청 · 상한 · 선택 없음
- `apps/api/tests/test_assistant_sessions.py` (6): retain · 목록 · 슬롯 대기/중단 · 프로세스 사이 잠금 · 저널 동시 쓰기
- 실제 볼트(`localhost:5181` + agy)에서 화면 확인: 불릿 2개 선택 → AI Direct → 지시 던지기 → 표시가 뜨고 포커스 · 활성 탭은 그대로 → 두 세션 동시 실행
  → 뒤에서 끝나면 안 읽음 · 알림 · 리본 배지 → 표시를 누르면 그 세션 탭 (답이 기준점 불릿 id 를 정확히 가리킴) → `Alt+[` 로 메인 → 새로고침 뒤 세션 · 탭 복원
  → Composer 띠 · 대시보드의 완료 → 탭 · 표시 사라짐, 서버 세션 0
- 화면에서 하지 않은 것: 실제 아웃라인 파일에 완료 표시하기 (사용자 문서를 바꾸므로 자동 테스트로 대신했다), vdoc · 탐색기 표면의 실제 agy 실행

**추가 (같은 날)**
- **지시 쓰는 중 표시**: AI Direct 입력창이 열려 있는 동안 지시를 받을 항목에 보라색 점선 띠와 "AI 지시 대상 · N개" 표시를 둔다.
  아웃라이너 선택이 풀려도 대상이 보인다 (`AnchorDraftHighlight`, `ai-react`).
- **작업 중 띠**: 세션이 진행 중 · 대기열 · 승인 대기 · 검토 필요 · 오류일 때 그 항목에 상태 색 왼쪽 줄과 옅은 바탕을 두른다. 끝나거나 끊긴 세션은 표시(칩)만 남긴다.
  띠 위치는 `useAnchorBands` 가 잰다 (붙어 있는 줄은 하나로 합친다).
- **터미널 에이전트 로그** (`[AGENT]` 채널, `pushAgentLog`): `‹세션 제목›` 꼬리표를 단다. 지시 → ▶ 실행 → 도구(호출마다 한 번, 실패는 따로) → 변경안 · 파일 작업 → ✓ 끝남(걸린 시간) · ✋ 승인 대기 · ● 검토 필요 · ✕ 오류 → ■ 완료.
  토큰은 찍지 않는다.
- **칸 안 변경안 검토** (studio `SlotFrame` → `SlotChangeReview` 이식): v2 캔버스의 `wrapSlotContent` 로 칸마다 승인 대기 변경안을 칸 바로 아래 띠로 보인다.
  표 칸도 같은 경로를 탄다. 띠에서 ✓ 승인 · ✕ 거절, 단어 단위 diff 를 펼치면 덩어리별 부분 승인을 한다.
  기준점 세션이 낸 변경안이면 "✦ 세션 이름"을 눌러 그 세션으로 간다. 화면은 `ai-react/SlotChangeReview` · `slotDiff`, 배선은 앱 `V2SlotReview`.
- **리본 진행 표시**: 세션이 도는 동안 AI 세션 아이콘에 도는 고리와 파란 진행 수, 손이 필요하면 빨간 수.
