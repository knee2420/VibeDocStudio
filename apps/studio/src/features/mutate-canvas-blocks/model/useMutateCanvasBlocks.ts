import {
  applyTableCommandToDocument,
  cloneBlockWithSlots,
  createInsertableBlock,
  duplicateBlock as duplicateBlockOp,
  findBlock,
  getBlockSlotIds,
  importBlockFromDocument,
  insertBlock,
  isBlockLocked,
  mapBlock,
  moveBlockByOffset,
  moveBlockFrame as moveBlockFrameOp,
  moveBlockToPosition,
  removeBlock,
  resizeBlockFrame as resizeBlockFrameOp,
  toggleBlockLock as toggleBlockLockOp,
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
    useBlockClipboardStore.getState().copySnapshot(doc.docId, loc.block, doc.slots);
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

    copyBlock: performCopyBlock,

    copySelectedBlock: (): boolean => {
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      const blockId = useSlotSelectionStore.getState().selectedBlockId;
      if (!doc || !blockId) return false;
      const loc = findBlock(doc, blockId);
      if (!loc) return false;
      return performCopyBlock(loc.pageId, blockId);
    },

    pasteBlock: (targetPageId?: string, atIndex?: number): boolean => {
      const clipboard = useBlockClipboardStore.getState().copied;
      const state = useStudioDocumentStore.getState();
      const doc = selectActiveDocument(state);
      if (!clipboard || !doc) return false;

      const sel = useSlotSelectionStore.getState();
      let pageId = targetPageId;
      let insertAt = atIndex;

      if (!pageId && sel.selectedBlockId) {
        const selBlockLoc = findBlock(doc, sel.selectedBlockId);
        if (selBlockLoc) {
          pageId = selBlockLoc.pageId;
          if (insertAt === undefined) insertAt = selBlockLoc.index + 1;
        }
      }
      if (!pageId && sel.selectedSlotId) {
        const ownerPage = doc.pages.find((p) =>
          p.blocks.some((b) => getBlockSlotIds(b).includes(sel.selectedSlotId!))
        );
        if (ownerPage) pageId = ownerPage.pageId;
      }
      if (!pageId) {
        pageId = doc.pages.find((p) => p.pageId === state.activePageId)?.pageId ?? doc.pages[0]?.pageId;
      }
      if (!pageId) return false;

      let insertedBlockId: string | null = null;
      apply((prev) => {
        const cloned = cloneBlockWithSlots(clipboard.block, clipboard.slots, idSuffix);
        const crossDoc = clipboard.sourceDocId !== prev.docId;
        const pastedSlots: Record<string, VDocSlot> = {};
        for (const sid of getBlockSlotIds(cloned.block)) {
          const clonedSlot = cloned.slots[sid];
          if (!clonedSlot) continue;
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
        insertedBlockId = cloned.block.blockId;
        return insertBlock(prev, pageId!, cloned.block, pastedSlots, insertAt);
      }, "블록 붙여넣기");
      if (insertedBlockId) {
        useSlotSelectionStore.getState().setSelectedBlockId(insertedBlockId);
      }
      return Boolean(insertedBlockId);
    },

    /** Inserts a new block at `atIndex` (default: end of page) and focuses its first slot. */
    addBlockToPage: (pageId: string, kind: InsertableBlockKind, atIndex?: number) => {
      let focusSlotId: string | null = null;
      apply((doc) => {
        const draft = createInsertableBlock(kind, {
          suffix: idSuffix(),
          defaultBackdataRefs: Object.keys(doc.backdata).slice(0, 1),
        });
        focusSlotId = draft.focusSlotId;
        return insertBlock(doc, pageId, draft.block, draft.slots, atIndex);
      });
      if (focusSlotId) setSelectedSlotId(focusSlotId);
    },

    duplicateBlock: (pageId: string, blockId: string) =>
      apply((doc) => duplicateBlockOp(doc, pageId, blockId, idSuffix)),

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
