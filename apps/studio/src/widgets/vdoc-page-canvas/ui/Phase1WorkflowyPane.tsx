import React, { useEffect, useState } from "react";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { WorkflowyOutlinerSurface } from "@/features/workflowy-outliner";
import { CenterWorkbenchHost } from "./CenterWorkbenchHost";
import { PreviewDocumentPane } from "./PreviewDocumentPane";

export const Phase1WorkflowyPane: React.FC = () => {
  const [splitOpen, setSplitOpen] = useState(false);
  const project = useProjectStore(selectActiveProject);
  const documents = useStudioDocumentStore((s) => s.docs);
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const outline = useWorkingOutlineStore((s) => s.outline);
  const loadedProjectId = useWorkingOutlineStore((s) => s.loadedProjectId);
  const loadWorkingOutline = useWorkingOutlineStore((s) => s.loadWorkingOutline);

  // Phase 3 등에서 복귀했을 때 미반영 편집이 없고 문서 revision 이 달라진 경우에만 서버에서 최신 재동기화
  useEffect(() => {
    if (!project || !outline || loadedProjectId !== project.projectId || outline.dirty) return;
    const projectDocs = documents.filter((d) => project.docIds.includes(d.docId));
    const revChanged = projectDocs.some(
      (d) => (d.revision ?? 1) !== (outline.baseDocRevisions[d.docId] ?? 1)
    );
    if (!revChanged) return;
    void loadWorkingOutline(
      project,
      projectDocs.length > 0 ? projectDocs : activeDoc ? [activeDoc] : [],
      { refresh: true }
    );
  }, [activeDoc, documents, loadWorkingOutline, loadedProjectId, outline, project]);

  return (
    <CenterWorkbenchHost
      mode={splitOpen ? "split" : "single"}
      primaryPane={
        <WorkflowyOutlinerSurface
          splitOpen={splitOpen}
          onToggleSplitPreview={() => setSplitOpen((v) => !v)}
        />
      }
      secondaryPane={
        splitOpen ? <PreviewDocumentPane onClose={() => setSplitOpen(false)} /> : undefined
      }
    />
  );
};
