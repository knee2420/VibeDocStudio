import React from "react";

import { VDocPageSheet } from "@vibe/slot-canvas";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { SlotInlineComposerHost } from "@/features/compose-slot-ai";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";

export const VDocPageCanvas: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const mode = useStudioDocumentStore((s) => s.mode);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );
  const toggleComposerForSlot = useSlotSelectionStore(
    (s) => s.toggleComposerForSlot
  );
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );

  const { updateSlotContent } = useSlotContentActions();
  const { moveBlock, deleteBlock } = useMutateCanvasBlocks();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  return (
    <main
      onClick={() => setComposerOpenSlotId(null)}
      className="flex-1 overflow-y-auto px-8 py-6 space-y-8 select-text"
    >
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
          renderInlineComposer={(slot, boundChunks) => (
            <SlotInlineComposerHost
              targetSlot={slot}
              boundChunks={boundChunks}
              onApplySlotContent={updateSlotContent}
            />
          )}
        />
      ))}
    </main>
  );
};

