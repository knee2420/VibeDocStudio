import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, FileText, FlaskConical, GitCompare, PenLine, X } from "lucide-react";

import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import { documentSurface } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  hasSplitDragData,
  readSplitDragData,
  useDocumentSplitStore,
  type SplitSide,
} from "@/entities/workspace-layout";
import { playgroundActions, usePlaygroundDocIds } from "@/features/playground";
import { useDragResize } from "@/shared/lib";

const noop = () => {};

/**
 * Antigravity / VS Code 스타일 문서 좌우 분할 패널.
 * 파일 트리·플레이그라운드·상단 탭에서 캔버스로 문서를 끌어다 놓으면
 * 현재 편집 중인 문서를 유지한 채 나란히 띄워 비교·참고할 수 있다.
 */
export const DocumentSplitPane: React.FC<{ side: SplitSide }> = ({ side }) => {
  const pane = useDocumentSplitStore((s) => s.pane);
  const openSplit = useDocumentSplitStore((s) => s.openSplit);
  const closeSplit = useDocumentSplitStore((s) => s.closeSplit);
  const swapSide = useDocumentSplitStore((s) => s.swapSide);
  const setWidth = useDocumentSplitStore((s) => s.setWidth);
  const setPageId = useDocumentSplitStore((s) => s.setPageId);

  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const playgroundIds = usePlaygroundDocIds();

  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sheetZoom, setSheetZoom] = useState(0.65);
  const [dropOver, setDropOver] = useState(false);

  const { onResizeStart } = useDragResize({
    axis: side === "left" ? "x" : "x-left",
    size: pane?.width ?? 520,
    onResize: setWidth,
  });

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let rafId = 0;
    const updateZoom = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w > 100) {
          const next = Math.min(1, Math.max(0.38, (w - 32) / 794));
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
  }, [pane?.docId, pane?.width]);

  // 특정 쪽을 끌어다 놓았으면 그 쪽으로 자동 스크롤
  useEffect(() => {
    if (!pane?.pageId) return;
    const timer = window.setTimeout(() => {
      const target = scrollRef.current?.querySelector<HTMLElement>(`[data-split-page-id="${CSS.escape(pane.pageId!)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [pane?.docId, pane?.pageId]);

  if (!pane || pane.side !== side) return null;

  const splitDoc = docs.find((d) => d.docId === pane.docId);
  if (!splitDoc) {
    return null;
  }

  const isLab = playgroundIds.has(splitDoc.docId);
  const seamless = documentSurface(splitDoc).kind === "scroll";
  const canCompareDiff = Boolean(splitDoc.origin?.copiedFrom);

  /** 이 분할 패널의 문서를 주 편집 캔버스로 올리고, 기존 활성 문서를 이 분할 패널로 내린다. */
  const focusForEdit = () => {
    const prevActive = activeDocId;
    playgroundActions.open(splitDoc.docId);
    if (pane.pageId) {
      useStudioDocumentStore.getState().setActivePageId(pane.pageId);
    }
    if (prevActive && prevActive !== splitDoc.docId) {
      openSplit({ docId: prevActive }, side);
    } else {
      closeSplit();
    }
  };

  return (
    <aside
      data-testid={`document-split-pane-${side}`}
      style={{ width: pane.width }}
      onDragOver={(e) => {
        if (!hasSplitDragData(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!dropOver) setDropOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false);
      }}
      onDrop={(e) => {
        const payload = readSplitDragData(e);
        setDropOver(false);
        if (!payload) return;
        e.preventDefault();
        e.stopPropagation();
        openSplit(payload, side);
      }}
      className={`relative h-full flex flex-col bg-[#eef0f3] shrink-0 overflow-hidden select-text ${
        side === "left" ? "border-r border-slate-300" : "border-l border-slate-300"
      }`}
    >
      {/* 상단 미니 헤더 */}
      <header className="fig-panel h-9 px-2.5 bg-white border-b border-[var(--fig-border)] flex items-center gap-1.5 shrink-0 select-none">
        {isLab ? (
          <FlaskConical className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-[#6e6e73] shrink-0" />
        )}
        <span className="text-[12px] font-semibold text-slate-800 truncate min-w-0 flex-1" title={splitDoc.title}>
          {splitDoc.title}
        </span>

        {splitDoc.pages.length > 1 && (
          <select
            value={pane.pageId ?? ""}
            onChange={(e) => setPageId(e.target.value || undefined)}
            title="쪽 바로 이동"
            className="h-6 max-w-[110px] px-1 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-700 outline-none cursor-pointer"
          >
            <option value="">전체 ({splitDoc.pages.length}쪽)</option>
            {splitDoc.pages.map((p, idx) => (
              <option key={p.pageId} value={p.pageId}>
                {idx + 1}. {p.pageLabel || `${idx + 1}쪽`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={focusForEdit}
          title="이 문서를 주 캔버스에서 편집 (현재 문서와 자리 바꾸기)"
          className="fig-icon-btn"
          data-testid="split-pane-edit-btn"
        >
          <PenLine className="w-3.5 h-3.5" />
        </button>

        {canCompareDiff && (
          <button
            type="button"
            onClick={() => {
              closeSplit();
              playgroundActions.compareWithSource(splitDoc.docId);
            }}
            title="원본과 차이점(Diff · 겹쳐 보기) 열기"
            className="fig-icon-btn"
            data-testid="split-pane-diff-btn"
          >
            <GitCompare className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={swapSide}
          title={side === "left" ? "오른쪽으로 옮기기" : "왼쪽으로 옮기기"}
          className="fig-icon-btn"
          data-testid="split-pane-swap-btn"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={closeSplit}
          title="분할 보기 닫기"
          className="fig-icon-btn"
          data-testid="split-pane-close-btn"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* A4 문서 미리보기 영역 */}
      <div ref={bodyRef} className="flex-1 min-h-0 relative overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-auto p-4">
          <div style={{ zoom: sheetZoom }} className="w-[794px] mx-auto space-y-6">
            {splitDoc.pages.map((page) => (
              <div
                key={page.pageId}
                data-split-page-id={page.pageId}
                className={pane.pageId === page.pageId ? "ring-2 ring-[var(--vds-accent)]/80 rounded-sm" : undefined}
              >
                <MemoVDocPageSheet
                  seamless={seamless}
                  docTitle={splitDoc.title}
                  totalPages={splitDoc.pages.length}
                  page={page}
                  slots={splitDoc.slots}
                  backdata={splitDoc.backdata}
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
            ))}
          </div>
        </div>

        {/* 다른 문서를 이 패널 위로 끌어왔을 때 교체 안내 오버레이 */}
        {dropOver && (
          <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-[var(--vds-accent)] bg-[var(--vds-accent)]/10 flex items-center justify-center z-40">
            <span className="px-3 py-1.5 rounded-md bg-[var(--vds-accent)] text-white text-xs font-semibold shadow">
              여기에 놓아 이 패널 문서 바꾸기
            </span>
          </div>
        )}
      </div>

      {/* 경계선 드래그 리사이즈 핸들 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="분할 보기 폭 조절"
        onMouseDown={onResizeStart}
        className={`absolute top-0 bottom-0 w-1.5 z-30 cursor-col-resize hover:bg-[var(--vds-accent)]/40 transition-colors ${
          side === "left" ? "right-0" : "left-0"
        }`}
      />
    </aside>
  );
};
