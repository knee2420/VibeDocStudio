/**
 * v2 AI Composer 이식 계약 (docs/specs/v2-composer-port-testcases.md §3.2 UF1–UF9).
 * studio 의 Composer 동작이 명세 — 바뀐 것은 문서 = 볼트 파일, 리소스 = 볼트 · 외부 폴더, 레퍼런스 = `.ref` 뿐이다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { createEmptyRefDocument, serializeRefJson } from "@vibe/ref-canvas/core";
import { getBlockSlotIds, type VDocDocument } from "@vibe/vdoc-schema";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { parseVDocJson, serializeVDocJson } from "@vibe/vault-formats";
import { createV2AiWorkspace, type V2AiWorkspace } from "@vibe/ai-vault";

const DOC = "01. Architecture/00. System-Proposal.vdoc";
const CTX: ToolRunContext = { callId: "c1", sessionId: null, signal: new AbortController().signal };

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

function setup(opts: { storage?: Storage } = {}) {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const opened: Array<{ path: string; mode?: string }> = [];
  const logs: string[] = [];
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (path, mode) => {
      opened.push({ path, mode });
      rt.openVaultFile(path, mode ?? "current");
    },
    getTextSelection: () => null,
    pushLog: (_l, m) => logs.push(m),
    storage: opts.storage ?? null,
    fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  });
  ai.start();
  return { rt, ai, opened, logs };
}

const doc = (rt: ReturnType<typeof setup>["rt"], path = DOC): VDocDocument => parseVDocJson(rt.vault.read(path), "x");
const tool = (ai: V2AiWorkspace, name: string): WorkspaceTool<any> => {
  const t = ai.runtime.tools.get(name);
  assert.ok(t, `도구 ${name} 이 등록돼야 한다`);
  return t!;
};
const provider = (ai: V2AiWorkspace, id: string) => ai.runtime.contexts.list().find((p) => p.id === id)!;
const slotsOfPage = (d: VDocDocument, index: number) => (d.pages[index]?.blocks ?? []).flatMap((b) => getBlockSlotIds(b)).filter((id) => d.slots[id] && !d.slots[id].constraints?.locked);
const blockCount = (d: VDocDocument) => d.pages.reduce((n, p) => n + p.blocks.length, 0);

function addRef(rt: ReturnType<typeof setup>["rt"], path: string, title: string, serverRefId?: string) {
  const base = createEmptyRefDocument(title);
  const ref = {
    ...base,
    source: { ...base.source, ...(serverRefId ? { serverRefId } : {}) },
    blocks: [{ id: "b1", frameIndex: 1, kind: "paragraph", text: "참고 문단 하나", bbox: null }],
  };
  rt.vault.createFile(path, serializeRefJson(ref as typeof base));
}

describe("v2 AI Composer — 변경된 스펙(볼트 모델) 계약", () => {
  it("UF1 작업대: 볼트 id · 문서 경로 · 형제 문서 경로 · 범위 · 선택 · 라이브러리 레퍼런스", () => {
    const { rt, ai } = setup();
    const d = doc(rt);
    const slotId = slotsOfPage(d, 0)[0];
    rt.vdocUiBridge.getState().selectSlot(DOC, slotId, null, d.pages[0].pageId);
    addRef(rt, "00. References/RFP.ref", "제안요청서", "ref-lib-1");
    addRef(rt, "00. References/local.ref", "로컬 메모");
    ai.store.getState().toggleReference("00. References/RFP.ref", true);
    ai.store.getState().toggleReference("00. References/local.ref", true);

    const [wb] = provider(ai, "workbench").current!();
    const payload = JSON.parse(wb.content!);
    assert.equal(payload.vaultId, rt.vault.id);
    assert.equal(payload.docVaultPath, DOC);
    assert.equal(payload.docId, d.docId);
    assert.ok(payload.projectDocs.some((p: { vaultPath: string }) => p.vaultPath === DOC));
    assert.ok(payload.projectDocs.every((p: { vaultPath: string }) => p.vaultPath.startsWith("01. Architecture/")));
    assert.deepEqual(payload.selection, [slotId]);
    assert.equal(payload.scope.mode, "page");
    // 서버가 읽을 수 있는 것은 라이브러리에 이어진 레퍼런스뿐
    assert.deepEqual(payload.references.map((r: { refId: string }) => r.refId), ["ref-lib-1"]);
    ai.dispose();
  });

  it("UF2 리소스: 볼트 폴더 → 절대 경로 루트, 외부 폴더 그대로, 끄면 첨부 없음", () => {
    const { ai } = setup();
    assert.deepEqual(provider(ai, "resources").current!(), []);
    ai.store.getState().toggleResourceFolder("01. Architecture", true);
    ai.store.getState().addExternalFolder("C:\\자료\\프로젝트\\");
    const [mount] = provider(ai, "resources").current!();
    assert.equal(mount.kind, "resource-mount");
    const body = JSON.parse(mount.content!);
    assert.deepEqual(body.roots.map((r: { path: string }) => r.path), ["C:/vaults/demo/01. Architecture", "C:\\자료\\프로젝트"]);
    assert.ok(body.roots.every((r: { kind: string }) => r.kind === "dir"));
    ai.store.getState().setSourcesOn(false);
    assert.deepEqual(provider(ai, "resources").current!(), []);
    ai.dispose();
  });

  it("UF3 레퍼런스: 라이브러리 연결은 ref:<id> + wb_read 안내, 볼트 전용은 본문을 싣는다", () => {
    const { rt, ai } = setup();
    addRef(rt, "00. References/RFP.ref", "제안요청서", "ref-lib-1");
    addRef(rt, "00. References/local.ref", "로컬 메모");
    ai.store.getState().toggleReference("00. References/RFP.ref", true);
    const refs = provider(ai, "references").current!();
    assert.equal(refs.length, 1);
    assert.equal(refs[0].id, "ref:ref-lib-1");
    assert.match(refs[0].content!, /wb_read\(ref:ref-lib-1/);
    assert.match(refs[0].content!, /수치는 내 문서로 가져오지 않는다/);
    const local = provider(ai, "references").search!("로컬")[0];
    assert.match(local.content!, /참고 문단 하나/);
    ai.dispose();
  });

  it("UF4 · UF5 변경안: 제출하면 파일은 그대로, 승인하면 그 칸만 바뀌고 구조는 그대로", async () => {
    const { rt, ai } = setup();
    const before = rt.vault.read(DOC);
    const d = doc(rt);
    const [a, b] = slotsOfPage(d, 0);
    const res = (await tool(ai, "slots.proposeBatch").run(
      { changes: [{ slotId: a, html: "<p>AI 가 채운 내용</p>" }, { slotId: b, html: d.slots[b].content }], reason: "테스트" },
      CTX
    )) as { staged: number; skipped: Array<{ why: string }> };
    assert.equal(res.staged, 1);
    assert.equal(res.skipped[0].why, "변경 없음");
    assert.equal(rt.vault.read(DOC), before, "승인 전에는 볼트 파일이 그대로여야 한다");
    const queue = ai.store.getState().queue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].path, DOC);

    const { applied } = ai.approve([queue[0].diffId]);
    assert.equal(applied, 1);
    const after = doc(rt);
    assert.equal(after.slots[a].content, "<p>AI 가 채운 내용</p>");
    assert.equal(after.slots[a].fill?.author, "ai");
    assert.equal(after.slots[b].content, d.slots[b].content);
    assert.equal(after.pages.length, d.pages.length);
    assert.equal(blockCount(after), blockCount(d));
    assert.equal(ai.store.getState().queue.length, 0);
    ai.dispose();
  });

  it("UF6 잠긴 칸 · 범위 밖 칸은 거부한다 (이번 메시지 범위 = 이 페이지)", async () => {
    const { rt, ai } = setup();
    const d = doc(rt);
    assert.ok(d.pages.length >= 2, "샘플 문서는 2쪽 이상");
    // 잠긴 칸
    const lockedId = slotsOfPage(d, 0)[0];
    const locked = { ...d, slots: { ...d.slots, [lockedId]: { ...d.slots[lockedId], constraints: { ...(d.slots[lockedId].constraints ?? {}), locked: true } } } };
    rt.vault.write(DOC, serializeVDocJson(locked));
    await assert.rejects(async () => tool(ai, "slot.proposeContent").run({ slotId: lockedId, html: "<p>x</p>" }, CTX), /잠긴 슬롯/);
    rt.vault.write(DOC, serializeVDocJson(d));

    // 범위: 1쪽 → 2쪽 칸 변경안 거부
    ai.store.getState().setScopeMode(DOC, "page");
    rt.vdocUiBridge.getState().setActivePage(DOC, d.pages[0].pageId);
    const sent = ai.scopeForSend("다듬어줘", ai.runtime.contexts.autoContexts());
    const scopeRef = sent.find((c) => c.kind === "scope");
    assert.ok(scopeRef && /이 페이지/.test(scopeRef.label));
    const page2Slot = slotsOfPage(d, 1)[0];
    await assert.rejects(async () => tool(ai, "slot.proposeContent").run({ slotId: page2Slot, html: "<p>밖</p>" }, CTX), /범위 밖/);
    const mixed = (await tool(ai, "slots.proposeBatch").run(
      { changes: [{ slotId: slotsOfPage(d, 0)[1], html: "<p>안</p>" }, { slotId: page2Slot, html: "<p>밖</p>" }] },
      CTX
    )) as { staged: number; skipped: Array<{ slotId: string; why: string }> };
    assert.equal(mixed.staged, 1);
    assert.ok(mixed.skipped.some((s) => s.slotId === page2Slot && s.why === "범위 밖"));

    // 범위 끔: 문서 도구 전부 거부
    ai.store.getState().setScopeOn(false);
    ai.scopeForSend("요약", ai.runtime.contexts.autoContexts());
    await assert.rejects(async () => tool(ai, "slot.proposeContent").run({ slotId: slotsOfPage(d, 0)[1], html: "<p>x</p>" }, CTX), /꺼져|범위 밖/);
    ai.dispose();
  });

  it("UF7 읽기 도구: 개요 · 칸 · 상태 목록이 볼트 문서 기준", async () => {
    const { rt, ai } = setup();
    const d = doc(rt);
    const outline = (await tool(ai, "document.getOutline").run({}, CTX)) as string;
    assert.match(outline, new RegExp(d.docId));
    assert.match(outline, /01\. Architecture\/00\. System-Proposal\.vdoc/);
    const sid = slotsOfPage(d, 0)[0];
    const slot = (await tool(ai, "slot.read").run({ slotId: sid }, CTX)) as { slotId: string; html: string };
    assert.equal(slot.slotId, sid);
    assert.equal(slot.html, d.slots[sid].content);
    const list = (await tool(ai, "slots.listByState").run({ scope: "document" }, CTX)) as { count: number };
    assert.ok(list.count > 0);
    const state = (await tool(ai, "workspace.getState").run({}, CTX)) as { document: { vaultPath: string } };
    assert.equal(state.document.vaultPath, DOC);
    ai.dispose();
  });

  it("UF8 에이전트 초안: dc_new 결과의 볼트 경로를 탭으로 열고 [AI] 배지를 단다", () => {
    const { rt, ai, opened } = setup();
    const draft = "01. Architecture/입찰 공고서.vdoc";
    rt.vault.createFile(draft, serializeVDocJson({ ...doc(rt), docId: "vdoc-draft", title: "입찰 공고서", origin: { createdBy: "agent" } } as VDocDocument));
    (ai.controller as unknown as { set(p: object): void }).set({
      items: [{ kind: "agent_tool", id: "t1", name: "mcp_vibefs_dc_new", state: "done", params: {}, output: `[초안] vdoc-draft\n볼트 파일: vault://${draft}` }],
    });
    assert.deepEqual(opened.at(-1), { path: draft, mode: "new-tab" });
    assert.equal(rt.layout.getState().getActiveTab()?.resourceId, draft);
    assert.equal(ai.env.activeDocPath(), draft);
    ai.dispose();
  });

  it("UF12 wb_propose 개편안(서버 이벤트)이 그 볼트 문서의 변경안 대기열로 들어간다", () => {
    const { rt, ai } = setup();
    const d = doc(rt);
    const [a, b] = slotsOfPage(d, 0);
    const before = rt.vault.read(DOC);
    const event = {
      type: "workbench_proposals",
      proposals: [{ proposalId: "p1", docId: d.docId, target: "page:page-1", mode: "fill", summary: "개요 다듬기", candidates: [{ slots: { [a]: "<p>새 요약</p>", [b]: d.slots[b].content } }] }],
    };
    // 스트림 대역: 컨트롤러의 서버 이벤트 구독자에게 직접 흘린다
    const listeners = (ai.controller as unknown as { serverListeners: Map<string, Set<(e: object) => void>> }).serverListeners;
    listeners.get("workbench_proposals")?.forEach((fn) => fn(event));
    const queue = ai.store.getState().queue;
    assert.equal(queue.length, 1, "바뀐 칸 하나만 변경안이 된다");
    assert.equal(queue[0].path, DOC);
    assert.equal(queue[0].targetId, a);
    assert.equal(rt.vault.read(DOC), before, "승인 전 볼트 파일은 그대로");
    ai.dispose();
  });

  it("UF11 변경안 대기열은 새로고침(새 런타임)에도 남는다", async () => {
    const storage = new MemoryStorage();
    const first = setup({ storage });
    const sid = slotsOfPage(doc(first.rt), 0)[0];
    await tool(first.ai, "slot.proposeContent").run({ slotId: sid, html: "<p>남아야 하는 변경안</p>" }, CTX);
    first.ai.dispose();
    const second = setup({ storage });
    const queue = second.ai.store.getState().queue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].path, DOC);
    second.ai.dispose();
  });

  it("UF10 React StrictMode 의 정리 → 재마운트 뒤에도 도구 · 제공자가 한 벌만 남는다", () => {
    const { ai } = setup();
    const stop = ai.start(); // 두 번째 start 는 아무것도 더 걸지 않는다
    const tools = ai.runtime.tools.list().length;
    stop();
    assert.equal(ai.runtime.tools.list().length, 0);
    assert.equal(ai.runtime.contexts.list().length, 0);
    ai.start();
    assert.equal(ai.runtime.tools.list().length, tools);
    assert.ok(ai.runtime.contexts.autoContexts().some((c) => c.kind === "workbench"), "재마운트 뒤 작업대 첨부가 다시 붙어야 한다");
    ai.dispose();
  });

  it("UF8b ACP 가 도구 결과를 비워 보내도 dc_build 의 doc 인자(docId)로 초안 파일을 찾아 연다", async () => {
    const { rt, ai, opened } = setup();
    const draft = "01. Architecture/공고서 초안.vdoc";
    rt.vault.createFile(draft, serializeVDocJson({ ...doc(rt), docId: "vdoc-draft-2", title: "공고서 초안", origin: { createdBy: "agent" } } as VDocDocument));
    (ai.controller as unknown as { set(p: object): void }).set({
      items: [{ kind: "agent_tool", id: "t2", name: "mcp_vibefs_8da9db59_dc_build", state: "done", params: { doc: "vdoc-draft-2" }, output: "" }],
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(opened.at(-1)?.path, draft);
    assert.equal(ai.env.activeDocPath(), draft);
    ai.dispose();
  });

  it("UF13 리서치: 볼트 사진 주소를 캔버스가 원본으로 풀고, 저장 폴더 · 새 .ref 를 자동으로 켜며, RO 를 작업대에 싣는다", async () => {
    const { rt, ai } = setup();
    // 1) resource:vault:<경로> → 볼트 원본 주소 (다른 주소는 기본 규칙)
    const { resolveMediaSrc } = await import("@vibe/slot-canvas");
    assert.match(resolveMediaSrc("resource:vault:여행/도쿄/사진/a.jpg"), /\/api\/vaults\/.+\/raw\?path=%EC%97%AC%ED%96%89/);
    assert.equal(resolveMediaSrc("https://x/y.jpg"), "https://x/y.jpg");
    // 2) rs_image_save → 그 폴더를 리소스로 켠다
    const set = (ai.controller as unknown as { set(p: object): void }).set.bind(ai.controller);
    set({ items: [{ kind: "agent_tool", id: "r1", name: "mcp_vibefs_ab12_rs_image_save", state: "done", params: { folder: "여행/도쿄/사진", items: [] }, output: "" }] });
    assert.deepEqual(ai.store.getState().resourceFolders, ["여행/도쿄/사진"]);
    // 3) rs_ref_import → 그 폴더의 새 .ref 를 레퍼런스로 켠다
    addRef(rt, "여행/도쿄/레퍼런스/후기.ref", "도쿄 후기", "ref-lib-9");
    set({ items: [...ai.controller.getState().items, { kind: "agent_tool", id: "r2", name: "mcp_vibefs_ab12_rs_ref_import", state: "done", params: { url: "https://x", folder: "여행/도쿄/레퍼런스" }, output: "" }] });
    assert.deepEqual(ai.store.getState().referencePaths, ["여행/도쿄/레퍼런스/후기.ref"]);
    // 4) 화면 RO → 작업대 readOnly
    rt.vault.setReadOnly?.(true);
    const wb = JSON.parse(provider(ai, "workbench").current!()[0].content!);
    assert.equal(wb.readOnly, Boolean(rt.vault.isReadOnly?.()));
    ai.dispose();
    assert.equal(resolveMediaSrc("resource:vault:a.jpg").includes("/api/vaults/"), false, "정리하면 해석기를 뗀다");
  });

  it("UF9 대화 키는 볼트 단위 고정 — 좌측 탐색기/탭으로 파일을 바꿔도 AI Composer 대화는 초기화·전환되지 않고 유지된다", () => {
    const storage = new MemoryStorage();
    const { rt, ai } = setup({ storage });
    const key = (ai.controller as unknown as { conversationKey: string | null }).conversationKey;
    assert.equal(key, `${rt.vault.id}:workspace`);
    const ctl = ai.controller as unknown as { set(p: object): void; flushSave(): void };
    ctl.set({ items: [{ kind: "user", id: "u1", text: "첫 질문", contexts: [] }] });
    ctl.flushSave();
    const other = "01. Architecture/other.vdoc";
    rt.vault.createFile(other, serializeVDocJson({ ...doc(rt), docId: "vdoc-other", title: "다른 문서" }));
    rt.openVaultFile(other, "new-tab");
    assert.equal((ai.controller as unknown as { conversationKey: string }).conversationKey, `${rt.vault.id}:workspace`);
    assert.equal(ai.controller.getState().items.length, 1, "다른 .vdoc 을 열어도 대화가 유지되어야 한다");
    rt.openVaultFile(DOC, "current");
    assert.equal(ai.controller.getState().items.length, 1);
    ai.dispose();
  });
});
