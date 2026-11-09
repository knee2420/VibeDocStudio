/**
 * 워크스페이스 요소 → Composer 첨부. 끌어 놓기 · 우클릭 메뉴 · Ctrl+L 이 모두 `attachToComposer` 로 모인다.
 */
import { create } from "zustand";

import type { ContextRef } from "@vibe/ai-kernel";
import { useActiveSlotEditorStore } from "@vibe/slot-editor";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { composerController } from "@/shared/ai";

import { blockRef, docIndex, referenceTextRef, slotRangeRef, slotRef, textRangeRef } from "./contextBuilders";

// --- 여러 개 고르기 (Ctrl/Shift+클릭) -------------------------------------------------------

/**
 * 아웃라이너 · 참조 덱 등에서 Ctrl/Shift+클릭으로 고른 묶음. 범위(scope)마다 따로 들고,
 * 마지막으로 고른 범위가 Ctrl+L 의 대상이 된다. 이 묶음 안의 한 줄을 끌면 묶음 전체가 간다.
 */
interface PickState {
  picked: Record<string, ContextRef[]>;
  lastScope: string | null;
  togglePick(scope: string, ref: ContextRef): void;
  setPicks(scope: string, refs: ContextRef[]): void;
  clearPicks(scope?: string): void;
}

export const useAttachPickStore = create<PickState>((set) => ({
  picked: {},
  lastScope: null,
  togglePick: (scope, ref) =>
    set((s) => {
      const current = s.picked[scope] ?? [];
      const exists = current.some((r) => r.kind === ref.kind && r.id === ref.id);
      const next = exists ? current.filter((r) => !(r.kind === ref.kind && r.id === ref.id)) : [...current, ref];
      return { picked: { ...s.picked, [scope]: next }, lastScope: next.length ? scope : s.lastScope };
    }),
  setPicks: (scope, refs) => set((s) => ({ picked: { ...s.picked, [scope]: refs }, lastScope: refs.length ? scope : s.lastScope })),
  clearPicks: (scope) =>
    set((s) => {
      if (!scope) return { picked: {}, lastScope: null };
      const { [scope]: _removed, ...rest } = s.picked;
      return { picked: rest, lastScope: s.lastScope === scope ? null : s.lastScope };
    }),
}));

export const selectPickedIds = (scope: string) => (s: PickState) => s.picked[scope];

/** 끌거나 우클릭한 줄이 고른 묶음 안에 있으면 묶음 전체, 아니면 그 줄 하나. */
export function withPicked(scope: string, ref: ContextRef): ContextRef[] {
  const picked = useAttachPickStore.getState().picked[scope] ?? [];
  return picked.some((r) => r.kind === ref.kind && r.id === ref.id) ? picked : [ref];
}

// --- Composer 로 보내기 ---------------------------------------------------------------------

export interface AttachOptions {
  /** 역할 강제 (우클릭 "대상으로 · 참조로 첨부"). 읽기 전용 요소는 대상이 될 수 없다. */
  role?: "target" | "reference";
  /** 입력창이 비어 있으면 함께 넣을 지시문 (`{handles}` → 첨부 이름). */
  prompt?: string;
}

export function attachToComposer(refs: ContextRef[], options: AttachOptions = {}): void {
  const layout = useWorkspaceLayoutStore.getState();
  layout.openRightPanel("composer");
  const finalRefs = refs.map((ref) => {
    if (!options.role) return ref;
    if (options.role === "target" && ref.access !== "write") return { ...ref, role: "reference" as const };
    return { ...ref, role: options.role };
  });
  composerController.attach(finalRefs, { prompt: options.prompt });
}

// --- Ctrl+L: "지금 고른 것" -------------------------------------------------------------------

/** 참조 작업창의 PDF 영역 선택 — 카드가 최신 상태를 여기 알린다 (Ctrl+L 대상). */
export const useReferenceRegionStore = create<{
  current: ContextRef | null;
  setCurrent(ref: ContextRef | null): void;
  /** AI 칩이 가리킨 레퍼런스 PDF 영역 — 레퍼런스 작업창이 그 자리에 강조 상자를 그리고 스크롤한다. */
  focus: { refId: string; page: number; box: [number, number, number, number]; at: number } | null;
  setFocus(focus: { refId: string; page: number; box: [number, number, number, number] } | null): void;
}>((set) => ({
  current: null,
  setCurrent: (ref) => set({ current: ref }),
  focus: null,
  setFocus: (focus) => set({ focus: focus ? { ...focus, at: Date.now() } : null }),
}));

/**
 * Ctrl+L 이 첨부할 것을 고른다. 우선순위:
 * 1) 슬롯 편집기의 텍스트 선택  2) 참조 문서 안의 텍스트 선택  3) Ctrl/Shift 로 고른 묶음
 * 4) 참조 PDF 영역  5) 선택한 슬롯  6) 선택한 블록
 */
export function currentAttachables(): ContextRef[] {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());

  // 0) 여러 슬롯에 걸친 범위 선택 (드래그 · 브라우저 선택)
  const range = useSlotSelectionStore.getState().slotRange;
  if (doc && range) return [slotRangeRef(doc, range.slotIds, range.unitIds)];

  const { activeSlotId, activeEditor } = useActiveSlotEditorStore.getState();
  const sel = activeEditor?.state.selection;
  if (doc && activeSlotId && sel && !sel.empty && doc.slots[activeSlotId]) {
    const text = activeEditor!.state.doc.textBetween(sel.from, sel.to, " ");
    if (text.trim()) return [textRangeRef(doc, doc.slots[activeSlotId], { from: sel.from, to: sel.to, text })];
  }

  const domSel = window.getSelection();
  const card = domSel && !domSel.isCollapsed ? (domSel.anchorNode?.parentElement?.closest("[data-testid^='reference-card-']") as HTMLElement | null) : null;
  if (card && domSel) {
    const refId = card.dataset.testid!.replace("reference-card-", "");
    const text = domSel.toString();
    if (text.trim()) return [referenceTextRef(refId, text)];
  }

  const picks = useAttachPickStore.getState();
  if (picks.lastScope && picks.picked[picks.lastScope]?.length) return picks.picked[picks.lastScope];

  const region = useReferenceRegionStore.getState().current;
  if (region) return [region];

  if (!doc) return [];
  const selection = useSlotSelectionStore.getState();
  if (selection.selectedSlotId && doc.slots[selection.selectedSlotId]) return [slotRef(doc, doc.slots[selection.selectedSlotId])];
  if (selection.selectedBlockId) {
    const found = docIndex(doc).blocks.get(selection.selectedBlockId);
    if (found) return [blockRef(doc, found.page, found.block)];
  }
  return [];
}

// --- 우클릭 메뉴 상태 -------------------------------------------------------------------------

export interface AttachMenuState {
  menu: { x: number; y: number; refs: ContextRef[] } | null;
  open(x: number, y: number, refs: ContextRef[]): void;
  close(): void;
}

export const useAttachMenuStore = create<AttachMenuState>((set) => ({
  menu: null,
  open: (x, y, refs) => set({ menu: refs.length ? { x, y, refs } : null }),
  close: () => set({ menu: null }),
}));
