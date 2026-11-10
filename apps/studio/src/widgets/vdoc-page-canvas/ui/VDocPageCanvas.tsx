import React from "react";
import { ArrowUpLeft } from "lucide-react";

import { MemoVDocPageSheet, WindowedPageChunker } from "@vibe/slot-canvas";
import { useActiveSlotEditorStore, type SlotAiAction } from "@vibe/slot-editor";
import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachToComposer, referenceTextRef } from "@/features/ai-workspace";
import { buildSlotAiActionPrompt, SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { pageMutations } from "@/features/mutate-document-pages";
import { applyAiSlotResult, markSlotAiEdited } from "@/features/stage-ai-changes";
import { getOutlineProjection, outlineCommands, useOutlineSelector } from "@/features/zoom-hierarchy";
import { useStableCallback } from "@/shared/lib";

import { useCanvasRangeSelection } from "../model/useCanvasRangeSelection";
import { AiStagingDrawer } from "./AiStagingDrawer";
import { SlotFrame } from "./SlotFrame";
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
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const setSelectedOutlinerNodeId = useWorkspaceSessionStore((s) => s.setSelectedOutlinerNodeId);

  const { updateSlotContent } = useSlotContentActions();
  const blocks = useMutateCanvasBlocks();
  const pageStatesByPageId = usePdfScaffoldJobStore((s) => s.pageStatesByPageId);
  // 캔버스는 줌 상태만 구독한다 (투영 전체를 구독하면 아웃라인 요약이 바뀔 때마다 캔버스가 다시 그려진다).
  const zoomLevel = useOutlineSelector((p) => p.activeZoomLevel);
  const zoomedNode = useOutlineSelector((p) => p.allNodes.find((n) => n.nodeId === p.rootNodeId));
  const openReferenceCount = useWorkspaceSessionStore((s) => s.openReferenceIds.length);

  // 표 구역 · 블록 · 페이지를 넘는 슬롯 범위 선택 (드래그 · 브라우저 선택)
  const mainRef = React.useRef<HTMLElement>(null);
  const getMain = React.useCallback(() => mainRef.current, []);
  useCanvasRangeSelection(getMain);

  // 페이지 시트에 넘기는 콜백은 모두 고정 참조여야 MemoVDocPageSheet 의 메모가 유지된다.
  const onSelectSlot = useStableCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    const matched = getOutlineProjection().allNodes.find((n) => n.targetSlotId === slotId);
    if (matched) setSelectedOutlinerNodeId(matched.nodeId);
  });
  // 블록을 고른다고 오른쪽 패널을 열지 않는다 — 사용자가 접어 둔 Composer 는 접힌 채로 둔다.
  const onSelectBlock = useStableCallback((blockId: string) => {
    setSelectedBlockId(blockId);
  });
  const onOpenBackdataDrawer = useStableCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    openRightPanel("inspector");
  });
  const onCancelPendingPage = useStableCallback((pageId: string) => {
    void usePdfScaffoldJobStore.getState().cancelPendingPage(pageId);
  });
  const onRetryPendingPage = useStableCallback((pageId: string) => {
    void usePdfScaffoldJobStore.getState().retryPendingPage(pageId);
  });
  const onRemovePendingPage = useStableCallback((pageId: string) => {
    usePdfScaffoldJobStore.getState().clearPageState(pageId);
    pageMutations.removePendingPlaceholderPage(doc?.docId, pageId);
  });
  const onSlotAiAction = useStableCallback((slotId: string, action: SlotAiAction, text: string) => {
    if (action === "attach") {
      attachToComposer([referenceTextRef(slotId, text)], { role: "reference" });
      openRightPanel("composer");
      return;
    }
    // 선택 영역 AI 바: 그 범위만 고치도록 편집기 문서 위치를 함께 넘긴다.
    const { activeSlotId, activeEditor } = useActiveSlotEditorStore.getState();
    const sel = activeSlotId === slotId ? activeEditor?.state.selection : undefined;
    const range = sel && !sel.empty ? { from: sel.from, to: sel.to, text } : null;
    openComposerWithPrompt(slotId, buildSlotAiActionPrompt(action, text), range);
  });
  const onUpdateSlotContent = useStableCallback(updateSlotContent);
  const onApplyAiResult = useStableCallback((slotId: string, html: string) => {
    void applyAiSlotResult(slotId, html, { source: "인라인 AI", harnessId: "inline.slot" });
  });
  const onAiEditedSelection = useStableCallback((slotId: string) => markSlotAiEdited(slotId, "inline.selection"));
  const wrapSlotContent = useStableCallback((slot: VDocSlot, content: React.ReactNode) => <SlotFrame slot={slot}>{content}</SlotFrame>);
  const onMoveBlock = useStableCallback(blocks.moveBlock);
  const onMoveBlockTo = useStableCallback(blocks.moveBlockTo);
  const onDeleteBlock = useStableCallback(blocks.deleteBlock);
  const onInsertBlock = useStableCallback(blocks.addBlockToPage);
  const onCopyBlock = useStableCallback(blocks.copyBlock);
  const onDuplicateBlock = useStableCallback(blocks.duplicateBlock);
  const onToggleBlockLock = useStableCallback(blocks.toggleBlockLock);
  const onMoveBlockFrame = useStableCallback(blocks.moveBlockFrame);
  const onResizeBlockFrame = useStableCallback(blocks.resizeBlockFrame);
  const onUpdateBlock = useStableCallback(blocks.updateBlock);
  const onTableCommand = useStableCallback(blocks.runTableCommand);
  const renderInlineComposer = useStableCallback((slot: VDocSlot, boundChunks: BackdataChunk[]) => (
    <SlotInlineComposerHost
      targetSlot={slot}
      boundChunks={boundChunks}
      onApplySlotContent={onUpdateSlotContent}
      onApplyAiResult={onApplyAiResult}
      onAiEditedSelection={onAiEditedSelection}
    />
  ));

  if (!doc) return null;

  // 페이지 단위로 줌인했으면 그 페이지만 격리해 보여준다.
  const zoomedPageId = zoomedNode?.targetPageId;
  const isPageZoomed =
    zoomLevel !== "project" &&
    zoomLevel !== "document" &&
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
              onClick={outlineCommands.zoomOutOneLevel}
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
                onCopyBlock={onCopyBlock}
                onDuplicateBlock={onDuplicateBlock}
                onToggleBlockLock={onToggleBlockLock}
                onMoveBlockFrame={onMoveBlockFrame}
                onResizeBlockFrame={onResizeBlockFrame}
                onUpdateBlock={onUpdateBlock}
                onTableCommand={onTableCommand}
                onTableSelectionChange={setTableSelection}
                onSlotAiAction={onSlotAiAction}
                renderInlineComposer={renderInlineComposer}
                wrapSlotContent={wrapSlotContent}
                pendingState={pageStatesByPageId[page.pageId] ?? null}
                onCancelPendingPage={onCancelPendingPage}
                onRetryPendingPage={onRetryPendingPage}
                onRemovePendingPage={onRemovePendingPage}
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
