import React, { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";

import { getBlockSlotIds, type VDocPage } from "@vibe/vdoc-schema";

import { ChangeOverviewRuler, type RulerKind } from "@/features/document-diff";

import type { GutterChangeKind, SlotGutterChange } from "../model/WorkingChangeContext";

const MINIMAP_OPEN_KEY = "vdoc:canvas-minimap-open";
const readMinimapOpen = () => {
  try {
    const v = window.localStorage.getItem(MINIMAP_OPEN_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
};

const LINE_COLOR: Record<GutterChangeKind, string> = {
  add: "bg-[#2da44e]",
  mod: "bg-[#0d99ff]",
  del: "bg-[#cf222e]",
};

/**
 * Antigravity / VS Code 스타일 우측 문서 미니맵 + 변경 오버뷰 룰러.
 * - 왼쪽(58px, 접기 가능): 전체 페이지를 초소형 와이어프레임으로 조망 + 바뀐 블록 컬러 스트립 + 현재 뷰포트 슬라이더
 * - 오른쪽(16px, 상시): ChangeOverviewRuler (문서 전체의 추가/수정/삭제 눈금 + 클릭 즉시 점프)
 */
export const CanvasMinimapRuler: React.FC<{
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pages: readonly VDocPage[];
  changeMap: ReadonlyMap<string, SlotGutterChange>;
  activePageId: string | null;
  onJumpPage: (pageId: string) => void;
  depsKey: string;
}> = ({ scrollRef, pages, changeMap, activePageId, onJumpPage, depsKey }) => {
  const [minimapOpen, setMinimapOpen] = useState(readMinimapOpen);
  const mapRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const toggleMinimap = () => {
    setMinimapOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MINIMAP_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // 현재 스크롤 뷰포트 슬라이더를 미니맵 높이에 맞춰 직접 동기화 (리렌더 없이 60fps)
  useEffect(() => {
    if (!minimapOpen) return;
    const scroller = scrollRef.current;
    const mapEl = mapRef.current;
    const slider = sliderRef.current;
    if (!scroller || !mapEl || !slider) return;

    const sync = () => {
      const total = Math.max(1, scroller.scrollHeight);
      const mapH = Math.max(1, mapEl.clientHeight);
      const ratioTop = scroller.scrollTop / total;
      const ratioH = Math.min(1, scroller.clientHeight / total);
      slider.style.top = `${ratioTop * mapH}px`;
      slider.style.height = `${Math.max(20, ratioH * mapH)}px`;
      slider.style.display = scroller.scrollHeight > scroller.clientHeight + 2 ? "block" : "none";
    };

    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(scroller);
    if (scroller.firstElementChild) ro?.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [scrollRef, minimapOpen, depsKey, pages.length]);

  const scrollToMapY = (clientY: number) => {
    const scroller = scrollRef.current;
    const mapEl = mapRef.current;
    if (!scroller || !mapEl) return;
    const rect = mapEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    scroller.scrollTop = ratio * scroller.scrollHeight - scroller.clientHeight / 2;
  };

  // 페이지별 블록 와이어프레임 + 변경 상태 요약
  const pageSummaries = useMemo(
    () =>
      pages.map((page, idx) => {
        const blocks = page.blocks.slice(0, 12).map((b) => {
          const sids = getBlockSlotIds(b);
          let kind: GutterChangeKind | null = null;
          for (const sid of sids) {
            const c = changeMap.get(sid);
            if (c) {
              kind = c.kind === "add" ? "add" : kind === "add" ? "add" : c.kind;
            }
          }
          return { blockId: b.blockId, kind, isTable: b.kind === "structured-table" || b.kind === "table", isHeading: b.kind === "heading" };
        });
        const changedCount = blocks.filter((b) => b.kind !== null).length;
        return { pageId: page.pageId, pageNo: idx + 1, label: page.pageLabel || `${idx + 1}쪽`, blocks, changedCount };
      }),
    [pages, changeMap],
  );

  return (
    <div
      data-testid="canvas-minimap-ruler"
      className="h-full flex shrink-0 bg-[#f8f9fb] border-l border-slate-200/80 select-none relative z-10"
    >
      {/* 왼쪽: 미니맵 스트립 (토글 가능) */}
      {minimapOpen && (
        <div className="w-[62px] h-full flex flex-col border-r border-slate-200/70 bg-[#f4f5f8]">
          <div className="h-6 px-1.5 flex items-center justify-between border-b border-slate-200/70 shrink-0">
            <span className="text-[9px] font-mono font-semibold text-slate-400">MAP</span>
            <button
              type="button"
              onClick={toggleMinimap}
              title="미니맵 접기 (변경 룰러만 남기기)"
              className="p-0.5 rounded hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <MapIcon className="w-2.5 h-2.5" />
            </button>
          </div>

          <div
            ref={mapRef}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              scrollToMapY(e.clientY);
              e.currentTarget.setPointerCapture(e.pointerId);
              const move = (ev: PointerEvent) => scrollToMapY(ev.clientY);
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onWheel={(e) => {
              const el = scrollRef.current;
              if (el) el.scrollTop += e.deltaY;
            }}
            className="flex-1 relative overflow-hidden px-1.5 py-2 flex flex-col gap-1.5 cursor-pointer"
          >
            {/* 현재 화면에 보이는 범위 슬라이더 */}
            <div
              ref={sliderRef}
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 bg-[#0d99ff]/[0.12] border-y border-[#0d99ff]/40 z-20"
            />

            {pageSummaries.map((p) => {
              const isCurrent = p.pageId === activePageId;
              return (
                <div
                  key={p.pageId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpPage(p.pageId);
                  }}
                  title={`${p.pageNo}쪽 · ${p.label}${p.changedCount > 0 ? ` (변경 ${p.changedCount}곳)` : ""}`}
                  className={`relative w-full aspect-[1/1.38] max-h-[68px] rounded-[2px] bg-white border p-1 flex flex-col gap-[2px] overflow-hidden shrink-0 transition-colors ${
                    isCurrent ? "border-[#0d99ff] ring-1 ring-[#0d99ff]/30" : "border-slate-300/80 hover:border-slate-400"
                  }`}
                >
                  {p.blocks.length === 0 ? (
                    <div className="w-2/3 h-[2px] rounded-full bg-slate-200 mt-1" />
                  ) : (
                    p.blocks.map((b) => (
                      <div
                        key={b.blockId}
                        className={`rounded-[1px] shrink-0 ${
                          b.kind
                            ? `${LINE_COLOR[b.kind]} w-full ${b.isTable ? "h-[5px]" : "h-[3px]"}`
                            : b.isHeading
                              ? "bg-slate-400/70 w-3/4 h-[3px]"
                              : b.isTable
                                ? "bg-slate-300/80 w-full h-[5px]"
                                : "bg-slate-200 w-11/12 h-[2px]"
                        }`}
                      />
                    ))
                  )}
                  <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono text-slate-400 leading-none">
                    {p.pageNo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 오른쪽: 16px 변경 오버뷰 룰러 (상시 표시 + 미니맵 접혔을 때 펼침 버튼) */}
      <div className="flex flex-col h-full">
        {!minimapOpen && (
          <button
            type="button"
            onClick={toggleMinimap}
            title="미니맵 펼치기"
            className="h-6 w-[16px] flex items-center justify-center border-b border-slate-200/70 bg-[#fafafa] hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
          >
            <MapIcon className="w-2.5 h-2.5" />
          </button>
        )}
        <div className="flex-1 min-h-0 flex">
          <ChangeOverviewRuler
            scrollRef={scrollRef}
            selector="[data-change-gutter]"
            kindOf={(el) => {
              const k = el.dataset.changeGutter;
              return k === "add" || k === "mod" || k === "del" ? (k as RulerKind) : null;
            }}
            labelOf={(el) => el.dataset.changeLabel ?? "변경된 영역"}
            deps={[depsKey, changeMap.size, pages.length]}
          />
        </div>
      </div>
    </div>
  );
};
