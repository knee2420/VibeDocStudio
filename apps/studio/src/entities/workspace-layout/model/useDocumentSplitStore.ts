import type React from "react";
import { create } from "zustand";

export const SPLIT_DOC_MIME = "application/x-vdoc-split-doc";

export interface SplitDocPayload {
  docId: string;
  pageId?: string;
}

export type SplitSide = "left" | "right";

export interface DocumentSplitPaneState {
  docId: string;
  pageId?: string;
  side: SplitSide;
  /** 분할 패널 폭 (px). 경계선 드래그로 조절한다. */
  width: number;
}

export const SPLIT_PANE_MIN_WIDTH = 340;
export const SPLIT_PANE_MAX_WIDTH = 920;
export const SPLIT_PANE_DEFAULT_WIDTH = 520;

interface DocumentSplitStore {
  pane: DocumentSplitPaneState | null;
  openSplit: (payload: SplitDocPayload, side: SplitSide) => void;
  closeSplit: () => void;
  swapSide: () => void;
  setWidth: (width: number) => void;
  setPageId: (pageId: string | undefined) => void;
}

export const useDocumentSplitStore = create<DocumentSplitStore>((set) => ({
  pane: null,
  openSplit: (payload, side) =>
    set((s) => ({
      pane: {
        docId: payload.docId,
        pageId: payload.pageId,
        side,
        width: s.pane?.width ?? SPLIT_PANE_DEFAULT_WIDTH,
      },
    })),
  closeSplit: () => set({ pane: null }),
  swapSide: () =>
    set((s) => (s.pane ? { pane: { ...s.pane, side: s.pane.side === "left" ? "right" : "left" } } : s)),
  setWidth: (width) =>
    set((s) =>
      s.pane
        ? {
            pane: {
              ...s.pane,
              width: Math.max(SPLIT_PANE_MIN_WIDTH, Math.min(SPLIT_PANE_MAX_WIDTH, Math.round(width))),
            },
          }
        : s,
    ),
  setPageId: (pageId) => set((s) => (s.pane ? { pane: { ...s.pane, pageId } } : s)),
}));

/** 드래그 시작 시 분할 보기용 페이로드를 DataTransfer 에 함께 싣는다 (기존 AI 첨부 드래그와 공존). */
export function setSplitDragData(e: React.DragEvent, payload: SplitDocPayload): void {
  try {
    e.dataTransfer.setData(SPLIT_DOC_MIME, JSON.stringify(payload));
  } catch {
    // 일부 브라우저 제한 무시
  }
}

export function hasSplitDragData(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types ?? []).includes(SPLIT_DOC_MIME);
}

export function readSplitDragData(e: React.DragEvent): SplitDocPayload | null {
  try {
    const raw = e.dataTransfer.getData(SPLIT_DOC_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SplitDocPayload>;
    if (!parsed || typeof parsed.docId !== "string" || !parsed.docId) return null;
    return { docId: parsed.docId, pageId: typeof parsed.pageId === "string" ? parsed.pageId : undefined };
  } catch {
    return null;
  }
}
