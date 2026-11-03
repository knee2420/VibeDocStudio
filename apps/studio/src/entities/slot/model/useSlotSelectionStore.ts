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

export interface SlotSelectionState {
  selectedBlockId: string | null;
  selectedSlotId: string | null;
  composerOpenSlotId: string | null;
  /** Prompt the inline composer runs on open (selection AI bar). */
  composerPrompt: string | null;
  tableSelection: TableSelection | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  showAddBackdataForm: boolean;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedSlotId: (slotId: string | null) => void;
  setComposerOpenSlotId: (slotId: string | null) => void;
  toggleComposerForSlot: (slotId: string) => void;
  openComposerWithPrompt: (slotId: string, prompt: string) => void;
  setTableSelection: (selection: TableSelection | null) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  setShowAddBackdataForm: (show: boolean) => void;
}

/** 선택 상태는 문서를 불러온 뒤 첫 편집 슬롯으로 정한다 (`selectFirstEditableSlot`). */
export const useSlotSelectionStore = create<SlotSelectionState>((set) => ({
  selectedBlockId: null,
  selectedSlotId: null,
  composerOpenSlotId: null,
  composerPrompt: null,
  tableSelection: null,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  showAddBackdataForm: false,
  setSelectedBlockId: (blockId) => set({ selectedBlockId: blockId }),
  setSelectedSlotId: (slotId) => set({ selectedSlotId: slotId }),
  setComposerOpenSlotId: (slotId) => set({ composerOpenSlotId: slotId, composerPrompt: null }),
  toggleComposerForSlot: (slotId) =>
    set((state) => ({
      selectedSlotId: slotId,
      composerPrompt: null,
      composerOpenSlotId:
        state.composerOpenSlotId === slotId ? null : slotId,
    })),
  openComposerWithPrompt: (slotId, prompt) =>
    set({ selectedSlotId: slotId, composerOpenSlotId: slotId, composerPrompt: prompt }),
  setTableSelection: (selection) => set({ tableSelection: selection }),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setShowAddBackdataForm: (show) => set({ showAddBackdataForm: show }),
}));
