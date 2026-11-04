import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectBoundReferenceProjects, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

export interface ReferenceDocView {
  docId: string;
  title: string;
  projectTitle: string;
  pageCount: number | null;
  loaded: boolean;
  openInSplit: boolean;
}

/** 참조 레이어 덱에 보이는 참조 문서들 (활성 프로젝트에 바인딩된 참조 프로젝트의 문서). */
export function referenceDocs(): ReferenceDocView[] {
  const projects = selectBoundReferenceProjects(useProjectStore.getState());
  const docs = useStudioDocumentStore.getState().docs;
  const open = new Set(useWorkspaceSessionStore.getState().openReferenceDocIds);
  return projects.flatMap((project) =>
    project.docIds.map((docId) => {
      const d = docs.find((x) => x.docId === docId);
      return {
        docId,
        title: d?.title ?? project.title,
        projectTitle: project.title,
        pageCount: d?.pages.length ?? null,
        loaded: Boolean(d),
        openInSplit: open.has(docId),
      };
    })
  );
}
