import React from "react";
import { ArrowUpLeft } from "lucide-react";

import { MemoVDocPageSheet, WindowedPageChunker } from "@vibe/slot-canvas";
import { useActiveSlotEditorStore, type SlotAiAction } from "@vibe/slot-editor";
import { documentSurface, type BackdataChunk, type VDocSlot } from "@vibe/vdoc-schema";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  hasSplitDragData,
  readSplitDragData,
  useDocumentSplitStore,
  useWorkspaceLayoutStore,
  type SplitSide,
} from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachToComposer, referenceTextRef } from "@/features/ai-workspace";
import { studioKeyLayers } from "@/features/command-bus";
import { buildSlotAiActionPrompt, SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { pageMutations } from "@/features/mutate-document-pages";
import { applyAiSlotResult, markSlotAiEdited } from "@/features/stage-ai-changes";
import { getOutlineProjection, outlineCommands, useOutlineSelector, ZoomFocusStyle } from "@/features/zoom-hierarchy";
import { useStableCallback } from "@/shared/lib";
import { DocumentDiffView, useActiveDiffStore, type ActiveDiffTarget } from "@/features/document-diff";
import { playgroundActions } from "@/features/playground";
import { restorePageFromVersion, restoreSlots, restoreVersion, useWorkingPagesByDoc } from "@/features/document-revisions";
import { scrollToCanvasPage } from "@/shared/lib";

import { useCanvasRangeSelection } from "../model/useCanvasRangeSelection";
import { WorkingSlotChangesContext, type GutterChangeKind, type SlotGutterChange } from "../model/WorkingChangeContext";
import { AiStagingDrawer } from "./AiStagingDrawer";
import { CanvasMinimapRuler } from "./CanvasMinimapRuler";
import { SlotFrame } from "./SlotFrame";
import { Phase1StorylineWorkbench } from "./Phase1StorylineWorkbench";
import { Phase2TemplateWorkbench } from "./Phase2TemplateWorkbench";
import { ReferenceSplitViewport, ReferenceViewerPane } from "./ReferenceSplitViewport";
import { DocumentSplitPane } from "./DocumentSplitPane";
import { SlotRangeAiBar } from "./SlotRangeAiBar";
import { BlockPlacementLayer } from "./BlockPlacementLayer";
import { FigmaFloatingToolbar } from "./FigmaFloatingToolbar";
import { NewTabPagePicker } from "./NewTabPagePicker";
import { HiddenLayersStyle } from "@/features/layer-visibility";
import { DocumentGridOverlay } from "@/widgets/outline-preview-sidebar";

/** 한 번에 DOM 에 올리는 페이지 수 (슬라이딩 윈도우). */
const WINDOW_CHUNK_PAGES = 15;

/**
 * 아웃라인에서 가리키는 캔버스 대상(슬롯 · 블록)을 강조하는 스타일 (피그마 레이어 호버와 같은 파란 외곽선).
 * 무한 pulse 애니메이션 · `transition: all` · 큰 그림자는 쓰지 않는다 — 사이드바에 마우스를 올려 두기만 해도
 * 큰 블록을 매 프레임 다시 그려 캔버스 스크롤 · 선택이 끊겼다.
 */
const OutlineHoverHighlight: React.FC = () => {
  const targetId = useWorkspaceSessionStore((s) => s.hoveredOutlineTargetId);
  if (!targetId) return null;
  const id = CSS.escape(targetId);
  return (
    <style>{`
      [data-slot-id="${id}"],
      [data-block-id="${id}"] {
        outline: 1.5px solid #0d99ff !important;
        outline-offset: 2px !important;
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

  // 블록 선택 상태가 되면 캔버스 루트에 포커스를 주어 Ctrl+C / Ctrl+V / Delete 가 바로 동작하게 한다.
  React.useEffect(() => {
    if (!selectedBlockId || composerOpenSlotId) return;
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl?.isContentEditable) activeEl.blur();
    if (activeEl !== mainRef.current) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [selectedBlockId, composerOpenSlotId]);

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
  const onInsertMedia = useStableCallback(blocks.addMediaToPage);
  const onInsertBlockAtY = useStableCallback(blocks.insertFromMenu);
  const onCopyBlock = useStableCallback(blocks.copyBlock);
  // 피그마식 배치 도구: 툴바 · 에셋에서 고른 블록을 캔버스를 클릭한 자리에 넣는다.
  const onPlaceBlock = useStableCallback((pageId: string, kind: string, index: number) => blocks.addBlockToPage(pageId, kind, index));
  const isExternalRangeActive = React.useCallback(() => {
    const r = useSlotSelectionStore.getState().slotRange;
    return Boolean(r && !r.withinTable);
  }, []);
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

  const docIdList = React.useMemo(() => (doc ? [doc.docId] : []), [doc?.docId]);
  const workingByDoc = useWorkingPagesByDoc(docIdList);
  const slotChangeMap = React.useMemo(() => {
    const map = new Map<string, SlotGutterChange>();
    if (!doc) return map;
    const pages = workingByDoc[doc.docId] ?? [];
    for (const wp of pages) {
      for (const item of wp.items) {
        const kind: GutterChangeKind =
          wp.kind === "added" || (item.stat.added > 0 && item.stat.removed === 0 && !item.before.trim())
            ? "add"
            : item.stat.removed > 0 && item.stat.added === 0 && !item.after.trim()
              ? "del"
              : "mod";
        map.set(item.slotId, {
          slotId: item.slotId,
          kind,
          before: item.before,
          label: item.label,
          statText: `+${item.stat.added} −${item.stat.removed}`,
        });
      }
    }
    return map;
  }, [doc, workingByDoc]);

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
  const seamless = documentSurface(doc).kind === "scroll";

  return (
    <WorkingSlotChangesContext.Provider value={slotChangeMap}>
      <div className="flex-1 flex min-w-0 h-full overflow-hidden">
        <main
          ref={mainRef}
          tabIndex={-1}
          data-vdoc-canvas-main=""
          onClick={() => clearSelection()}
          className="flex-1 overflow-y-auto overflow-x-auto px-6 py-8 select-text min-w-0 bg-[#eef1f6] focus:outline-none"
        >
      <BlockPlacementLayer getMain={getMain} pages={pagesToRender} editable={mode === "Editing"} onPlace={onPlaceBlock} />
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

        <div className="w-fit min-w-[794px] mx-auto">
          <WindowedPageChunker
            pages={pagesToRender}
            activePageId={activePageId}
            chunkSize={WINDOW_CHUNK_PAGES}
            pageGapPx={seamless ? 0 : undefined}
            renderPage={(page) => (
              <MemoVDocPageSheet
                key={page.pageId}
                seamless={seamless}
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
                registerKeyLayer={studioKeyLayers.register}
                isExternalRangeActive={isExternalRangeActive}
                onToggleComposerForSlot={toggleComposerForSlot}
                onOpenBackdataDrawer={onOpenBackdataDrawer}
                onUpdateSlotContent={onUpdateSlotContent}
                onMoveBlock={onMoveBlock}
                onDeleteBlock={onDeleteBlock}
                onMoveBlockTo={onMoveBlockTo}
                onInsertBlock={onInsertBlock}
                onInsertMedia={onInsertMedia}
                onInsertBlockAtY={onInsertBlockAtY}
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
        <CanvasMinimapRuler
          scrollRef={mainRef as React.RefObject<HTMLDivElement | null>}
          pages={pagesToRender}
          changeMap={slotChangeMap}
          activePageId={activePageId}
          onJumpPage={(pageId) => {
            setActivePageId(pageId);
            scrollToCanvasPage(pageId);
          }}
          depsKey={`${doc.docId}:${doc.revision}:${slotChangeMap.size}`}
        />
      </div>
    </WorkingSlotChangesContext.Provider>
  );
};

/** 중앙 작업 영역: 단계별 작업대 + 왼쪽 참조 작업창 + 하단 AI 변경안 서랍 + Side-by-Side Diff 캔버스. */
/** 변경 비교 화면 + 버전 비교일 때 "전체 · 쪽 되돌리기" 연결 (기능 둘을 이 위젯에서 잇는다). */
const VersionAwareDiffView: React.FC<{ activeDiff: ActiveDiffTarget }> = ({ activeDiff }) => {
  const docId = useStudioDocumentStore((s) => s.activeDocId);
  const version = activeDiff.version;
  const variant = activeDiff.variant;
  const beforeDoc = activeDiff.beforeDoc;
  return (
    <DocumentDiffView
      activeDiff={activeDiff}
      revert={restoreSlots}
      adoptVariant={
        variant
          ? async () => {
              await playgroundActions.adoptVariant(variant.docId, `${variant.targetName} ${variant.label}`);
              useActiveDiffStore.getState().closeDiff();
            }
          : undefined
      }
      restoreVersion={
        version && docId
          ? async () => {
              await restoreVersion(docId, version);
              useActiveDiffStore.getState().closeDiff();
            }
          : undefined
      }
      restorePage={
        version && beforeDoc && docId
          ? (pageId) => {
              if (restorePageFromVersion(docId, beforeDoc, pageId, version.name)) useActiveDiffStore.getState().closeDiff();
            }
          : undefined
      }
    />
  );
};

export const VDocPageCanvas: React.FC = () => {
  const hasDocument = useStudioDocumentStore((s) => Boolean(selectActiveDocument(s)));
  const activeTabKey = useStudioDocumentStore((s) => s.activeTabKey);
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const pageGridOpen = useWorkspaceLayoutStore((s) => s.pageGridOpen);
  const openSplit = useDocumentSplitStore((s) => s.openSplit);
  const [dropSide, setDropSide] = React.useState<SplitSide | null>(null);
  if (!hasDocument) return null;

  const isNewTab = !activeDiff && !pageGridOpen && activeTabKey === "new-tab";

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (activeDiff || !hasSplitDragData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const rect = e.currentTarget.getBoundingClientRect();
    const nextSide: SplitSide = e.clientX - rect.left < rect.width / 2 ? "left" : "right";
    if (dropSide !== nextSide) setDropSide(nextSide);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDropSide(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const payload = readSplitDragData(e);
    const side = dropSide;
    setDropSide(null);
    if (!payload || !side || activeDiff) return;
    e.preventDefault();
    openSplit(payload, side);
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <OutlineHoverHighlight />
      <HiddenLayersStyle />
      <ZoomFocusStyle />
      <div className="flex-1 flex overflow-hidden relative">
        <ReferenceSplitViewport />
        <ReferenceViewerPane />
        {!activeDiff && !pageGridOpen && <DocumentSplitPane side="left" />}
        {activeDiff ? (
          <VersionAwareDiffView activeDiff={activeDiff} />
        ) : pageGridOpen ? (
          <DocumentGridOverlay />
        ) : isNewTab ? (
          <NewTabPagePicker />
        ) : currentPhase === "storylining" ? (
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
        {!activeDiff && !pageGridOpen && <DocumentSplitPane side="right" />}

        {/* Antigravity / VS Code 스타일 좌·우 화면 분할 드롭 존 */}
        {dropSide && !activeDiff && (
          <div
            aria-hidden
            data-testid={`canvas-split-dropzone-${dropSide}`}
            className={`pointer-events-none absolute top-2 bottom-2 w-[calc(50%-12px)] z-50 rounded-xl border-2 border-dashed border-[#0d99ff] bg-[#0d99ff]/12 backdrop-blur-[1px] flex items-center justify-center transition-all ${
              dropSide === "left" ? "left-2" : "right-2"
            }`}
          >
            <div className="px-4 py-2 rounded-lg bg-[#0d99ff] text-white text-xs font-semibold shadow-lg">
              {dropSide === "left" ? "여기에 놓아 왼쪽에 나란히 보기" : "여기에 놓아 오른쪽에 나란히 보기"}
            </div>
          </div>
        )}
      </div>
      {!activeDiff && !pageGridOpen && !isNewTab && currentPhase === "drafting" && <SlotRangeAiBar />}
      {!activeDiff && !pageGridOpen && !isNewTab && <FigmaFloatingToolbar />}
      {!activeDiff && !pageGridOpen && !isNewTab && <AiStagingDrawer />}
    </div>
  );
};
