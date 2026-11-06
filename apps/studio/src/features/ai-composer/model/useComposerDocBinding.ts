import { useEffect } from "react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { composerController } from "@/shared/ai";

/**
 * Composer 대화를 지금 문서에 묶는다 — 문서를 바꾸면 그 문서의 대화가 돌아오고, 새로고침해도 남는다.
 * 실행 중이면 끝난 뒤에 옮긴다 (컨트롤러가 미뤄 둔다).
 */
export function useComposerDocBinding(): void {
  const projectId = useProjectStore((s) => selectActiveProject(s)?.projectId ?? null);
  const docId = useStudioDocumentStore((s) => s.activeDocId);
  useEffect(() => {
    composerController.bindConversation(projectId && docId ? `${projectId}:${docId}` : null);
  }, [projectId, docId]);
}
