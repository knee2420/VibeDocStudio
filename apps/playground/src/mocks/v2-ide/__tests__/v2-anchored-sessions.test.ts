/**
 * 무마찰 디렉팅 — 기준점 세션 (docs/specs/v2-anchored-sessions-guide.md).
 *
 * 가짜 `/api/assistant` 가 턴마다 열린 SSE 를 만들고, 테스트가 이벤트를 흘려 실제 Composer 컨트롤러 · 도구 · 레지스트리를 돌린다.
 * 확인하는 것:
 *   - 기준점 세션의 도구는 활성 탭이 아니라 기준점 문서를 본다 (다른 문서를 보고 있어도)
 *   - 뒤 세션의 화면 조작 도구는 실행되지 않고, 세션을 열 때 한 번 실행된다
 *   - 변경안 · 파일 묶음에 세션 꼬리표 → 세션별 검토 · 완료 시 버리기 · 되돌리기는 그 서버 세션으로
 *   - 아웃라인 불릿 완료 = 세션 완료, 불릿 삭제 = 기준점 없음
 *   - 범위(turn)는 세션마다 따로 — 메인 범위를 건드리지 않는다
 *   - 동시 실행 상한 (하네스 core settings)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createV2AiWorkspace, type V2AiWorkspace } from "@vibe/ai-vault";
import coreSettings from "@vibe/harness-packs/core/settings.json";
import { createDefaultVDoc, parseOutlineJson, parseVDocJson, serializeOutlineJson, serializeVDocJson, type OutlineFilePayload } from "@vibe/vault-formats";
import { getBlockSlotIds, type VDocDocument } from "@vibe/vdoc-schema";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const DOC_A = "01. Architecture/00. System-Proposal.vdoc";
const DOC_B = "01. Architecture/other.vdoc";
const OUTLINE = "01. Architecture/plan.outline";

// --- 가짜 서버 ---------------------------------------------------------------------------------

interface Turn {
  readonly sessionId: string;
  readonly kind: "messages" | "tool-results";
  readonly body: Record<string, unknown>;
  emit(event: Record<string, unknown>): void;
  end(stopReason?: string): void;
  readonly done: boolean;
}

class FakeServer {
  readonly turns: Turn[] = [];
  readonly undone: string[] = [];
  private seq = 0;

  fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && path === "/api/assistant/sessions") return json({ sessionId: `srv-${++this.seq}`, provider: "fake", model: "m" });
    const undo = /^\/api\/assistant\/sessions\/([^/]+)\/fs-batches\/([^/]+)\/undo$/.exec(path);
    if (undo) {
      this.undone.push(`${decodeURIComponent(undo[1])}:${decodeURIComponent(undo[2])}`);
      return json({ ok: true, message: "ok", batchId: undo[2] });
    }
    const m = /^\/api\/assistant\/sessions\/([^/]+)\/(messages|tool-results)$/.exec(path);
    if (method === "POST" && m) return this.open(m[1], m[2] as Turn["kind"], init);
    if (method === "DELETE" || path.endsWith("/interrupt")) return new Response(null, { status: 204 });
    return json({});
  }) as typeof fetch;

  private open(sessionId: string, kind: Turn["kind"], init?: RequestInit): Response {
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
    init?.signal?.addEventListener("abort", () => {
      if (!closed) {
        closed = true;
        ctrl.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }
    });
    const emit = (e: Record<string, unknown>) => {
      if (!closed) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
    };
    emit({ type: "turn_start", provider: "fake", model: "m" });
    this.turns.push({
      sessionId,
      kind,
      body: init?.body ? JSON.parse(String(init.body)) : {},
      emit,
      end: (stopReason = "end_turn") => {
        emit({ type: "turn_done", stopReason, usage: {} });
        if (!closed) {
          closed = true;
          ctrl.close();
        }
      },
      get done() {
        return closed;
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  open_(): Turn[] {
    return this.turns.filter((t) => !t.done);
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function waitFor(pred: () => boolean, what: string, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`기다림 초과: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

// --- 준비 ---------------------------------------------------------------------------------------

function outlinePayload(nodes: Array<{ id: string; text: string; done?: boolean }>): OutlineFilePayload {
  return {
    version: 1,
    id: "ol-1",
    title: "plan",
    defaultView: "list" as OutlineFilePayload["defaultView"],
    rootNodes: nodes.map((n) => ({ id: n.id, text: n.text, children: [], ...(n.done ? { isCompleted: true, completedAt: 1 } : {}) })),
  };
}

function setup() {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  rt.vault.createFile(DOC_B, serializeVDocJson(createDefaultVDoc("Other", "a4")));
  rt.vault.createFile(OUTLINE, serializeOutlineJson(outlinePayload([{ id: "n1", text: "근거 조사" }, { id: "n2", text: "레퍼런스" }, { id: "n3", text: "에셋" }])));
  const server = new FakeServer();
  const opened: string[] = [];
  let editorSelection: { resourceId: string; kind: string; nodeIds?: string[] } | null = null;
  const agentLogs: string[] = [];
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    docs: rt.docs,
    openVaultFile: (path, mode) => {
      opened.push(path);
      rt.openVaultFile(path, mode ?? "current");
    },
    getTextSelection: () => null,
    getEditorSelection: () => editorSelection,
    pushLog: () => undefined,
    pushAgentLog: (level, message) => agentLogs.push(`${level}:${message}`),
    storage: null,
    fetchFn: server.fetchFn,
  });
  ai.start();
  return {
    rt,
    ai,
    server,
    opened,
    agentLogs,
    selectOutline: (ids: string[]) => {
      editorSelection = { resourceId: OUTLINE, kind: "outline-nodes", nodeIds: ids };
    },
  };
}

const docOf = (rt: ReturnType<typeof setup>["rt"], path: string): VDocDocument => parseVDocJson(rt.vault.read(path), "x");
const firstSlots = (d: VDocDocument, n: number) =>
  d.pages.flatMap((p) => p.blocks.flatMap((b) => getBlockSlotIds(b))).filter((id) => d.slots[id] && !d.slots[id].constraints?.locked).slice(0, n);

/** 캔버스에서 칸을 고르고 그 선택에 세션을 던진다 */
function throwOnCanvas(ctx: ReturnType<typeof setup>, path: string, slotIds: string[], prompt: string) {
  ctx.rt.openVaultFile(path, "current");
  ctx.rt.vdocUiBridge.getState().setSelection(
    path,
    slotIds.map((id) => ({ id, kind: "slot" as const })),
    slotIds[0]
  );
  const entry = ctx.ai.sendAnchored("vdoc", prompt);
  assert.ok(entry, "선택이 있으면 세션이 생긴다");
  return entry!;
}

const toolResult = (turn: Turn) => (turn.body.results as Array<{ id: string; ok: boolean; output: unknown }>)[0];

describe("v2 무마찰 디렉팅 — 기준점 세션", () => {
  it("기준점 세션의 도구는 활성 탭이 아니라 기준점 문서를 본다 · 포커스를 뺏지 않는다", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const slots = firstSlots(docOf(rt, DOC_A), 2);
    const entry = throwOnCanvas(ctx, DOC_A, slots, "이 칸들 근거 조사해줘");
    await waitFor(() => server.turns.length === 1, "첫 턴");
    // 사용자는 다른 문서로 넘어가 계속 일한다
    rt.openVaultFile(DOC_B, "current");
    assert.equal(rt.layout.getState().getActiveTab()?.resourceId, DOC_B);

    const first = server.turns[0];
    assert.match(String(first.body.text), /이 칸들 근거 조사해줘$/);
    const wire = first.body.contexts as Array<{ kind: string; content: string }>;
    const wb = JSON.parse(wire.find((c) => c.kind === "workbench")!.content) as { docVaultPath: string; selection: string[] };
    assert.equal(wb.docVaultPath, DOC_A, "작업대는 기준점 문서");
    assert.deepEqual(wb.selection, slots, "작업대 선택 = 기준점 칸 (화면 선택이 아니라)");
    const scope = wire.find((c) => c.kind === "scope");
    assert.match(String(scope?.content), new RegExp(`docId: ${docOf(rt, DOC_A).docId}`), "범위는 기준점 문서");
    assert.equal(ai.store.getState().turn, null, "메인 범위는 건드리지 않는다");
    assert.equal(ai.store.getState().turnBySession[entry.key]?.path, DOC_A);

    first.emit({ type: "tool_call", id: "c1", name: "document.getOutline", arguments: {} });
    first.end("tool_calls");
    await waitFor(() => server.turns.length === 2, "도구 결과 턴");
    const result = toolResult(server.turns[1]);
    assert.equal(result.ok, true);
    assert.match(String(result.output), new RegExp(DOC_A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "기준점 문서 구조를 읽었다");
    assert.doesNotMatch(String(result.output), /other\.vdoc/);

    // 뒤 세션의 화면 이동은 실행하지 않는다
    const opensBefore = ctx.opened.length;
    server.turns[1].emit({ type: "tool_call", id: "c2", name: "canvas.selectSlot", arguments: { slotId: slots[0] }, async: true });
    server.turns[1].end("end_turn");
    await waitFor(() => ai.sessions.status(entry.key) === "idle", "세션 끝");
    assert.equal(rt.layout.getState().getActiveTab()?.resourceId, DOC_B, "화면을 옮기지 않았다");
    assert.equal(ctx.opened.length, opensBefore);
    assert.equal(ai.sessions.view(entry.key)?.revealHints.length, 1);
    assert.equal(ai.sessions.view(entry.key)?.unread, true, "뒤에서 끝나면 안 읽음");

    // 세션을 열면 그때 한 번 이동한다
    ai.openSession(entry.key);
    assert.equal(ai.sessions.foreground(), entry.key);
    assert.equal(rt.layout.getState().getActiveTab()?.resourceId, DOC_A);
    assert.equal(ai.sessions.view(entry.key)?.revealHints.length, 0);
    assert.equal(ai.sessions.view(entry.key)?.unread, false);
    ai.dispose();
  });

  it("변경안은 세션 꼬리표 → 세션별 검토 수 · 완료하면 그 세션 것만 버린다", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const [s1, s2] = firstSlots(docOf(rt, DOC_A), 2);
    const entry = throwOnCanvas(ctx, DOC_A, [s1], "채워줘");
    await waitFor(() => server.turns.length === 1, "첫 턴");
    server.turns[0].emit({ type: "tool_call", id: "p1", name: "slot.proposeContent", arguments: { slotId: s1, html: "<p>세션 초안</p>" } });
    server.turns[0].end("tool_calls");
    await waitFor(() => server.turns.length === 2, "결과 턴");
    server.turns[1].end();
    await waitFor(() => ai.sessions.status(entry.key) === "needs_review", "검토 필요");

    // 메인이 만든 변경안 (꼬리표 없음)
    const mainTool = ai.runtime.tools.get("slot.proposeContent")!;
    rt.openVaultFile(DOC_A, "current");
    await mainTool.run({ slotId: s2, html: "<p>메인 초안</p>" }, { callId: "m", sessionId: null, signal: new AbortController().signal });
    const queue = ai.store.getState().queue;
    assert.equal(queue.find((c) => c.targetId === s1)?.sessionKey, entry.key);
    assert.equal(queue.find((c) => c.targetId === s2)?.sessionKey, undefined);
    assert.equal(ai.sessions.view(entry.key)?.reviewCount, 1);
    assert.equal(ai.sessions.view(ai.sessions.mainKey)?.reviewCount, 1);

    await ai.completeSession(entry.key, { discardStaged: true });
    assert.equal(ai.sessions.status(entry.key), "completed");
    assert.deepEqual(ai.store.getState().queue.map((c) => c.targetId), [s2], "메인 변경안은 남는다");
    assert.equal(ai.store.getState().turnBySession[entry.key], undefined);
    ai.dispose();
  });

  it("완료하면서 변경안을 남기면 메인에서 검토한다", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const [s1] = firstSlots(docOf(rt, DOC_A), 1);
    const entry = throwOnCanvas(ctx, DOC_A, [s1], "채워줘");
    await waitFor(() => server.turns.length === 1, "첫 턴");
    server.turns[0].emit({ type: "tool_call", id: "p1", name: "slot.proposeContent", arguments: { slotId: s1, html: "<p>x</p>" } });
    server.turns[0].end("tool_calls");
    await waitFor(() => server.turns.length === 2, "결과 턴");
    server.turns[1].end();
    await waitFor(() => ai.sessions.status(entry.key) === "needs_review", "검토 필요");
    await ai.completeSession(entry.key, { discardStaged: false });
    assert.equal(ai.store.getState().queue.length, 1);
    assert.equal(ai.store.getState().queue[0].sessionKey, undefined);
    assert.equal(ai.sessions.view(ai.sessions.mainKey)?.reviewCount, 1);
    ai.dispose();
  });

  it("아웃라인: 불릿 선택에 세션 → 불릿을 완료하면 세션이 닫히고, 불릿을 지우면 기준점 없음", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    ctx.selectOutline(["n1", "n2"]);
    const a = ai.sendAnchored("outline", "근거 자료 조사해서 리스트업");
    assert.ok(a);
    await waitFor(() => server.turns.length === 1, "첫 턴");
    const wire = server.turns[0].body.contexts as Array<{ kind: string; content: string; role: string }>;
    const outlineRef = wire.find((c) => c.kind === "outline-node");
    assert.match(String(outlineRef?.content), /nodeIds=n1, n2/);
    assert.equal(outlineRef?.role, "target");
    const wb = JSON.parse(wire.find((c) => c.kind === "workbench")!.content) as { activeOutlinePath: string; selectedOutlineNodeIds: string[] };
    assert.equal(wb.activeOutlinePath, OUTLINE);
    assert.deepEqual(wb.selectedOutlineNodeIds, ["n1", "n2"], "작업대 불릿 선택 = 기준점");
    assert.match(String(server.turns[0].body.text), /^@\S+ 근거 자료 조사해서 리스트업$/);
    server.turns[0].end();
    await waitFor(() => ai.sessions.status(a!.key) === "idle", "끝");

    ctx.selectOutline(["n3"]);
    const b = ai.sendAnchored("outline", "에셋 추천");
    await waitFor(() => server.turns.length === 2, "둘째 턴");
    server.turns[1].end();
    assert.deepEqual(ai.sessions.findByItems("outline", OUTLINE, ["n2"]).map((v) => v.key), [a!.key]);

    // 일부만 완료 → 그대로
    const cur = () => parseOutlineJson(rt.vault.read(OUTLINE), "plan");
    const write = (p: OutlineFilePayload) => rt.vault.write(OUTLINE, serializeOutlineJson(p));
    write({ ...cur(), rootNodes: cur().rootNodes.map((n) => (n.id === "n1" ? { ...n, isCompleted: true } : n)) });
    await new Promise((r) => setTimeout(r, 20));
    assert.notEqual(ai.sessions.status(a!.key), "completed");
    // 둘 다 완료 → 세션 완료 (검토할 변경안이 없으니 묻지 않는다)
    write({ ...cur(), rootNodes: cur().rootNodes.map((n) => (n.id === "n2" ? { ...n, isCompleted: true } : n)) });
    await waitFor(() => ai.sessions.status(a!.key) === "completed", "완료로 닫힘");

    // 불릿 삭제 → 기준점 없음 (세션은 유지)
    write({ ...cur(), rootNodes: cur().rootNodes.filter((n) => n.id !== "n3") });
    await waitFor(() => ai.sessions.view(b!.key)?.lifecycle === "anchor-lost", "기준점 없음");
    assert.notEqual(ai.sessions.status(b!.key), "completed");
    ai.dispose();
  });

  it("완료할 때 검토 안 한 변경안이 있으면 앱에 묻는다 — 취소하면 세션 유지", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const [s1] = firstSlots(docOf(rt, DOC_A), 1);
    ctx.selectOutline(["n1"]);
    const a = ai.sendAnchored("outline", "정리")!;
    await waitFor(() => server.turns.length === 1, "첫 턴");
    // 아웃라인 세션이 문서 칸 변경안을 낸 경우 (꼬리표는 세션)
    ai.store.getState().enqueue([
      { path: DOC_A, diffId: "d1", phase: "drafting", targetKind: "slot-html", targetId: s1, title: "t", beforeSummary: "", afterSummary: "", payload: { slotId: s1, html: "<p/>" }, sourceReferenceIds: [], sessionKey: a.key } as never,
    ]);
    server.turns[0].end();
    const asked: string[] = [];
    const off = ai.onCompletionRequest((req) => {
      asked.push(req.key);
      req.cancel();
    });
    const cur = parseOutlineJson(rt.vault.read(OUTLINE), "plan");
    rt.vault.write(OUTLINE, serializeOutlineJson({ ...cur, rootNodes: cur.rootNodes.map((n) => (n.id === "n1" ? { ...n, isCompleted: true } : n)) }));
    await waitFor(() => asked.length === 1, "확인 요청");
    assert.equal(ai.sessions.status(a.key), "needs_review", "취소 → 세션 유지");
    // 같은 완료 상태에서 다시 묻지 않는다
    rt.vault.write(OUTLINE, rt.vault.read(OUTLINE) + "\n");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(asked.length, 1);
    off();
    ai.dispose();
  });

  it("동시 실행 상한 (하네스 core settings) — 넘치면 대기열, 끝나는 대로 시작", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const max = (coreSettings as { sessions: { maxConcurrentRuns: number } }).sessions.maxConcurrentRuns;
    const slots = firstSlots(docOf(rt, DOC_A), max + 1);
    const keys = slots.map((s, i) => throwOnCanvas(ctx, DOC_A, [s], `작업 ${i}`).key);
    await waitFor(() => server.turns.length === max, "상한만큼 시작");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(server.turns.length, max);
    assert.equal(ai.sessions.status(keys[max]), "queued");
    server.turns[0].end();
    await waitFor(() => server.turns.length === max + 1, "대기 세션 시작");
    assert.match(String(server.turns[max].body.text), new RegExp(`작업 ${max}$`));
    server.open_().forEach((t) => t.end());
    await waitFor(() => keys.every((k) => ai.sessions.status(k) === "idle"), "모두 끝");
    ai.dispose();
  });

  it("파일 묶음은 세션 · 서버 세션 꼬리표 → 되돌리기는 그 서버 세션으로", async () => {
    const ctx = setup();
    const { rt, ai, server } = ctx;
    const [s1] = firstSlots(docOf(rt, DOC_A), 1);
    const entry = throwOnCanvas(ctx, DOC_A, [s1], "폴더 정리");
    await waitFor(() => server.turns.length === 1, "첫 턴");
    const sid = server.turns[0].sessionId;
    server.turns[0].emit({ type: "fs_batches", batches: [{ batchId: "fb1", summary: "폴더 2개 생성", createdAt: 1, ops: 2, undone: false }] });
    server.turns[0].end();
    await waitFor(() => ai.store.getState().fsBatches.length === 1, "묶음 기록");
    const batch = ai.store.getState().fsBatches[0];
    assert.equal(batch.sessionKey, entry.key);
    assert.equal(batch.serverSessionId, sid);
    const res = await ai.undoFsBatch("fb1");
    assert.equal(res.ok, true);
    assert.deepEqual(server.undone, [`${sid}:fb1`]);
    ai.dispose();
  });

  it("터미널 에이전트 로그: 지시 · 시작 · 도구 · 끝 · 완료가 세션 꼬리표와 함께 (토큰은 찍지 않는다)", async () => {
    const ctx = setup();
    const { rt, ai, server, agentLogs } = ctx;
    const [s1] = firstSlots(docOf(rt, DOC_A), 1);
    const entry = throwOnCanvas(ctx, DOC_A, [s1], "근거 조사");
    await waitFor(() => server.turns.length === 1, "첫 턴");
    server.turns[0].emit({ type: "text_delta", text: "토큰1" });
    server.turns[0].emit({ type: "text_delta", text: "토큰2" });
    server.turns[0].emit({ type: "agent_tool", callId: "a1", name: "read_file", title: "파일 읽기", state: "running", params: {}, locations: [{ path: DOC_A }] });
    server.turns[0].emit({ type: "agent_tool", callId: "a1", name: "read_file", title: "파일 읽기", state: "done", params: {} });
    server.turns[0].end();
    await waitFor(() => ai.sessions.status(entry.key) === "idle", "끝");
    await ai.completeSession(entry.key);
    const tag = `‹근거 조사›`;
    const mine = agentLogs.filter((l) => l.includes(tag));
    assert.ok(mine.some((l) => l.includes('지시 ← "근거 조사"')), mine.join(" | "));
    assert.ok(mine.some((l) => l.includes("▶ 실행")));
    assert.ok(mine.findIndex((l) => l.includes("지시 ←")) < mine.findIndex((l) => l.includes("▶ 실행")), "지시가 실행 시작보다 먼저");
    assert.equal(mine.filter((l) => l.includes("→ 파일 읽기")).length, 1, "같은 도구 호출은 한 번만");
    assert.ok(mine.some((l) => l.startsWith("ok:") && l.includes("✓ 끝남")));
    assert.ok(mine.some((l) => l.includes("■ 완료")));
    assert.ok(!agentLogs.some((l) => l.includes("토큰1")), "토큰은 찍지 않는다");
    ai.dispose();
  });

  it("선택이 없으면 기준점 세션을 만들지 않는다 (호출자가 메인으로 보낸다)", () => {
    const { ai, rt } = setup();
    rt.openVaultFile(DOC_A, "current");
    rt.vdocUiBridge.getState().setSelection(DOC_A, [], null);
    rt.vdocUiBridge.getState().selectSlot(DOC_A, null);
    assert.equal(ai.sendAnchored("vdoc", "아무거나"), null);
    assert.equal(ai.sendAnchored("outline", "아무거나"), null);
    assert.equal(ai.sessions.list().length, 1, "메인만");
    ai.dispose();
  });
});
