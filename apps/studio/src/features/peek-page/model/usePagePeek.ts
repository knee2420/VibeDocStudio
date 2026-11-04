import { useEffect } from "react";
import type React from "react";
import { create } from "zustand";

/**
 * Ctrl(⌘) + 호버로 페이지 썸네일을 커서 옆에 띄우는 "퀵 피크".
 *
 * 어느 목록(아웃라인 · 페이지 미리보기 · 참조 덱)에서든 `usePeekTrigger()` 가 돌려준
 * 핸들러를 항목에 붙이면 된다. Ctrl 을 누르고 떼는 키 리스너는 `usePeekKeyboard()` 하나뿐이다.
 */
export interface PeekTarget {
  docId: string;
  pageId: string;
}

interface PagePeekState {
  /** 지금 보여주는 피크. */
  open: (PeekTarget & { x: number; y: number }) | null;
  /** 커서 아래 항목 (Ctrl 을 누르면 바로 열 대상). */
  hovered: (PeekTarget & { x: number; y: number }) | null;
  hover: (target: (PeekTarget & { x: number; y: number }) | null, withModifier: boolean) => void;
  show: () => void;
  hide: () => void;
}

export const usePagePeekStore = create<PagePeekState>((set, get) => ({
  open: null,
  hovered: null,
  hover: (target, withModifier) => set({ hovered: target, open: target && withModifier ? target : null }),
  show: () => {
    const { hovered } = get();
    if (hovered) set({ open: hovered });
  },
  hide: () => set({ open: null }),
}));

const hasModifier = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

/** 목록 항목에 붙일 호버 핸들러. `target` 이 `null` 이면 피크하지 않는다. */
export function usePeekTrigger() {
  const hover = usePagePeekStore((s) => s.hover);
  return (target: PeekTarget | null) => {
    if (!target) return {};
    const track = (e: React.MouseEvent) => hover({ ...target, x: e.clientX, y: e.clientY }, hasModifier(e));
    return {
      onMouseEnter: track,
      onMouseMove: track,
      onMouseLeave: () => hover(null, false),
    };
  };
}

/** 전역 Ctrl 키 · 창 포커스 처리. 피크 카드와 함께 한 번만 마운트한다. */
export function usePeekKeyboard(): void {
  useEffect(() => {
    const { show, hide } = usePagePeekStore.getState();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") show();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!hasModifier(e)) hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hide);
    };
  }, []);
}

/** 문서 ID(+ 선택적 페이지 ID)를 피크 대상으로. 페이지가 없으면 문서 첫 페이지, 문서를 모르면 `null`. */
export function resolvePeekTarget(
  docs: ReadonlyArray<{ docId: string; pages: ReadonlyArray<{ pageId: string }> }>,
  docId: string | null | undefined,
  pageId?: string | null
): PeekTarget | null {
  if (!docId) return null;
  const resolvedPageId = pageId ?? docs.find((d) => d.docId === docId)?.pages[0]?.pageId;
  return resolvedPageId ? { docId, pageId: resolvedPageId } : null;
}
