import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { BlockInsertionPalette } from "@/features/mutate-canvas-blocks";

export const OutlinePreviewSidebar: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const mode = useStudioDocumentStore((s) => s.mode);

  const leftSidebarOpen = useSlotSelectionStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useSlotSelectionStore((s) => s.setLeftSidebarOpen);

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  if (!leftSidebarOpen) {
    return (
      <button
        type="button"
        onClick={() => setLeftSidebarOpen(true)}
        className="absolute left-3 top-3 z-20 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
        title="좌측 Document preview 열기"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-900">Document preview</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Document · {doc.pages.length} pages
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLeftSidebarOpen(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
          title="좌측 패널 접기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {doc.pages.map((p) => {
          const isActive = p.pageId === activePageId;
          return (
            <div
              key={p.pageId}
              onClick={() => {
                setActivePageId(p.pageId);
                document
                  .getElementById(`vdoc-page-${p.pageId}`)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`group flex items-center gap-3 p-2 rounded-lg border transition cursor-pointer ${
                isActive
                  ? "border-l-4 border-l-[#248567] border-slate-200 bg-emerald-50/40"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="w-11 h-14 rounded bg-white border border-slate-300 shadow-2xs p-1 flex flex-col justify-between shrink-0 overflow-hidden">
                <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
                <div className="space-y-0.5">
                  <div className="h-1 w-4/5 bg-emerald-500/40 rounded-xs" />
                  <div className="h-1 w-full bg-slate-200 rounded-xs" />
                  <div className="grid grid-cols-2 gap-0.5">
                    <div className="h-2 bg-slate-100 border border-slate-200 rounded-xs" />
                    <div className="h-2 bg-slate-100 border border-slate-200 rounded-xs" />
                  </div>
                </div>
                <div className="h-1 w-1/2 bg-slate-200 rounded-xs" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800">
                  {p.pageNumber} · Page
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {p.pageLabel}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  블록 {p.blocks.length}개
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {mode === "Editing" && (
        <BlockInsertionPalette
          targetPageId={activePageId || doc.pages[0]?.pageId || ""}
        />
      )}
    </aside>
  );
};

