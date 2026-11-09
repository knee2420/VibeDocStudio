import {
  applyTableCommandToDocument,
  createInsertableBlock,
  duplicateBlock as duplicateBlockOp,
  importBlockFromDocument,
  insertBlock,
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
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

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

  return {
    moveBlock: (pageId: string, blockIndex: number, direction: -1 | 1) =>
      apply((doc) => moveBlockByOffset(doc, pageId, blockIndex, direction)),

    /** Drag-and-drop move; `toIndex` is the insertion index in the target page before removal. */
    moveBlockTo: (fromPageId: string, blockId: string, toPageId: string, toIndex: number) =>
      apply((doc) => moveBlockToPosition(doc, fromPageId, blockId, toPageId, toIndex)),

    deleteBlock: (pageId: string, blockId: string) => apply((doc) => removeBlock(doc, pageId, blockId)),

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
