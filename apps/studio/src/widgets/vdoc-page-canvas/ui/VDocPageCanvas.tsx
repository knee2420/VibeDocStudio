import React from "react";

import { VDocPageSheet } from "@vibe/slot-canvas";
import type { SlotAiAction } from "@vibe/slot-editor";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";

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
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const mode = useStudioDocumentStore((s) => s.mode);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const composerPrompt = useSlotSelectionStore((s) => s.composerPrompt);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore((s) => s.setComposerOpenSlotId);
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const openComposerWithPrompt = useSlotSelectionStore((s) => s.openComposerWithPrompt);
  const setRightSidebarOpen = useSlotSelectionStore((s) => s.setRightSidebarOpen);
  const setTableSelection = useSlotSelectionStore((s) => s.setTableSelection);

  const { updateSlotContent } = useSlotContentActions();
  const { moveBlock, moveBlockTo, deleteBlock, addBlockToPage, duplicateBlock, toggleBlockLock, moveBlockFrame, runTableCommand } =
    useMutateCanvasBlocks();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  return (
    <main onClick={() => setComposerOpenSlotId(null)} className="flex-1 overflow-y-auto px-14 py-6 select-text">
      {doc.pages.map((page) => (
        <VDocPageSheet
          key={page.pageId}
          docTitle={doc.title}
          totalPages={doc.pages.length}
          page={page}
          slots={doc.slots}
          backdata={doc.backdata}
          mode={mode}
          selectedSlotId={selectedSlotId}
          composerOpenSlotId={composerOpenSlotId}
          onSelectPage={setActivePageId}
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
          onTableCommand={runTableCommand}
          onTableSelectionChange={setTableSelection}
          onSlotAiAction={(slotId, action, text) =>
            openComposerWithPrompt(slotId, `${AI_ACTION_PROMPTS[action]}: "${text.slice(0, 200)}"`)
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
      ))}
    </main>
  );
};
