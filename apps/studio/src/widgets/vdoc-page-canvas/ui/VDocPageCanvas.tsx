import React from "react";
import { Columns, Layers } from "lucide-react";

import { MemoVDocPageSheet, WindowedPageChunker } from "@vibe/slot-canvas";
import type { SlotAiAction } from "@vibe/slot-editor";
import {
  createSectionPage,
  type BackdataChunk,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectReferenceDocId, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { useStableCallback } from "@/shared/lib";

import { AiStagingDrawer } from "./AiStagingDrawer";
import { Phase1StorylineWorkbench } from "./Phase1StorylineWorkbench";
import { Phase2TemplateWorkbench } from "./Phase2TemplateWorkbench";
import { ReferenceSplitViewport } from "./ReferenceSplitViewport";

const AI_ACTION_PROMPTS: Record<SlotAiAction, string> = {
  expand: "선택한 부분을 더 상세하게 확장해줘",
  summarize: "선택한 부분을 간결하게 요약해줘",
  translate: "선택한 부분을 영어로 번역해줘",
  grammar: "선택한 부분의 문법과 맞춤법을 수정해줘",
  tone: "선택한 부분을 더 자연스럽고 전문적인 어투로 수정해줘",
};

const STRESS_PAGE_COUNT = 25;
const WINDOW_CHUNK_PAGES = 15;

/** 개발용: 25쪽 문서로 늘려 슬라이딩 윈도우를 검증하거나, 1쪽으로 되돌린다. */
function toggleStressPages(prev: VDocDocument): VDocDocument {
  if (prev.pages.length > WINDOW_CHUNK_PAGES) {
    return { ...prev, pages: prev.pages.slice(0, 1) };
  }
  const pages = [...prev.pages];
  const slots = { ...prev.slots };
  for (let pageNumber = pages.length + 1; pageNumber <= STRESS_PAGE_COUNT; pageNumber++) {
    const section = createSectionPage({
      pageId: `sim-page-${pageNumber}`,
      pageNumber,
      pageLabel: `시뮬레이션 섹션 #${pageNumber}`,
      headerHtml: `<p>${prev.title} · 대용량 슬라이딩 윈도우 검증</p>`,
      footerHtml: `<p>Page ${pageNumber} / ${STRESS_PAGE_COUNT}</p>`,
      headingHtml: `<h3>Section ${pageNumber} · 대용량 조판 윈도우 청크 페이지 (${pageNumber}p)</h3>`,
      bodyHtml: `<p>대용량 문서에서도 ${WINDOW_CHUNK_PAGES}페이지 슬라이딩 윈도우만 DOM에 마운트됩니다.</p>`,
    });
    pages.push(section.page);
    Object.assign(slots, section.slots);
  }
  return { ...prev, pages, slots };
}

/** 인라인 작성기는 작성 프롬프트를 스스로 구독해, 페이지 전체를 다시 그리지 않고도 갱신된다. */
const ConnectedInlineComposer: React.FC<{
  slot: VDocSlot;
  boundChunks: BackdataChunk[];
  onApplySlotContent: (slotId: string, html: string) => void;
}> = ({ slot, boundChunks, onApplySlotContent }) => {
  const composerPrompt = useSlotSelectionStore((s) => s.composerPrompt);
  return (
    <SlotInlineComposerHost
      targetSlot={slot}
      boundChunks={boundChunks}
      initialPrompt={composerPrompt ?? undefined}
      onApplySlotContent={onApplySlotContent}
    />
  );
};

export const VDocPageCanvas: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const mode = useStudioDocumentStore((s) => s.mode);
  const referenceDocId = useProjectStore(selectReferenceDocId);

  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const splitReferenceDocId = useWorkspaceSessionStore((s) => s.splitReferenceDocId);
  const setSplitReferenceDocId = useWorkspaceSessionStore((s) => s.setSplitReferenceDocId);
  const hoveredOutlinerNodeId = useWorkspaceSessionStore((s) => s.hoveredOutlinerNodeId);

  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore((s) => s.setComposerOpenSlotId);

  const { updateSlotContent } = useSlotContentActions();
  const blocks = useMutateCanvasBlocks();

  // 페이지 시트에 넘기는 콜백은 모두 고정 참조여야 MemoVDocPageSheet 의 메모가 유지된다.
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
  const onSelectBlock = useStableCallback((blockId: string) => {
    const selection = useSlotSelectionStore.getState();
    selection.setSelectedBlockId(blockId);
    selection.setRightSidebarOpen(true);
  });
  const onOpenBackdataDrawer = useStableCallback((slotId: string) => {
    const selection = useSlotSelectionStore.getState();
    selection.setSelectedSlotId(slotId);
    selection.setRightSidebarOpen(true);
  });
  const onSlotAiAction = useStableCallback((slotId: string, action: SlotAiAction, text: string) =>
    useSlotSelectionStore
      .getState()
      .openComposerWithPrompt(slotId, `${AI_ACTION_PROMPTS[action]}: "${text.slice(0, 200)}"`)
  );
  const renderInlineComposer = useStableCallback((slot: VDocSlot, boundChunks: BackdataChunk[]) => (
    <ConnectedInlineComposer slot={slot} boundChunks={boundChunks} onApplySlotContent={onUpdateSlotContent} />
  ));
  const selectionActions = useSlotSelectionStore.getState();

  if (!doc) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {hoveredOutlinerNodeId && (
        <style>{`
          [data-slot-id="${hoveredOutlinerNodeId}"] {
            outline: 2px solid #059669 !important;
            outline-offset: 3px !important;
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.3) !important;
            transition: all 0.15s ease-in-out !important;
            animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }
        `}</style>
      )}
      <div className="flex-1 flex overflow-hidden">
        {currentPhase === "storylining" ? (
          <main className="flex-1 overflow-y-auto">
            <Phase1StorylineWorkbench />
          </main>
        ) : currentPhase === "templating" ? (
          <main className="flex-1 overflow-y-auto">
            <Phase2TemplateWorkbench />
          </main>
        ) : (
          <main
            onClick={() => setComposerOpenSlotId(null)}
            className="flex-1 overflow-y-auto px-10 py-5 select-text"
          >
            {/* Phase 3 Top Canvas Utility Bar */}
            <div className="max-w-[794px] mx-auto mb-2.5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    data-testid="simulate-25pages-btn"
                    onClick={() => updateCurrentDoc(toggleStressPages, { history: true, label: "페이지 시뮬레이션 전환" })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold shadow-2xs cursor-pointer transition font-mono tabular-nums"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    {doc.pages.length > WINDOW_CHUNK_PAGES
                      ? `원본 페이지(1p)로 복원 (현재 ${doc.pages.length}p)`
                      : `⚡ ${STRESS_PAGE_COUNT}p 대용량 슬라이딩 윈도우 시뮬레이션`}
                  </button>
                )}
              </div>

              <button
                type="button"
                data-testid="canvas-toggle-split-ref-btn"
                disabled={!splitReferenceDocId && !referenceDocId}
                onClick={() => setSplitReferenceDocId(splitReferenceDocId ? null : referenceDocId)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition disabled:opacity-40 ${
                  splitReferenceDocId
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                {splitReferenceDocId
                  ? "참조 스플릿 비교 닫기"
                  : "참조 문서 나란히 비교 (Split View)"}
              </button>
            </div>

            <WindowedPageChunker
              pages={doc.pages}
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
                  onSelectSlot={selectionActions.setSelectedSlotId}
                  onToggleComposerForSlot={selectionActions.toggleComposerForSlot}
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
                  onTableSelectionChange={selectionActions.setTableSelection}
                  onSlotAiAction={onSlotAiAction}
                  renderInlineComposer={renderInlineComposer}
                />
              )}
            />
          </main>
        )}

        {/* Side-by-Side Read-Only Reference Split Viewport */}
        <ReferenceSplitViewport />
      </div>

      {/* Bottom Dock: Git-style AI Staged Diffs Drawer */}
      <AiStagingDrawer />
    </div>
  );
};
