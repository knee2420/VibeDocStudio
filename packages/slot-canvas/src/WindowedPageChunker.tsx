import React, { useEffect, useMemo, useRef, useState } from "react";

import { A4_PAGE_STRIDE_PX, type VDocPage } from "@vibe/vdoc-schema";

export interface WindowedPageChunkerProps {
  pages: VDocPage[];
  activePageId?: string;
  chunkSize?: number;
  onSelectWindowStart?: (startPage: number) => void;
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
 * 일치한다. 스크롤 위치에서 지금 보고 있는 쪽을 계산해 창을 따라 옮기고, 이전/다음 버튼과
 * `activePageId` 점프로도 옮길 수 있다.
 */
export const WindowedPageChunker: React.FC<WindowedPageChunkerProps> = ({
  pages,
  activePageId,
  chunkSize = 15,
  onSelectWindowStart,
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

  const { startPage, endPage, visiblePages, topSpacerPx, bottomSpacerPx } = useMemo(() => {
    if (!virtualized) {
      return {
        startPage: 1,
        endPage: Math.max(1, totalPages),
        visiblePages: pages,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      };
    }
    const clampedStart = clampStart(windowStart, totalPages, chunkSize);
    const clampedEnd = Math.min(totalPages, clampedStart + chunkSize - 1);
    return {
      startPage: clampedStart,
      endPage: clampedEnd,
      visiblePages: pages.slice(clampedStart - 1, clampedEnd),
      topSpacerPx: (clampedStart - 1) * A4_PAGE_STRIDE_PX,
      bottomSpacerPx: (totalPages - clampedEnd) * A4_PAGE_STRIDE_PX,
    };
  }, [pages, totalPages, chunkSize, windowStart, virtualized]);

  const handleShiftWindow = (nextStart: number) => {
    const clamped = clampStart(nextStart, totalPages, chunkSize);
    setWindowStart(clamped);
    onSelectWindowStart?.(clamped);
  };

  return (
    <div ref={rootRef} data-testid="windowed-page-chunker" className="w-full">
      {/* Windowed Chunk Status Bar (always visible so users & auditors can inspect DOM virtualization metrics) */}
      <div className="max-w-[794px] mx-auto mb-4 px-3.5 py-2 rounded-xl bg-white/90 backdrop-blur border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
            ⚡ 슬라이딩 윈도우 청크 ({chunkSize}p 단위)
          </span>
          <span className="text-slate-600 font-mono tabular-nums">
            렌더링 구간: <strong className="text-slate-900">{startPage}–{endPage}p</strong> / 전체{" "}
            <strong className="text-slate-900">{totalPages}p</strong>
          </span>
          {virtualized && (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono tabular-nums">
              DOM 마운트: {visiblePages.length}장 (가상 여백 상단 {Math.round(topSpacerPx)}px · 하단 {Math.round(bottomSpacerPx)}px)
            </span>
          )}
        </div>

        {virtualized && (
          <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
            <button
              type="button"
              disabled={startPage <= 1}
              onClick={() => handleShiftWindow(startPage - chunkSize)}
              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-[11px] font-medium text-slate-700 cursor-pointer"
            >
              ◀ 이전 {chunkSize}p
            </button>
            <button
              type="button"
              disabled={endPage >= totalPages}
              onClick={() => handleShiftWindow(startPage + chunkSize)}
              className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-[11px] font-medium text-slate-700 cursor-pointer"
            >
              다음 {chunkSize}p ▶
            </button>
          </div>
        )}
      </div>

      {topSpacerPx > 0 && (
        <div
          aria-hidden="true"
          data-testid="chunker-top-spacer"
          style={{ height: `${topSpacerPx}px` }}
          className="max-w-[794px] mx-auto rounded-lg border border-dashed border-slate-300/70 bg-slate-100/40 flex items-start justify-center pt-6 text-xs text-slate-400 font-mono tabular-nums"
        >
          ▲ 상단 가상화 구간 (1 ~ {startPage - 1}p 언마운트됨 · 스크롤하면 자동으로 로드)
        </div>
      )}

      {visiblePages.map((page, idx) => renderPage(page, startPage - 1 + idx))}

      {bottomSpacerPx > 0 && (
        <div
          aria-hidden="true"
          data-testid="chunker-bottom-spacer"
          style={{ height: `${bottomSpacerPx}px` }}
          className="max-w-[794px] mx-auto rounded-lg border border-dashed border-slate-300/70 bg-slate-100/40 flex items-start justify-center pt-6 text-xs text-slate-400 font-mono tabular-nums"
        >
          ▼ 하단 가상화 구간 ({endPage + 1} ~ {totalPages}p 언마운트됨 · 스크롤하면 자동으로 로드)
        </div>
      )}
    </div>
  );
};
