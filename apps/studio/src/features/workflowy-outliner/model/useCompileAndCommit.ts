import { useCallback, useMemo } from "react";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

export function useCompileAndCommit() {
  const project = useProjectStore(selectActiveProject);
  const documents = useStudioDocumentStore((s) => s.docs);
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const upsertDocument = useStudioDocumentStore((s) => s.upsertDocument);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const hydrateProjects = useProjectStore((s) => s.hydrate);
  const setActiveProjectPhase = useProjectStore((s) => s.setActiveProjectPhase);
  const setPhase = useWorkspaceSessionStore((s) => s.setPhase);

  const compilePreview = useWorkingOutlineStore((s) => s.compilePreview);
  const commitToPhase3 = useWorkingOutlineStore((s) => s.commitToPhase3);
  const compiling = useWorkingOutlineStore((s) => s.compiling);
  const committing = useWorkingOutlineStore((s) => s.committing);
  const dirty = useWorkingOutlineStore((s) => Boolean(s.outline?.dirty));

  const projectDocs = useMemo(
    () =>
      project
        ? documents.filter((d) => project.docIds.includes(d.docId))
        : activeDoc
          ? [activeDoc]
          : [],
    [activeDoc, documents, project]
  );

  const handleCompilePreview = useCallback(async () => {
    return compilePreview(projectDocs, project?.title);
  }, [compilePreview, projectDocs, project?.title]);

  const handleCommitToPhase3 = useCallback(
    async (options?: { switchToDrafting?: boolean }) => {
      if (!project) return null;
      const result = await commitToPhase3(projectDocs, project);
      if (!result) return null;
      for (const doc of result.documents) {
        upsertDocument(doc);
      }
      if (result.documents[0]) {
        setActiveDocId(result.documents[0].docId);
      }
      await hydrateProjects();
      if (options?.switchToDrafting) {
        await setActiveProjectPhase("drafting");
        setPhase("drafting");
      }
      return result;
    },
    [
      commitToPhase3,
      hydrateProjects,
      project,
      projectDocs,
      setActiveDocId,
      setActiveProjectPhase,
      setPhase,
      upsertDocument,
    ]
  );

  return {
    dirty,
    compiling,
    committing,
    compilePreview: handleCompilePreview,
    commitToPhase3: handleCommitToPhase3,
  };
}
