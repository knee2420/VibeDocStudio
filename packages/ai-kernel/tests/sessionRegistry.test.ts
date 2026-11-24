import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ComposerSessionController,
  createAiRuntime,
  SessionRegistry,
  type ComposerPersistence,
  type ComposerSnapshot,
  type SessionAnchor,
  type SessionRegistryMeta,
  type SessionStatusEvent,
} from "../src/index";
import { FakeAssistantServer, settle } from "./fakeAssistantServer";

function setup(options: { maxRuns?: number; maxTabs?: number; maxCompleted?: number; meta?: { value: SessionRegistryMeta | null }; convo?: Map<string, ComposerSnapshot>; server?: FakeAssistantServer; review?: Map<string, number> } = {}) {
  const server = options.server ?? new FakeAssistantServer();
  const runtime = createAiRuntime({ baseUrl: "http://x", fetchFn: server.fetchFn });
  const convo = options.convo ?? new Map<string, ComposerSnapshot>();
  const persistence: ComposerPersistence = {
    load: (k) => convo.get(k) ?? null,
    save: (k, s) => void convo.set(k, s),
    remove: (k) => void convo.delete(k),
  };
  const main = new ComposerSessionController(runtime);
  main.setPersistence(persistence);
  main.bindConversation("v:workspace");
  const meta = options.meta ?? { value: null };
  const completed: Array<{ key: string; discard: boolean }> = [];
  const review = options.review ?? new Map<string, number>();
  let n = 0;
  const registry = new SessionRegistry({
    main,
    mainKey: "v:workspace",
    createController: () => {
      const c = new ComposerSessionController(runtime);
      c.setPersistence(persistence);
      return c;
    },
    metaStore: { load: () => meta.value, save: (m) => void (meta.value = JSON.parse(JSON.stringify(m))) },
    maxConcurrentRuns: options.maxRuns ?? 2,
    maxOpenTabs: options.maxTabs ?? 8,
    maxCompleted: options.maxCompleted ?? 50,
    pendingReviewCount: (k) => review.get(k) ?? 0,
    onComplete: (e, o) => void completed.push({ key: e.key, discard: o.discardStaged }),
    removeConversation: (k) => void convo.delete(k),
    newKey: () => `k${++n}`,
  });
  const events: SessionStatusEvent[] = [];
  registry.onStatus((e) => events.push(e));
  return { server, runtime, registry, main, meta, convo, completed, events, review };
}

const anchor = (ids: string[], path = "plan.outline"): SessionAnchor => ({ surface: "outline", path, itemIds: ids, label: `plan · ${ids.length}` });

describe("SessionRegistry — 동시 실행 · 대기열", () => {
  it("상한을 넘는 기준점 세션은 대기열에 두고, 끝나는 대로 먼저 온 순서로 보낸다", async () => {
    const { server, registry } = setup({ maxRuns: 2 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    const c = registry.createAnchored({ anchor: anchor(["n3"]), instruction: "C", contexts: [] });
    const d = registry.createAnchored({ anchor: anchor(["n4"]), instruction: "D", contexts: [] });
    await server.waitForTurns(2);
    await settle();
    assert.equal(server.turns.length, 2, "실행 슬롯은 2개");
    assert.equal(registry.status(a.key), "running");
    assert.equal(registry.status(b.key), "running");
    assert.equal(registry.status(c.key), "queued");
    assert.equal(registry.status(d.key), "queued");
    assert.deepEqual(registry.queuedKeys(), [c.key, d.key]);

    server.turns[1].finish({ text: "B 끝" });
    await server.waitForTurns(3);
    await settle();
    assert.equal(registry.status(b.key), "idle");
    assert.equal(registry.status(c.key), "running", "C 가 먼저 (FIFO)");
    assert.equal(registry.status(d.key), "queued");
    assert.match(String((server.turns[2].body as { text: string }).text), /C$/);

    server.turns[0].finish();
    server.turns[2].finish();
    await server.waitForTurns(4);
    await settle();
    assert.equal(registry.status(d.key), "running");
    server.turns[3].finish();
    await settle(10);
    assert.equal(registry.runningCount(), 0);
    assert.deepEqual(registry.queuedKeys(), []);
  });

  it("메인은 대기열을 거치지 않는다 (지금 동작 그대로)", async () => {
    const { server, registry, main } = setup({ maxRuns: 1 });
    registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    await server.waitForTurns(1);
    void main.send("메인 질문");
    await server.waitForTurns(2);
    assert.equal(server.turns.length, 2);
    assert.equal(main.getState().status === "idle", false);
    server.turns.forEach((t) => t.finish());
    await settle(10);
  });

  it("같은 세션에 이어 보내면 슬롯을 새로 쓰지 않고 그 세션 대기열로 간다", async () => {
    const { server, registry } = setup({ maxRuns: 1 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    await server.waitForTurns(1);
    registry.dispatch(a.key, "A2");
    assert.equal(registry.controller(a.key).getState().queue.length, 1);
    assert.deepEqual(registry.queuedKeys(), []);
    server.turns[0].finish();
    await server.waitForTurns(2);
    server.turns[1].finish();
    await settle(10);
    assert.equal(registry.status(a.key), "idle");
  });

  it("승인 대기는 실행 슬롯을 쓰지 않는다 — 자리를 비워도 다른 작업이 돈다", async () => {
    const { server, runtime, registry } = setup({ maxRuns: 1 });
    runtime.tools.register({ name: "doc.write", description: "쓰기", risk: "write", inputSchema: {}, run: () => ({ ok: true }) });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    await server.waitForTurns(1);
    assert.equal(registry.status(b.key), "queued");
    server.turns[0].finish({ toolCall: { id: "c1", name: "doc.write" } });
    await server.waitForTurns(2);
    await settle();
    assert.equal(registry.status(a.key), "awaiting_approval");
    assert.equal(registry.status(b.key), "running", "A 가 승인을 기다리는 동안 B 가 시작");
    registry.controller(a.key).approve("c1");
    await server.waitForTurns(3);
    server.turns[1].finish();
    server.turns[2].finish();
    await settle(10);
    assert.equal(registry.status(a.key), "idle");
    assert.equal(registry.status(b.key), "idle");
  });

  it("대기 중인 세션을 멈추면 대기열에서 빠지고 서버 요청은 가지 않는다", async () => {
    const { server, registry } = setup({ maxRuns: 1 });
    registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    await server.waitForTurns(1);
    registry.stop(b.key);
    assert.equal(registry.status(b.key), "idle");
    server.turns[0].finish();
    await settle(10);
    assert.equal(server.turns.length, 1);
  });

  it("기준점 세션은 retain · label 로 서버 세션을 만든다", async () => {
    const { server, registry } = setup();
    registry.createAnchored({ anchor: anchor(["n1"]), instruction: "근거 자료 조사", contexts: [] });
    await server.waitForTurns(1);
    assert.equal(server.created[0].retain, true);
    assert.equal(server.created[0].label, "근거 자료 조사");
    server.turns[0].finish();
    await settle(10);
  });
});

describe("SessionRegistry — 상태 · 알림 · 탭", () => {
  it("뒤에서 끝난 세션은 안 읽음 + 상태 이벤트, 앞 세션은 안 읽음이 생기지 않는다", async () => {
    const { server, registry, events } = setup();
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    registry.setForeground(b.key);
    await server.waitForTurns(2);
    server.turns[0].finish();
    server.turns[1].finish();
    await settle(10);
    assert.equal(registry.view(a.key)?.unread, true);
    assert.equal(registry.view(b.key)?.unread, false);
    const finished = events.filter((e) => e.from === "running" && e.to === "idle").map((e) => e.key).sort();
    assert.deepEqual(finished, [a.key, b.key].sort());
    assert.equal(events.find((e) => e.key === b.key && e.to === "idle")?.foreground, true);
    registry.setForeground(a.key);
    assert.equal(registry.view(a.key)?.unread, false);
  });

  it("오류로 끝나면 error, 변경안이 남으면 needs_review", async () => {
    const review = new Map<string, number>();
    const { server, registry } = setup({ review });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    await server.waitForTurns(2);
    server.turns[0].fail("엔진 실패");
    server.turns[1].finish();
    await settle(10);
    assert.equal(registry.status(a.key), "error");
    review.set(b.key, 2);
    registry.refresh();
    assert.equal(registry.status(b.key), "needs_review");
    assert.equal(registry.view(b.key)?.reviewCount, 2);
  });

  it("토큰이 흐르는 동안에는 목록 참조가 바뀌지 않는다 (화면이 토큰마다 다시 그리지 않게)", async () => {
    const { server, registry } = setup();
    registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    await server.waitForTurns(1);
    await settle();
    const before = registry.list();
    let notified = 0;
    registry.subscribe(() => notified++);
    // 같은 상태에서 본문만 바뀌는 갱신
    const c = registry.controller(registry.list()[1].key);
    c.setDraft("초안");
    c.setDraft("초안2");
    assert.equal(registry.list(), before);
    assert.equal(notified, 0);
    server.turns[0].finish();
    await settle(10);
  });

  it("서버 세션 id 로 세션을 찾는다 (도구 호출 → 기준점)", async () => {
    const { server, registry } = setup();
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    await server.waitForTurns(1);
    const sid = registry.controller(a.key).getState().sessionId;
    assert.ok(sid);
    assert.equal(registry.byServerSessionId(sid)?.key, a.key);
    assert.equal(registry.byServerSessionId("nope"), null);
    server.turns[0].finish();
    await settle(10);
  });

  it("탭: 열기 · 직전 탭 · 닫기(세션은 유지) · 상한 넘치면 오래 안 본 탭부터", () => {
    const { registry } = setup({ maxTabs: 3, maxRuns: 0 });
    const keys = [1, 2, 3].map((i) => registry.createAnchored({ anchor: anchor([`n${i}`]), instruction: `T${i}`, contexts: [] }).key);
    assert.deepEqual(registry.openTabs(), [registry.mainKey], "만든다고 탭이 열리지 않는다 (포커스 유지)");
    registry.setForeground(keys[0]);
    registry.setForeground(keys[1]);
    assert.equal(registry.foreground(), keys[1]);
    registry.back();
    assert.equal(registry.foreground(), keys[0]);
    registry.back();
    assert.equal(registry.foreground(), keys[1]);
    registry.setForeground(keys[2]);
    assert.equal(registry.openTabs().length, 3);
    assert.ok(registry.openTabs().includes(registry.mainKey), "메인 탭은 밀려나지 않는다");
    assert.ok(!registry.openTabs().includes(keys[0]), "가장 오래 안 본 탭이 밀려난다");
    registry.closeTab(keys[2]);
    assert.equal(registry.foreground(), keys[1]);
    assert.ok(registry.get(keys[2]), "탭을 닫아도 세션은 남는다");
    registry.closeTab(registry.mainKey);
    assert.ok(registry.openTabs().includes(registry.mainKey), "메인 탭은 닫히지 않는다");
  });

  it("탭 상태는 바뀔 때만 새 객체이고 구독자에게 알린다 (탭 줄이 다시 그린다)", () => {
    const { registry } = setup({ maxRuns: 1 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const s0 = registry.getTabState();
    assert.equal(registry.getTabState(), s0, "그대로면 같은 객체");
    let notified = 0;
    registry.subscribe(() => notified++);
    registry.setForeground(a.key);
    const s1 = registry.getTabState();
    assert.notEqual(s1, s0);
    assert.deepEqual([...s1.tabs], [registry.mainKey, a.key]);
    assert.equal(s1.foreground, a.key);
    assert.equal(s1.canGoBack, true);
    assert.ok(notified > 0);
    registry.back();
    assert.equal(registry.getTabState().foreground, registry.mainKey);
    registry.closeTab(a.key);
    assert.deepEqual([...registry.getTabState().tabs], [registry.mainKey]);
    assert.equal(registry.getTabState().canGoBack, false);
  });

  it("뒤 세션의 화면 조작 힌트는 쌓였다가 꺼내면 비워진다", () => {
    const { registry } = setup({ maxRuns: 0 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    registry.addRevealHint(a.key, { tool: "canvas.select", args: { slotIds: ["s1"] } });
    assert.equal(registry.view(a.key)?.revealHints.length, 1);
    assert.deepEqual(registry.takeRevealHints(a.key).map((h) => h.tool), ["canvas.select"]);
    assert.equal(registry.view(a.key)?.revealHints.length, 0);
  });

  it("같은 항목을 가리키는 세션을 찾는다", () => {
    const { registry } = setup({ maxRuns: 0 });
    const a = registry.createAnchored({ anchor: anchor(["n1", "n2"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2", "n3"]), instruction: "B", contexts: [] });
    registry.createAnchored({ anchor: anchor(["n2"], "other.outline"), instruction: "C", contexts: [] });
    assert.deepEqual(registry.findByItems("outline", "plan.outline", ["n2"]).map((v) => v.key), [a.key, b.key]);
    assert.deepEqual(registry.findByItems("outline", "plan.outline", ["n1"]).map((v) => v.key), [a.key]);
  });
});

describe("SessionRegistry — 완료 · 저장 · 페이지 떠나기", () => {
  it("완료: 실행을 멈추고 서버 세션을 닫고 탭을 닫는다. 기록은 남고 다시 열 수 있다", async () => {
    const { server, registry, completed, convo } = setup({ maxRuns: 1 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    registry.setForeground(a.key);
    await server.waitForTurns(1);
    const sid = registry.controller(a.key).getState().sessionId!;
    await registry.complete(a.key, { discardStaged: true });
    assert.equal(registry.status(a.key), "completed");
    assert.ok(!registry.openTabs().includes(a.key));
    assert.equal(registry.foreground(), registry.mainKey);
    assert.ok(server.closed.includes(sid), "서버 세션을 닫았다");
    assert.ok(server.turns[0].aborted, "실행 중이던 턴을 끊었다");
    assert.deepEqual(completed, [{ key: a.key, discard: true }]);
    assert.ok(convo.get(a.key)?.items.some((i) => i.kind === "user"), "대화 기록은 남는다");
    await server.waitForTurns(2);
    assert.equal(registry.status(b.key), "running", "완료로 난 슬롯에 대기 세션이 들어간다");
    assert.throws(() => registry.dispatch(a.key, "더"), /완료된 세션/);
    registry.reopen(a.key);
    assert.equal(registry.view(a.key)?.lifecycle, "active");
    assert.equal(registry.foreground(), a.key);
    server.turns[1].finish();
    await settle(10);
  });

  it("대기 중인 세션을 완료하면 서버 요청 없이 끝난다", async () => {
    const { server, registry } = setup({ maxRuns: 1 });
    registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    await server.waitForTurns(1);
    await registry.complete(b.key);
    server.turns[0].finish();
    await settle(10);
    assert.equal(server.turns.length, 1);
    assert.equal(registry.status(b.key), "completed");
  });

  it("메인은 완료할 수 없다", async () => {
    const { registry } = setup();
    await assert.rejects(registry.complete(registry.mainKey), /메인/);
  });

  it("완료 이력은 상한을 넘으면 오래된 것부터 지운다 (대화 기록도)", async () => {
    const { registry, convo } = setup({ maxRuns: 0, maxCompleted: 1 });
    const a = registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    await registry.complete(a.key);
    await new Promise((r) => setTimeout(r, 5));
    await registry.complete(b.key);
    assert.equal(registry.get(a.key), null);
    assert.ok(registry.get(b.key));
    assert.equal(convo.has(a.key), false);
  });

  it("새로고침: 세션 목록 · 탭을 되살리고, 실행 중이던 세션은 interrupted — 다시 보내면 같은 서버 세션으로 잇는다", async () => {
    const meta = { value: null as SessionRegistryMeta | null };
    const convo = new Map<string, ComposerSnapshot>();
    const first = setup({ meta, convo, maxRuns: 2 });
    const a = first.registry.createAnchored({ anchor: anchor(["n1"]), instruction: "A", contexts: [] });
    const b = first.registry.createAnchored({ anchor: anchor(["n2"]), instruction: "B", contexts: [] });
    first.registry.setForeground(b.key);
    await first.server.waitForTurns(2);
    first.server.turns[1].finish();
    await settle(10);
    const sidA = first.registry.controller(a.key).getState().sessionId;
    first.registry.pageExit();
    await settle(10);
    assert.ok(first.server.turns[0].aborted, "떠날 때 실행을 끊는다");
    assert.ok(!first.server.closed.includes(sidA!), "기준점 세션의 서버 세션은 닫지 않는다");
    assert.deepEqual(meta.value?.running, [a.key]);
    first.registry.dispose();

    const second = setup({ meta, convo, maxRuns: 2, server: first.server });
    assert.equal(second.registry.status(a.key), "interrupted");
    assert.equal(second.registry.status(b.key), "idle");
    assert.deepEqual([...second.registry.openTabs()], [second.registry.mainKey, b.key]);
    assert.equal(second.registry.foreground(), b.key);
    second.registry.dispatch(a.key, "이어서");
    await first.server.waitForTurns(3);
    assert.equal(first.server.turns[2].sessionId, sidA, "같은 서버 세션을 잇는다");
    first.server.turns[2].finish();
    await settle(10);
    assert.equal(second.registry.status(a.key), "idle");
  });

  it("서버에서 세션이 사라졌으면 요약을 붙여 새 세션으로 잇는다", async () => {
    const meta = { value: null as SessionRegistryMeta | null };
    const convo = new Map<string, ComposerSnapshot>();
    const first = setup({ meta, convo });
    const a = first.registry.createAnchored({ anchor: anchor(["n1"]), instruction: "첫 지시", contexts: [] });
    await first.server.waitForTurns(1);
    first.server.turns[0].finish({ text: "첫 답" });
    await settle(10);
    const sidA = first.registry.controller(a.key).getState().sessionId!;
    first.registry.dispose();
    first.server.expired.add(sidA);
    const second = setup({ meta, convo, server: first.server });
    second.registry.dispatch(a.key, "두 번째");
    await first.server.waitForTurns(2);
    const retry = first.server.turns[1];
    assert.notEqual(retry.sessionId, sidA);
    assert.match(String((retry.body as { text: string }).text), /첫 지시/);
    retry.finish();
    await settle(10);
  });
});
