import React from "react";
import { CopyPlus, Lock, X } from "lucide-react";

import { VDocPageSheet } from "@vibe/slot-canvas";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

const noop = () => {};

export const ReferenceSplitViewport: React.FC = () => {
  const splitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.splitReferenceDocId
  );
  const setSplitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.setSplitReferenceDocId
  );

  const docs = useStudioDocumentStore((s) => s.docs);
  const selectedReferenceProjectId = useProjectStore(
    (s) => s.selectedReferenceProjectId
  );
  const projects = useProjectStore((s) => s.projects);
  const cloneNodeFromReference = useProjectStore(
    (s) => s.cloneNodeFromReference
  );

  if (!splitReferenceDocId) return null;

  const refDoc = docs.find((d) => d.docId === splitReferenceDocId) || docs[0];
  const refProj =
    projects.find((p) => p.projectId === selectedReferenceProjectId) ||
    projects.find((p) => p.isReferenceOnly);

  if (!refDoc) return null;

  const handleCloneFirstSection = () => {
    const firstNode = refProj?.storylineNodes.find((n) => n.parentId !== null);
    if (refProj && firstNode) {
      cloneNodeFromReference(refProj.projectId, firstNode.nodeId);
    }
  };

  return (
    <aside
      data-testid="reference-split-viewport"
      className="w-[46%] border-l-2 border-violet-300 bg-slate-100/90 flex flex-col shrink-0 overflow-hidden"
    >
      {/* Read-Only Lock Banner (Law of Mode Clarity) */}
      <div
        data-testid="readonly-lock-banner"
        className="px-4 py-2.5 bg-violet-950 text-white flex items-center justify-between gap-2 shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-700 text-violet-100 text-[11px] font-bold shrink-0">
            <Lock className="w-3 h-3" />
            🔒 읽기 전용 참조 뷰포트
          </span>
          <span className="text-xs font-semibold truncate" title={refDoc.title}>
            {refDoc.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="split-banner-clone-btn"
            onClick={handleCloneFirstSection}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold cursor-pointer shadow-2xs"
          >
            <CopyPlus className="w-3 h-3" />
            내 작업본으로 복제
          </button>
          <button
            type="button"
            data-testid="close-split-viewport-btn"
            onClick={() => setSplitReferenceDocId(null)}
            className="p-1 rounded hover:bg-violet-800 text-violet-200 cursor-pointer"
            title="참조 스플릿 뷰 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Read-Only A4 Sheet Preview */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {refDoc.pages.map((page) => (
          <VDocPageSheet
            key={page.pageId}
            docTitle={refDoc.title}
            totalPages={refDoc.pages.length}
            page={page}
            slots={refDoc.slots}
            backdata={refDoc.backdata}
            mode="Viewing"
            selectedBlockId={null}
            selectedSlotId={null}
            composerOpenSlotId={null}
            onSelectPage={noop}
            onSelectSlot={noop}
            onToggleComposerForSlot={noop}
            onOpenBackdataDrawer={noop}
            onUpdateSlotContent={noop}
            onMoveBlock={noop}
            onDeleteBlock={noop}
          />
        ))}
      </div>
    </aside>
  );
};

