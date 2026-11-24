import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { createVDocUiBridgeStore } from "@vibe/canvas-state";
import { MemoryVaultAdapter } from "@vibe/vault-core";
import { createDefaultVDoc, createVDocStore, serializeVDocJson } from "@vibe/vault-formats";
import { insertBlock, type LayoutBlock, type VDocDocument } from "@vibe/vdoc-schema";

import { createV2AiStore, createV2ContextProviders, createV2Tools, workbenchPayload, type V2AiEnv, type V2ToolHost } from "../src/index";

const PATH = "a/doc.vdoc";

function setup() {
  let doc: VDocDocument = createDefaultVDoc("Doc", "a4");
  const pageId = doc.pages[0].pageId;
  doc = { ...doc, pages: doc.pages.map((p) => ({ ...p, blocks: [] })) };
  for (const i of [1, 2, 3]) {
    const block = { blockId: `b${i}`, kind: "callout-box", title: `B${i}`, slotId: `s${i}`, tone: "info" } as unknown as LayoutBlock;
    doc = insertBlock(doc, pageId, block, { [`s${i}`]: { slotId: `s${i}`, label: `칸${i}`, role: "editable-slot", content: `<p>${i}</p>`, backDataRefs: [] } }, i - 1);
  }
  const vault = new MemoryVaultAdapter();
  vault.createFolder("a");
  vault.createFile(PATH, serializeVDocJson(doc));
  const bridge = createVDocUiBridgeStore();
  const env: V2AiEnv = {
    vault,
    vaultId: "v",
    vaultRootPath: null,
    vdocUiBridge: bridge,
    store: createV2AiStore("v", null),
    activeDocPath: () => PATH,
    activeTabPath: () => PATH,
    textSelection: () => null,
    explorerSelection: () => [],
    docs: createVDocStore(vault),
  };
  const revealed: string[][] = [];
  const host: V2ToolHost = {
    controller: { getState: () => ({ items: [], sessionId: null }) } as unknown as V2ToolHost["controller"],
    revealSlot: () => undefined,
    revealSelection: (path, items) => {
      bridge.getState().setSelection(path, items);
      revealed.push(items.map((i) => i.id));
    },
    openPath: () => undefined,
    showExplorer: () => undefined,
  };
  return { env, bridge, host, revealed, pageId };
}

const run = async (tools: WorkspaceTool<any>[], name: string, args: unknown) => {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `도구 없음: ${name}`);
  return tool.run(args, { callId: "t" } as ToolRunContext);
};

describe("@vibe/ai-vault — 다중 선택 연계", () => {
  it("캔버스에서 여러 개를 고르면 '현재 선택' 첨부가 slot-range 하나로", () => {
    const { env, bridge } = setup();
    bridge.getState().setSelection(PATH, [
      { id: "b1", kind: "block", blockId: "b1" },
      { id: "s3", kind: "slot", blockId: "b3" },
    ]);
    const sel = createV2ContextProviders(env).find((p) => p.id === "selection");
    const refs = sel?.current?.() ?? [];
    assert.equal(refs.length, 1);
    assert.equal(refs[0].kind, "slot-range");
    assert.deepEqual(refs[0].meta?.unitIds, ["b1", "s3"]);
    assert.deepEqual(refs[0].meta?.slotIds, ["s3"]);
    const wb = workbenchPayload(env) as { selection: string[]; selectionBlocks: string[] };
    assert.deepEqual(wb.selection, ["s3"]);
    assert.deepEqual(wb.selectionBlocks, ["b1"]);
  });

  it("canvas.select: 칸 · 블록 여러 개를 캔버스에 고르고 없는 것은 건너뛴다", async () => {
    const { env, host, bridge, revealed } = setup();
    const tools = createV2Tools(env, host);
    const res = (await run(tools, "canvas.select", { slotIds: ["s1", "nope"], blockIds: ["b2"] })) as { selected: string[]; skipped: { id: string }[] };
    assert.deepEqual(res.selected, ["s1", "b2"]);
    assert.deepEqual(res.skipped.map((s) => s.id), ["nope"]);
    assert.deepEqual(revealed, [["s1", "b2"]]);
    assert.equal(bridge.getState().getForPath(PATH).selection.items.length, 2);
  });

  it("canvas.select: 고를 것이 하나도 없으면 오류", async () => {
    const { env, host } = setup();
    await assert.rejects(() => Promise.resolve(run(createV2Tools(env, host), "canvas.select", { slotIds: ["x"] })));
  });

  it("탐색기에서 여러 파일 고르면 첨부 후보", () => {
    const { env } = setup();
    env.vault.createFile("a/note.md", "# n");
    const e2: V2AiEnv = { ...env, explorerSelection: () => [PATH, "a/note.md"] };
    const refs = createV2ContextProviders(e2).find((p) => p.id === "explorer-selection")?.current?.() ?? [];
    assert.equal(refs.length, 2);
  });
});
