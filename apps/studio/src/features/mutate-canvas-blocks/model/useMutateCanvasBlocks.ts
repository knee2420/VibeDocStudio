import {
  applyTableCommand,
  cloneBlockWithSlots,
  getBlockSlotIds,
  isBlockLocked,
  type LayoutBlock,
  type TableCommand,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export type InsertableBlockKind =
  | "columns-grid"
  | "structured-table"
  | "section-block"
  | "fillable-group";

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function mapBlock(
  doc: VDocDocument,
  pageId: string,
  blockId: string,
  fn: (block: LayoutBlock) => LayoutBlock
): VDocDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.pageId === pageId ? { ...p, blocks: p.blocks.map((b) => (b.blockId === blockId ? fn(b) : b)) } : p
    ),
  };
}

function createBlock(
  kind: InsertableBlockKind,
  prev: VDocDocument,
  nextSlots: Record<string, VDocSlot>
): { block: LayoutBlock; focusSlotId: string } {
  const suffix = newId();
  const backdataRefs = Object.keys(prev.backdata).slice(0, 1);

  if (kind === "columns-grid") {
    const s1 = `slot_col1_${suffix}`;
    const s2 = `slot_col2_${suffix}`;
    nextSlots[s1] = { slotId: s1, label: "좌측 컬럼 슬롯", role: "editable-slot", content: "<p></p>", backDataRefs: backdataRefs };
    nextSlots[s2] = { slotId: s2, label: "우측 컬럼 슬롯", role: "editable-slot", content: "<p></p>", backDataRefs: backdataRefs };
    return {
      block: { blockId: `blk_cols_${suffix}`, kind: "columns-grid", title: "2단 그리드", widths: ["1fr", "1fr"], cardStyle: "plain", slotIds: [s1, s2] },
      focusSlotId: s1,
    };
  }

  if (kind === "structured-table") {
    const ids = ["th1", "th2", "tc1", "tc2"].map((k) => `slot_${k}_${suffix}`);
    const [h1, h2, c1, c2] = ids;
    nextSlots[h1] = { slotId: h1, label: "표 헤더 1", role: "editable-slot", content: "<p>항목</p>", backDataRefs: [] };
    nextSlots[h2] = { slotId: h2, label: "표 헤더 2", role: "editable-slot", content: "<p>내용</p>", backDataRefs: [] };
    nextSlots[c1] = { slotId: c1, label: "표 1행 1열", role: "editable-slot", content: "<p></p>", backDataRefs: backdataRefs };
    nextSlots[c2] = { slotId: c2, label: "표 1행 2열", role: "editable-slot", content: "<p></p>", backDataRefs: backdataRefs };
    return {
      block: {
        blockId: `blk_tbl_${suffix}`,
        kind: "structured-table",
        title: "표",
        columnWidths: ["32%", "68%"],
        borderRules: { outer: "1px solid #eaeaea", rowBottom: "1px solid #eaeaea", vertical: "1px solid #eaeaea" },
        headerStyle: { bg: "#f5f5f6", fontWeight: "600", padding: "8px" },
        cellPadding: "8px",
        rows: [
          {
            rowId: `r_h_${suffix}`,
            cells: [
              { cellId: `ch1_${suffix}`, slotId: h1, isHeader: true, hAlign: "center", vAlign: "middle" },
              { cellId: `ch2_${suffix}`, slotId: h2, isHeader: true, hAlign: "center", vAlign: "middle" },
            ],
          },
          {
            rowId: `r_1_${suffix}`,
            cells: [
              { cellId: `cc1_${suffix}`, slotId: c1, vAlign: "middle" },
              { cellId: `cc2_${suffix}`, slotId: c2, vAlign: "middle" },
            ],
          },
        ],
      },
      focusSlotId: c1,
    };
  }

  if (kind === "fillable-group") {
    const sid = `slot_fill_${suffix}`;
    nextSlots[sid] = { slotId: sid, label: "할당형 입력 슬롯", role: "fillable-field", assignee: "서민규", content: "<p></p>", backDataRefs: backdataRefs };
    return {
      block: { blockId: `blk_fill_${suffix}`, kind: "fillable-group", title: "할당형 입력 필드", slotId: sid, assigneeName: "서민규", fieldType: "text-area" },
      focusSlotId: sid,
    };
  }

  const hId = `slot_sec_h_${suffix}`;
  const bId = `slot_sec_b_${suffix}`;
  nextSlots[hId] = { slotId: hId, label: "섹션 제목", role: "editable-slot", content: "<h2>새 섹션</h2>", backDataRefs: [] };
  nextSlots[bId] = { slotId: bId, label: "섹션 본문", role: "editable-slot", content: "<p></p>", backDataRefs: backdataRefs };
  return {
    block: { blockId: `blk_sec_${suffix}`, kind: "section-block", title: "텍스트 섹션", headingSlotId: hId, bodySlotId: bId },
    focusSlotId: bId,
  };
}

export function useMutateCanvasBlocks() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const history = { history: true };

  const moveBlock = (pageId: string, blockIndex: number, direction: -1 | 1) => {
    updateCurrentDoc(
      (prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.pageId !== pageId) return p;
          const targetIndex = blockIndex + direction;
          if (targetIndex < 0 || targetIndex >= p.blocks.length) return p;
          const nextBlocks = [...p.blocks];
          const [moved] = nextBlocks.splice(blockIndex, 1);
          nextBlocks.splice(targetIndex, 0, moved);
          return { ...p, blocks: nextBlocks };
        }),
      }),
      history
    );
  };

  /** Drag-and-drop move; `toIndex` is the insertion index in the target page before removal. */
  const moveBlockTo = (fromPageId: string, blockId: string, toPageId: string, toIndex: number) => {
    updateCurrentDoc((prev) => {
      const fromPage = prev.pages.find((p) => p.pageId === fromPageId);
      const fromIndex = fromPage?.blocks.findIndex((b) => b.blockId === blockId) ?? -1;
      if (!fromPage || fromIndex < 0) return prev;
      const block = fromPage.blocks[fromIndex];
      const adjusted = fromPageId === toPageId && fromIndex < toIndex ? toIndex - 1 : toIndex;
      if (fromPageId === toPageId && adjusted === fromIndex) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          let blocks = p.blocks;
          if (p.pageId === fromPageId) blocks = blocks.filter((b) => b.blockId !== blockId);
          if (p.pageId === toPageId) {
            blocks = [...blocks];
            blocks.splice(Math.min(adjusted, blocks.length), 0, block);
          }
          return blocks === p.blocks ? p : { ...p, blocks };
        }),
      };
    }, history);
  };

  const deleteBlock = (pageId: string, blockId: string) => {
    updateCurrentDoc(
      (prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.pageId === pageId ? { ...p, blocks: p.blocks.filter((b) => b.blockId !== blockId) } : p)),
      }),
      history
    );
  };

  /** Inserts a new block at `atIndex` (default: end of page). */
  const addBlockToPage = (pageId: string, kind: InsertableBlockKind, atIndex?: number) => {
    let focus: string | null = null;
    updateCurrentDoc((prev) => {
      const nextSlots: Record<string, VDocSlot> = { ...prev.slots };
      const { block, focusSlotId } = createBlock(kind, prev, nextSlots);
      focus = focusSlotId;
      return {
        ...prev,
        slots: nextSlots,
        pages: prev.pages.map((p) => {
          if (p.pageId !== pageId) return p;
          const blocks = [...p.blocks];
          blocks.splice(atIndex ?? blocks.length, 0, block);
          return { ...p, blocks };
        }),
      };
    }, history);
    if (focus) setSelectedSlotId(focus);
  };

  const duplicateBlock = (pageId: string, blockId: string) => {
    updateCurrentDoc((prev) => {
      const page = prev.pages.find((p) => p.pageId === pageId);
      const index = page?.blocks.findIndex((b) => b.blockId === blockId) ?? -1;
      if (!page || index < 0) return prev;
      const { block, slots } = cloneBlockWithSlots(page.blocks[index], prev.slots, newId);
      return {
        ...prev,
        slots,
        pages: prev.pages.map((p) => {
          if (p.pageId !== pageId) return p;
          const blocks = [...p.blocks];
          blocks.splice(index + 1, 0, block);
          return { ...p, blocks };
        }),
      };
    }, history);
  };

  const toggleBlockLock = (pageId: string, blockId: string) => {
    updateCurrentDoc((prev) => {
      const block = prev.pages.find((p) => p.pageId === pageId)?.blocks.find((b) => b.blockId === blockId);
      if (!block) return prev;
      const lock = !isBlockLocked(block, prev.slots);
      const slots = { ...prev.slots };
      for (const id of getBlockSlotIds(block)) {
        const slot = slots[id];
        if (slot) slots[id] = { ...slot, constraints: { ...slot.constraints, locked: lock } };
      }
      return { ...prev, slots };
    }, history);
  };

  /** Free placement of a framed (fixed-position) block. */
  const moveBlockFrame = (pageId: string, blockId: string, x: number, y: number) => {
    updateCurrentDoc(
      (prev) =>
        mapBlock(prev, pageId, blockId, (block) =>
          block.frame ? { ...block, frame: { ...block.frame, x: Math.max(0, x), y: Math.max(0, y) } } : block
        ),
      history
    );
  };

  /** Resizes a framed block by delta width/height. */
  const resizeBlockFrame = (pageId: string, blockId: string, dw: number, dh: number) => {
    updateCurrentDoc(
      (prev) =>
        mapBlock(prev, pageId, blockId, (block) => {
          if (!block.frame) return block;
          const minW = 24;
          const minH = 24;
          const currentW = block.frame.w ?? 100;
          const currentH = block.frame.h ?? 100;
          return {
            ...block,
            frame: {
              ...block.frame,
              w: Math.max(minW, Math.round(currentW + dw)),
              h: Math.max(minH, Math.round(currentH + dh)),
            },
          };
        }),
      history
    );
  };

  /** Updates arbitrary layout block properties via an updater callback. */
  const updateBlock = (pageId: string, blockId: string, updater: (prev: LayoutBlock) => LayoutBlock) => {
    updateCurrentDoc(
      (prev) => mapBlock(prev, pageId, blockId, updater),
      history
    );
  };

  /** Applies a table command to a structured table, or to one section of a composite frame. */
  const runTableCommand = (pageId: string, blockId: string, sectionId: string | null, cmd: TableCommand) => {
    updateCurrentDoc((prev) => {
      let slots = prev.slots;
      const next = mapBlock(prev, pageId, blockId, (block) => {
        if (block.kind === "structured-table" || block.kind === "table") {
          const result = applyTableCommand(block, slots, cmd, newId);
          if (!result) return block;
          slots = result.slots;
          return result.block;
        }
        if (block.kind === "composite-form-frame" && sectionId) {
          return {
            ...block,
            sections: block.sections.map((sec) => {
              if (sec.sectionId !== sectionId) return sec;
              const result = applyTableCommand(sec, slots, cmd, newId);
              if (!result) return sec;
              slots = result.slots;
              return result.block;
            }),
          };
        }
        return block;
      });
      return slots === prev.slots && next.pages === prev.pages ? prev : { ...next, slots, updatedAt: new Date().toISOString() };
    }, history);
  };

  return {
    moveBlock,
    moveBlockTo,
    deleteBlock,
    addBlockToPage,
    duplicateBlock,
    toggleBlockLock,
    moveBlockFrame,
    resizeBlockFrame,
    updateBlock,
    runTableCommand,
  };
}
