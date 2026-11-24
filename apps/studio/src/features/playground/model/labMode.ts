import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, selectPlaygroundProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

import { playgroundActions } from "./playgroundActions";
import { usePlaygroundDocIds } from "./playgroundDocs";

/**
 * 실험실 모드 — 플레이그라운드 초안을 열어 둔 상태.
 * 피그마 Dev Mode 처럼 화면 배치는 같고, 색 · 크롬만 바뀌어 "지금은 프로젝트가 아니다"를 한눈에 보인다.
 */
export function useLabMode(): boolean {
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const ids = usePlaygroundDocIds();
  return Boolean(activeDocId && ids.has(activeDocId));
}

export const labMode = {
  /** 실험실로: 지금 쪽의 버전이 있으면 그것, 없으면 가장 최근 초안, 초안이 없으면 플레이그라운드 목록. */
  enter: () => {
    const docs = useStudioDocumentStore.getState();
    const playground = selectPlaygroundProject(useProjectStore.getState());
    const drafts = docs.docs.filter((d) => playground?.docIds.includes(d.docId));
    const samePage = drafts.find(
      (d) => d.origin?.copiedFrom?.docId === docs.activeDocId && d.origin.copiedFrom.pageIds?.includes(docs.activePageId),
    );
    const sameDoc = drafts.find((d) => d.origin?.copiedFrom?.docId === docs.activeDocId);
    const recent = [...drafts].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
    const target = samePage ?? sameDoc ?? recent;
    if (target) playgroundActions.open(target.docId);
    else useWorkspaceLayoutStore.getState().setActiveActivityTab("playground");
  },

  /** 프로젝트로: 원본에서 복사해 온 초안이면 그 원본(그 쪽), 아니면 작업 프로젝트의 첫 문서. */
  leave: () => {
    const docs = useStudioDocumentStore.getState();
    const current = docs.docs.find((d) => d.docId === docs.activeDocId);
    const from = current?.origin?.copiedFrom;
    const loaded = new Set(docs.docs.map((d) => d.docId));
    const target =
      (from && loaded.has(from.docId) ? from.docId : null) ??
      selectActiveProject(useProjectStore.getState())?.docIds.find((id) => loaded.has(id));
    if (!target) return;
    playgroundActions.open(target);
    if (from?.docId === target && from.pageIds?.[0]) useStudioDocumentStore.getState().setActivePageId(from.pageIds[0]);
  },
};
