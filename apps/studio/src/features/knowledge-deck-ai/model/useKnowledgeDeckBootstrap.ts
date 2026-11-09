import { useEffect } from "react";

import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";

/**
 * 활성 프로젝트의 지식 덱 목록을 앱 시작 · 프로젝트 전환 때 불러온다.
 * Resource Manager 를 열지 않아도 체크된 덱이 Composer 에 자동 첨부되고, 돌던 색인 작업의 진행도 이어서 본다.
 */
export function useKnowledgeDeckBootstrap(): void {
  const projectId = useProjectStore(selectActiveProject)?.projectId;
  const loadDecks = useKnowledgeDeckStore((s) => s.loadDecks);
  useEffect(() => {
    if (projectId) void loadDecks(projectId);
  }, [projectId, loadDecks]);
}
