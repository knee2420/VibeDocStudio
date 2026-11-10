import { create } from "zustand";

import {
  extractBlockVariableKeys,
  getBlockSlotIds,
  type BlockFrameRect,
  type LayoutBlock,
  type VDocSlot,
} from "@vibe/vdoc-schema";

export interface BlockClipboardEntry {
  sourceDocId: string;
  sourcePageId: string;
  sourceFrame?: BlockFrameRect;
  sourceVariables: Record<string, string>;
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
  pasteCount: number;
}

export interface BlockClipboardState {
  copied: BlockClipboardEntry | null;
  entries: BlockClipboardEntry[];
  copySnapshot: (
    sourceDocId: string,
    sourcePageId: string,
    block: LayoutBlock,
    docSlots: Record<string, VDocSlot>,
    docVariables?: Record<string, string>
  ) => void;
  copySnapshots: (
    sourceDocId: string,
    items: readonly { sourcePageId: string; block: LayoutBlock }[],
    docSlots: Record<string, VDocSlot>,
    docVariables?: Record<string, string>
  ) => void;
  incrementPasteCount: () => number;
  clear: () => void;
}

function buildEntry(
  sourceDocId: string,
  sourcePageId: string,
  block: LayoutBlock,
  docSlots: Record<string, VDocSlot>,
  docVariables: Record<string, string>
): BlockClipboardEntry {
  const ownedSlots: Record<string, VDocSlot> = {};
  const sourceVariables: Record<string, string> = {};
  for (const sid of getBlockSlotIds(block)) {
    const slot = docSlots[sid];
    if (!slot) continue;
    ownedSlots[sid] = structuredClone(slot);
    for (const key of extractBlockVariableKeys(slot.content)) {
      if (key in docVariables && !(key in sourceVariables)) {
        sourceVariables[key] = docVariables[key];
      }
    }
  }
  return {
    sourceDocId,
    sourcePageId,
    ...(block.frame ? { sourceFrame: { ...block.frame } } : {}),
    sourceVariables,
    block: structuredClone(block),
    slots: ownedSlots,
    pasteCount: 0,
  };
}

/** 캔버스 블록 클립보드 (단일 · 다중 블록 스냅샷 · 원본 페이지/좌표 · 연속 붙여넣기 횟수를 유지한다). */
export const useBlockClipboardStore = create<BlockClipboardState>((set, get) => ({
  copied: null,
  entries: [],
  copySnapshot: (sourceDocId, sourcePageId, block, docSlots, docVariables = {}) => {
    const entry = buildEntry(sourceDocId, sourcePageId, block, docSlots, docVariables);
    set({ copied: entry, entries: [entry] });
  },
  copySnapshots: (sourceDocId, items, docSlots, docVariables = {}) => {
    if (items.length === 0) return;
    const entries = items.map((it) => buildEntry(sourceDocId, it.sourcePageId, it.block, docSlots, docVariables));
    set({ copied: entries[0], entries });
  },
  incrementPasteCount: () => {
    const { entries } = get();
    if (entries.length === 0) return 0;
    const nextCount = entries[0].pasteCount + 1;
    const updated = entries.map((e) => ({ ...e, pasteCount: nextCount }));
    set({ copied: updated[0], entries: updated });
    return nextCount;
  },
  clear: () => set({ copied: null, entries: [] }),
}));
