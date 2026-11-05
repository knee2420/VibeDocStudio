import React from "react";
import { ArrowUpLeft, Columns } from "lucide-react";

import { MemoVDocPageSheet, WindowedPageChunker } from "@vibe/slot-canvas";
import { useActiveSlotEditorStore, type SlotAiAction } from "@vibe/slot-editor";
import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectReferenceDocId, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { buildSlotAiActionPrompt, SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { StressPagesToggleButton } from "@/features/simulate-large-document";
import { useFractalZoomNavigation } from "@/features/zoom-hierarchy";
import { useStableCallback } from "@/shared/lib";

import { useCanvasRangeSelection } from "../model/useCanvasRangeSelection";
import { AiStagingDrawer } from "./AiStagingDrawer";
import { Phase1StorylineWorkbench } from "./Phase1StorylineWorkbench";
import { Phase2TemplateWorkbench } from "./Phase2TemplateWorkbench";
import { ReferenceSplitViewport } from "./ReferenceSplitViewport";
import { SlotRangeAiBar } from "./SlotRangeAiBar";

/** 한 번에 DOM 에 올리는 페이지 수 (슬라이딩 윈도우). */
const WINDOW_CHUNK_PAGES = 15;

/** 아웃라인에서 가리키는 캔버스 대상(슬롯 · 블록)을 강조하는 스타일. */
const OutlineHoverHighlight: React.FC = () => {
  const targetId = useWorkspaceSessionStore((s) => s.hoveredOutlineTargetId);
  if (!targetId) return null;
  const id = CSS.escape(targetId);
  return (
    <style>{`
      [data-slot-id="${id}"],
      [data-block-id="${id}"] {
        outline: 2px solid #059669 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.3) !important;
        transition: all 0.15s ease-in-out !important;
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
      }
    `}</style>
  );
};

/** 캔버스 위 도구 줄: 개발용 시뮬레이션 · 참조 작업창 열기. */
const CanvasUtilityBar: React.FC = () => {
  const referenceDocId = useProjectStore(selectReferenceDocId);
  const openReferenceCount = useWorkspaceSessionStore((s) => s.openReferenceDocIds.length);
  const openReferenceDoc = useWorkspaceSessionStore((s) => s.openReferenceDoc);
  const closeAllReferenceDocs = useWorkspaceSessionStore((s) => s.closeAllReferenceDocs);
  const isOpen = openReferenceCount > 0;

  return (
    <div className="w-[794px] max-w-[794px] mx-auto mb-2.5 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <StressPagesToggleButton />
      </div>
      <button
        type="button"
        data-testid="canvas-split-ref-btn"
        disabled={!isOpen && !referenceDocId}
        onClick={() => (isOpen ? closeAllReferenceDocs() : referenceDocId && openReferenceDoc(referenceDocId))}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition disabled:opacity-40 ${
          isOpen ? "bg-slate-800 text-white border-slate-800 shadow-2xs" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-2xs"
        }`}
      >
        <Columns className="w-3.5 h-3.5" />
        {isOpen ? "참조 작업창 닫기" : "참조 문서 나란히 비교 (Split View)"}
      </button>
    </div>
  );
};

/** Phase 3 슬롯 집필 캔버스: A4 페이지 시트를 슬라이딩 윈도우로 그린다. */
const DraftingCanvas: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const mode = useStudioDocumentStore((s) => s.mode);

  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setSelectedBlockId = useSlotSelectionStore((s) => s.setSelectedBlockId);
  const clearSelection = useSlotSelectionStore((s) => s.clearSelection);
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const openComposerWithPrompt = useSlotSelectionStore((s) => s.openComposerWithPrompt);
  const setTableSelection = useSlotSelectionStore((s) => s.setTableSelection);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const setSelectedOutlinerNodeId = useWorkspaceSessionStore((s) => s.setSelectedOutlinerNodeId);

  const { updateSlotContent } = useSlotContentActions();
  const blocks = useMutateCanvasBlocks();
  const { projection, handleZoomOutOneLevel } = useFractalZoomNavigation();
  const openReferenceCount = useWorkspaceSessionStore((s) => s.openReferenceDocIds.length);

  // 표 구역 · 블록 · 페이지를 넘는 슬롯 범위 선택 (드래그 · 브라우저 선택)
  const mainRef = React.useRef<HTMLElement>(null);
  const getMain = React.useCallback(() => mainRef.current, []);
  useCanvasRangeSelection(getMain);

  // 페이지 시트에 넘기는 콜백은 모두 고정 참조여야 MemoVDocPageSheet 의 메모가 유지된다.
  const onSelectSlot = useStableCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    const matched = projection.allNodes.find((n) => n.targetSlotId === slotId);
    if (matched) setSelectedOutlinerNodeId(matched.nodeId);
  });
  const onSelectBlock = useStableCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setRightSidebarOpen(true);
  });
  const onOpenBackdataDrawer = useStableCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    openRightPanel("inspector");
  });
  const onSlotAiAction = useStableCallback((slotId: string, action: SlotAiAction, text: string) => {
    // 선택 영역 AI 바: 그 범위만 고치도록 편집기 문서 위치를 함께 넘긴다.
    const { activeSlotId, activeEditor } = useActiveSlotEditorStore.getState();
    const sel = activeSlotId === slotId ? activeEditor?.state.selection : undefined;
    const range = sel && !sel.empty ? { from: sel.from, to: sel.to, text } : null;
    openComposerWithPrompt(slotId, buildSlotAiActionPrompt(action, text), range);
  });
  const onUpdateSlotContent = useStableCallback(updateSlotContent);
  const onMoveBlock = useStableCallback(blocks.moveBlock);
  const onMoveBlockTo = useStableCallback(blocks.moveBlockTo);
  const onDeleteBlock = useStableCallback(blocks.deleteBlock);
  const onInsertBlock = useStableCallback(blocks.addBlockToPage);
  const onDuplicateBlock = useStableCallback(blocks.duplicateBlock);
  const onToggleBlockLock = useStableCallback(blocks.toggleBlockLock);
  const onMoveBlockFrame = useStableCallback(blocks.moveBlockFrame);
  const onResizeBlockFrame = useStableCallback(blocks.resizeBlockFrame);
  const onUpdateBlock = useStableCallback(blocks.updateBlock);
  const onTableCommand = useStableCallback(blocks.runTableCommand);
  const renderInlineComposer = useStableCallback((slot: VDocSlot, boundChunks: BackdataChunk[]) => (
    <SlotInlineComposerHost targetSlot={slot} boundChunks={boundChunks} onApplySlotContent={onUpdateSlotContent} />
  ));

  if (!doc) return null;

  // 페이지 단위로 줌인했으면 그 페이지만 격리해 보여준다.
  const zoomedNode = projection.allNodes.find((n) => n.nodeId === projection.rootNodeId);
  const zoomedPageId = zoomedNode?.targetPageId;
  const isPageZoomed =
    projection.activeZoomLevel !== "project" &&
    projection.activeZoomLevel !== "document" &&
    Boolean(zoomedPageId) &&
    doc.pages.length > 1 &&
    doc.pages.some((p) => p.pageId === zoomedPageId);
  const pagesToRender = isPageZoomed ? doc.pages.filter((p) => p.pageId === zoomedPageId) : doc.pages;

  return (
    <main
      ref={mainRef}
      onClick={() => clearSelection()}
      className="flex-1 overflow-y-auto overflow-x-auto px-6 py-8 select-text min-w-0 bg-[#eef1f6]"
    >
      <div className={`w-fit min-w-[794px] ${openReferenceCount > 0 ? "ml-2.5 mr-auto" : "mx-auto"} flex flex-col items-center`}>
        <CanvasUtilityBar />

        {isPageZoomed && (
          <div
            data-testid="page-zoom-focus-banner"
            className="w-[794px] max-w-[794px] mx-auto mb-3 px-3.5 py-2 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950 shadow-2xs select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold">{zoomedNode?.title || "단일 페이지"} 집중 편집 모드</span>
              <span className="text-emerald-700 text-[11px]">(전체 {doc.pages.length}p 중 1페이지만 격리 표시)</span>
            </div>
            <button
              type="button"
              data-testid="canvas-page-zoom-out-btn"
              onClick={handleZoomOutOneLevel}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-emerald-100/70 text-emerald-800 border border-emerald-300 rounded-lg font-semibold text-xs cursor-pointer transition shadow-2xs"
              title="전체 페이지 조망으로 복귀 (Alt+↑)"
            >
              <ArrowUpLeft className="w-3.5 h-3.5 text-emerald-700" />
              전체 페이지 보기 (Zoom Out)
            </button>
          </div>
        )}

        <div className="w-[794px] min-w-[794px] mx-auto">
          <WindowedPageChunker
            pages={pagesToRender}
            activePageId={activePageId}
            chunkSize={WINDOW_CHUNK_PAGES}
            renderPage={(page) => (
              <MemoVDocPageSheet
                key={page.pageId}
                docTitle={doc.title}
                totalPages={doc.pages.length}
                page={page}
                slots={doc.slots}
                backdata={doc.backdata}
                mode={mode}
                selectedBlockId={selectedBlockId}
                selectedSlotId={selectedSlotId}
                composerOpenSlotId={composerOpenSlotId}
                onSelectPage={setActivePageId}
                onSelectBlock={onSelectBlock}
                onSelectSlot={onSelectSlot}
                onToggleComposerForSlot={toggleComposerForSlot}
                onOpenBackdataDrawer={onOpenBackdataDrawer}
                onUpdateSlotContent={onUpdateSlotContent}
                onMoveBlock={onMoveBlock}
                onDeleteBlock={onDeleteBlock}
                onMoveBlockTo={onMoveBlockTo}
                onInsertBlock={onInsertBlock}
                onDuplicateBlock={onDuplicateBlock}
                onToggleBlockLock={onToggleBlockLock}
                onMoveBlockFrame={onMoveBlockFrame}
                onResizeBlockFrame={onResizeBlockFrame}
                onUpdateBlock={onUpdateBlock}
                onTableCommand={onTableCommand}
                onTableSelectionChange={setTableSelection}
                onSlotAiAction={onSlotAiAction}
                renderInlineComposer={renderInlineComposer}
              />
            )}
          />
        </div>
      </div>
    </main>
  );
};

/** 중앙 작업 영역: 단계별 작업대 + 왼쪽 참조 작업창 + 하단 AI 변경안 서랍. */
export const VDocPageCanvas: React.FC = () => {
  const hasDocument = useStudioDocumentStore((s) => Boolean(selectActiveDocument(s)));
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  if (!hasDocument) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <OutlineHoverHighlight />
      <div className="flex-1 flex overflow-hidden">
        <ReferenceSplitViewport />
        {currentPhase === "storylining" ? (
          <main className="flex-1 overflow-y-auto">
            <Phase1StorylineWorkbench />
          </main>
        ) : currentPhase === "templating" ? (
          <main className="flex-1 overflow-y-auto">
            <Phase2TemplateWorkbench />
          </main>
        ) : (
          <DraftingCanvas />
        )}
      </div>
      {currentPhase === "drafting" && <SlotRangeAiBar />}
      <AiStagingDrawer />
    </div>
  );
};
