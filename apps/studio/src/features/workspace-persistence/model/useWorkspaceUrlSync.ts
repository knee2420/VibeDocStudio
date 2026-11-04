import { useEffect } from "react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { isWorkbenchPhase, parseReferenceDocIds, useWorkspaceSessionStore } from "@/entities/workspace-session";
import { writeStoredJson } from "@/shared/lib";

const STORAGE_KEY = "vdoc-studio-session-v1";

/**
 * 작업 공간 위치(단계 `phase` · 줌 루트 `zoom` · 활성 문서 `doc` · 참조 작업창 `splitRef`)를
 * URL 쿼리와 브라우저 저장소에 맞추고, 뒤로/앞으로 가기를 반영한다.
 * 승인 대기 중인 AI 변경안이 있으면 탭 닫기를 한 번 막는다.
 */
export function useWorkspaceUrlSync(): void {
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const zoomRootNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const openReferenceDocIds = useWorkspaceSessionStore((s) => s.openReferenceDocIds);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const stagingCount = useAiStagingStore((s) => s.queue.length);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("phase", currentPhase);
    params.set("zoom", zoomRootNodeId);
    if (activeDocId) params.set("doc", activeDocId);
    if (openReferenceDocIds.length > 0) params.set("splitRef", openReferenceDocIds.join(","));
    else params.delete("splitRef");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);

    writeStoredJson(STORAGE_KEY, {
      phase: currentPhase,
      zoom: zoomRootNodeId,
      doc: activeDocId,
      splitRef: openReferenceDocIds,
    });
  }, [currentPhase, zoomRootNodeId, activeDocId, openReferenceDocIds]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const session = useWorkspaceSessionStore.getState();
      const phase = params.get("phase");
      if (isWorkbenchPhase(phase)) session.setPhase(phase);
      const zoom = params.get("zoom");
      if (zoom) session.zoomIntoNode(zoom);
      const doc = params.get("doc");
      if (doc) useStudioDocumentStore.getState().setActiveDocId(doc);
      session.setOpenReferenceDocIds(parseReferenceDocIds(params.get("splitRef")));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (stagingCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [stagingCount]);
}
