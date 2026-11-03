import { useDeferredValue, useMemo } from "react";

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

  const zoomRootNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
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
        quickFilterQuery
      ),
    [activeProject, docs, zoomRootNodeId, quickFilterQuery]
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
    if (node.targetSlotId) {
      setSelectedSlotId(node.targetSlotId);
      window.setTimeout(() => {
        const el = document.querySelector(
          `[data-slot-id="${node.targetSlotId}"]`
        );
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    }
  };

  const handleZoomOutOneLevel = () => {
    const crumbs = projection.breadcrumbs;
    if (crumbs.length <= 1) {
      zoomIntoNode(PROJECT_ROOT_CRUMB_ID);
      return;
    }
    const parentCrumb = crumbs[crumbs.length - 2];
    zoomIntoNode(parentCrumb.nodeId);
  };

  return {
    projection,
    handleBulletZoomIn,
    handleSelectOutlineNode,
    handleBreadcrumbClick,
    handleZoomOutOneLevel,
  };
}

