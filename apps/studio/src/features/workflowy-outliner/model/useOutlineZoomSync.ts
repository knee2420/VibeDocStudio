import { useEffect } from "react";
import type { OutlineEditorStore } from "@vibe/outliner/editor";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/**
 * 중앙 `@vibe/outliner` 의 `activeRootId` 와 좌측 탐색기(`zoomNodeId` / `zoomRootNodeId`)를 양방향 동기화한다.
 */
export function useOutlineZoomSync(editorStore: OutlineEditorStore): void {
  const storeZoomRootId = useWorkingOutlineStore((s) => s.zoomRootNodeId);
  const setZoomRootNodeId = useWorkingOutlineStore((s) => s.setZoomRootNodeId);
  const sessionZoomNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const zoomIntoNode = useWorkspaceSessionStore((s) => s.zoomIntoNode);

  // 1. 에디터 내부 zoom 변경 -> 전역 WorkingOutline + workspace-session 반영
  useEffect(() => {
    const unsubscribe = editorStore.subscribe((state, prevState) => {
      if (state.activeRootId !== prevState.activeRootId) {
        const nextId = state.activeRootId ?? null;
        setZoomRootNodeId(nextId);
        zoomIntoNode(nextId ?? "project-root");
      }
    });
    return unsubscribe;
  }, [editorStore, setZoomRootNodeId, zoomIntoNode]);

  // 2. 좌측 탐색기/브레드크럼 zoom 변경 -> 에디터 activeRootId 동기화
  useEffect(() => {
    const normalized =
      sessionZoomNodeId && sessionZoomNodeId !== "project-root"
        ? sessionZoomNodeId
        : (storeZoomRootId ?? null);
    const currentEditorRoot = editorStore.getState().activeRootId ?? null;
    if (currentEditorRoot !== normalized) {
      editorStore.getState().setZoom(normalized);
      if ((storeZoomRootId ?? null) !== normalized) {
        setZoomRootNodeId(normalized);
      }
    }
  }, [editorStore, sessionZoomNodeId, storeZoomRootId, setZoomRootNodeId]);
}
