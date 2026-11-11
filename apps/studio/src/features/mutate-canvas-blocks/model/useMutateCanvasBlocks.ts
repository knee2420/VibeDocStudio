import {
  applyTableCommandToDocument,
  cloneBlockWithSlots,
  createInsertableBlock,
  deleteUnitsFromDocument,
  duplicateBlock as duplicateBlockOp,
  findBlock,
  findBlockBySlotId,
  findFullySelectedBlocks,
  getBlockKind,
  getBlockSlotIds,
  htmlToPlainText,
  importBlockFromDocument,
  insertAtY,
  insertBlock,
  isBlockLocked,
  isFramedPage,
  mapBlock,
  mergeMissingVariables,
  moveBlockByOffset,
  moveBlockFrame as moveBlockFrameOp,
  moveBlockToPosition,
  placePastedBlock,
  removeBlock,
  resizeBlockFrame as resizeBlockFrameOp,
  toggleBlockLock as toggleBlockLockOp,
  type FlowGap,
  type InsertableBlockKind,
  type LayoutBlock,
  type TableCommand,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useBlockClipboardStore, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

export type { InsertableBlockKind };

/** 블록 · 셀 · 슬롯 ID 접미사 (문서 안에서만 고유하면 된다). */
const idSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const HISTORY = { history: true } as const;

function blockToPlainText(block: LayoutBlock, docSlots: Record<string, VDocSlot>): string {
  const def = getBlockKind(block.kind);
  const tables = def.tables?.(block) ?? [];
  if (tables.length > 0) {
    const lines: string[] = [];
    for (const sec of tables) {
      for (const row of sec.table.rows) {
        const cols = row.cells.map((c) => htmlToPlainText(docSlots[c.slotId]?.content ?? ""));
        lines.push(cols.join("\t"));
      }
    }
    return lines.join("\n").trim();
  }
  const slotTexts = getBlockSlotIds(block)
    .map((sid) => htmlToPlainText(docSlots[sid]?.content ?? ""))
    .filter((t) => t.length > 0);
  if (slotTexts.length > 0) return slotTexts.join("\n");
  if (block.kind === "image") return block.alt || block.title || "이미지";
  return block.title || "";
}

/**
 * 캔버스 블록 편집 명령. 문서를 어떻게 바꾸는지는 `@vibe/vdoc-schema` 의 순수 연산이 정하고,
 * 이 훅은 활성 문서에 적용 · 되돌리기 이력 · 선택 이동만 맡는다.
 */
export function useMutateCanvasBlocks() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);

  const apply = (op: (doc: VDocDocument) => VDocDocument, label?: string) =>
    updateCurrentDoc(op, label ? { history: true, label } : HISTORY);

  const performDeleteBlock = (pageId: string, blockId: string): boolean => {
    let deleted = false;
    apply((doc) => {
      const loc = findBlock(doc, blockId);
      if (!loc || loc.pageId !== pageId || isBlockLocked(loc.block, doc.slots)) return doc;
      deleted = true;
      return removeBlock(doc, pageId, blockId);
    }, "블록 삭제");
    if (deleted && useSlotSelectionStore.getState().selectedBlockId === blockId) {
      useSlotSelectionStore.getState().clearSelection();
    }
    return deleted;
  };

  const performCopyBlock = (pageId: string, blockId: string): boolean => {
    const doc = selectActiveDocument(useStudioDocumentStore.getState());
    if (!doc) return false;
    const loc = findBlock(doc, blockId);
    if (!loc || loc.pageId !== pageId) return false;
    useBlockClipboardStore
      .getState()
      .copySnapshot(doc.docId, loc.pageId, loc.block, doc.slots, doc.variables);
    const plain = blockToPlainText(loc.block, doc.slots);
    if (plain && typeof navigator !== "undefined") {
      void navigator.clipboard?.writeText?.(plain);
    }
    return true;
  };

  return {
    moveBlock: (pageId: string, blockIndex: number, direction: -1 | 1) =>
      apply((doc) => moveBlockByOffset(doc, pageId, blockIndex, direction)),

    /** Drag-and-drop move; `toIndex` is the insertion index in the target page before removal. */
    moveBlockTo: (fromPageId: string, blockId: string, toPageId: string, toIndex: number) =>
      apply((doc) => moveBlockToPosition(doc, fromPageId, blockId, toPageId, toIndex)),

    deleteBlock: (pageId: string, blockId: string) => {
      performDeleteBlock(pageId, blockId);
    },

    deleteSelectedBlock: (): boolean => {
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      const blockId = useSlotSelectionStore.getState().selectedBlockId;
      if (!doc || !blockId) return false;
      const loc = findBlock(doc, blockId);
      if (!loc) return false;
      return performDeleteBlock(loc.pageId, blockId);
    },

    /** 범위 선택(`slotRange`) 삭제: 전체 포함 블록은 삭제하고 일부 칸만 걸친 슬롯은 내용을 비운다. */
    deleteUnitRange: (unitIds: readonly string[]): boolean => {
      if (unitIds.length === 0) return false;
      let changed = false;
      apply((doc) => {
        const next = deleteUnitsFromDocument(doc, unitIds);
        if (next !== doc) changed = true;
        return next;
      }, "선택 영역 삭제");
      if (changed) {
        useSlotSelectionStore.getState().clearSelection();
      }
      return changed;
    },

    copyBlock: performCopyBlock,

    copySelectedBlock: (): boolean => {
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      const blockId = useSlotSelectionStore.getState().selectedBlockId;
      if (!doc || !blockId) return false;
      const loc = findBlock(doc, blockId);
      if (!loc) return false;
      return performCopyBlock(loc.pageId, blockId);
    },

    /** 범위 선택(`slotRange`) 복사: 전체 단위가 포함된 블록들을 앱 클립보드에 담고 전체 텍스트(TSV)도 시스템 클립보드에 넣는다. */
    copyUnitRange: (unitIds: readonly string[], plainText?: string): boolean => {
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      if (!doc || unitIds.length === 0) return false;
      const fullBlocks = findFullySelectedBlocks(doc, unitIds);
      if (fullBlocks.length > 0) {
        useBlockClipboardStore.getState().copySnapshots(
          doc.docId,
          fullBlocks.map((b) => ({ sourcePageId: b.pageId, block: b.block })),
          doc.slots,
          doc.variables
        );
      }
      const fallbackText =
        plainText ??
        fullBlocks
          .map((b) => blockToPlainText(b.block, doc.slots))
          .filter((t) => t.length > 0)
          .join("\n");
      if (fallbackText && typeof navigator !== "undefined") {
        void navigator.clipboard?.writeText?.(fallbackText);
      }
      return fullBlocks.length > 0 || Boolean(fallbackText);
    },

    pasteBlock: (targetPageId?: string, atIndex?: number): boolean => {
      const { entries } = useBlockClipboardStore.getState();
      const state = useStudioDocumentStore.getState();
      const doc = selectActiveDocument(state);
      if (entries.length === 0 || !doc) return false;

      const sel = useSlotSelectionStore.getState();
      let pageId = targetPageId;
      let selectedBlockOnPage: string | null = null;

      if (sel.selectedBlockId) {
        const selBlockLoc = findBlock(doc, sel.selectedBlockId);
        if (selBlockLoc) {
          if (!pageId) pageId = selBlockLoc.pageId;
          if (selBlockLoc.pageId === pageId) selectedBlockOnPage = selBlockLoc.block.blockId;
        }
      }
      if (!pageId && sel.selectedSlotId) {
        const slotLoc = findBlockBySlotId(doc, sel.selectedSlotId);
        if (slotLoc) pageId = slotLoc.pageId;
      }
      if (sel.slotRange?.unitIds.length) {
        for (let i = sel.slotRange.unitIds.length - 1; i >= 0; i--) {
          const uid = sel.slotRange.unitIds[i];
          const unitLoc = findBlockBySlotId(doc, uid) ?? findBlock(doc, uid.split(":")[0]);
          if (unitLoc) {
            if (!pageId) pageId = unitLoc.pageId;
            if (!selectedBlockOnPage && unitLoc.pageId === pageId) selectedBlockOnPage = unitLoc.block.blockId;
            break;
          }
        }
      }
      if (!pageId) {
        pageId = doc.pages.find((p) => p.pageId === state.activePageId)?.pageId ?? doc.pages[0]?.pageId;
      }
      if (!pageId) return false;

      const targetPage = doc.pages.find((p) => p.pageId === pageId);
      if (!targetPage) return false;

      const anySameFramed =
        isFramedPage(targetPage) &&
        entries.some((entry) => entry.sourcePageId === pageId && Boolean(entry.sourceFrame));
      const pasteCount = anySameFramed ? useBlockClipboardStore.getState().incrementPasteCount() : 1;

      const blockHeights: Record<string, number> = {};
      if (selectedBlockOnPage && typeof document !== "undefined") {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(selectedBlockOnPage)}"]`);
        if (el) blockHeights[selectedBlockOnPage] = Math.round(el.getBoundingClientRect().height);
      }

      let lastInsertedId: string | null = null;
      apply(
        (prev) => {
          let workingDoc = prev;
          let anchorBlockId = selectedBlockOnPage;
          let insertedOffset = 0;

          for (const entry of entries) {
            const workingPage = workingDoc.pages.find((p) => p.pageId === pageId);
            if (!workingPage) break;

            const cloned = cloneBlockWithSlots(entry.block, entry.slots, idSuffix, { copySuffix: false });
            const crossDoc = entry.sourceDocId !== workingDoc.docId;
            const pastedSlots: Record<string, VDocSlot> = {};
            const pastedSlotHtmls: string[] = [];
            for (const sid of getBlockSlotIds(cloned.block)) {
              const clonedSlot = cloned.slots[sid];
              if (!clonedSlot) continue;
              pastedSlotHtmls.push(clonedSlot.content);
              if (!crossDoc) {
                pastedSlots[sid] = clonedSlot;
                continue;
              }
              // 다른 문서로 붙여넣을 때 끊기는 근거 참조 · 채움 추적 메타를 비운다.
              const { fill: _fill, ...rest } = clonedSlot;
              pastedSlots[sid] = {
                ...rest,
                isEdited: false,
                originalContent: undefined,
                backDataRefs: [],
              };
            }

            const placed = placePastedBlock(workingPage, cloned.block, {
              sourcePageId: entry.sourcePageId,
              sourceFrame: entry.sourceFrame,
              selectedBlockId: anchorBlockId,
              pasteCount,
              blockHeights,
            });
            const insertIndex =
              atIndex !== undefined && !isFramedPage(workingPage) ? atIndex + insertedOffset : placed.atIndex;
            insertedOffset++;
            lastInsertedId = placed.block.blockId;
            anchorBlockId = placed.block.blockId;

            workingDoc = insertBlock(workingDoc, pageId!, placed.block, pastedSlots, insertIndex);
            if (crossDoc) {
              const nextVars = mergeMissingVariables(workingDoc.variables, entry.sourceVariables, pastedSlotHtmls);
              if (nextVars !== workingDoc.variables) {
                workingDoc = { ...workingDoc, variables: nextVars };
              }
            }
          }
          return workingDoc;
        },
        entries.length > 1 ? "블록 여러 개 붙여넣기" : "블록 붙여넣기"
      );

      if (lastInsertedId) {
        useSlotSelectionStore.getState().setSelectedBlockId(lastInsertedId);
      }
      return Boolean(lastInsertedId);
    },

    /** 플로팅 `+` 메뉴에서 Y 높이(또는 흐름 틈)에 새 블록을 삽입하고 포커스한다. */
    insertFromMenu: (
      pageId: string,
      y: number,
      kind: InsertableBlockKind | string,
      flowGaps?: readonly FlowGap[]
    ) => {
      let focusSlotId: string | undefined;
      let createdBlockId: string | null = null;
      apply((doc) => {
        const page = doc.pages.find((p) => p.pageId === pageId);
        if (!page) return doc;
        const draft = createInsertableBlock(kind, {
          suffix: idSuffix(),
          defaultBackdataRefs: Object.keys(doc.backdata).slice(0, 1),
        });
        focusSlotId = draft.focusSlotId;
        const placed = insertAtY(page, y, draft.block, { flowGaps });
        createdBlockId = placed.block.blockId;
        return insertBlock(doc, pageId, placed.block, draft.slots, placed.atIndex);
      }, "블록 삽입");

      if (focusSlotId) {
        setSelectedSlotId(focusSlotId);
      } else if (createdBlockId) {
        useSlotSelectionStore.getState().setSelectedBlockId(createdBlockId);
      }
    },

    /** Inserts a new block at `atIndex` (default: end of page) and focuses its first slot (or block). */
    addBlockToPage: (pageId: string, kind: InsertableBlockKind, atIndex?: number) => {
      let focusSlotId: string | undefined;
      let createdBlockId: string | null = null;
      apply((doc) => {
        const draft = createInsertableBlock(kind, {
          suffix: idSuffix(),
          defaultBackdataRefs: Object.keys(doc.backdata).slice(0, 1),
        });
        focusSlotId = draft.focusSlotId;
        createdBlockId = draft.block.blockId;
        return insertBlock(doc, pageId, draft.block, draft.slots, atIndex);
      });
      if (focusSlotId) setSelectedSlotId(focusSlotId);
      else if (createdBlockId) useSlotSelectionStore.getState().setSelectedBlockId(createdBlockId);
    },

    duplicateBlock: (pageId: string, blockId: string) => {
      let duplicatedBlockId: string | null = null;
      apply((doc) => {
        const beforePage = doc.pages.find((p) => p.pageId === pageId);
        const beforeIds = new Set((beforePage?.blocks ?? []).map((b) => b.blockId));
        const next = duplicateBlockOp(doc, pageId, blockId, idSuffix);
        const afterPage = next.pages.find((p) => p.pageId === pageId);
        duplicatedBlockId = afterPage?.blocks.find((b) => !beforeIds.has(b.blockId))?.blockId ?? null;
        return next;
      }, "블록 복제");
      if (duplicatedBlockId) {
        useSlotSelectionStore.getState().setSelectedBlockId(duplicatedBlockId);
      }
    },

    toggleBlockLock: (pageId: string, blockId: string) =>
      apply((doc) => toggleBlockLockOp(doc, pageId, blockId)),

    /** Free placement of a framed (fixed-position) block. */
    moveBlockFrame: (pageId: string, blockId: string, x: number, y: number) =>
      apply((doc) => moveBlockFrameOp(doc, pageId, blockId, x, y)),

    /** Resizes a framed block by delta width/height. */
    resizeBlockFrame: (pageId: string, blockId: string, dw: number, dh: number) =>
      apply((doc) => resizeBlockFrameOp(doc, pageId, blockId, dw, dh)),

    /** Updates arbitrary layout block properties via an updater callback. */
    updateBlock: (pageId: string, blockId: string, updater: (prev: LayoutBlock) => LayoutBlock) =>
      apply((doc) => mapBlock(doc, pageId, blockId, updater)),

    /** Applies a table command to a structured table, or to one section of a composite frame. */
    runTableCommand: (pageId: string, blockId: string, sectionId: string | null, cmd: TableCommand) =>
      apply((doc) => applyTableCommandToDocument(doc, pageId, blockId, sectionId, cmd, idSuffix)),

    /** 다른 문서(참조 문서)의 블록을 슬롯째 복제해 활성 문서의 `targetPageId` 끝에 붙인다. */
    importBlockFrom: (source: VDocDocument, block: LayoutBlock, targetPageId: string) =>
      apply(
        (doc) => importBlockFromDocument(doc, source, block.blockId, targetPageId, idSuffix),
        `참조 블록 '${block.title || block.kind}' 복제 삽입`
      ),
  };
}
