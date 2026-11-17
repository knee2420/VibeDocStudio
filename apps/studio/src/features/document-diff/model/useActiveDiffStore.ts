import { create } from "zustand";

import type { VDocDocument } from "@vibe/vdoc-schema";

export interface ActiveDiffTarget {
  type: "working" | "revision" | "staged" | "slot" | "version";
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
  /**
   * 비교 기준이 보관된 버전이면 그 문서 전체 — "실제 페이지로 비교"에서 왼쪽에 그때의 쪽 구성 그대로 그린다
   * (없으면 지금 문서 구성에 이전 글만 넣어 그린다).
   */
  beforeDoc?: VDocDocument;
  /** 버전과 비교 중이면 그 버전 (검토 화면 위에 "이 버전으로 되돌리기"). */
  version?: { id: string; name: string; at: string; kind: "named" | "auto" };
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
