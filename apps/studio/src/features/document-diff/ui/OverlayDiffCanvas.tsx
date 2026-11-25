import React, { useEffect, useMemo, useRef, useState } from "react";

import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import { documentSurface, type VDocSlot } from "@vibe/vdoc-schema";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { type ActiveDiffTarget } from "../model/useActiveDiffStore";

const noop = () => {};

/**
 * Figma Dev Mode "Compare changes — Overlay" 방식의 겹쳐 비교 캔버스.
 * 원본(BEFORE) A4 페이지 위에 현재/실험본(AFTER) A4 페이지를 정확히 겹쳐 두고,
 * 투명도 슬라이더(0% 원본 ↔ 100% 버전)로 레이아웃·여백·글자 이동 차이를 한눈에 확인한다.
 */
export const OverlayDiffCanvas: React.FC<{ activeDiff: ActiveDiffTarget }> = ({ activeDiff }) => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const paneRef = useRef<HTMLDivElement>(null);
  const [sheetZoom, setSheetZoom] = useState(0.85);
  // 0 = 원본만, 50 = 반반 겹침, 100 = 현재/버전만
  const [opacity, setOpacity] = useState(50);

  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let rafId = 0;
    const updateZoom = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w > 120) {
          const next = Math.min(1, Math.max(0.45, (w - 64) / 794));
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

  const beforeDoc = activeDiff.beforeDoc;
  const beforeSlotsMap = useMemo(() => {
    if (beforeDoc) return beforeDoc.slots;
    if (!doc) return {};
    const next: Record<string, VDocSlot> = { ...doc.slots };
    for (const slotId of activeDiff.changedSlotIds) {
      const base = next[slotId];
      if (base) next[slotId] = { ...base, content: activeDiff.beforeSlots[slotId] ?? "" };
    }
    return next;
  }, [doc, beforeDoc, activeDiff.changedSlotIds, activeDiff.beforeSlots]);

  const afterSlotsMap = useMemo(() => {
    if (!doc) return {};
    const next: Record<string, VDocSlot> = { ...doc.slots };
    for (const slotId of activeDiff.changedSlotIds) {
      const base = next[slotId];
      if (base) next[slotId] = { ...base, content: activeDiff.afterSlots[slotId] ?? "" };
    }
    return next;
  }, [doc, activeDiff.changedSlotIds, activeDiff.afterSlots]);

  if (!doc) return null;

  const seamless = documentSurface(doc).kind === "scroll";
  const rightPages = activeDiff.pageId ? doc.pages.filter((p) => p.pageId === activeDiff.pageId) : doc.pages;
  const effectiveRight = beforeDoc ? rightPages : rightPages.length > 0 ? rightPages : doc.pages;
  const leftPages = beforeDoc
    ? activeDiff.pageId
      ? beforeDoc.pages.filter((p) => p.pageId === activeDiff.pageId)
      : beforeDoc.pages
    : effectiveRight;

  const pageCount = Math.max(leftPages.length, effectiveRight.length);
  const leftTitle = activeDiff.beforeLabel ?? (activeDiff.version ? `'${activeDiff.version.name}' 버전` : "원본 (BEFORE)");
  const rightTitle = activeDiff.afterLabel ?? "현재 서식 (AFTER)";

  return (
    <div className="flex-1 flex flex-col h-full bg-[#e9ecef] overflow-hidden select-none">
      {/* Figma Dev Mode Overlay 투명도 컨트롤 바 */}
      <div className="px-4 py-2 bg-white border-b border-[var(--fig-border)] flex items-center justify-center gap-3 shrink-0 text-[11.5px]">
        <button
          type="button"
          onClick={() => setOpacity(0)}
          className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
            opacity === 0 ? "bg-rose-100 text-rose-800" : "text-black/60 hover:bg-black/5"
          }`}
          title="원본만 보기 (0%)"
        >
          {leftTitle}
        </button>

        <div className="flex items-center gap-2 w-[260px]">
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label="원본과 현재 버전 겹침 투명도"
            data-testid="overlay-opacity-slider"
            className="flex-1 accent-indigo-600 cursor-pointer"
          />
          <span className="w-9 text-right font-mono text-[11px] text-black/65 tabular-nums">{opacity}%</span>
        </div>

        <button
          type="button"
          onClick={() => setOpacity(100)}
          className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
            opacity === 100 ? "bg-emerald-100 text-emerald-800" : "text-black/60 hover:bg-black/5"
          }`}
          title="현재 버전만 보기 (100%)"
        >
          {rightTitle}
        </button>

        <button
          type="button"
          onClick={() => setOpacity(50)}
          className="ml-1 px-2 py-0.5 rounded border border-black/10 text-[11px] text-black/60 hover:bg-black/5 cursor-pointer"
        >
          50%
        </button>
      </div>

      {/* 겹쳐진 A4 페이지 뷰포트 */}
      <div ref={paneRef} className="flex-1 overflow-y-auto overflow-x-auto p-6">
        <div style={{ zoom: sheetZoom }} className="w-[794px] mx-auto space-y-8">
          {Array.from({ length: pageCount }, (_, i) => {
            const leftPage = leftPages[i];
            const rightPage = effectiveRight[i];
            return (
              <div key={rightPage?.pageId ?? leftPage?.pageId ?? i} className="relative w-[794px]">
                {/* 아래층: 원본 (BEFORE) */}
                <div style={{ opacity: opacity === 100 ? 0 : 1 }} className="transition-opacity duration-75">
                  {leftPage ? (
                    <MemoVDocPageSheet
                      seamless={seamless}
                      docTitle={beforeDoc?.title ?? doc.title}
                      totalPages={(beforeDoc ?? doc).pages.length}
                      page={leftPage}
                      slots={beforeSlotsMap}
                      backdata={beforeDoc?.backdata ?? doc.backdata}
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
                    />
                  ) : (
                    <div className="w-[794px] min-h-[520px] rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/80 flex items-center justify-center text-sm text-slate-500">
                      원본에 없는 새 페이지 ({i + 1}쪽)
                    </div>
                  )}
                </div>

                {/* 위층: 현재 / 실험 버전 (AFTER) — 슬라이더 투명도 적용 */}
                {rightPage && (
                  <div
                    style={{ opacity: opacity / 100 }}
                    className="absolute inset-0 pointer-events-none transition-opacity duration-75"
                  >
                    <MemoVDocPageSheet
                      seamless={seamless}
                      docTitle={doc.title}
                      totalPages={doc.pages.length}
                      page={rightPage}
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
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
