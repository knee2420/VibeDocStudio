import React, { useEffect, useMemo, useRef, useState } from "react";

import { A4_PAGE_STRIDE_PX, type VDocPage } from "@vibe/vdoc-schema";

export interface WindowedPageChunkerProps {
  pages: VDocPage[];
  activePageId?: string;
  chunkSize?: number;
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
 * Sliding-window A4 page chunker (`10~20p` active DOM window + proportional top/bottom height spacers).
 *
 * 스페이서는 언마운트된 페이지의 실제 높이만큼 자리를 차지하므로 스크롤바 길이 · 위치가 문서 전체와
 * 일치한다. 스크롤 위치에서 지금 보고 있는 쪽을 계산해 창을 따라 옮기고, `activePageId` 점프로도 옮긴다.
 */
export const WindowedPageChunker: React.FC<WindowedPageChunkerProps> = ({
  pages,
  activePageId,
  chunkSize = 15,
  renderPage,
}) => {
  const totalPages = pages.length;
  const virtualized = totalPages > chunkSize;
  const rootRef = useRef<HTMLDivElement>(null);
  const [windowStart, setWindowStart] = useState<number>(1);
  const [prevActivePageId, setPrevActivePageId] = useState<string | undefined>(activePageId);

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
        // 청커 윗변이 스크롤 영역 윗변보다 얼마나 위로 지나갔는지 = 청커 안에서의 스크롤 거리
        const offset = scroller.getBoundingClientRect().top - root.getBoundingClientRect().top;
        const viewingPage = Math.floor(Math.max(0, offset) / A4_PAGE_STRIDE_PX) + 1;
        const next = clampStart(viewingPage - Math.floor(chunkSize / 3), totalPages, chunkSize);
        setWindowStart((prev) => (Math.abs(prev - next) >= Math.ceil(chunkSize / 3) ? next : prev));
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [virtualized, totalPages, chunkSize]);

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
    return {
      startPage: clampedStart,
      visiblePages: pages.slice(clampedStart - 1, clampedEnd),
      topSpacerPx: (clampedStart - 1) * A4_PAGE_STRIDE_PX,
      bottomSpacerPx: (totalPages - clampedEnd) * A4_PAGE_STRIDE_PX,
    };
  }, [pages, totalPages, chunkSize, windowStart, virtualized]);

  return (
    <div ref={rootRef} data-testid="windowed-page-chunker" className="w-full">
      {/* 언마운트된 쪽의 실제 높이만큼 자리를 지킨다 (스크롤바 길이 · 위치 유지) */}
      {topSpacerPx > 0 && <div aria-hidden="true" data-testid="chunker-top-spacer" style={{ height: `${topSpacerPx}px` }} />}

      {visiblePages.map((page, idx) => renderPage(page, startPage - 1 + idx))}

      {bottomSpacerPx > 0 && <div aria-hidden="true" data-testid="chunker-bottom-spacer" style={{ height: `${bottomSpacerPx}px` }} />}
    </div>
  );
};
