import { create } from "zustand";

import type { TableCellRange } from "@vibe/vdoc-schema";

/** Multi-cell range or whole-table selection on the canvas, for the table-edit toolbar. */
export interface TableSelection {
  pageId: string;
  blockId: string;
  sectionId: string | null;
  range: TableCellRange | null;
  tableSelected: boolean;
}

/**
 * 캔버스에서 지금 고른 블록 · 슬롯 · 표 범위와, 슬롯에 붙는 인라인 AI 작성기의 열림 상태.
 * 패널 열림 같은 화면 배치는 `workspace-layout` 이 맡는다.
 */
export interface SlotSelectionState {
  selectedBlockId: string | null;
  selectedSlotId: string | null;
  composerOpenSlotId: string | null;
  /** Prompt the inline composer runs on open (selection AI bar). */
  composerPrompt: string | null;
  tableSelection: TableSelection | null;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedSlotId: (slotId: string | null) => void;
  clearSelection: () => void;
  setComposerOpenSlotId: (slotId: string | null) => void;
  toggleComposerForSlot: (slotId: string) => void;
  openComposerWithPrompt: (slotId: string, prompt: string) => void;
  setTableSelection: (selection: TableSelection | null) => void;
}

export const useSlotSelectionStore = create<SlotSelectionState>((set) => ({
  selectedBlockId: null,
  selectedSlotId: null,
  composerOpenSlotId: null,
  composerPrompt: null,
  tableSelection: null,
  setSelectedBlockId: (blockId) => set({ selectedBlockId: blockId, selectedSlotId: null }),
  setSelectedSlotId: (slotId) => set({ selectedSlotId: slotId, selectedBlockId: null }),
  clearSelection: () => set({ selectedBlockId: null, selectedSlotId: null, composerOpenSlotId: null, composerPrompt: null }),
  setComposerOpenSlotId: (slotId) => set({ composerOpenSlotId: slotId, composerPrompt: null }),
  toggleComposerForSlot: (slotId) =>
    set((state) => ({
      selectedSlotId: slotId,
      composerPrompt: null,
      composerOpenSlotId: state.composerOpenSlotId === slotId ? null : slotId,
    })),
  openComposerWithPrompt: (slotId, prompt) =>
    set({ selectedSlotId: slotId, composerOpenSlotId: slotId, composerPrompt: prompt }),
  setTableSelection: (selection) => set({ tableSelection: selection }),
}));
