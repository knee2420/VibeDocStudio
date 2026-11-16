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
  /** 칸 이름 (지운 칸처럼 지금 문서에 없을 때 쓴다). */
  slotLabels?: Record<string, string>;
  /** 검토 머리말 — 작성자 · 시각 · 메모. */
  meta?: { author?: "human" | "ai"; authorName?: string; at?: string; note?: string };
  /** 검토 화면에서 바뀐 곳마다 "되돌리기"를 보일까 (새로 만든 쪽의 칸은 되돌릴 이전 글이 없다). */
  revertible?: boolean;
}

export interface ActiveDiffState {
  activeDiff: ActiveDiffTarget | null;
  openDiff: (target: ActiveDiffTarget) => void;
  closeDiff: () => void;
  /** 되돌린 칸을 지금 검토 목록에서 뺀다. */
  dropSlots: (slotIds: string[]) => void;
}

export const useActiveDiffStore = create<ActiveDiffState>((set) => ({
  activeDiff: null,
  openDiff: (target) => set({ activeDiff: target }),
  closeDiff: () => set({ activeDiff: null }),
  dropSlots: (slotIds) =>
    set((s) => {
      if (!s.activeDiff) return s;
      const drop = new Set(slotIds);
      return { activeDiff: { ...s.activeDiff, changedSlotIds: s.activeDiff.changedSlotIds.filter((id) => !drop.has(id)) } };
    }),
}));
