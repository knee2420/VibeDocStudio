import React from "react";

import {
  DocumentStatusBadges,
  useStudioDocumentStore,
} from "@/entities/vdoc-document";
import { StudioAgentSettingsButton } from "@/features/agent-settings";
import { SlotFormattingSubToolbar } from "@/features/edit-slot-richtext";
import { VDocFileActionButtons } from "@/features/export-import-vdoc";
import { ImportPdfButton } from "@/features/import-pdf-form";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { DocumentSwitcherBar } from "@/features/switch-catalog-form";

export const StudioTopRibbon: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const { runTableCommand } = useMutateCanvasBlocks();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  return (
    <>
      <header className="h-13 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#248567] text-white font-bold flex items-center justify-center text-sm shadow-xs">
            V
          </div>

          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={doc.title}
                onChange={(e) =>
                  updateCurrentDoc((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                className="w-80 sm:w-96 font-semibold text-sm text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-[#248567] rounded px-1.5 py-0.5 outline-none"
              />
              <DocumentStatusBadges doc={doc} />
            </div>

            <DocumentSwitcherBar />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StudioAgentSettingsButton />
          <ImportPdfButton />
          <VDocFileActionButtons />
        </div>
      </header>

      <SlotFormattingSubToolbar onTableCommand={runTableCommand} />
    </>
  );
};
