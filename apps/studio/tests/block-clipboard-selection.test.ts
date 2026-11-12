import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  cloneBlockWithSlots,
  deleteUnitsFromDocument,
  getBlockSlotIds,
  insertAtY,
  insertBlock,
  mergeMissingVariables,
  placePastedBlock,
  type LayoutBlock,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { useBlockClipboardStore, useSlotSelectionStore } from "../src/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "../src/entities/vdoc-document";
import { useHistoryStore } from "../src/shared/lib/history";

function makeDoc(
  docId: string,
  pageId: string,
  blocks: LayoutBlock[],
  variables: Record<string, string> = {}
): VDocDocument {
  return {
    version: "1.0.0",
    docId,
    title: docId,
    status: "Draft",
    updatedAt: "2026-11-10T00:00:00.000Z",
    variables,
    backdata: { bd_1: { chunkId: "bd_1", sourceTitle: "근거", sourceType: "markdown", excerpt: "원문", updatedAt: "", tags: [] } },
    pages: [
      {
        pageId,
        pageNumber: 1,
        pageLabel: "1p",
        headerSlotId: `${pageId}_hdr`,
        footerSlotId: `${pageId}_ftr`,
        hideHeaderFooter: true,
        blocks,
      },
    ],
    slots: {
      [`${pageId}_hdr`]: { slotId: `${pageId}_hdr`, label: "머리말", role: "editable-slot", content: "", backDataRefs: [] },
      [`${pageId}_ftr`]: { slotId: `${pageId}_ftr`, label: "바닥글", role: "editable-slot", content: "", backDataRefs: [] },
    },
  };
}

describe("Block clipboard, Esc owner promotion, and cross-doc paste state", () => {
  beforeEach(() => {
    useHistoryStore.setState({ past: [], future: [], lastMessage: null });
    useBlockClipboardStore.getState().clear();
    useSlotSelectionStore.getState().clearSelection();
    useStudioDocumentStore.setState({
      docs: [],
      activeDocId: "",
      activePageId: "",
      persistedDocIds: new Set<string>(),
      saveState: {},
      lastError: null,
    });
  });

  it("promotes selected slot to its owning block on Esc and clears on second Esc", () => {
    const blk: LayoutBlock = { blockId: "blk_1", kind: "text", title: "텍스트", slotId: "slot_a" };
    const doc = makeDoc("doc_a", "p_a", [blk]);
    doc.slots.slot_a = { slotId: "slot_a", label: "칸 A", role: "editable-slot", content: "<p>내용</p>", backDataRefs: [] };

    const sel = useSlotSelectionStore.getState();
    sel.setSelectedSlotId("slot_a");
    assert.equal(useSlotSelectionStore.getState().selectedSlotId, "slot_a");
    assert.equal(useSlotSelectionStore.getState().selectedBlockId, null);

    // 1차 Esc: 편집 중인 칸 → 소유 블록 선택
    const promoted = useSlotSelectionStore.getState().selectOwnerBlockFromSlot(doc);
    assert.equal(promoted, "blk_1");
    assert.equal(useSlotSelectionStore.getState().selectedBlockId, "blk_1");
    assert.equal(useSlotSelectionStore.getState().selectedSlotId, null);

    // 2차 Esc: 선택 해제
    useSlotSelectionStore.getState().clearSelection();
    assert.equal(useSlotSelectionStore.getState().selectedBlockId, null);
    assert.equal(useSlotSelectionStore.getState().selectedSlotId, null);
  });

  it("keeps tableSelection synchronized with selectedBlockId across grip clicks and switches", () => {
    const sel = useSlotSelectionStore.getState();
    sel.setTableSelection({ pageId: "p1", blockId: "tbl_1", sectionId: null, range: null, tableSelected: true });
    sel.setSelectedBlockId("tbl_1");
    assert.equal(useSlotSelectionStore.getState().tableSelection?.blockId, "tbl_1");

    // 다른 블록을 고르면 기존 tableSelection 을 정리한다
    sel.setSelectedBlockId("blk_2");
    assert.equal(useSlotSelectionStore.getState().tableSelection, null);
  });

  it("tracks sourcePageId, sourceFrame, sourceVariables, pasteCount and restores single Undo step", async () => {
    const orig: LayoutBlock = {
      blockId: "blk_src",
      kind: "text",
      title: "원본",
      slotId: "slot_src",
      frame: { x: 80, y: 120, w: 300, h: 60 },
    };
    const srcDoc = makeDoc("doc_src", "p_src", [orig], { org: "ACME", unused: "skip" });
    srcDoc.slots.slot_src = {
      slotId: "slot_src",
      label: "원본 라벨",
      role: "editable-slot",
      content: '<p><span data-variable="org"></span> 본문</p>',
      backDataRefs: ["bd_1"],
      isEdited: true,
      fill: { author: "ai", at: "2026-11-10T00:00:00Z" },
    };

    useBlockClipboardStore
      .getState()
      .copySnapshot(srcDoc.docId, "p_src", orig, srcDoc.slots, srcDoc.variables);

    const entry = useBlockClipboardStore.getState().copied!;
    assert.equal(entry.sourcePageId, "p_src");
    assert.deepEqual(entry.sourceFrame, { x: 80, y: 120, w: 300, h: 60 });
    assert.deepEqual(entry.sourceVariables, { org: "ACME" });
    assert.equal(entry.pasteCount, 0);

    // 같은 페이지 연속 카운터 확인
    assert.equal(useBlockClipboardStore.getState().incrementPasteCount(), 1);
    assert.equal(useBlockClipboardStore.getState().incrementPasteCount(), 2);

    // 타 문서(일반 페이지)에 붙여넣기 + 단일 Undo 검증
    const targetFlowBlock: LayoutBlock = { blockId: "blk_t1", kind: "text", title: "기존", slotId: "slot_t1" };
    const targetDoc = makeDoc("doc_dst", "p_dst", [targetFlowBlock], {});
    targetDoc.slots.slot_t1 = { slotId: "slot_t1", label: "기존", role: "editable-slot", content: "<p>기존</p>", backDataRefs: [] };

    useStudioDocumentStore.getState().upsertDocument(targetDoc);
    useStudioDocumentStore.getState().updateCurrentDoc((prev) => {
      const cloned = cloneBlockWithSlots(entry.block, entry.slots, () => "k1", { copySuffix: false });
      const sid = getBlockSlotIds(cloned.block)[0];
      const { fill: _f, ...rest } = cloned.slots[sid];
      const cleaned = { ...rest, isEdited: false, originalContent: undefined, backDataRefs: [] };
      const placed = placePastedBlock(prev.pages[0], cloned.block, {
        sourcePageId: entry.sourcePageId,
        sourceFrame: entry.sourceFrame,
        selectedBlockId: "blk_t1",
      });
      const withBlock = insertBlock(prev, "p_dst", placed.block, { [sid]: cleaned }, placed.atIndex);
      return {
        ...withBlock,
        variables: mergeMissingVariables(prev.variables, entry.sourceVariables, [cleaned.content]),
      };
    }, { history: true, label: "블록 붙여넣기" });

    const after = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(after.pages[0].blocks.length, 2);
    assert.equal(after.pages[0].blocks[1].frame, undefined);
    const pastedSid = getBlockSlotIds(after.pages[0].blocks[1])[0];
    assert.equal(after.slots[pastedSid].label, "원본 라벨");
    assert.deepEqual(after.slots[pastedSid].backDataRefs, []);
    assert.equal(after.slots[pastedSid].fill, undefined);
    assert.deepEqual(after.variables, { org: "ACME" });

    // 1회 Undo 로 붙여넣기 전체 원복
    await useHistoryStore.getState().undo();
    const reverted = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(reverted.pages[0].blocks.length, 1);
    assert.deepEqual(reverted.variables, {});

    // insertAtY 도 단일 히스토리 호환 확인
    useStudioDocumentStore.getState().updateCurrentDoc((prev) => {
      const extra: LayoutBlock = { blockId: "blk_ins", kind: "image", title: "이미지", src: "" };
      const ins = insertAtY(prev.pages[0], 0, extra, { flowGaps: [{ index: 0, y: 10 }, { index: 1, y: 200 }] });
      return insertBlock(prev, "p_dst", ins.block, {}, ins.atIndex);
    }, { history: true });
    assert.equal(selectActiveDocument(useStudioDocumentStore.getState())!.pages[0].blocks[0].blockId, "blk_ins");
  });

  it("deletes full-covered blocks and clears partial slots in a single Undo step", async () => {
    const sec: LayoutBlock = {
      blockId: "blk_sec",
      kind: "section-block",
      title: "섹션",
      headingSlotId: "s_h",
      bodySlotId: "s_b",
    };
    const grid: LayoutBlock = {
      blockId: "blk_grid",
      kind: "columns-grid",
      title: "그리드",
      widths: ["1fr", "1fr"],
      slotIds: ["s_g1", "s_g2"],
    };
    const doc = makeDoc("doc_del", "p_del", [sec, grid]);
    doc.slots.s_h = { slotId: "s_h", label: "H", role: "editable-slot", content: "<p>새 섹션</p>", backDataRefs: [] };
    doc.slots.s_b = { slotId: "s_b", label: "B", role: "editable-slot", content: "<p>본문</p>", backDataRefs: [] };
    doc.slots.s_g1 = { slotId: "s_g1", label: "G1", role: "editable-slot", content: "<p>좌</p>", backDataRefs: [] };
    doc.slots.s_g2 = { slotId: "s_g2", label: "G2", role: "editable-slot", content: "<p>우</p>", backDataRefs: [] };

    useStudioDocumentStore.getState().upsertDocument(doc);
    useStudioDocumentStore.getState().updateCurrentDoc(
      (prev) => deleteUnitsFromDocument(prev, ["s_h", "s_b", "s_g1", "s_g2"]),
      { history: true, label: "선택 영역 삭제" }
    );
    assert.equal(selectActiveDocument(useStudioDocumentStore.getState())!.pages[0].blocks.length, 0);

    await useHistoryStore.getState().undo();
    assert.equal(selectActiveDocument(useStudioDocumentStore.getState())!.pages[0].blocks.length, 2);
  });

  it("copySnapshots stores multi-block range entries and increments pasteCount cleanly across fixed frames", () => {
    const b1: LayoutBlock = {
      blockId: "blk_t",
      kind: "text",
      title: "표",
      slotId: "s_1",
      frame: { x: 80, y: 377, w: 632, h: 120 },
    };
    const b2: LayoutBlock = {
      blockId: "blk_s",
      kind: "text",
      title: "요약",
      slotId: "s_2",
      frame: { x: 400, y: 520, w: 312, h: 60 },
    };
    const doc = makeDoc("doc_multi", "p_fixed", [b1, b2], { v1: "147" });
    doc.slots.s_1 = { slotId: "s_1", label: "S1", role: "editable-slot", content: "<p>{{v1}}</p>", backDataRefs: [] };
    doc.slots.s_2 = { slotId: "s_2", label: "S2", role: "editable-slot", content: "<p>Subtotal</p>", backDataRefs: [] };

    useBlockClipboardStore.getState().copySnapshots(
      "doc_multi",
      [
        { sourcePageId: "p_fixed", block: b1 },
        { sourcePageId: "p_fixed", block: b2 },
      ],
      doc.slots,
      doc.variables
    );

    const state1 = useBlockClipboardStore.getState();
    assert.equal(state1.entries.length, 2);
    assert.deepEqual(state1.entries[0].sourceVariables, { v1: "147" });
    assert.equal(state1.incrementPasteCount(), 1);
    assert.deepEqual(useBlockClipboardStore.getState().entries.map((e) => e.pasteCount), [1, 1]);

    const p0 = placePastedBlock(doc.pages[0], state1.entries[0].block, {
      sourcePageId: state1.entries[0].sourcePageId,
      sourceFrame: state1.entries[0].sourceFrame,
      pasteCount: 1,
    });
    const p1 = placePastedBlock(doc.pages[0], state1.entries[1].block, {
      sourcePageId: state1.entries[1].sourcePageId,
      sourceFrame: state1.entries[1].sourceFrame,
      pasteCount: 1,
    });
    assert.deepEqual(p0.block.frame, { x: 96, y: 393, w: 632, h: 120 });
    assert.deepEqual(p1.block.frame, { x: 416, y: 536, w: 312, h: 60 });
  });
});

