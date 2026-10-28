import { create } from "zustand";

import { INITIAL_VDOC_DOCUMENTS } from "@vibe/vdoc-schema";

const initialDoc = INITIAL_VDOC_DOCUMENTS[0];
const initialEditableSlotId =
  Object.values(initialDoc?.slots || {}).find((s) => s.role !== "boilerplate")
    ?.slotId ||
  Object.keys(initialDoc?.slots || {})[0] ||
  null;

export interface SlotSelectionState {
  selectedSlotId: string | null;
  composerOpenSlotId: string | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  showAddBackdataForm: boolean;
  setSelectedSlotId: (slotId: string | null) => void;
  setComposerOpenSlotId: (slotId: string | null) => void;
  toggleComposerForSlot: (slotId: string) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  setShowAddBackdataForm: (show: boolean) => void;
}

export const useSlotSelectionStore = create<SlotSelectionState>((set) => ({
  selectedSlotId: initialEditableSlotId,
  composerOpenSlotId: null,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  showAddBackdataForm: false,
  setSelectedSlotId: (slotId) => set({ selectedSlotId: slotId }),
  setComposerOpenSlotId: (slotId) => set({ composerOpenSlotId: slotId }),
  toggleComposerForSlot: (slotId) =>
    set((state) => ({
      selectedSlotId: slotId,
      composerOpenSlotId:
        state.composerOpenSlotId === slotId ? null : slotId,
    })),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setShowAddBackdataForm: (show) => set({ showAddBackdataForm: show }),
}));

