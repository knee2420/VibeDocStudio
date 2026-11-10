import { create } from "zustand";

import { getBlockSlotIds, type LayoutBlock, type VDocSlot } from "@vibe/vdoc-schema";

export interface BlockClipboardEntry {
  sourceDocId: string;
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
}

export interface BlockClipboardState {
  copied: BlockClipboardEntry | null;
  copySnapshot: (sourceDocId: string, block: LayoutBlock, docSlots: Record<string, VDocSlot>) => void;
  clear: () => void;
}

/** 캔버스 블록 클립보드 (복사한 블록과 해당 슬롯의 스냅샷을 유지한다). */
export const useBlockClipboardStore = create<BlockClipboardState>((set) => ({
  copied: null,
  copySnapshot: (sourceDocId, block, docSlots) => {
    const ownedSlots: Record<string, VDocSlot> = {};
    for (const sid of getBlockSlotIds(block)) {
      const slot = docSlots[sid];
      if (slot) ownedSlots[sid] = structuredClone(slot);
    }
    set({
      copied: {
        sourceDocId,
        block: structuredClone(block),
        slots: ownedSlots,
      },
    });
  },
  clear: () => set({ copied: null }),
}));

