import React from "react";
import { Columns, Layers } from "lucide-react";

import { VDocPageSheet, WindowedPageChunker } from "@vibe/slot-canvas";
import type { SlotAiAction } from "@vibe/slot-editor";
import type { VDocPage, VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";

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

export const VDocPageCanvas: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const mode = useStudioDocumentStore((s) => s.mode);

  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const splitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.splitReferenceDocId
  );
  const setSplitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.setSplitReferenceDocId
  );

  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useSlotSelectionStore((s) => s.setSelectedBlockId);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const composerPrompt = useSlotSelectionStore((s) => s.composerPrompt);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );
  const toggleComposerForSlot = useSlotSelectionStore(
    (s) => s.toggleComposerForSlot
  );
  const openComposerWithPrompt = useSlotSelectionStore(
    (s) => s.openComposerWithPrompt
  );
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );
  const setTableSelection = useSlotSelectionStore((s) => s.setTableSelection);

  const { updateSlotContent } = useSlotContentActions();
  const {
    moveBlock,
    moveBlockTo,
    deleteBlock,
    addBlockToPage,
    duplicateBlock,
    toggleBlockLock,
    moveBlockFrame,
    resizeBlockFrame,
    updateBlock,
    runTableCommand,
  } = useMutateCanvasBlocks();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  // 1-click Stress Test helper to generate/restore a 25-page document to verify 15p WindowedPageChunker
  const handleToggle25PageStressDoc = () => {
    if (doc.pages.length > 15) {
      updateCurrentDoc(
        (prev) => ({
          ...prev,
          pages: prev.pages.slice(0, 1),
        }),
        { history: true }
      );
      return;
    }

    updateCurrentDoc(
      (prev) => {
        const nextPages: VDocPage[] = [...prev.pages];
        const nextSlots: Record<string, VDocSlot> = { ...prev.slots };
        const targetTotal = 25;

        for (let pNum = nextPages.length + 1; pNum <= targetTotal; pNum++) {
          const pid = `sim-page-${pNum}`;
          const hSlot = `${pid}_heading`;
          const bSlot = `${pid}_body`;
          const hdrSlot = `${pid}_header`;
          const ftrSlot = `${pid}_footer`;

          nextSlots[hdrSlot] = {
            slotId: hdrSlot,
            label: "머리말",
            role: "boilerplate",
            content: `<p>${prev.title} · 대용량 슬라이딩 윈도우 검증</p>`,
            backDataRefs: [],
          };
          nextSlots[ftrSlot] = {
            slotId: ftrSlot,
            label: "바닥글",
            role: "boilerplate",
            content: `<p>Page ${pNum} / ${targetTotal}</p>`,
            backDataRefs: [],
          };
          nextSlots[hSlot] = {
            slotId: hSlot,
            label: `섹션 ${pNum} 제목`,
            role: "editable-slot",
            content: `<h3>Section ${pNum} · 대용량 조판 윈도우 청크 페이지 (${pNum}p)</h3>`,
            backDataRefs: [],
          };
          nextSlots[bSlot] = {
            slotId: bSlot,
            label: `섹션 ${pNum} 본문`,
            role: "editable-slot",
            content: `<p>100페이지급 대용량 문서에서도 15페이지 슬라이딩 윈도우 청크(WindowedPageChunker)만 DOM에 마운트되어 지연 없이 쾌적하게 동작합니다.</p>`,
            backDataRefs: [],
          };

          nextPages.push({
            pageId: pid,
            pageNumber: pNum,
            pageLabel: `시뮬레이션 섹션 #${pNum}`,
            headerSlotId: hdrSlot,
            footerSlotId: ftrSlot,
            blocks: [
              {
                blockId: `blk_${pid}_1`,
                kind: "section-block",
                title: `시뮬레이션 섹션 #${pNum}`,
                headingSlotId: hSlot,
                bodySlotId: bSlot,
              },
            ],
          });
        }

        return {
          ...prev,
          pages: nextPages,
          slots: nextSlots,
        };
      },
      { history: true }
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
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
                <button
                  type="button"
                  data-testid="simulate-25pages-btn"
                  onClick={handleToggle25PageStressDoc}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold shadow-2xs cursor-pointer transition font-mono tabular-nums"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  {doc.pages.length > 15
                    ? `원본 페이지(1p)로 복원 (현재 ${doc.pages.length}p)`
                    : "⚡ 25p 대용량 슬라이딩 윈도우 시뮬레이션"}
                </button>
              </div>

              <button
                type="button"
                data-testid="canvas-toggle-split-ref-btn"
                onClick={() =>
                  setSplitReferenceDocId(
                    splitReferenceDocId
                      ? null
                      : "vdoc-pandadoc-vc-proposal-01"
                  )
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition ${
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
              chunkSize={15}
              renderPage={(page) => (
                <VDocPageSheet
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
                  onSelectBlock={(blkId) => {
                    setSelectedBlockId(blkId);
                    setRightSidebarOpen(true);
                  }}
                  onSelectSlot={setSelectedSlotId}
                  onToggleComposerForSlot={toggleComposerForSlot}
                  onOpenBackdataDrawer={(slotId) => {
                    setSelectedSlotId(slotId);
                    setRightSidebarOpen(true);
                  }}
                  onUpdateSlotContent={updateSlotContent}
                  onMoveBlock={moveBlock}
                  onDeleteBlock={deleteBlock}
                  onMoveBlockTo={moveBlockTo}
                  onInsertBlock={addBlockToPage}
                  onDuplicateBlock={duplicateBlock}
                  onToggleBlockLock={toggleBlockLock}
                  onMoveBlockFrame={moveBlockFrame}
                  onResizeBlockFrame={resizeBlockFrame}
                  onUpdateBlock={updateBlock}
                  onTableCommand={runTableCommand}
                  onTableSelectionChange={setTableSelection}
                  onSlotAiAction={(slotId, action, text) =>
                    openComposerWithPrompt(
                      slotId,
                      `${AI_ACTION_PROMPTS[action]}: "${text.slice(0, 200)}"`
                    )
                  }
                  renderInlineComposer={(slot, boundChunks) => (
                    <SlotInlineComposerHost
                      targetSlot={slot}
                      boundChunks={boundChunks}
                      initialPrompt={composerPrompt ?? undefined}
                      onApplySlotContent={updateSlotContent}
                    />
                  )}
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
