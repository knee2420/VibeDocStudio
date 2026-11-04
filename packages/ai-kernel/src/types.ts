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
}

/** 위젯 · 기능이 자기 컨텍스트를 노출하는 통로. */
export interface ContextProvider {
  id: string;
  label: string;
  /** true 면 현재 값(`current`)이 매 메시지에 자동 첨부 후보로 붙는다. */
  auto?: boolean;
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
  outputFormat?: "html" | "text" | "markdown";
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
  total_tokens?: number;
  [key: string]: unknown;
}

export type AssistantEvent =
  | { type: "turn_start"; provider: string; model: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "agent_tool"; stepIndex?: number; name: string; state: "running" | "done"; params: Record<string, unknown>; output?: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown>; async?: boolean }
  | { type: "tool_call_progress"; name: string | null; chars: number }
  | { type: "status"; state: string; message: string }
  | { type: "error"; message: string; code?: string }
  | { type: "result"; text: string; format: string }
  | {
      type: "turn_done";
      stopReason: "end_turn" | "tool_calls" | "error" | "tool_limit";
      usage?: TurnUsage;
      durationMs?: number;
      firstTokenMs?: number | null;
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
