import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export function useSwitchCatalogForm() {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );

  const switchDocument = (docId: string) => {
    const targetDoc = docs.find((d) => d.docId === docId);
    if (!targetDoc) return;
    setActiveDocId(docId);
    const firstEditable =
      Object.values(targetDoc.slots).find((s) => s.role !== "boilerplate")
        ?.slotId ||
      Object.keys(targetDoc.slots)[0] ||
      null;
    setSelectedSlotId(firstEditable);
    setComposerOpenSlotId(null);
  };

  return {
    docs,
    activeDocId,
    switchDocument,
  };
}

