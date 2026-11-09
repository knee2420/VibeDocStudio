/**
 * AI 공용 계약. Composer(다중 턴) · 인라인 AI(단발) · 서버(`/api/assistant`)가 같은 모양을 쓴다.
 */

/** 도구가 워크스페이스에 미치는 영향의 크기. 권한 모드가 이 값으로 자동 실행 여부를 정한다. */
export type RiskLevel = "read" | "ui" | "stage" | "write";

/**
 * - `ask`: 읽기 · 화면 조작만 자동, 문서 변경안(stage)부터 매번 묻는다
 * - `auto-stage`: 변경안은 Staged 대기열로 자동 제출 (승인은 대기열에서), 직접 쓰기(write)만 묻는다
 * - `plan`: 읽기 · 화면 조작만 허용, 문서를 바꾸는 도구는 거부하고 계획만 세운다
 */
export type PermissionMode = "ask" | "auto-stage" | "plan";

/** 컨텍스트 한 조각 — `@슬롯`, `@참조 문서`, 현재 선택 영역, 백데이터 …. */
export interface ContextRef {
  kind: string;
  id: string;
  label: string;
  /** 모델에 그대로 들어갈 본문. 비어 있으면 제공자의 `resolve` 가 보낼 때 채운다. */
  content?: string;
  /** 칩 툴팁 등 화면용 부가 정보. 모델에는 가지 않는다. */
  hint?: string;
  /** 이 요소를 고칠 수 있는가. write 만 "대상"이 될 수 있다 (기본 read). */
  access?: ContextAccess;
  /** 이번 요청에서의 역할 — target(고칠 대상) · reference(참고자료). 비우면 access 로 정한다. */
  role?: ContextRole;
  /** 프롬프트에서 가리키는 짧은 이름 (`@블록1`). 입력창이 첨부할 때 붙인다. */
  handle?: string;
  /** 화면 복원용 부가 정보 (페이지 · 좌표 · 소속 문서 …). 모델에는 가지 않는다. */
  meta?: Record<string, unknown>;
}

export type ContextAccess = "read" | "write";
export type ContextRole = "target" | "reference";

/** 첨부의 실제 역할: 명시한 role, 없으면 쓸 수 있는 요소는 대상 · 나머지는 참고자료. */
export function contextRole(ref: ContextRef): ContextRole {
  if (ref.role) return ref.role;
  return ref.access === "write" ? "target" : "reference";
}

/**
 * 화면 요소 하나 (페이지 · 블록 · 슬롯 · 참조 문서 …) — 답변 속 위치 링크와 첨부 칩이 같은 정보를 쓴다.
 * 기능이 `EntityResolver` 로 등록하고, UI 는 id 만 들고 있다가 여기서 찾아 강조 · 이동한다.
 */
export interface EntityInfo {
  kind: string;
  id: string;
  label: string;
  /** 칩 옆 작은 설명 (예: "3페이지 · 표"). */
  detail?: string;
  /** 화면에서 그 위치로 이동 · 선택한다. */
  reveal(): void;
  /** 이동하지 않고 잠깐 강조한다 (호버). */
  highlight(on: boolean): void;
  /** 첨부용 컨텍스트 (끌기 · Ctrl+클릭). */
  toContext?(): ContextRef;
}

export interface EntityResolver {
  id: string;
  /** `kind` 가 주어지면(링크 `vdoc:block/…`) 그 종류만, 없으면 맨 id 로 찾는다. */
  resolve(id: string, kind?: string): EntityInfo | null;
}

/**
 * 다른 위젯이 이미 쓰는 드래그 데이터(MIME)를 첨부로 바꾸는 번역기.
 * 예: 캔버스 블록 재배치용 `application/x-vdoc-block` → 블록 컨텍스트.
 */
export interface DropTranslator {
  mime: string;
  translate(data: string): ContextRef[];
}

/** 위젯 · 기능이 자기 컨텍스트를 노출하는 통로. */
export interface ContextProvider {
  id: string;
  label: string;
  /** true 면 현재 값(`current`)이 매 메시지에 자동 첨부 후보로 붙는다. */
  auto?: boolean;
  /**
   * true 면 현재 값(`current`)을 "첨부 제안"으로만 보여 준다 — 사용자가 눌러야 첨부된다.
   * 캔버스 선택처럼 Composer 와 함께 쓸 수도, 안 쓸 수도 있는 것에 쓴다.
   */
  suggest?: boolean;
  current?(): ContextRef[];
  /** `@` 멘션 검색. */
  search?(query: string): ContextRef[];
  /** 보내기 직전에 본문을 채운다 (멘션 칩은 가볍게 들고 있다가 여기서 읽는다). */
  resolve?(ref: ContextRef): ContextRef;
}

export interface ToolRunContext {
  /** 실행 중인 호출 id (변경안 출처 기록용). */
  callId: string;
  sessionId: string | null;
  signal: AbortSignal;
}

/** 기능이 등록하는 워크스페이스 도구. 프론트에서 실행된다. */
export interface WorkspaceTool<A = Record<string, unknown>> {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
  run(args: A, ctx: ToolRunContext): unknown | Promise<unknown>;
  /** 도구 카드에 보일 한 줄 요약 (예: "슬롯 '핵심 결론' 읽기"). */
  describe?(args: A): string;
}

/** 인라인 메뉴 · Composer `/명령` · 커맨드 팔레트가 공유하는 AI 액션. */
export interface AiAction {
  id: string;
  label: string;
  description?: string;
  /** lucide 아이콘 이름 힌트 (UI 가 해석). */
  icon?: string;
  /** 지시문. 함수면 선택 텍스트 등으로 만든다. */
  instruction: string | ((input: AiActionInput) => string);
  outputFormat?: "html" | "text" | "markdown" | "slot-map";
  /** 이 액션이 보일 표면 id 들 (`slot-richtext`, `slot-selection`, `composer` …). */
  surfaces: string[];
  group?: string;
}

export interface AiActionInput {
  selectionText?: string;
  target?: ContextRef;
}

export function resolveActionInstruction(action: AiAction, input: AiActionInput = {}): string {
  return typeof action.instruction === "function" ? action.instruction(input) : action.instruction;
}

// --- 서버 이벤트 (SSE) -------------------------------------------------------------

export interface TurnUsage {
  input_tokens?: number;
  output_tokens?: number;
  thought_tokens?: number;
  cached_read_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export type AssistantEvent =
  | { type: "turn_start"; provider: string; model: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
      type: "agent_tool";
      stepIndex?: number;
      callId?: string;
      name: string;
      /** error: 에이전트 내장 도구가 실패했다 (작업 공간 가드 차단 · 없는 파일 등). 사유는 `error`. */
      state: "running" | "done" | "error";
      params: Record<string, unknown>;
      kind?: string;
      title?: string;
      locations?: { path: string }[];
      output?: string;
      error?: string;
    }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      async?: boolean;
      /** 서버가 직접 실행하는 도구 (지식 덱 `knowledge.*`) — 프론트는 표시만 하고 실행하지 않는다. */
      server?: boolean;
      risk?: RiskLevel;
      summary?: string;
    }
  /** 서버 도구의 실행 결과 (output 은 화면용 미리보기 JSON 문자열). */
  | { type: "tool_result"; id: string; name: string; ok: boolean; output?: string; durationMs?: number; chars?: number }
  | { type: "tool_call_progress"; name: string | null; chars: number }
  | { type: "status"; state: string; message: string }
  /** 리소스 작업 공간: 이 대화에서 agy 가 read_file 로 읽은 범위 (턴 끝마다). */
  | {
      type: "workspace_coverage";
      files: number;
      fullyRead: number;
      partiallyRead: number;
      unread: number;
      linesRead: number;
      linesTotal: number;
    }
  | {
      type: "citation_check";
      citations: {
        target: string;
        start_line: number;
        end_line: number;
        label?: string;
        is_verified: boolean;
        warning?: string | null;
        suggested_link?: string | null;
        is_broken_syntax?: boolean;
      }[];
      warnings: string[];
    }
  | { type: "error"; message: string; code?: string }
  | {
      type: "result";
      text?: string;
      format?: string;
      /** 하네스 결과 (`/harness/run`): 출력 계약별로 html · map 중 하나 */
      output?: string;
      html?: string;
      map?: Record<string, unknown>;
      /** 결과가 실제로 인용한 근거 [{citationId, locator}] */
      evidence?: { citationId?: string; locator: Record<string, unknown> }[];
      /** 게이트 경고 (근거 없는 문장 · 길이 초과 …) */
      warnings?: string[];
      harnessId?: string;
      runId?: string;
    }
  /** 하네스가 모은 근거 묶음 (E1, E2 … — 결과의 인용 표식이 가리킨다) */
  | { type: "evidence"; items: { id: string; tier: string; locator: Record<string, unknown> }[] }
  | {
      type: "turn_done";
      stopReason: "end_turn" | "tool_calls" | "error" | "tool_limit";
      usage?: TurnUsage;
      durationMs?: number;
      firstTokenMs?: number | null;
      /** 서버 도구 왕복으로 모델을 다시 부른 횟수 (한 스트림 안에서). */
      serverRounds?: number;
    };

export interface EngineModel {
  id: string;
  name: string;
}

export interface EngineStatus {
  externalLlmEnabled: boolean;
  cliAvailable: boolean;
  warmPool: Record<string, { spares: number; ready: number; target: number }>;
  composer: { provider: string; model: string };
  inline: { provider: string; model: string };
  models: Record<string, EngineModel[]>;
  sessions: number;
}

export interface ToolManifestEntry {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
}
