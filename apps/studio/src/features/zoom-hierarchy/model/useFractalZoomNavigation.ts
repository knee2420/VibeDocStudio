import { useCallback, useDeferredValue, useEffect, useMemo } from "react";

import {
  buildProjectFractalTree,
  PROJECT_ROOT_CRUMB_ID,
  type FractalOutlineProjection,
  type OutlinerNode,
  type VProjectManifest,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

const EMPTY_PROJECT: VProjectManifest = {
  projectId: "",
  title: "",
  description: "",
  isReferenceOnly: true,
  activePhase: "storylining",
  docIds: [],
  referenceProjectIds: [],
  storylineNodes: [],
  provenanceLineage: [],
  updatedAt: "",
};

export function useFractalZoomNavigation(): {
  projection: FractalOutlineProjection;
  handleBulletZoomIn: (node: OutlinerNode) => void;
  handleSelectOutlineNode: (node: OutlinerNode) => void;
  handleBreadcrumbClick: (nodeId: string) => void;
  handleZoomOutOneLevel: () => void;
} {
  const activeProject = useProjectStore(selectActiveProject);
  // 아웃라인 트리는 문서 내용(슬롯 요약)까지 반영하지만 타이핑보다 늦어도 된다.
  // 지연 값으로 계산해 입력 응답성을 먼저 지킨다.
  const docs = useDeferredValue(useStudioDocumentStore((s) => s.docs));
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const setSelectedSlotId = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const setSelectedBlockId = useSlotSelectionStore((s) => s.setSelectedBlockId);

  const zoomRootNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const zoomIntoNode = useWorkspaceSessionStore((s) => s.zoomIntoNode);
  const setSelectedOutlinerNodeId = useWorkspaceSessionStore(
    (s) => s.setSelectedOutlinerNodeId
  );

  const projection = useMemo(
    () =>
      buildProjectFractalTree(
        activeProject ?? EMPTY_PROJECT,
        docs,
        zoomRootNodeId,
        quickFilterQuery,
        collapsedNodeIds
      ),
    [activeProject, docs, zoomRootNodeId, quickFilterQuery, collapsedNodeIds]
  );

  const syncCanvasSelection = (node: OutlinerNode) => {
    if (node.targetDocId) {
      setActiveDocId(node.targetDocId);
    }
    if (node.targetPageId) {
      setActivePageId(node.targetPageId);
      window.setTimeout(() => {
        document
          .getElementById(`vdoc-page-${node.targetPageId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    }
    if (!node.targetSlotId && node.targetBlockId) {
      // 블록 · 구역 · 행 컨테이너 노드는 해당 블록을 선택하고 테두리 링을 강조한다.
      setSelectedBlockId(node.targetBlockId);
      window.setTimeout(() => {
        const el = document.querySelector(
          `[data-block-id="${node.targetBlockId}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-emerald-400", "transition-all");
          window.setTimeout(() => {
            el.classList.remove("ring-4", "ring-emerald-400");
          }, 1200);
        }
      }, 60);
    }
    if (node.targetSlotId) {
      setSelectedSlotId(node.targetSlotId);
      window.setTimeout(() => {
        const el = document.querySelector(
          `[data-slot-id="${node.targetSlotId}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-emerald-400", "transition-all");
          window.setTimeout(() => {
            el.classList.remove("ring-4", "ring-emerald-400");
          }, 1200);
        }
      }, 60);
    }
  };

  const handleBulletZoomIn = (node: OutlinerNode) => {
    zoomIntoNode(node.nodeId);
    syncCanvasSelection(node);
  };

  const handleSelectOutlineNode = (node: OutlinerNode) => {
    setSelectedOutlinerNodeId(node.nodeId);
    syncCanvasSelection(node);
  };

  const handleBreadcrumbClick = (nodeId: string) => {
    zoomIntoNode(nodeId);
    const found = projection.allNodes.find((n) => n.nodeId === nodeId);
    if (found) {
      syncCanvasSelection(found);
    } else if (nodeId === PROJECT_ROOT_CRUMB_ID) {
      const firstDocId = activeProject?.docIds[0];
      if (firstDocId) {
        setActiveDocId(firstDocId);
      }
    }
  };

  const handleZoomOutOneLevel = useCallback(() => {
    let targetNodeId = PROJECT_ROOT_CRUMB_ID;
    if (projection.parentZoomNodeId) {
      targetNodeId = projection.parentZoomNodeId;
    } else {
      const crumbs = projection.breadcrumbs;
      if (crumbs.length > 1) {
        targetNodeId = crumbs[crumbs.length - 2].nodeId;
      }
    }
    zoomIntoNode(targetNodeId);

    const targetNode = projection.allNodes.find((n) => n.nodeId === targetNodeId);
    if (targetNode?.targetDocId) {
      setActiveDocId(targetNode.targetDocId);
      if (targetNode.targetPageId) {
        setActivePageId(targetNode.targetPageId);
      }
    } else if (
      targetNodeId === PROJECT_ROOT_CRUMB_ID ||
      targetNodeId === activeProject?.storylineNodes[0]?.nodeId
    ) {
      const firstDocId = activeProject?.docIds[0];
      if (firstDocId) {
        setActiveDocId(firstDocId);
      }
    }
  }, [
    projection.parentZoomNodeId,
    projection.breadcrumbs,
    projection.allNodes,
    zoomIntoNode,
    setActiveDocId,
    setActivePageId,
    activeProject,
  ]);

  // 아웃라이너의 현재 줌 루트에 해당하는 문서가 현재 활성 문서와 다르면 자동 동기화
  useEffect(() => {
    const zoomedNode = projection.allNodes.find((n) => n.nodeId === projection.rootNodeId);
    if (zoomedNode?.targetDocId) {
      if (zoomedNode.targetDocId !== useStudioDocumentStore.getState().activeDocId) {
        setActiveDocId(zoomedNode.targetDocId);
      }
    }
  }, [projection.rootNodeId, projection.allNodes, setActiveDocId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        handleZoomOutOneLevel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleZoomOutOneLevel]);

  return {
    projection,
    handleBulletZoomIn,
    handleSelectOutlineNode,
    handleBreadcrumbClick,
    handleZoomOutOneLevel,
  };
}

