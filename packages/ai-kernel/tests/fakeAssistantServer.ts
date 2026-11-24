/**
 * 테스트용 가짜 `/api/assistant` — 메시지 요청마다 열린 SSE 스트림을 만들고, 테스트가 원하는 때에 끝낸다.
 * 실제 `AssistantClient` · `ComposerSessionController` 를 그대로 돌려 동시성 흐름을 검증한다.
 */
export interface OpenTurn {
  readonly sessionId: string;
  readonly path: string;
  readonly body: Record<string, unknown>;
  /** 텍스트를 흘리고 턴을 끝낸다 */
  finish(options?: { text?: string; stopReason?: string; toolCall?: { id: string; name: string; arguments?: Record<string, unknown> } }): void;
  /** 오류 이벤트로 끝낸다 */
  fail(message: string): void;
  readonly aborted: boolean;
  /** 스트림이 끝났는가 (끝냄 · 실패 · 중단) */
  readonly done: boolean;
}

export class FakeAssistantServer {
  readonly turns: OpenTurn[] = [];
  readonly created: Record<string, unknown>[] = [];
  readonly closed: string[] = [];
  readonly interrupted: string[] = [];
  private seq = 0;
  private waiters: Array<() => void> = [];
  /** 이 세션 id 들은 404 (서버에서 사라짐) */
  readonly expired = new Set<string>();

  fetchFn: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (method === "POST" && path === "/api/assistant/sessions") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      this.created.push(body);
      const sessionId = `srv-${++this.seq}`;
      return json({ sessionId, provider: "fake", model: "fake-1" });
    }
    if (method === "GET" && path === "/api/assistant/sessions") return json({ sessions: [] });
    const del = /^\/api\/assistant\/sessions\/([^/]+)$/.exec(path);
    if (method === "DELETE" && del) {
      this.closed.push(del[1]);
      return new Response(null, { status: 204 });
    }
    const intr = /^\/api\/assistant\/sessions\/([^/]+)\/interrupt$/.exec(path);
    if (intr) {
      this.interrupted.push(intr[1]);
      return new Response(null, { status: 204 });
    }
    const msg = /^\/api\/assistant\/sessions\/([^/]+)\/(messages|tool-results)$/.exec(path);
    if (method === "POST" && msg) {
      const sessionId = msg[1];
      if (this.expired.has(sessionId)) return new Response("gone", { status: 404 });
      return this.openTurn(sessionId, path, init);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  private openTurn(sessionId: string, path: string, init?: RequestInit): Response {
    const encoder = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    let aborted = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
      },
    });
    const send = (event: Record<string, unknown>) => {
      if (!closed) ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };
    const close = () => {
      if (closed) return;
      closed = true;
      ctrl.close();
    };
    init?.signal?.addEventListener("abort", () => {
      aborted = true;
      if (!closed) {
        closed = true;
        ctrl.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }
    });
    send({ type: "turn_start", provider: "fake", model: "fake-1" });
    const turn: OpenTurn = {
      sessionId,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : {},
      finish: (options = {}) => {
        if (options.text) send({ type: "text_delta", text: options.text });
        if (options.toolCall) {
          send({ type: "tool_call", id: options.toolCall.id, name: options.toolCall.name, arguments: options.toolCall.arguments ?? {} });
        }
        send({ type: "turn_done", stopReason: options.stopReason ?? (options.toolCall ? "tool_calls" : "end_turn"), usage: {} });
        close();
      },
      fail: (message: string) => {
        send({ type: "error", message });
        send({ type: "turn_done", stopReason: "error", usage: {} });
        close();
      },
      get aborted() {
        return aborted;
      },
      get done() {
        return closed;
      },
    };
    this.turns.push(turn);
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => w());
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  /** 열린 턴이 n 개가 될 때까지 기다린다 */
  async waitForTurns(n: number, timeoutMs = 2000): Promise<void> {
    const started = Date.now();
    while (this.turns.length < n) {
      if (Date.now() - started > timeoutMs) throw new Error(`턴 ${n}개를 기다렸지만 ${this.turns.length}개`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
  }

  openTurns(): OpenTurn[] {
    return this.turns.filter((t) => !t.done);
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/** 마이크로태스크 · 타이머를 몇 바퀴 돌린다 */
export async function settle(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}
