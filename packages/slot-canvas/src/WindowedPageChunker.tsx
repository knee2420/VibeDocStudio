import React, { useEffect, useMemo, useRef, useState } from "react";

import { A4_PAGE_GAP_PX, resolvePageDimensionsPx, type VDocPage } from "@vibe/vdoc-schema";

export const VDOC_REVEAL_PAGE_EVENT = "vdoc:reveal-page";

export interface WindowedPageChunkerProps {
  pages: VDocPage[];
  activePageId?: string;
  chunkSize?: number;
  /** 쪽 사이 간격 (px). 이음매 없는 지면은 0. */
  pageGapPx?: number;
  renderPage: (page: VDocPage, index: number) => React.ReactNode;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/** 1-based 창 시작점을 `[1, maxStart]` 범위로 고정한다. */
export function clampWindowStart(start: number, totalPages: number, chunkSize: number): number {
  return Math.max(1, Math.min(start, Math.max(1, totalPages - chunkSize + 1)));
}

/** 특정 `pageNumber` 가 창 상단 1/3 부근에 오도록 시작점을 계산한다. */
export function computeWindowStartForPage(pageNumber: number, totalPages: number, chunkSize: number): number {
  if (totalPages <= chunkSize) return 1;
  return clampWindowStart(pageNumber - Math.floor(chunkSize / 3), totalPages, chunkSize);
}

/**
 * 스크롤 위치에서 다음 슬라이딩 창 시작점을 계산한다.
 * 뷰포트에 보이는 페이지가 현재 창 밖에 있거나 경계(`1`, `maxStart`)에 닿았을 때는 히스테리시스와 무관하게 갱신한다.
 */
export function computeNextWindowStartOnScroll(params: {
  prevStart: number;
  viewingStartPage: number;
  viewingEndPage: number;
  totalPages: number;
  chunkSize: number;
}): number {
  const { prevStart, viewingStartPage, viewingEndPage, totalPages, chunkSize } = params;
  if (totalPages <= chunkSize) return 1;
  const maxStart = Math.max(1, totalPages - chunkSize + 1);
  const clampedPrev = clampWindowStart(prevStart, totalPages, chunkSize);
  const prevEnd = Math.min(totalPages, clampedPrev + chunkSize - 1);
  const next = computeWindowStartForPage(viewingStartPage, totalPages, chunkSize);

  if (viewingStartPage < clampedPrev || viewingEndPage > prevEnd) {
    return next;
  }
  const hysteresis = Math.ceil(chunkSize / 3);
  if (next !== clampedPrev && (next === 1 || next === maxStart || Math.abs(clampedPrev - next) >= hysteresis)) {
    return next;
  }
  return clampedPrev;
}

/**
 * Sliding-window page chunker (`10~20p` active DOM window + proportional top/bottom height spacers).
 *
 * 스페이서는 언마운트된 페이지의 실제 `pageRect` 높이만큼 자리를 차지하므로 가변 세로 비율 문서에서도
 * 스크롤바 길이 · 위치가 일치한다.
 */
export const WindowedPageChunker: React.FC<WindowedPageChunkerProps> = ({
  pages,
  activePageId,
  chunkSize = 15,
  pageGapPx = A4_PAGE_GAP_PX,
  renderPage,
}) => {
  const totalPages = pages.length;
  const virtualized = totalPages > chunkSize;
  const rootRef = useRef<HTMLDivElement>(null);
  const [windowStart, setWindowStart] = useState<number>(() => {
    const idx = activePageId ? pages.findIndex((p) => p.pageId === activePageId) : -1;
    return idx >= 0 ? computeWindowStartForPage(idx + 1, pages.length, chunkSize) : 1;
  });
  const [prevActivePageId, setPrevActivePageId] = useState<string | undefined>(activePageId);
  const [scrollHoldToken, setScrollHoldToken] = useState(0);
  const scrollHoldUntilRef = useRef(0);

  const cumulativeBottoms = useMemo(() => {
    const sums: number[] = [];
    let acc = 0;
    for (const p of pages) {
      acc += resolvePageDimensionsPx(p).height + pageGapPx;
      sums.push(acc);
    }
    return sums;
  }, [pages, pageGapPx]);

  // Sync window automatically when activePageId jumps outside current window
  if (activePageId !== prevActivePageId) {
    setPrevActivePageId(activePageId);
    const idx = activePageId ? pages.findIndex((p) => p.pageId === activePageId) : -1;
    if (idx >= 0) {
      const pageNum = idx + 1;
      const clamped = clampWindowStart(windowStart, totalPages, chunkSize);
      const end = Math.min(totalPages, clamped + chunkSize - 1);
      if (pageNum < clamped || pageNum > end) {
        setWindowStart(computeWindowStartForPage(pageNum, totalPages, chunkSize));
        setScrollHoldToken((n) => n + 1);
      }
    }
  }

  // 프로그래밍 방식 페이지 이동(`scrollToCanvasPage` smooth 스크롤) 중에는 통과 중인 상단 페이지로 창이 되돌아가지 않게 보호한다.
  useEffect(() => {
    if (scrollHoldToken === 0) return;
    scrollHoldUntilRef.current = performance.now() + 800;
    const root = rootRef.current;
    const scroller = findScrollParent(root);
    if (!scroller) return;
    const releaseHold = () => {
      scrollHoldUntilRef.current = 0;
    };
    scroller.addEventListener("scrollend", releaseHold, { once: true });
    scroller.addEventListener("wheel", releaseHold, { once: true, passive: true });
    scroller.addEventListener("pointerdown", releaseHold, { once: true, passive: true });
    return () => {
      scroller.removeEventListener("scrollend", releaseHold);
      scroller.removeEventListener("wheel", releaseHold);
      scroller.removeEventListener("pointerdown", releaseHold);
    };
  }, [scrollHoldToken]);

  // 같은 activePageId 를 다시 클릭하거나 직접 스크롤 명령이 올 때도 대상 페이지가 DOM 에 마운트되게 보장한다.
  useEffect(() => {
    if (!virtualized || typeof window === "undefined") return;
    const onRevealPage = (ev: Event) => {
      const pageId = (ev as CustomEvent<{ pageId?: string }>).detail?.pageId;
      if (!pageId) return;
      const idx = pages.findIndex((p) => p.pageId === pageId);
      if (idx < 0) return;
      const pageNum = idx + 1;
      const clamped = clampWindowStart(windowStart, totalPages, chunkSize);
      const end = Math.min(totalPages, clamped + chunkSize - 1);
      if (pageNum < clamped || pageNum > end) {
        setWindowStart(computeWindowStartForPage(pageNum, totalPages, chunkSize));
        setScrollHoldToken((n) => n + 1);
      }
    };
    window.addEventListener(VDOC_REVEAL_PAGE_EVENT, onRevealPage);
    return () => window.removeEventListener(VDOC_REVEAL_PAGE_EVENT, onRevealPage);
  }, [virtualized, pages, totalPages, chunkSize, windowStart]);

  // 스크롤 위치 → 뷰포트가 걸친 쪽 범위 → 창 시작점
  useEffect(() => {
    if (!virtualized) return;
    const root = rootRef.current;
    const scroller = findScrollParent(root);
    if (!root || !scroller) return;
    let frame = 0;
    const syncFromScroll = () => {
      if (performance.now() < scrollHoldUntilRef.current) return;
      const topOffset = Math.max(0, scroller.getBoundingClientRect().top - root.getBoundingClientRect().top);
      const bottomOffset = Math.max(topOffset, topOffset + scroller.clientHeight - 1);
      let startIdx = cumulativeBottoms.findIndex((bottom) => topOffset < bottom);
      if (startIdx < 0) startIdx = Math.max(0, totalPages - 1);
      let endIdx = cumulativeBottoms.findIndex((bottom) => bottomOffset < bottom);
      if (endIdx < 0) endIdx = Math.max(0, totalPages - 1);
      setWindowStart((prev) =>
        computeNextWindowStartOnScroll({
          prevStart: prev,
          viewingStartPage: startIdx + 1,
          viewingEndPage: Math.max(startIdx, endIdx) + 1,
          totalPages,
          chunkSize,
        })
      );
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncFromScroll);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [virtualized, totalPages, chunkSize, cumulativeBottoms]);

  const { startPage, visiblePages, topSpacerPx, bottomSpacerPx } = useMemo(() => {
    if (!virtualized) {
      return {
        startPage: 1,
        visiblePages: pages,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      };
    }
    const clampedStart = clampWindowStart(windowStart, totalPages, chunkSize);
    const clampedEnd = Math.min(totalPages, clampedStart + chunkSize - 1);
    const topPx = clampedStart > 1 ? cumulativeBottoms[clampedStart - 2] ?? 0 : 0;
    const totalPx = cumulativeBottoms[totalPages - 1] ?? 0;
    const endPx = cumulativeBottoms[clampedEnd - 1] ?? totalPx;
    return {
      startPage: clampedStart,
      visiblePages: pages.slice(clampedStart - 1, clampedEnd),
      topSpacerPx: topPx,
      bottomSpacerPx: Math.max(0, totalPx - endPx),
    };
  }, [pages, totalPages, chunkSize, windowStart, virtualized, cumulativeBottoms]);

  return (
    <div ref={rootRef} data-testid="windowed-page-chunker" className="w-full">
      {/* 언마운트된 쪽의 실제 높이만큼 자리를 지킨다 (스크롤바 길이 · 위치 유지) */}
      {topSpacerPx > 0 && <div aria-hidden="true" data-testid="chunker-top-spacer" style={{ height: `${topSpacerPx}px` }} />}

      {visiblePages.map((page, idx) => renderPage(page, startPage - 1 + idx))}

      {bottomSpacerPx > 0 && <div aria-hidden="true" data-testid="chunker-bottom-spacer" style={{ height: `${bottomSpacerPx}px` }} />}
    </div>
  );
};
