import type { AssistantEvent, ContextRef, EngineStatus, PermissionMode, ToolManifestEntry } from "./types";
import { contextRole } from "./types";

export interface AssistantClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export interface SendMessagePayload {
  text: string;
  contexts: ContextRef[];
  tools: ToolManifestEntry[];
  mode: "agent" | "plan";
  provider?: string;
  model?: string;
  /** 지난 답변 중 즉시 실행된(결과를 기다리지 않은) 도구들의 결과. */
  deferredResults?: ToolResultPayload[];
}

export interface InlineRunPayload {
  actionId?: string;
  instruction: string;
  contexts: ContextRef[];
  outputFormat: "html" | "text" | "markdown" | "slot-map";
  model?: string;
}

export interface ToolResultPayload {
  id: string;
  name: string;
  ok: boolean;
  output: unknown;
}

export type EventHandler = (event: AssistantEvent) => void;

export class AssistantHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** `/api/assistant` 의 얇은 클라이언트. 스트리밍 응답은 SSE 를 fetch 스트림으로 읽는다. */
export class AssistantClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: AssistantClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  engines(): Promise<EngineStatus> {
    return this.json("GET", "/api/assistant/engines");
  }

  warmup(): Promise<{ composer: string; inline: string }> {
    return this.json("POST", "/api/assistant/warmup");
  }

  createSession(engine?: { provider?: string; model?: string }): Promise<{ sessionId: string; provider: string; model: string }> {
    return this.json("POST", "/api/assistant/sessions", engine ?? {});
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.fetchFn(`${this.baseUrl}/api/assistant/sessions/${sessionId}`, { method: "DELETE" }).catch(() => undefined);
  }

  async interrupt(sessionId: string): Promise<void> {
    await this.fetchFn(`${this.baseUrl}/api/assistant/sessions/${sessionId}/interrupt`, { method: "POST" }).catch(
      () => undefined
    );
  }

  sendMessage(sessionId: string, payload: SendMessagePayload, onEvent: EventHandler, signal?: AbortSignal) {
    return this.stream(`/api/assistant/sessions/${sessionId}/messages`, toWireMessage(payload), onEvent, signal);
  }

  submitToolResults(sessionId: string, results: ToolResultPayload[], onEvent: EventHandler, signal?: AbortSignal) {
    return this.stream(`/api/assistant/sessions/${sessionId}/tool-results`, { results }, onEvent, signal);
  }

  runInline(payload: InlineRunPayload, onEvent: EventHandler, signal?: AbortSignal) {
    return this.stream(
      "/api/assistant/inline/run",
      { ...payload, contexts: payload.contexts.map(toWireContext) },
      onEvent,
      signal
    );
  }

  /** AI 설정(`/api/runtime/policy`)의 1순위 엔진 · 모델을 바꾼다 — 모달과 Composer 헤더가 같은 원장을 쓴다. */
  updatePrimaryEngine(provider: string, model: string): Promise<unknown> {
    return this.json("PUT", "/api/runtime/policy", { primaryProvider: provider, primaryModel: model });
  }

  // --- 내부 ---------------------------------------------------------------------

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new AssistantHttpError(await errorText(res), res.status);
    return (await res.json()) as T;
  }

  /** SSE 를 끝까지 읽는다. 마지막 `turn_done` 이벤트를 돌려준다. */
  private async stream(
    path: string,
    body: unknown,
    onEvent: EventHandler,
    signal?: AbortSignal
  ): Promise<Extract<AssistantEvent, { type: "turn_done" }>> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw new AssistantHttpError(await errorText(res), res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let last: Extract<AssistantEvent, { type: "turn_done" }> = { type: "turn_done", stopReason: "error" };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      while (sep >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseFrame(frame);
        if (event) {
          if (event.type === "turn_done") last = event;
          onEvent(event);
        }
        sep = buffer.indexOf("\n\n");
      }
    }
    return last;
  }
}

function parseFrame(frame: string): AssistantEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data) as AssistantEvent;
  } catch {
    return null;
  }
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function toWireContext(ref: ContextRef) {
  // 역할은 명시한 첨부(handle 이 있는 것)에만 붙인다 — 자동 첨부(현재 선택 · 문서)는 배경 정보.
  const role = ref.handle ? contextRole(ref) : "";
  return { kind: ref.kind, id: ref.id, label: ref.label, content: ref.content ?? "", role, handle: ref.handle ?? "" };
}

function toWireMessage(payload: SendMessagePayload) {
  return { ...payload, contexts: payload.contexts.map(toWireContext) };
}

export function permissionToServerMode(mode: PermissionMode): "agent" | "plan" {
  return mode === "plan" ? "plan" : "agent";
}
