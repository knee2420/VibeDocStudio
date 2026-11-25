import React, { useEffect, useRef, useState } from "react";

import type { VDocPage } from "@vibe/vdoc-schema";

import { useAssetLibraryStore } from "@/entities/asset-library";

import { findBlockPlacement, type BlockPlacementTarget } from "../model/findBlockPlacement";

const isTypingTarget = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
};

interface Props {
  getMain: () => HTMLElement | null;
  pages: readonly Pick<VDocPage, "pageId" | "blocks">[];
  editable: boolean;
  onPlace: (pageId: string, kind: string, index: number) => void;
}

/**
 * 피그마식 블록 배치 도구 (툴바 · 에셋에서 블록을 고르면 켜진다).
 * - 커서가 십자로 바뀌고, 포인터를 따라 블록 사이에 파란 삽입선이 보인다
 * - 클릭한 자리에 넣고 이동(V) 도구로 돌아간다. Esc · V 는 취소, T 는 텍스트, H 는 손 도구
 * 배치 중 클릭은 슬롯 선택 · 편집으로 새지 않게 캡처 단계에서 막는다.
 */
export const BlockPlacementLayer: React.FC<Props> = ({ getMain, pages, editable, onPlace }) => {
  const activeTool = useAssetLibraryStore((s) => s.activeTool);
  const placement = useAssetLibraryStore((s) => s.placement);
  const [target, setTarget] = useState<BlockPlacementTarget | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef({ pages, onPlace });
  latest.current = { pages, onPlace };

  // 도구 단축키 (피그마): V 이동 · T 텍스트 · H 손 · Esc 배치 취소. 글자 입력 중 · 조합키는 건드리지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const store = useAssetLibraryStore.getState();
      const key = e.key.toLowerCase();
      if (key === "escape" && store.activeTool !== "select") {
        e.preventDefault();
        e.stopPropagation();
        store.setActiveTool("select");
      } else if (key === "v" && !e.shiftKey) store.setActiveTool("select");
      else if (key === "h" && !e.shiftKey) store.setActiveTool("hand");
      else if (key === "t" && !e.shiftKey && editable) store.armPlacement({ kind: "text", label: "텍스트" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editable]);

  const placing = activeTool === "place" && placement !== null && editable;

  useEffect(() => {
    const main = getMain();
    if (!placing || !main || !placement) {
      setTarget(null);
      setPointer(null);
      return;
    }
    main.dataset.placing = "";
    let frame = 0;
    let last: { x: number; y: number } | null = null;
    const update = () => {
      frame = 0;
      if (!last) return;
      setPointer(last);
      setTarget(findBlockPlacement(main, latest.current.pages, last.x, last.y));
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      last = null;
      setTarget(null);
      setPointer(null);
    };
    const swallow = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest("[data-testid='figma-floating-toolbar']")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest("[data-testid='figma-floating-toolbar']")) return;
      swallow(e);
      const hit = findBlockPlacement(main, latest.current.pages, e.clientX, e.clientY);
      if (!hit) return;
      latest.current.onPlace(hit.pageId, placement.kind, hit.index);
      useAssetLibraryStore.getState().setActiveTool("select");
    };
    main.addEventListener("pointermove", onMove);
    main.addEventListener("pointerleave", onLeave);
    main.addEventListener("pointerdown", onDown, true);
    main.addEventListener("mousedown", swallow, true);
    main.addEventListener("click", swallow, true);
    return () => {
      delete main.dataset.placing;
      if (frame) cancelAnimationFrame(frame);
      main.removeEventListener("pointermove", onMove);
      main.removeEventListener("pointerleave", onLeave);
      main.removeEventListener("pointerdown", onDown, true);
      main.removeEventListener("mousedown", swallow, true);
      main.removeEventListener("click", swallow, true);
    };
  }, [placing, placement, getMain]);

  if (!placing || !placement) return null;
  return (
    <>
      {target && (
        <div
          data-testid="block-placement-line"
          aria-hidden
          className="fixed z-[60] pointer-events-none"
          style={{ left: target.line.left, top: target.line.top - 1, width: target.line.width, height: 2, background: "var(--vds-accent)" }}
        >
          <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-white border-2 border-[var(--vds-accent)]" />
          <span className="absolute -right-1 -top-[3px] w-2 h-2 rounded-full bg-white border-2 border-[var(--vds-accent)]" />
        </div>
      )}
      {pointer && (
        <div
          aria-hidden
          className="fixed z-[61] pointer-events-none px-1.5 py-0.5 rounded bg-[var(--vds-accent)] text-white text-[11px] font-medium shadow-sm whitespace-nowrap"
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
        >
          {target ? `${placement.label} 넣기` : `${placement.label} — 페이지 위에서 클릭`}
        </div>
      )}
    </>
  );
};
