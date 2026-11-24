/**
 * 2D 캔버스 마키(드래그 사각형) 선택 — 빈 곳에서 끌면 사각형에 걸린 블록을 고른다 (Figma 식).
 *
 * 역할: 포인터를 따라 사각형을 그리고 후보 요소의 화면 사각형을 모아 `@vibe/selection-core` 로 적중을 가린다.
 * 무엇을 고를지(후보) · 고른 뒤 상태는 부르는 쪽이 정한다 — 이 훅은 문서 · 선택 저장소를 모른다.
 * - Shift / Ctrl(⌘) 를 누른 채 시작하면 기존 선택에 더한다 (additive).
 * - Alt 를 누르면 완전히 들어온 것만 (contain).
 * - 끌림이 문턱(4px)보다 짧으면 마키가 아니다 — 클릭은 원래 처리로 간다.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { hitTestRects, isMarqueeDrag, rectFromPoints, type Rect, type SelectionItem } from "@vibe/selection-core";

export interface MarqueeCandidate {
  readonly id: string;
  readonly el: Element;
}

export interface MarqueeModifiers {
  readonly additive: boolean;
  readonly contain: boolean;
}

export interface UseMarqueeSelectionOptions {
  /** 스크롤 컨테이너 (사각형은 이 안의 내용 좌표로 그린다). */
  readonly containerRef: React.RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  /** 이 요소에서 끌기를 시작해도 되는가 (블록 · 입력 · 버튼 위면 false 로). */
  readonly canStart: (target: HTMLElement) => boolean;
  /** 드래그 시작 때 한 번 부른다 — 고를 수 있는 요소들. */
  readonly collect: () => readonly MarqueeCandidate[];
  /** 끌기가 마키로 확정된 순간 (문턱을 넘었을 때) 한 번. */
  readonly onStart?: (mods: MarqueeModifiers) => void;
  /** 끄는 동안 (프레임마다 한 번) — 지금 걸린 id. */
  readonly onUpdate?: (ids: readonly string[], mods: MarqueeModifiers) => void;
  /** 놓았을 때 — 최종 id. */
  readonly onCommit: (ids: readonly string[], mods: MarqueeModifiers) => void;
}

export interface MarqueeState {
  /** 컨테이너 내용 좌표의 사각형 (그릴 때만). */
  readonly rect: Rect | null;
  /** 컨테이너에 붙일 포인터 핸들러. */
  readonly onPointerDown: (ev: React.PointerEvent) => void;
}

export function useMarqueeSelection(opts: UseMarqueeSelectionOptions): MarqueeState {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [rect, setRect] = useState<Rect | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback((ev: React.PointerEvent) => {
    const o = optsRef.current;
    const container = o.containerRef.current;
    if (!o.enabled || !container || ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (!target || !o.canStart(target)) return;

    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const mods: MarqueeModifiers = { additive: ev.shiftKey || ev.ctrlKey || ev.metaKey, contain: ev.altKey };
    let dragging = false;
    let frame = 0;
    let lastX = x0;
    let lastY = y0;
    let candidates: readonly MarqueeCandidate[] = [];
    let lastKey = "";
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;

    const toContent = (r: Rect): Rect => {
      const box = container.getBoundingClientRect();
      const dx = container.scrollLeft - box.left;
      const dy = container.scrollTop - box.top;
      return { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
    };

    const hits = (): string[] => {
      const marquee = rectFromPoints(x0 - (container.scrollLeft - startScrollLeft), y0 - (container.scrollTop - startScrollTop), lastX, lastY);
      const rects = candidates.map((c) => {
        const b = c.el.getBoundingClientRect();
        return { item: { id: c.id, kind: "block" } as SelectionItem, rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } };
      });
      return hitTestRects(rects, marquee, mods.contain ? "contain" : "intersect").map((i) => i.id);
    };

    const tick = () => {
      frame = 0;
      const ids = hits();
      const key = ids.join("|");
      const start = { x: x0 - (container.scrollLeft - startScrollLeft), y: y0 - (container.scrollTop - startScrollTop) };
      setRect(toContent(rectFromPoints(start.x, start.y, lastX, lastY)));
      if (key !== lastKey) {
        lastKey = key;
        optsRef.current.onUpdate?.(ids, mods);
      }
    };

    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dragging) {
        if (!isMarqueeDrag(x0, y0, lastX, lastY)) return;
        dragging = true;
        candidates = optsRef.current.collect();
        optsRef.current.onStart?.(mods);
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (dragging && !frame) frame = requestAnimationFrame(tick);
    };

    const finish = (commit: boolean) => {
      cleanupRef.current?.();
      if (frame) cancelAnimationFrame(frame);
      if (dragging && commit) {
        optsRef.current.onCommit(hits(), mods);
        // 마키가 끝난 자리의 click 은 선택을 덮어쓰지 않게 한 번 삼킨다
        const swallow = (ce: MouseEvent) => {
          ce.stopPropagation();
          ce.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      setRect(null);
    };

    const onUp = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    container.addEventListener("scroll", onScroll, { passive: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      container.removeEventListener("scroll", onScroll);
      cleanupRef.current = null;
    };
  }, []);

  return { rect, onPointerDown };
}

/** 마키 사각형 그리기 (스크롤 컨테이너 안, position: relative 기준). */
export const MarqueeOverlay: React.FC<{ readonly rect: Rect | null }> = ({ rect }) => {
  if (!rect) return null;
  return (
    <div
      aria-hidden
      data-vdoc-marquee
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: Math.max(0, rect.right - rect.left),
        height: Math.max(0, rect.bottom - rect.top),
        border: "1px solid rgba(13, 153, 255, 0.9)",
        background: "rgba(13, 153, 255, 0.08)",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
};
