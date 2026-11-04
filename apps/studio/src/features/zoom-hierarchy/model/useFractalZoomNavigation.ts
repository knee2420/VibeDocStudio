import { useDeferredValue, useEffect } from "react";

import {
  buildProjectFractalTree,
  PROJECT_ROOT_CRUMB_ID,
  type FractalOutlineProjection,
  type OutlinerNode,
  type VDocDocument,
  type VProjectManifest,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { revealCanvasElement, scrollToCanvasPage, useStableCallback } from "@/shared/lib";

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

/**
 * 아웃라인 투영은 아웃라이너 · 브레드크럼 · 캔버스가 함께 쓴다. 입력이 같으면 한 번만 계산하도록
 * 마지막 입력/결과를 모듈에 기억한다 (소비자마다 `useMemo` 를 두면 같은 트리를 세 번 만든다).
 */
type ProjectionInputs = [VProjectManifest, VDocDocument[], string, string, string[]];
let lastInputs: ProjectionInputs | null = null;
let lastProjection: FractalOutlineProjection | null = null;

function projectOutline(...inputs: ProjectionInputs): FractalOutlineProjection {
  if (lastProjection && lastInputs && inputs.every((v, i) => v === lastInputs![i])) return lastProjection;
  lastInputs = inputs;
  lastProjection = buildProjectFractalTree(...inputs);
  return lastProjection;
}

/** 현재 줌 · 필터 · 접힘 상태의 아웃라인 투영 (읽기 전용). */
export function useOutlineProjection(): FractalOutlineProjection {
  const activeProject = useProjectStore(selectActiveProject) ?? EMPTY_PROJECT;
  // 아웃라인 트리는 문서 내용(슬롯 요약)까지 반영하지만 타이핑보다 늦어도 된다.
  const docs = useDeferredValue(useStudioDocumentStore((s) => s.docs));
  const zoomRootNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  return projectOutline(activeProject, docs, zoomRootNodeId, quickFilterQuery, collapsedNodeIds);
}

/** 노드가 가리키는 문서 · 페이지 · 블록 · 슬롯을 캔버스에서 고르고 보여준다. */
function focusNodeOnCanvas(node: OutlinerNode): void {
  const documents = useStudioDocumentStore.getState();
  const selection = useSlotSelectionStore.getState();
  if (node.targetDocId) documents.setActiveDocId(node.targetDocId);
  if (node.targetPageId) {
    documents.setActivePageId(node.targetPageId);
    scrollToCanvasPage(node.targetPageId);
  }
  if (node.targetSlotId) {
    selection.setSelectedSlotId(node.targetSlotId);
    revealCanvasElement({ slotId: node.targetSlotId });
  } else if (node.targetBlockId) {
    // 블록 · 구역 · 행 컨테이너 노드는 해당 블록을 선택하고 테두리 링을 강조한다.
    selection.setSelectedBlockId(node.targetBlockId);
    revealCanvasElement({ blockId: node.targetBlockId });
  }
}

function openProjectFirstDocument(): void {
  const firstDocId = selectActiveProject(useProjectStore.getState())?.docIds[0];
  if (firstDocId) useStudioDocumentStore.getState().setActiveDocId(firstDocId);
}

/** 아웃라인 줌 · 선택 명령. 부작용(리스너 · 자동 동기화)은 `useZoomHierarchySync` 한 곳에만 있다. */
export function useFractalZoomNavigation() {
  const projection = useOutlineProjection();

  const handleBulletZoomIn = (node: OutlinerNode) => {
    useWorkspaceSessionStore.getState().zoomIntoNode(node.nodeId);
    focusNodeOnCanvas(node);
  };

  const handleSelectOutlineNode = (node: OutlinerNode) => {
    useWorkspaceSessionStore.getState().setSelectedOutlinerNodeId(node.nodeId);
    focusNodeOnCanvas(node);
  };

  const handleBreadcrumbClick = (nodeId: string) => {
    useWorkspaceSessionStore.getState().zoomIntoNode(nodeId);
    const found = projection.allNodes.find((n) => n.nodeId === nodeId);
    if (found) focusNodeOnCanvas(found);
    else if (nodeId === PROJECT_ROOT_CRUMB_ID) openProjectFirstDocument();
  };

  const handleZoomOutOneLevel = () => {
    const crumbs = projection.breadcrumbs;
    const targetNodeId =
      projection.parentZoomNodeId ?? (crumbs.length > 1 ? crumbs[crumbs.length - 2].nodeId : PROJECT_ROOT_CRUMB_ID);
    useWorkspaceSessionStore.getState().zoomIntoNode(targetNodeId);

    const targetNode = projection.allNodes.find((n) => n.nodeId === targetNodeId);
    const firstStoryNodeId = selectActiveProject(useProjectStore.getState())?.storylineNodes[0]?.nodeId;
    if (targetNode?.targetDocId) {
      const documents = useStudioDocumentStore.getState();
      documents.setActiveDocId(targetNode.targetDocId);
      if (targetNode.targetPageId) documents.setActivePageId(targetNode.targetPageId);
    } else if (targetNodeId === PROJECT_ROOT_CRUMB_ID || targetNodeId === firstStoryNodeId) {
      openProjectFirstDocument();
    }
  };

  return {
    projection,
    handleBulletZoomIn,
    handleSelectOutlineNode,
    handleBreadcrumbClick,
    handleZoomOutOneLevel,
  };
}

/**
 * 줌 위계의 전역 부작용. 페이지에서 한 번만 마운트한다.
 * - `Alt+↑`: 한 단계 줌아웃
 * - 줌 루트가 가리키는 문서가 활성 문서와 다르면 활성 문서를 맞춘다
 */
export function useZoomHierarchySync(): void {
  const { projection, handleZoomOutOneLevel } = useFractalZoomNavigation();
  const zoomOut = useStableCallback(handleZoomOutOneLevel);

  const zoomedDocId = projection.allNodes.find((n) => n.nodeId === projection.rootNodeId)?.targetDocId;
  useEffect(() => {
    const documents = useStudioDocumentStore.getState();
    if (zoomedDocId && zoomedDocId !== documents.activeDocId) documents.setActiveDocId(zoomedDocId);
  }, [zoomedDocId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        zoomOut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomOut]);
}
