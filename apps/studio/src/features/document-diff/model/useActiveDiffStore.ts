import { create } from "zustand";

export interface ActiveDiffTarget {
  type: "working" | "revision" | "staged" | "slot";
  diffKind?: "added" | "edited" | "deleted";
  revisionRev?: number;
  diffId?: string;
  pageId?: string;
  slotId?: string;
  label: string;
  beforeSlots: Record<string, string>; // slotId -> before html/text
  afterSlots: Record<string, string>;  // slotId -> after html/text
  changedSlotIds: string[];
}

export interface ActiveDiffState {
  activeDiff: ActiveDiffTarget | null;
  openDiff: (target: ActiveDiffTarget) => void;
  closeDiff: () => void;
}

export const useActiveDiffStore = create<ActiveDiffState>((set) => ({
  activeDiff: null,
  openDiff: (target) => set({ activeDiff: target }),
  closeDiff: () => set({ activeDiff: null }),
}));
