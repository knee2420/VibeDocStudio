import { AssistantClient, permissionToServerMode, type ToolResultPayload } from "./client";
import type { AiRuntime } from "./runtime";
import type { AssistantEvent, ContextRef, PermissionMode, RiskLevel, TurnUsage } from "./types";
import coreMessages from "@vibe/harness-packs/core/messages.json";
import coreSettings from "@vibe/harness-packs/core/settings.json";

export type ComposerItem =
  | { kind: "user"; id: string; text: string; contexts: ContextRef[] }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "thinking"; id: string; text: string; collapsed?: boolean; durationSeconds?: number }
  | {
      kind: "agent_tool";
      id: string;
      callId?: string;
      name: string;
      state: "running" | "done" | "error";
      params: Record<string, unknown>;
      toolKind?: string;
      title?: string;
      locations?: { path: string }[];
      output?: string;
      error?: string;
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
      /** 서버가 실행한 도구 (지식 덱 등). */
      server?: boolean;
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
/** 저장하는 대화 항목 수 상한 (오래된 것부터 버린다) */
const MAX_SAVED_ITEMS = 160;
/** 지난 대화 요약 분량 · 머리말 — 하네스 core 팩(`settings.json` · `messages.json` recap) */
const RECAP_TURNS = coreSettings.recap.turns;
const RECAP_CHARS = coreSettings.recap.chars;
const RECAP = coreMessages.recap;

/** 문서별 대화를 담는 저장소 — 스튜디오가 localStorage 로 구현해 넣는다. */
export interface ComposerPersistence {
  load(key: string): ComposerSnapshot | null;
  save(key: string, snapshot: ComposerSnapshot): void;
}

export interface ComposerSnapshot {
  items: ComposerItem[];
  sessionId: string | null;
  savedAt: string;
}

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
  /** 서버 이벤트를 앱의 다른 위젯이 받아 가는 길 (예: 레퍼런스 해석 카드 → 레퍼런스 패널) */
  private readonly serverListeners = new Map<string, Set<(event: AssistantEvent) => void>>();
  private abort: AbortController | null = null;
  private approvals = new Map<string, (approved: boolean) => void>();
  private engineOverride: { provider: string; model: string } | null = null;
  /** 새 대화마다 증가 — 중단된 이전 실행의 늦은 이벤트가 새 대화에 끼지 않게 한다. */
  private generation = 0;
  /** 즉시 실행된 도구 결과 — 다음 메시지에 실어 모델에 알린다. */
  private deferred: ToolResultPayload[] = [];
  private asyncRuns: Promise<unknown>[] = [];
  /** 지금 대화의 저장 열쇠 (문서별) — null 이면 저장하지 않는다 */
  private conversationKey: string | null = null;
  private persistence: ComposerPersistence | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** 서버 세션 없이 이어 가는 대화 — 다음 메시지 앞에 지난 대화 요약을 붙인다 */
  private needsRecap = false;
  /** 실행 중에 문서가 바뀌면, 실행이 끝난 뒤 그 대화로 옮긴다 */
  private pendingKey: string | null = null;

  constructor(private readonly runtime: AiRuntime) {}

  // --- 대화 보존 (문서별) --------------------------------------------------------

  setPersistence(persistence: ComposerPersistence | null): void {
    this.persistence = persistence;
  }

  /**
   * 대화를 문서 하나에 묶는다. 지금 대화를 저장하고 그 문서의 대화를 불러온다.
   * 서버 세션은 살아 있으면 그대로 잇고, 없거나 만료됐으면 다음 메시지에 지난 대화 요약을 붙여 새 세션으로 잇는다.
   */
  bindConversation(key: string | null): void {
    if (key === this.conversationKey) return;
    if (this.state.status !== "idle") {
      this.pendingKey = key;
      return;
    }
    this.flushSave();
    this.conversationKey = key;
    const snap = key && this.persistence ? this.persistence.load(key) : null;
    this.generation++;
    this.deferred = [];
    this.asyncRuns = [];
    const items = (snap?.items ?? []).map(settleItem);
    this.needsRecap = items.some((i) => i.kind === "user") && !snap?.sessionId;
    this.set({ sessionId: snap?.sessionId ?? null, items, status: "idle", queue: [] });
  }

  /**
   * 진행 중이거나 방금 시작한 대화를 새 키(문서)로 그대로 옮긴다.
   * dc_new · dc_use 처럼 대화 도중 활성 문서가 바뀔 때, 화면이 새 문서로 전환되어도
   * 현재 스트리밍 · 메시지 목록 · 세션 ID 를 그대로 유지하고 새 문서 키에 이어 저장한다.
   */
  transferConversation(key: string | null): void {
    this.pendingKey = null;
    if (key === this.conversationKey) return;
    this.conversationKey = key;
    if (key && this.persistence && this.state.items.length > 0) {
      this.flushSave();
    }
  }

  private scheduleSave(): void {
    if (!this.conversationKey || !this.persistence) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 500);
  }

  private flushSave(): void {
    clearTimeout(this.saveTimer);
    if (!this.conversationKey || !this.persistence) return;
    try {
      this.persistence.save(this.conversationKey, {
        items: this.state.items.slice(-MAX_SAVED_ITEMS).map(settleItem),
        sessionId: this.state.sessionId,
        savedAt: new Date().toISOString(),
      });
    } catch {
      /* 저장소가 가득 차도 대화는 계속 */
    }
  }

  /** 새 서버 세션에 실을 지난 대화 요약 (최근 몇 턴의 질문 · 답). */
  private recap(): string {
    const turns = this.state.items.filter(
      (i): i is Extract<ComposerItem, { kind: "user" | "assistant" }> => i.kind === "user" || i.kind === "assistant"
    );
    const recent = turns.slice(-RECAP_TURNS * 2);
    if (!recent.length) return "";
    const lines = recent.map((i) => `${i.kind === "user" ? RECAP.user : RECAP.assistant}: ${i.text.replace(/\s+/g, " ").slice(0, RECAP_CHARS)}`);
    return [
      RECAP.open,
      ...lines,
      RECAP.close,
      "",
      "",
    ].join("\n");
  }

  get client(): AssistantClient {
    return this.runtime.client;
  }

  // --- 구독 ---------------------------------------------------------------------

  getState = (): ComposerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** 특정 종류의 서버 이벤트를 구독한다. 반환값을 부르면 구독을 끊는다. */
  onServerEvent = <T extends AssistantEvent["type"]>(
    type: T,
    handler: (event: Extract<AssistantEvent, { type: T }>) => void,
  ): (() => void) => {
    const set = this.serverListeners.get(type) ?? new Set();
    set.add(handler as (event: AssistantEvent) => void);
    this.serverListeners.set(type, set);
    return () => set.delete(handler as (event: AssistantEvent) => void);
  };

  private set(patch: Partial<ComposerState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
    if ("items" in patch || "sessionId" in patch) this.scheduleSave();
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
    if (this.pendingKey !== null && this.state.status === "idle") {
      const key = this.pendingKey;
      this.pendingKey = null;
      this.bindConversation(key);
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
    this.needsRecap = false;
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
    // 떠나는 중이라 타이머가 돌지 않는다 — 바로 저장 (다음에 열면 요약을 붙여 새 세션으로 잇는다)
    this.flushSave();
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
    // 지난 대화가 있는데 서버 세션이 없으면(새로고침 · 문서 전환 · 만료) 요약을 실어 보낸다
    const prior = this.state.items.some((i) => i.kind === "user");
    if (prior && !this.state.sessionId) this.needsRecap = true;
    const recap = this.needsRecap ? this.recap() : "";
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
      const first = (sid: string, body: string) =>
        this.streamTurn(
          (onEvent) =>
            this.client.sendMessage(
              sid,
              {
                text: body,
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
      let done: Awaited<ReturnType<typeof first>>;
      try {
        done = await first(sessionId, recap + text);
      } catch (err) {
        // 되살린 세션이 서버에서 이미 닫혔다 — 새 세션 + 지난 대화 요약으로 한 번 다시
        if (!isExpired(err) || controller.signal.aborted || !prior) throw err;
        this.set({ sessionId: null });
        sessionId = await this.ensureSession();
        done = await first(sessionId, this.recap() + text);
      }
      this.needsRecap = false;
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
    let thinkingStartTime: number | null = null;
    let draftId: string | null = null;
    const sessionId = this.state.sessionId;
    let model = this.state.engine?.model ?? "";
    this.pendingCallItems = [];
    const agentTools = new Map<string, string>();
    const onEvent = (event: AssistantEvent) => {
      if (signal.aborted) return;
      this.serverListeners.get(event.type)?.forEach((handler) => {
        try {
          handler(event);
        } catch {
          /* 구독자 오류가 대화를 막지 않게 */
        }
      });
      switch (event.type) {
        case "turn_start":
          model = event.model;
          this.set({ status: "streaming", engine: { provider: event.provider, model: event.model } });
          break;
        case "text_delta": {
          if (thinkingId) {
            const tItem = this.state.items.find((i) => i.id === thinkingId);
            if (tItem && tItem.kind === "thinking" && tItem.collapsed === false) {
              const dur = thinkingStartTime ? Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000)) : undefined;
              this.update(thinkingId, { collapsed: true, durationSeconds: dur });
            }
          }
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
            thinkingStartTime = Date.now();
            this.push({ kind: "thinking", id: thinkingId, text: event.text, collapsed: false });
          } else {
            const item = this.state.items.find((i) => i.id === thinkingId);
            if (item && item.kind === "thinking") this.update(thinkingId, { text: item.text + event.text });
          }
          break;
        }
        case "agent_tool": {
          if (thinkingId) {
            const tItem = this.state.items.find((i) => i.id === thinkingId);
            if (tItem && tItem.kind === "thinking" && tItem.collapsed === false) {
              const dur = thinkingStartTime ? Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000)) : undefined;
              this.update(thinkingId, { collapsed: true, durationSeconds: dur });
            }
            thinkingId = null;
            thinkingStartTime = null;
          }
          const key = event.callId ?? `${event.stepIndex ?? event.name}`;
          const existing = agentTools.get(key);
          if (existing) {
            const prev = this.state.items.find((i) => i.id === existing);
            this.update(existing, {
              state: event.state,
              output: event.output,
              error: event.error,
              // 실패 갱신에는 인자가 비어 올 수 있다 — 처음 받은 인자 · 위치를 지킨다
              ...(event.locations?.length ? { locations: event.locations } : {}),
              ...(prev && prev.kind === "agent_tool" && Object.keys(prev.params ?? {}).length ? {} : { params: event.params }),
            });
          } else {
            const id = nid("at");
            agentTools.set(key, id);
            this.push({
              kind: "agent_tool",
              id,
              callId: event.callId,
              name: event.name,
              state: event.state,
              params: event.params,
              toolKind: event.kind,
              title: event.title,
              locations: event.locations,
              output: event.output,
              error: event.error,
            });
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
          if (event.server) {
            // 서버 도구: 서버가 실행하고 결과(tool_result)를 같은 스트림으로 보낸다 — 카드만 띄운다.
            const id = draftId ?? nid("tc");
            const fields: ComposerItem = {
              kind: "tool_call",
              id,
              callId: event.id,
              name: event.name,
              arguments: event.arguments,
              risk: event.risk ?? "read",
              summary: event.summary ?? event.name,
              status: "running",
              server: true,
            };
            if (draftId) this.update(draftId, fields);
            else this.push(fields);
            draftId = null;
            assistantId = null;
            break;
          }
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
        case "tool_result": {
          const item = this.state.items.find((i) => i.kind === "tool_call" && i.callId === event.id);
          if (item) {
            let output: unknown = event.output;
            try {
              output = event.output ? JSON.parse(event.output) : null;
            } catch {
              /* 잘린 미리보기 — 문자열 그대로 */
            }
            this.update(item.id, event.ok ? { status: "done", output } : { status: "error", error: String(event.output ?? "") });
          }
          break;
        }
        case "workspace_sources": {
          const shown = event.sources.filter((s) => s.available);
          if (shown.length === 0) break;
          const unused = shown.filter((s) => !s.used);
          this.push({
            kind: "notice",
            id: nid("n"),
            level: unused.length ? "warning" : "info",
            text:
              "확인한 출처: " +
              shown.map((s) => `${s.label} ${s.used ? "✓" : "✗ 안 열어 봄"}${s.used && s.detail ? ` ${s.detail}` : ""}`).join(" · "),
          });
          break;
        }
        case "reference_interpretations": {
          if (event.cards.length === 0) break;
          const layers = [...new Set(event.cards.map((c) => c.layer))].join(" · ");
          this.push({
            kind: "notice",
            id: nid("n"),
            level: "info",
            text: `레퍼런스 해석 카드 ${event.cards.length}장 제안 (${layers}) — 레퍼런스 패널에서 채택 강도를 정하고 확정하세요.`,
          });
          break;
        }
        case "workbench_proposals": {
          if (event.proposals.length === 0) break;
          const slotCount = event.proposals.reduce(
            (sum, p) => sum + Object.keys(p.candidates[0]?.slots ?? {}).length,
            0,
          );
          const maxCandidates = Math.max(...event.proposals.map((p) => p.candidates.length));
          const altText = maxCandidates > 1 ? ` · 후보 ${maxCandidates}안` : "";
          this.push({
            kind: "notice",
            id: nid("n"),
            level: "info",
            text: `개편안 대기열(Staged)에 ${slotCount}개 슬롯 변경안${altText}을 올렸습니다 — 본문 diff 또는 검토 서랍에서 확인하고 승인하세요.`,
          });
          break;
        }
        case "workspace_coverage": {
          const pct = event.linesTotal ? Math.round((100 * event.linesRead) / event.linesTotal) : 0;
          this.push({
            kind: "notice",
            id: nid("n"),
            level: "info",
            text:
              `리소스 작업 공간 · 읽은 범위: 텍스트 ${event.files}개 중 전부 ${event.fullyRead} · 일부 ${event.partiallyRead} · ` +
              `안 읽음 ${event.unread} (줄 ${event.linesRead.toLocaleString()}/${event.linesTotal.toLocaleString()} · ${pct}%)`,
          });
          break;
        }
        case "citation_check": {
          if (event.warnings && event.warnings.length > 0) {
            this.push({
              kind: "notice",
              id: nid("n"),
              level: "warning",
              text: `인용 검증 경고 (${event.warnings.length}건):\n` + event.warnings.map((w) => `• ${w}`).join("\n"),
            });
          }
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

function isExpired(err: unknown): boolean {
  return err instanceof Error && "status" in err && (err as { status: number }).status === 404;
}

/** 저장 · 복원할 때 진행 중 상태를 끝난 상태로 (되살린 대화에 돌고 있는 것은 없다). */
function settleItem(item: ComposerItem): ComposerItem {
  if (item.kind === "assistant" && item.streaming) return { ...item, streaming: false };
  if (item.kind === "tool_call" && (item.status === "drafting" || item.status === "running" || item.status === "awaiting_approval")) {
    return { ...item, status: "error", error: item.error ?? "대화를 다시 열어 실행이 끊겼습니다." };
  }
  if (item.kind === "agent_tool" && item.state === "running") return { ...item, state: "done" };
  return item;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}
