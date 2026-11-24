import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDefaultVDoc } from "@vibe/vault-formats";
import { insertBlock, type LayoutBlock, type VDocDocument } from "@vibe/vdoc-schema";

import { canvasSelectedIds, createVDocUiBridgeStore, describeCanvasSelection } from "../src/index";

const P = "a/doc.vdoc";

function docWithBlocks(): VDocDocument {
  let doc = createDefaultVDoc("Doc", "a4");
  const pageId = doc.pages[0].pageId;
  for (const i of [1, 2, 3]) {
    const slotId = `s${i}`;
    const block = { blockId: `b${i}`, kind: "callout-box", title: `B${i}`, slotId, tone: "info" } as unknown as LayoutBlock;
    doc = insertBlock(doc, pageId, block, { [slotId]: { slotId, label: `칸${i}`, role: "editable-slot", content: `<p>본문 ${i}</p>`, backDataRefs: [] } }, doc.pages[0].blocks.length);
  }
  return doc;
}

describe("@vibe/canvas-state", () => {
  it("단일 선택은 예전 값(selectedBlockId · selectedSlotId · selectedSceneNode)을 그대로 낸다", () => {
    const s = createVDocUiBridgeStore();
    s.getState().selectBlock(P, "b1", "p1");
    let ui = s.getState().getForPath(P);
    assert.equal(ui.selectedBlockId, "b1");
    assert.equal(ui.selectedSlotId, null);
    assert.deepEqual(ui.selectedSceneNode, { id: "b1", role: "block" });
    assert.equal(ui.activePageId, "p1");
    s.getState().selectSlot(P, "s2", "b2");
    ui = s.getState().getForPath(P);
    assert.equal(ui.selectedBlockId, "b2");
    assert.equal(ui.selectedSlotId, "s2");
    assert.equal(ui.selection.items.length, 1);
  });

  it("보조키 의도로 여러 개 · 주 항목이 마지막으로 고른 것", () => {
    const s = createVDocUiBridgeStore();
    const order = ["b1", "b2", "b3"].map((id) => ({ id, kind: "block" as const, blockId: id, pageId: "p1" }));
    s.getState().selectBlock(P, "b1");
    s.getState().applySelectIntent(P, "toggle", order[2], order);
    assert.deepEqual(canvasSelectedIds(s.getState().getForPath(P), "block"), ["b1", "b3"]);
    assert.equal(s.getState().getForPath(P).selectedBlockId, "b3");
    s.getState().selectBlock(P, "b1");
    s.getState().applySelectIntent(P, "range", order[2], order);
    assert.deepEqual(canvasSelectedIds(s.getState().getForPath(P), "block"), ["b1", "b2", "b3"]);
    s.getState().clearSelection(P);
    assert.equal(s.getState().getForPath(P).selectedBlockId, null);
  });

  it("바뀐 것이 없으면 저장소에 쓰지 않는다 (구독자가 깨어나지 않는다)", () => {
    const s = createVDocUiBridgeStore();
    s.getState().selectBlock(P, "b1");
    let notified = 0;
    const off = s.subscribe(() => (notified += 1));
    s.getState().selectBlock(P, "b1");
    s.getState().setHoveredBlock(P, null);
    s.getState().setActivePage(P, s.getState().getForPath(P).activePageId);
    s.getState().clearStagedAssetPreview(P);
    s.getState().setSelection(P, [{ id: "b1", kind: "block", blockId: "b1" }]);
    off();
    assert.equal(notified, 0);
  });

  it("describeCanvasSelection: 블록 · 칸 섞인 선택 → id · 요약 · 본문", () => {
    const doc = docWithBlocks();
    const s = createVDocUiBridgeStore();
    s.getState().setSelection(P, [
      { id: "b1", kind: "block", blockId: "b1" },
      { id: "s3", kind: "slot", blockId: "b3" },
    ]);
    const snap = describeCanvasSelection(doc, s.getState().getForPath(P).selection);
    assert.ok(snap);
    assert.deepEqual(snap.blockIds, ["b1", "b3"]);
    assert.deepEqual(snap.slotIds, ["s3"]);
    assert.match(snap.summary, /2개 선택/);
    assert.match(snap.text, /본문 1/);
    assert.match(snap.text, /본문 3/);
    assert.equal(describeCanvasSelection(doc, s.getState().getForPath("other").selection), null);
  });
});
