import { AssistantClient, permissionToServerMode, type ToolResultPayload } from "./client";
import type { AiRuntime } from "./runtime";
import type { AssistantEvent, ContextRef, PermissionMode, RiskLevel, TurnUsage } from "./types";

export type ComposerItem =
  | { kind: "user"; id: string; text: string; contexts: ContextRef[] }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "thinking"; id: string; text: string }
  | {
      kind: "agent_tool";
      id: string;
      name: string;
      state: "running" | "done";
      params: Record<string, unknown>;
      output?: string;
    }
  | {
      kind: "tool_call";
      id: string;
      callId: string;
      name: string;
      arguments: Record<string, unknown>;
      risk: RiskLevel | "unknown";
      summary: string;
      /** drafting: 모델이 도구 블록을 아직 쓰는 중 (chars = 지금까지 길이). */
      status: "drafting" | "awaiting_approval" | "running" | "done" | "error" | "denied";
      chars?: number;
      /** 결과를 기다리지 않고 스트리밍 중 즉시 실행된 도구 (ui · stage). */
      async?: boolean;
      output?: unknown;
      error?: string;
    }
  | { kind: "notice"; id: string; level: "info" | "warning" | "error"; text: string }
  | {
      kind: "turn_meta";
      id: string;
      model: string;
      durationMs?: number;
      firstTokenMs?: number | null;
      usage?: TurnUsage;
    };

export type ComposerStatus = "idle" | "connecting" | "streaming" | "running_tools" | "awaiting_approval";

export interface ComposerDraft {
  text: string;
  contexts: ContextRef[];
  /** 바뀔 때마다 증가 — 입력창이 외부 초안을 받아들일 시점을 안다. */
  revision: number;
}

/** 다른 위젯이 입력창에 넣는 첨부 (끌어 놓기 · 우클릭 · Ctrl+L). revision 이 바뀌면 입력창이 받아들인다. */
export interface ComposerAttachInbox {
  refs: ContextRef[];
  /** 함께 넣을 지시문 앞부분 (예: "채워줘"). `{handles}` 는 첨부 이름들로 바뀐다. */
  prompt?: string;
  revision: number;
}

export interface ComposerState {
  sessionId: string | null;
  status: ComposerStatus;
  items: ComposerItem[];
  mode: PermissionMode;
  engine: { provider: string; model: string } | null;
  /** 실행 중에 보낸 메시지 (끝나면 순서대로 보낸다). */
  queue: { text: string; contexts: ContextRef[] }[];
  draft: ComposerDraft;
  inbox: ComposerAttachInbox;
}

const MAX_TOOL_ROUNDS = 16;

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Composer 대화 하나의 상태 기계 + 에이전트 루프.
 *
 * 메시지 → (서버가 모델을 돌려 이벤트 스트림) → 도구 호출이 나오면 권한 모드에 따라 실행/승인 대기 →
 * 결과를 서버로 → 모델이 이어서 … → 답이 끝나면 대기열의 다음 메시지.
 */
export class ComposerSessionController {
  private state: ComposerState = {
    sessionId: null,
    status: "idle",
    items: [],
    mode: "auto-stage",
    engine: null,
    queue: [],
    draft: { text: "", contexts: [], revision: 0 },
    inbox: { refs: [], revision: 0 },
  };
  private readonly listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private approvals = new Map<string, (approved: boolean) => void>();
  private engineOverride: { provider: string; model: string } | null = null;
  /** 새 대화마다 증가 — 중단된 이전 실행의 늦은 이벤트가 새 대화에 끼지 않게 한다. */
  private generation = 0;
  /** 즉시 실행된 도구 결과 — 다음 메시지에 실어 모델에 알린다. */
  private deferred: ToolResultPayload[] = [];
  private asyncRuns: Promise<unknown>[] = [];

  constructor(private readonly runtime: AiRuntime) {}

  get client(): AssistantClient {
    return this.runtime.client;
  }

  // --- 구독 ---------------------------------------------------------------------

  getState = (): ComposerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ComposerState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private push(item: ComposerItem): void {
    this.set({ items: [...this.state.items, item] });
  }

  private update(id: string, patch: Partial<ComposerItem>): void {
    this.set({
      items: this.state.items.map((it) => (it.id === id ? ({ ...it, ...patch } as ComposerItem) : it)),
    });
  }

  // --- 공개 동작 ----------------------------------------------------------------

  setMode(mode: PermissionMode): void {
    this.set({ mode });
  }

  /** 다음 턴부터 이 엔진을 쓴다 (서버가 세션의 엔진을 바꿔 끼우며 대화를 잇는다). */
  setEngine(provider: string, model: string): void {
    this.engineOverride = { provider, model };
    this.set({ engine: { provider, model } });
  }

  /** 인라인 AI 등 다른 표면이 Composer 입력창에 초안을 넣는다 ("Composer 에서 이어하기"). */
  setDraft(text: string, contexts: ContextRef[] = []): void {
    this.set({ draft: { text, contexts, revision: this.state.draft.revision + 1 } });
  }

  /** 첨부를 입력창으로 보낸다 (입력 중인 글은 그대로 두고 커서 위치에 `@이름` 을 넣는다). */
  attach(refs: ContextRef[], options: { prompt?: string } = {}): void {
    if (refs.length === 0 && !options.prompt) return;
    this.set({ inbox: { refs, prompt: options.prompt, revision: this.state.inbox.revision + 1 } });
  }

  async send(text: string, contexts: ContextRef[] = []): Promise<void> {
    const body = text.trim();
    if (!body) return;
    if (this.state.status !== "idle") {
      this.set({ queue: [...this.state.queue, { text: body, contexts }] });
      return;
    }
    await this.runConversation(body, contexts);
    while (this.state.queue.length > 0 && this.state.status === "idle") {
      const [next, ...rest] = this.state.queue;
      this.set({ queue: rest });
      await this.runConversation(next.text, next.contexts);
    }
  }

  stop(): void {
    this.set({ queue: [] });
    this.abort?.abort();
    this.approvals.forEach((resolve) => resolve(false));
    this.approvals.clear();
    if (this.state.sessionId) void this.client.interrupt(this.state.sessionId);
  }

  approve(callId: string): void {
    this.approvals.get(callId)?.(true);
    this.approvals.delete(callId);
  }

  deny(callId: string): void {
    this.approvals.get(callId)?.(false);
    this.approvals.delete(callId);
  }

  async newSession(): Promise<void> {
    this.generation++;
    this.stop();
    const old = this.state.sessionId;
    this.deferred = [];
    this.asyncRuns = [];
    this.set({ sessionId: null, items: [], status: "idle", queue: [] });
    if (old) await this.client.closeSession(old);
  }

  /**
   * 페이지를 떠날 때(새로고침 · 탭 닫기 · HMR 모듈 교체) 서버 세션을 닫는다.
   * 닫지 않으면 서버가 세션마다 agy 프로세스(170MB 이상)를 30분 동안 붙잡고 있었다.
   */
  closeOnPageExit(): void {
    const id = this.state.sessionId;
    if (!id) return;
    this.abort?.abort();
    this.set({ sessionId: null });
    void this.client.closeSession(id, { keepalive: true });
  }

  // --- 루프 ---------------------------------------------------------------------

  private async ensureSession(): Promise<string> {
    if (this.state.sessionId) return this.state.sessionId;
    const created = await this.client.createSession(this.engineOverride ?? undefined);
    this.set({ sessionId: created.sessionId, engine: { provider: created.provider, model: created.model } });
    return created.sessionId;
  }

  private async runConversation(text: string, contexts: ContextRef[]): Promise<void> {
    const gen = this.generation;
    const resolved = this.runtime.contexts.resolve(contexts);
    this.push({ kind: "user", id: nid("u"), text, contexts: resolved });
    this.set({ status: "connecting" });
    const controller = new AbortController();
    this.abort = controller;
    try {
      let sessionId: string;
      try {
        sessionId = await this.ensureSession();
      } catch (err) {
        this.push({ kind: "notice", id: nid("n"), level: "error", text: `세션을 만들지 못했습니다: ${message(err)}` });
        return;
      }
      const engine = this.engineOverride ?? undefined;
      const deferredResults = this.deferred;
      this.deferred = [];
      let done = await this.streamTurn(
        (onEvent) =>
          this.client.sendMessage(
            sessionId,
            {
              text,
              contexts: resolved,
              tools: this.runtime.tools.manifest(),
              mode: permissionToServerMode(this.state.mode),
              provider: engine?.provider,
              model: engine?.model,
              deferredResults,
            },
            onEvent,
            controller.signal
          ),
        controller.signal
      );
      let rounds = 0;
      while (done.stopReason === "tool_calls" && !controller.signal.aborted) {
        if (++rounds > MAX_TOOL_ROUNDS) {
          this.push({ kind: "notice", id: nid("n"), level: "warning", text: "도구 호출 한도에 도달해 멈췄습니다." });
          break;
        }
        const results = await this.runPendingTools(sessionId, controller.signal);
        if (controller.signal.aborted) break;
        done = await this.streamTurn(
          (onEvent) => this.client.submitToolResults(sessionId, results, onEvent, controller.signal),
          controller.signal
        );
      }
      // 즉시 실행 도구(승인 대기 포함)가 끝나야 이 대화 차례가 끝난다.
      if (this.asyncRuns.length) {
        this.set({ status: "running_tools" });
        await Promise.all(this.asyncRuns);
        this.asyncRuns = [];
      }
    } catch (err) {
      if (gen === this.generation && !controller.signal.aborted) {
        const expired = err instanceof Error && "status" in err && (err as { status: number }).status === 404;
        if (expired) this.set({ sessionId: null });
        this.push({
          kind: "notice",
          id: nid("n"),
          level: "error",
          text: expired ? "세션이 만료되었습니다. 다시 보내면 새 세션으로 이어집니다." : message(err),
        });
      }
    } finally {
      if (this.abort === controller) this.abort = null;
      if (gen === this.generation) {
        if (controller.signal.aborted) this.push({ kind: "notice", id: nid("n"), level: "info", text: "실행을 중단했습니다." });
        this.finishStreamingItems();
        this.set({ status: "idle" });
      }
    }
  }

  private pendingCallItems: string[] = [];

  private async streamTurn(
    request: (onEvent: (e: AssistantEvent) => void) => Promise<Extract<AssistantEvent, { type: "turn_done" }>>,
    signal: AbortSignal
  ) {
    let assistantId: string | null = null;
    let thinkingId: string | null = null;
    let draftId: string | null = null;
    const sessionId = this.state.sessionId;
    let model = this.state.engine?.model ?? "";
    this.pendingCallItems = [];
    const agentTools = new Map<string, string>();
    const onEvent = (event: AssistantEvent) => {
      if (signal.aborted) return;
      switch (event.type) {
        case "turn_start":
          model = event.model;
          this.set({ status: "streaming", engine: { provider: event.provider, model: event.model } });
          break;
        case "text_delta": {
          if (!assistantId) {
            assistantId = nid("a");
            this.push({ kind: "assistant", id: assistantId, text: event.text, streaming: true });
          } else {
            const item = this.state.items.find((i) => i.id === assistantId);
            if (item && item.kind === "assistant") this.update(assistantId, { text: item.text + event.text });
          }
          break;
        }
        case "thinking_delta": {
          if (!thinkingId) {
            thinkingId = nid("t");
            this.push({ kind: "thinking", id: thinkingId, text: event.text });
          } else {
            const item = this.state.items.find((i) => i.id === thinkingId);
            if (item && item.kind === "thinking") this.update(thinkingId, { text: item.text + event.text });
          }
          break;
        }
        case "agent_tool": {
          const key = `${event.stepIndex ?? event.name}`;
          const existing = agentTools.get(key);
          if (existing) this.update(existing, { state: event.state, output: event.output });
          else {
            const id = nid("at");
            agentTools.set(key, id);
            this.push({ kind: "agent_tool", id, name: event.name, state: event.state, params: event.params, output: event.output });
          }
          assistantId = null; // 도구 뒤의 텍스트는 새 말풍선
          break;
        }
        case "tool_call_progress": {
          // 숨겨진 도구 블록을 쓰는 동안에도 카드를 먼저 띄운다 (긴 변경안 HTML 생성 중 "멈춘 듯한" 구간 제거).
          const label = event.name ?? "도구 호출";
          if (!draftId) {
            draftId = nid("tc");
            this.push({
              kind: "tool_call",
              id: draftId,
              callId: "",
              name: label,
              arguments: {},
              risk: (event.name && this.runtime.tools.get(event.name)?.risk) || "unknown",
              summary: "작성 중…",
              status: "drafting",
              chars: event.chars,
            });
          } else {
            this.update(draftId, { name: label, chars: event.chars });
          }
          assistantId = null;
          break;
        }
        case "tool_call": {
          const tool = this.runtime.tools.get(event.name);
          const id = draftId ?? nid("tc");
          const fields: ComposerItem = {
            kind: "tool_call",
            id,
            callId: event.id,
            name: event.name,
            arguments: event.arguments,
            risk: tool?.risk ?? "unknown",
            summary: safeDescribe(tool, event.arguments) ?? event.name,
            status: "running",
            async: Boolean(event.async),
          };
          if (draftId) this.update(draftId, fields);
          else this.push(fields);
          draftId = null;
          if (event.async) this.asyncRuns.push(this.executeCall(id, sessionId, signal, true));
          else this.pendingCallItems.push(id);
          assistantId = null;
          break;
        }
        case "status":
          if (event.state === "spawning" || event.state === "resuming" || event.state === "warning") {
            this.push({ kind: "notice", id: nid("n"), level: event.state === "warning" ? "warning" : "info", text: event.message });
          }
          break;
        case "error":
          this.push({ kind: "notice", id: nid("n"), level: event.code === "interrupted" ? "info" : "error", text: event.message });
          break;
        case "turn_done":
          this.push({
            kind: "turn_meta",
            id: nid("m"),
            model,
            durationMs: event.durationMs,
            firstTokenMs: event.firstTokenMs,
            usage: event.usage,
          });
          break;
        default:
          break;
      }
    };
    const done = await request(onEvent);
    this.finishStreamingItems();
    return done;
  }

  private async runPendingTools(sessionId: string, signal: AbortSignal): Promise<ToolResultPayload[]> {
    const results: ToolResultPayload[] = [];
    this.set({ status: "running_tools" });
    for (const itemId of this.pendingCallItems) {
      const result = await this.executeCall(itemId, sessionId, signal, false);
      if (result) results.push(result);
    }
    this.pendingCallItems = [];
    return results;
  }

  /** 도구 하나를 권한 모드에 따라 실행한다. 즉시 실행(async) 도구의 결과는 다음 메시지로 미룬다. */
  private async executeCall(
    itemId: string,
    sessionId: string | null,
    signal: AbortSignal,
    deferResult: boolean
  ): Promise<ToolResultPayload | null> {
    const item = this.state.items.find((i) => i.id === itemId);
    if (!item || item.kind !== "tool_call") return null;
    const settle = (result: ToolResultPayload) => {
      if (deferResult) this.deferred.push(result);
      return result;
    };
    const tool = this.runtime.tools.get(item.name);
    if (!tool) {
      this.update(itemId, { status: "error", error: "등록되지 않은 도구" });
      return settle({ id: item.callId, name: item.name, ok: false, output: `unknown tool: ${item.name}` });
    }
    const decision = this.permissionFor(tool.risk);
    if (decision === "deny") {
      this.update(itemId, { status: "denied" });
      return settle({ id: item.callId, name: item.name, ok: false, output: "plan 모드에서는 문서를 바꾸는 도구를 실행할 수 없습니다." });
    }
    if (decision === "ask") {
      this.update(itemId, { status: "awaiting_approval" });
      const prev = this.state.status;
      this.set({ status: "awaiting_approval" });
      const approved = await new Promise<boolean>((resolve) => this.approvals.set(item.callId, resolve));
      if (this.state.status === "awaiting_approval") this.set({ status: prev === "awaiting_approval" ? "running_tools" : prev });
      if (!approved || signal.aborted) {
        this.update(itemId, { status: "denied" });
        return settle({ id: item.callId, name: item.name, ok: false, output: "사용자가 이 도구 실행을 거부했습니다." });
      }
      this.update(itemId, { status: "running" });
    }
    try {
      const output = await tool.run(item.arguments, { callId: item.callId, sessionId, signal });
      this.update(itemId, { status: "done", output });
      return settle({ id: item.callId, name: item.name, ok: true, output: output ?? null });
    } catch (err) {
      this.update(itemId, { status: "error", error: message(err) });
      return settle({ id: item.callId, name: item.name, ok: false, output: message(err) });
    }
  }

  private permissionFor(risk: RiskLevel): "auto" | "ask" | "deny" {
    const mode = this.state.mode;
    if (risk === "read" || risk === "ui") return "auto";
    if (mode === "plan") return "deny";
    if (risk === "stage") return mode === "ask" ? "ask" : "auto";
    return "ask";
  }

  private finishStreamingItems(): void {
    if (!this.state.items.some((i) => i.kind === "assistant" && i.streaming)) return;
    this.set({
      items: this.state.items.map((i) => (i.kind === "assistant" && i.streaming ? { ...i, streaming: false } : i)),
    });
  }
}

function safeDescribe(tool: { describe?: (args: any) => string } | undefined, args: Record<string, unknown>) {
  try {
    return tool?.describe?.(args);
  } catch {
    return undefined;
  }
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}
