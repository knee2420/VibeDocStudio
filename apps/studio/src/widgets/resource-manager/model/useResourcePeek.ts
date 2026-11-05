import { useEffect } from "react";
import type React from "react";
import { create } from "zustand";
import type { ResourceItem } from "@vibe/vdoc-schema";

interface ResourcePeekState {
  open: { item: ResourceItem; x: number; y: number } | null;
  hovered: { item: ResourceItem; x: number; y: number } | null;
  hover: (target: { item: ResourceItem; x: number; y: number } | null, withModifier: boolean) => void;
  show: () => void;
  hide: () => void;
}

export const useResourcePeekStore = create<ResourcePeekState>((set, get) => ({
  open: null,
  hovered: null,
  hover: (target, withModifier) =>
    set({ hovered: target, open: target && withModifier ? target : null }),
  show: () => {
    const { hovered } = get();
    if (hovered) set({ open: hovered });
  },
  hide: () => set({ open: null }),
}));

const hasModifier = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

/** 트리 노드에 붙일 Ctrl + 호버 피크 핸들러 */
export function useResourcePeekTrigger() {
  const hover = useResourcePeekStore((s) => s.hover);

  return (item: ResourceItem) => {
    const track = (e: React.MouseEvent) => {
      hover({ item, x: e.clientX, y: e.clientY }, hasModifier(e));
    };
    return {
      onMouseEnter: track,
      onMouseMove: track,
      onMouseLeave: () => hover(null, false),
    };
  };
}

/** Ctrl/⌘ 키 감지 리스너 (호버 중에 Ctrl 키를 누르면 즉시 미리보기 팝업 열림) */
export function useResourcePeekKeyboard(): void {
  useEffect(() => {
    const { show, hide } = useResourcePeekStore.getState();
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

