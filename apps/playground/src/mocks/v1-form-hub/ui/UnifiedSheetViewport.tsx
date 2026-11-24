import React, { useEffect, useMemo, useRef, useState } from "react";
import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import {
  documentSurface,
  resolvePageDimensionsPx,
  type TableCommand,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { CheckCircle2, Eye, MousePointerClick } from "lucide-react";
import type { PlaygroundMode } from "../model/types";

const NOOP = () => {};

interface BlockOverlayRect {
  pageId: string;
  blockId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface UnifiedSheetViewportProps {
  mode: PlaygroundMode;
  compiledDoc: VDocDocument;
  docFormat?: string;
  activeLinkedPageId?: string | null;
  selectedBlockId: string | null;
  selectedBlockLabel?: string | null;
  selectedSlotId: string | null;
  editedCount: number;
  focusRequest: { nodeId: string; seq: number } | null;
  onSelectBlock: (blockId: string | null) => void;
  onSelectSlot: (slotId: string | null) => void;
  onUpdateSlotContent: (slotId: string, html: string) => void;
  onTableCommand: (
    pageId: string,
    blockId: string,
    sectionId: string | null,
    cmd: TableCommand
  ) => void;
  onSwitchMode: (mode: PlaygroundMode, options?: { selectedSlotId?: string | null }) => void;
  renderPageOverlay?: (ctx: {
    pageId: string;
    hostRef: React.RefObject<HTMLDivElement | null>;
    renderWidth: number;
    scale: number;
  }) => React.ReactNode;
}

/**
 * 한 화면 중앙 시트 뷰포트 — 다중 페이지(`compiledDoc.pages`)를 세로 스택으로 렌더링하며 `Mode` 에 따라 두 상태를 스위칭한다.
 * - `wysiwym`: 각 블록을 개별 선택해 우측 에셋 허브를 블록별 맞춤으로 전환 (더블클릭 시 `wysiwyg` 진입)
 * - `wysiwyg`: 100% 정배율 직접 편집 뷰 (Tiptap + `InteractiveTable` 병합/행·열/선 편집)
 */
export const UnifiedSheetViewport: React.FC<UnifiedSheetViewportProps> = ({
  mode,
  compiledDoc,
  docFormat,
  activeLinkedPageId,
  selectedBlockId,
  selectedBlockLabel,
  selectedSlotId,
  editedCount,
  focusRequest,
  onSelectBlock,
  onSelectSlot,
  onUpdateSlotContent,
  onTableCommand,
  onSwitchMode,
  renderPageOverlay,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetsHostRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(540);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [blockOverlay, setBlockOverlay] = useState<BlockOverlayRect | null>(null);

  const isEditing = mode === "wysiwyg";

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const inner = Math.max(240, el.clientWidth - 36);
      setAvailableWidth((prev) => (Math.abs(prev - inner) < 1 ? prev : inner));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const firstPage = compiledDoc.pages[0];
  const surface = documentSurface(compiledDoc);
  const seamless = surface.kind === "scroll";
  const pageDims = useMemo(
    () => (firstPage ? resolvePageDimensionsPx(firstPage) : { width: 794, height: 1123 }),
    [firstPage]
  );
  const renderWidth = seamless ? surface.width : pageDims.width;
  const scale = isEditing ? 1 : Math.min(1, Math.max(0.32, availableWidth / renderWidth));

  useEffect(() => {
    const host = sheetsHostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;

    const updateAllHeights = () => {
      const inners = host.querySelectorAll<HTMLElement>("[data-vdoc-page-inner]");
      const next: Record<string, number> = {};
      inners.forEach((inner) => {
        const pid = inner.dataset.vdocPageId;
        if (pid && inner.offsetHeight > 0) {
          next[pid] = inner.offsetHeight;
        }
      });
      setPageHeights((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => Math.abs((prev[k] ?? 0) - next[k]) < 1)
        ) {
          return prev;
        }
        return next;
      });
    };

    const raf = requestAnimationFrame(updateAllHeights);
    const ro = new ResizeObserver(updateAllHeights);
    host.querySelectorAll<HTMLElement>("[data-vdoc-page-inner]").forEach((inner) => {
      ro.observe(inner);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [compiledDoc, scale, isEditing]);

  useEffect(() => {
    if (isEditing || !selectedBlockId) return;
    const host = sheetsHostRef.current;
    if (!host) return;

    const measureBlock = () => {
      const blockEl = host.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(selectedBlockId)}"]`
      );
      const pageInner = blockEl?.closest<HTMLElement>("[data-vdoc-page-inner]") ?? null;
      const pageId = pageInner?.dataset.vdocPageId;
      if (!blockEl || !pageInner || !pageId) {
        setBlockOverlay(null);
        return;
      }
      const rootRect = pageInner.getBoundingClientRect();
      const elRect = blockEl.getBoundingClientRect();
      const s = rootRect.width / renderWidth || 1;
      setBlockOverlay({
        pageId,
        blockId: selectedBlockId,
        top: (elRect.top - rootRect.top) / s,
        left: (elRect.left - rootRect.left) / s,
        width: elRect.width / s,
        height: elRect.height / s,
      });
    };

    const raf = requestAnimationFrame(measureBlock);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureBlock) : null;
    ro?.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [selectedBlockId, compiledDoc, renderWidth, scale, isEditing]);

  const activeBlockOverlay =
    !isEditing && selectedBlockId && blockOverlay?.blockId === selectedBlockId
      ? blockOverlay
      : null;

  useEffect(() => {
    if (!focusRequest) return;
    const host = sheetsHostRef.current;
    if (!host) return;
    const targetEl =
      host.querySelector<HTMLElement>(`[data-block-id="pg_blk_${CSS.escape(focusRequest.nodeId)}"]`) ??
      host.querySelector<HTMLElement>(
        `[data-block-id^="pg_blk_${CSS.escape(focusRequest.nodeId)}_"]`
      ) ??
      (activeLinkedPageId
        ? host.querySelector<HTMLElement>(
            `[data-vdoc-page-id="${CSS.escape(activeLinkedPageId)}"]`
          )
        : null);
    targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusRequest, activeLinkedPageId]);

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) return;
    e.stopPropagation();
    const blockEl = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-block-id]");
    const clickedBlockId = blockEl?.dataset.blockId ?? null;
    onSelectBlock(clickedBlockId);
  };

  const handlePreviewDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) return;
    e.stopPropagation();
    const slotEl = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-slot-id]");
    const clickedSlotId = slotEl?.dataset.slotId ?? null;
    onSwitchMode("wysiwyg", { selectedSlotId: clickedSlotId });
  };

  return (
    <div className="h-full flex flex-col min-w-0 bg-[#eef1f6]">
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isEditing ? (
            <>
              <MousePointerClick className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-800 truncate">
                WYSIWYG 본문·표 마감 중 (셀 드래그 후 우클릭으로 병합 · 행/열 추가 가능)
              </span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="font-semibold text-slate-700 truncate">
                {selectedBlockId
                  ? `선택 블록: ${selectedBlockLabel ?? selectedBlockId} (우측 에셋 허브에서 블록 교체 · 더블클릭 편집)`
                  : seamless && docFormat?.toLowerCase().includes("web")
                    ? "실시간 웹 설문 뷰 (문항 클릭 시 UI 스타일 교체 · 옵션 직접 체크 가능)"
                    : "실시간 한글 서식 뷰 (블록 클릭 시 해당 블록 전용 에셋 표시 · 더블클릭 편집)"}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editedCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              수정 {editedCount}건
            </span>
          ) : null}

          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
            {seamless
              ? `${docFormat?.toLowerCase().includes("web") ? "WebForm 웹 설문" : "블로그형"} · ${renderWidth}px`
              : `A4형 · ${renderWidth}px`}{" "}
            ({Math.round(scale * 100)}%)
          </span>

          <button
            type="button"
            onClick={() => onSwitchMode(isEditing ? "wysiwym" : "wysiwyg")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer transition ${
              isEditing
                ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {isEditing ? "구조·에셋 모드로" : "본문·표 직접 편집"}
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        onClick={() => {
          if (isEditing) {
            onSelectSlot(null);
          } else {
            onSelectBlock(null);
          }
        }}
        className={`flex-1 min-h-0 overflow-auto px-5 py-6 flex flex-col ${
          isEditing ? "items-start xl:items-center select-text" : "items-center"
        }`}
      >
        <div
          ref={sheetsHostRef}
          className={`flex flex-col items-center shrink-0 ${
            seamless
              ? "gap-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              : "gap-6"
          }`}
        >
          {compiledDoc.pages.map((page) => {
            const singlePageHeight =
              pageHeights[page.pageId] ??
              resolvePageDimensionsPx(page).height ??
              1123;
            const isActivePage =
              !seamless && compiledDoc.pages.length > 1 && activeLinkedPageId === page.pageId;

            return (
              <div key={page.pageId} className="flex flex-col items-center gap-1.5 shrink-0">
                {!seamless && compiledDoc.pages.length > 1 ? (
                  <div className="w-full flex items-center justify-between px-1 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold border ${
                        isActivePage
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      <span>{page.pageNumber}쪽</span>
                      <span className="opacity-75">·</span>
                      <span className="max-w-[360px] truncate">{page.pageLabel ?? `${page.pageNumber}페이지`}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      - {page.pageNumber} / {compiledDoc.pages.length} -
                    </span>
                  </div>
                ) : null}

                <div
                  onClickCapture={handlePreviewClick}
                  onDoubleClickCapture={handlePreviewDoubleClick}
                  style={{
                    width: Math.round(renderWidth * scale),
                    height: isEditing || seamless ? undefined : Math.round(singlePageHeight * scale),
                  }}
                  className={`relative shrink-0 bg-white transition ${
                    seamless
                      ? "[&_[data-block-id]]:cursor-pointer [&_[data-block-id]]:transition-all [&_[data-block-id]:hover]:outline [&_[data-block-id]:hover]:outline-2 [&_[data-block-id]:hover]:outline-indigo-400/75 [&_[data-block-id]:hover]:outline-offset-4"
                      : isEditing
                        ? "shadow-sm border border-emerald-300 ring-2 ring-emerald-500/15"
                        : isActivePage
                          ? "shadow-sm border border-indigo-300 ring-2 ring-indigo-500/20 overflow-hidden [&_[data-block-id]]:cursor-pointer [&_[data-block-id]]:transition-all [&_[data-block-id]:hover]:outline [&_[data-block-id]:hover]:outline-2 [&_[data-block-id]:hover]:outline-indigo-400/75 [&_[data-block-id]:hover]:outline-offset-4"
                          : "shadow-sm border border-slate-200 overflow-hidden [&_[data-block-id]]:cursor-pointer [&_[data-block-id]]:transition-all [&_[data-block-id]:hover]:outline [&_[data-block-id]:hover]:outline-2 [&_[data-block-id]:hover]:outline-indigo-400/75 [&_[data-block-id]:hover]:outline-offset-4"
                  }`}
                >
                  <div
                    data-vdoc-page-inner="true"
                    data-vdoc-page-id={page.pageId}
                    style={{
                      width: renderWidth,
                      transform: isEditing ? undefined : `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                    className="relative"
                  >
                    <MemoVDocPageSheet
                      docTitle={compiledDoc.title}
                      totalPages={compiledDoc.pages.length}
                      seamless={seamless}
                      page={page}
                      slots={compiledDoc.slots}
                      backdata={compiledDoc.backdata}
                      mode={isEditing ? "Editing" : "Viewing"}
                      selectedBlockId={isEditing ? selectedBlockId : null}
                      selectedSlotId={isEditing ? selectedSlotId : null}
                      composerOpenSlotId={null}
                      onSelectPage={NOOP}
                      onSelectBlock={(bid) => {
                        onSelectBlock(bid);
                      }}
                      onSelectSlot={(slotId) => {
                        if (isEditing) onSelectSlot(slotId);
                      }}
                      onToggleComposerForSlot={NOOP}
                      onOpenBackdataDrawer={NOOP}
                      onUpdateSlotContent={onUpdateSlotContent}
                      onMoveBlock={NOOP}
                      onDeleteBlock={NOOP}
                      onTableCommand={isEditing ? onTableCommand : undefined}
                    />

                    {activeBlockOverlay && activeBlockOverlay.pageId === page.pageId ? (
                      <div
                        className="pointer-events-none absolute z-30 border-2 border-indigo-600 bg-indigo-500/[0.04] rounded-sm"
                        style={{
                          top: Math.max(0, activeBlockOverlay.top - 5),
                          left: Math.max(0, activeBlockOverlay.left - 6),
                          width: activeBlockOverlay.width + 12,
                          height: activeBlockOverlay.height + 10,
                        }}
                      >
                        <div className="absolute -top-5 left-0 px-2 py-0.5 rounded-t bg-indigo-600 text-white text-[10px] font-bold shadow-xs whitespace-nowrap">
                          {selectedBlockLabel ?? "선택된 블록"}
                        </div>
                      </div>
                    ) : null}

                    {renderPageOverlay
                      ? renderPageOverlay({
                          pageId: page.pageId,
                          hostRef: sheetsHostRef,
                          renderWidth,
                          scale,
                        })
                      : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
