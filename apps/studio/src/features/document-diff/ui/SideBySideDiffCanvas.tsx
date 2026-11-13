import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import { documentSurface, type VDocSlot } from "@vibe/vdoc-schema";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { type ActiveDiffTarget } from "../model/useActiveDiffStore";

const noop = () => {};

export const SideBySideDiffCanvas: React.FC<{ activeDiff: ActiveDiffTarget }> = ({ activeDiff }) => {
  const doc = useStudioDocumentStore(selectActiveDocument);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const [sheetZoom, setSheetZoom] = useState(0.72);

  // Measure outer non-scrolling pane width to auto-fit 794px A4 sheets without scrollbar ResizeObserver feedback loops
  useEffect(() => {
    const el = leftPaneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let rafId = 0;
    const updateZoom = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w > 100) {
          // Reserve 48px for p-4 (32px) + vertical scrollbar allowance (16px)
          const next = Math.min(1, Math.max(0.42, (w - 48) / 794));
          const rounded = Math.round(next * 200) / 200;
          setSheetZoom((prev) => (Math.abs(prev - rounded) >= 0.005 ? rounded : prev));
        }
      });
    };
    updateZoom();
    const ro = new ResizeObserver(updateZoom);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Scroll to target page or slot when diff target changes
  useEffect(() => {
    const selector = activeDiff.slotId
      ? `[data-slot-id="${CSS.escape(activeDiff.slotId)}"]`
      : activeDiff.pageId
        ? `[data-page-id="${CSS.escape(activeDiff.pageId)}"]`
        : null;
    if (!selector) return;

    const timer = window.setTimeout(() => {
      leftScrollRef.current?.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
      rightScrollRef.current?.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activeDiff.slotId, activeDiff.pageId, activeDiff.revisionRev, activeDiff.diffId]);

  const changedSet = useMemo(() => new Set(activeDiff.changedSlotIds), [activeDiff.changedSlotIds]);

  const beforeSlotsMap = useMemo(() => {
    if (!doc) return {};
    const next: Record<string, VDocSlot> = { ...doc.slots };
    for (const slotId of activeDiff.changedSlotIds) {
      const base = next[slotId];
      if (base) {
        next[slotId] = { ...base, content: activeDiff.beforeSlots[slotId] ?? "" };
      }
    }
    return next;
  }, [doc, activeDiff.changedSlotIds, activeDiff.beforeSlots]);

  const afterSlotsMap = useMemo(() => {
    if (!doc) return {};
    const next: Record<string, VDocSlot> = { ...doc.slots };
    for (const slotId of activeDiff.changedSlotIds) {
      const base = next[slotId];
      if (base) {
        next[slotId] = { ...base, content: activeDiff.afterSlots[slotId] ?? "" };
      }
    }
    return next;
  }, [doc, activeDiff.changedSlotIds, activeDiff.afterSlots]);

  const wrapBeforeSlot = useCallback(
    (slot: VDocSlot, content: React.ReactNode) => {
      if (!changedSet.has(slot.slotId)) return content;
      return (
        <div
          data-diff-side="before"
          className="ring-2 ring-rose-500 bg-rose-50/45 rounded-[3px] relative"
        >
          {content}
        </div>
      );
    },
    [changedSet]
  );

  const wrapAfterSlot = useCallback(
    (slot: VDocSlot, content: React.ReactNode) => {
      if (!changedSet.has(slot.slotId)) return content;
      return (
        <div
          data-diff-side="after"
          className="ring-2 ring-emerald-500 bg-emerald-50/45 rounded-[3px] relative min-h-[20px]"
        >
          {content}
        </div>
      );
    },
    [changedSet]
  );

  const handleScroll = (source: "left" | "right") => {
    if (isSyncingScroll.current) return;
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (!leftEl || !rightEl) return;

    isSyncingScroll.current = true;
    if (source === "left") {
      rightEl.scrollTop = leftEl.scrollTop;
    } else {
      leftEl.scrollTop = rightEl.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  if (!doc) return null;

  const seamless = documentSurface(doc).kind === "scroll";
  const isAddedPage = activeDiff.diffKind === "added";
  const pagesToRender = activeDiff.pageId
    ? doc.pages.filter((p) => p.pageId === activeDiff.pageId)
    : doc.pages;
  const effectivePages = pagesToRender.length > 0 ? pagesToRender : doc.pages;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#eef0f3] overflow-hidden select-text">
      {/* Main 1:1 Side-by-Side Real A4 Editor Preview */}
      <div className="flex-1 flex overflow-hidden divide-x divide-slate-300">
        {/* Left: Base Version (Before) */}
        <div ref={leftPaneRef} className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#e9ecef]">
          <div className="px-4 py-1.5 bg-rose-50/90 border-b border-rose-200/80 flex items-center justify-between shrink-0 select-none">
            <span className="text-[11px] font-bold text-rose-900">Base version (이전 서식)</span>
            <span className="px-1.5 py-0.2 rounded bg-rose-200/80 text-rose-800 text-[10px] font-mono font-bold">
              BEFORE
            </span>
          </div>

          <div
            ref={leftScrollRef}
            onScroll={() => handleScroll("left")}
            className="flex-1 overflow-y-auto overflow-x-auto p-4 [scrollbar-gutter:stable]"
          >
            <div style={{ zoom: sheetZoom }} className="w-[794px] mx-auto space-y-6">
              {isAddedPage ? (
                <div className="w-[794px] min-h-[520px] rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/80 flex flex-col items-center justify-center gap-2.5 text-slate-500 p-12 select-none">
                  <span className="px-2.5 py-1 rounded-full bg-slate-200/90 text-slate-600 text-xs font-mono font-bold">
                    NO BASE VERSION
                  </span>
                  <p className="text-sm font-semibold text-slate-600">
                    이전에 존재하지 않던 새로 추가된 페이지입니다
                  </p>
                  <p className="text-xs text-slate-400">
                    우측 Current version에서 새로 생성된 페이지와 영역을 확인할 수 있습니다.
                  </p>
                </div>
              ) : (
                effectivePages.map((page) => (
                  <div key={`before-${page.pageId}`} data-page-id={page.pageId}>
                    <MemoVDocPageSheet
                      seamless={seamless}
                      docTitle={doc.title}
                      totalPages={doc.pages.length}
                      page={page}
                      slots={beforeSlotsMap}
                      backdata={doc.backdata}
                      mode="Viewing"
                      selectedBlockId={null}
                      selectedSlotId={null}
                      composerOpenSlotId={null}
                      onSelectPage={noop}
                      onSelectSlot={noop}
                      onToggleComposerForSlot={noop}
                      onOpenBackdataDrawer={noop}
                      onUpdateSlotContent={noop}
                      onMoveBlock={noop}
                      onDeleteBlock={noop}
                      wrapSlotContent={wrapBeforeSlot}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Current Version (After) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#e9ecef]">
          <div className="px-4 py-1.5 bg-emerald-50/90 border-b border-emerald-200/80 flex items-center justify-between shrink-0 select-none">
            <span className="text-[11px] font-bold text-emerald-900">Current version (현재 서식)</span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-200/80 text-emerald-800 text-[10px] font-mono font-bold">
              AFTER
            </span>
          </div>

          <div
            ref={rightScrollRef}
            onScroll={() => handleScroll("right")}
            className="flex-1 overflow-y-auto overflow-x-auto p-4 [scrollbar-gutter:stable]"
          >
            <div style={{ zoom: sheetZoom }} className="w-[794px] mx-auto space-y-6">
              {effectivePages.map((page) => (
                <div
                  key={`after-${page.pageId}`}
                  data-page-id={page.pageId}
                  className={isAddedPage ? "ring-2 ring-emerald-500 rounded-sm relative" : undefined}
                >
                  {isAddedPage && (
                    <span className="absolute -top-3 right-2 z-10 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono font-bold shadow-xs">
                      NEW PAGE (U)
                    </span>
                  )}
                  <MemoVDocPageSheet
                    seamless={seamless}
                    docTitle={doc.title}
                    totalPages={doc.pages.length}
                    page={page}
                    slots={afterSlotsMap}
                    backdata={doc.backdata}
                    mode="Viewing"
                    selectedBlockId={null}
                    selectedSlotId={null}
                    composerOpenSlotId={null}
                    onSelectPage={noop}
                    onSelectSlot={noop}
                    onToggleComposerForSlot={noop}
                    onOpenBackdataDrawer={noop}
                    onUpdateSlotContent={noop}
                    onMoveBlock={noop}
                    onDeleteBlock={noop}
                    wrapSlotContent={wrapAfterSlot}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
