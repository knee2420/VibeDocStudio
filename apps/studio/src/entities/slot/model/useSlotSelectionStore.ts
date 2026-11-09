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

/** 선택 영역 AI 바에서 연 인라인 AI 의 대상 범위 (슬롯 편집기 문서 위치). */
export interface SlotTextRange {
  from: number;
  to: number;
  text: string;
}

/**
 * 여러 선택 단위에 걸친 범위 선택 — 표 구역 · 블록 · 페이지를 넘는 드래그, 또는 여러 슬롯에 걸친 브라우저 선택.
 * 선택 단위는 블록 정의가 정한다 (`@vibe/vdoc-schema` block-kit): 슬롯 · 이미지 같은 슬롯 없는 내용.
 * Composer 첨부 · 선택 영역 AI 바 · 복사가 이 목록을 쓴다.
 */
export interface SlotRangeSelection {
  /** 고른 선택 단위 전부, 읽는 순서대로 (`data-vdoc-unit`). */
  unitIds: string[];
  /** 그중 슬롯 단위 (글을 고칠 수 있는 칸). */
  slotIds: string[];
  /** drag: 캔버스가 직접 그린 범위 · native: 브라우저 글자 선택이 여러 슬롯에 걸친 것. */
  source: "drag" | "native";
  /** 한 표(구역) 안의 범위 — 표가 이미 칸 강조를 그리므로 캔버스는 덧칠하지 않는다. */
  withinTable?: boolean;
  /** 선택이 끝난 자리(화면 좌표 + 그때의 캔버스 스크롤). AI 바를 그 옆에 띄운다. */
  endPoint?: { x: number; y: number; scrollTop: number; scrollLeft: number };
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
  /** 인라인 AI 가 고칠 선택 범위. null 이면 슬롯 전체가 대상이다. */
  composerRange: SlotTextRange | null;
  tableSelection: TableSelection | null;
  slotRange: SlotRangeSelection | null;
  setSlotRange: (range: SlotRangeSelection | null) => void;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedSlotId: (slotId: string | null) => void;
  clearSelection: () => void;
  setComposerOpenSlotId: (slotId: string | null) => void;
  toggleComposerForSlot: (slotId: string) => void;
  openComposerWithPrompt: (slotId: string, prompt: string, range?: SlotTextRange | null) => void;
  setTableSelection: (selection: TableSelection | null) => void;
}

export const useSlotSelectionStore = create<SlotSelectionState>((set) => ({
  selectedBlockId: null,
  selectedSlotId: null,
  composerOpenSlotId: null,
  composerPrompt: null,
  composerRange: null,
  tableSelection: null,
  slotRange: null,
  setSlotRange: (range) => set({ slotRange: range && range.unitIds.length > 1 ? range : null }),
  setSelectedBlockId: (blockId) => set({ selectedBlockId: blockId, selectedSlotId: null, slotRange: null }),
  setSelectedSlotId: (slotId) =>
    set((s) => ({
      selectedSlotId: slotId,
      selectedBlockId: null,
      // 범위 안의 슬롯을 누른 것(드래그 끝의 클릭)은 범위를 유지한다.
      slotRange: slotId && s.slotRange?.slotIds.includes(slotId) ? s.slotRange : null,
    })),
  clearSelection: () =>
    set({ selectedBlockId: null, selectedSlotId: null, composerOpenSlotId: null, composerPrompt: null, composerRange: null, slotRange: null }),
  setComposerOpenSlotId: (slotId) => set({ composerOpenSlotId: slotId, composerPrompt: null, composerRange: null }),
  toggleComposerForSlot: (slotId) =>
    set((state) => ({
      selectedSlotId: slotId,
      composerPrompt: null,
      composerRange: null,
      composerOpenSlotId: state.composerOpenSlotId === slotId ? null : slotId,
    })),
  openComposerWithPrompt: (slotId, prompt, range = null) =>
    set({ selectedSlotId: slotId, composerOpenSlotId: slotId, composerPrompt: prompt, composerRange: range }),
  setTableSelection: (selection) => set({ tableSelection: selection }),
}));
