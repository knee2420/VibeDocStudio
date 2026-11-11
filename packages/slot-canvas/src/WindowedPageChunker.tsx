import React, { useEffect, useMemo, useRef, useState } from "react";

import { A4_PAGE_GAP_PX, resolvePageDimensionsPx, type VDocPage } from "@vibe/vdoc-schema";

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

function clampStart(start: number, totalPages: number, chunkSize: number): number {
  return Math.max(1, Math.min(start, Math.max(1, totalPages - chunkSize + 1)));
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
  const [windowStart, setWindowStart] = useState<number>(1);
  const [prevActivePageId, setPrevActivePageId] = useState<string | undefined>(activePageId);

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
      if (pageNum < windowStart || pageNum >= windowStart + chunkSize) {
        setWindowStart(Math.floor(idx / chunkSize) * chunkSize + 1);
      }
    }
  }

  // 스크롤 위치 → 보고 있는 쪽 → 창 시작점 (창의 1/3 지점에 오도록)
  useEffect(() => {
    if (!virtualized) return;
    const root = rootRef.current;
    const scroller = findScrollParent(root);
    if (!root || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = Math.max(0, scroller.getBoundingClientRect().top - root.getBoundingClientRect().top);
        let idx = cumulativeBottoms.findIndex((bottom) => offset < bottom);
        if (idx < 0) idx = Math.max(0, totalPages - 1);
        const viewingPage = idx + 1;
        const next = clampStart(viewingPage - Math.floor(chunkSize / 3), totalPages, chunkSize);
        setWindowStart((prev) => (Math.abs(prev - next) >= Math.ceil(chunkSize / 3) ? next : prev));
      });
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
    const clampedStart = clampStart(windowStart, totalPages, chunkSize);
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
