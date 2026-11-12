import { useEffect, useSyncExternalStore } from "react";

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
import { revealCanvasElement, scrollToCanvasPage } from "@/shared/lib";

const EMPTY_PROJECT: VProjectManifest = {
  projectId: "",
  title: "",
  description: "",
  activePhase: "storylining",
  docIds: [],
  storylineNodes: [],
  provenanceLineage: [],
  updatedAt: "",
};

/**
 * 아웃라인 투영은 아웃라이너 · 브레드크럼 · 캔버스가 함께 쓴다. 입력이 같으면 한 번만 계산하도록
 * 마지막 입력/결과를 모듈에 기억한다 (소비자마다 `useMemo` 를 두면 같은 트리를 세 번 만든다).
 */
type ProjectionInputs = [VProjectManifest, VDocDocument[], string];
let lastInputs: ProjectionInputs | null = null;
let lastProjection: FractalOutlineProjection | null = null;

function projectOutline(...inputs: ProjectionInputs): FractalOutlineProjection {
  if (lastProjection && lastInputs && inputs.every((v, i) => v === lastInputs![i])) return lastProjection;
  lastInputs = inputs;
  lastProjection = shareStructure(lastProjection, buildProjectFractalTree(...inputs));
  return lastProjection;
}

/** 얕은 비교 (노드 · 브레드크럼 항목은 원시값 필드만 가진다). */
function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function shareArray<T extends object>(prev: readonly T[] | undefined, next: T[], pool: Map<string, T>, key: (v: T) => string): T[] {
  let same = prev !== undefined && prev.length === next.length;
  const out = next.map((item, i) => {
    const old = pool.get(key(item));
    const kept = old && shallowEqual(old, item) ? old : item;
    if (same && prev![i] !== kept) same = false;
    return kept;
  });
  return same ? (prev as T[]) : out;
}

function shallowRecordEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/**
 * 새 투영에서 바뀌지 않은 노드는 이전 객체를 그대로 쓴다. 타이핑 한 번에 트리가 새로 만들어져도
 * 실제로 달라진 줄만 새 객체가 되어, 메모된 아웃라인 줄은 그 줄만 다시 그린다.
 * 아무것도 달라지지 않았으면 이전 투영 객체를 그대로 돌려준다.
 */
function shareStructure(prev: FractalOutlineProjection | null, next: FractalOutlineProjection): FractalOutlineProjection {
  if (!prev) return next;
  const pool = new Map(prev.allNodes.map((n) => [n.nodeId, n]));
  const nodeKey = (n: OutlinerNode) => n.nodeId;
  const allNodes = shareArray(prev.allNodes, next.allNodes, pool, nodeKey);
  const visibleNodes = shareArray(prev.visibleNodes, next.visibleNodes, pool, nodeKey);
  const crumbPool = new Map(prev.breadcrumbs.map((c) => [c.nodeId, c]));
  const breadcrumbs = shareArray(prev.breadcrumbs, next.breadcrumbs, crumbPool, (c) => c.nodeId);
  const hasChildrenMap = shallowRecordEqual(prev.hasChildrenMap, next.hasChildrenMap) ? prev.hasChildrenMap : next.hasChildrenMap;
  const shared = { ...next, allNodes, visibleNodes, breadcrumbs, hasChildrenMap };
  return shallowEqual(prev, shared) ? prev : shared;
}

/**
 * 지금 스토어 상태의 아웃라인 투영 (렌더 밖에서도 부를 수 있다).
 * 입력이 같으면 캐시를 돌려주고, 바뀌어도 달라진 노드만 새 객체가 된다 (`shareStructure`).
 *
 * 검색어 · 접힘은 투영에 넣지 않는다. 사이드바의 페이지 · 레이어 구역이 각자 다르게 적용하고
 * (`widgets/outline-preview-sidebar/model/outlineSections`), 넣으면 검색 한 글자 · 접기 한 번마다
 * 전체 트리를 다시 만들고 캔버스까지 깨운다. `visibleNodes` 는 줌 범위만 반영한다.
 */
export function getOutlineProjection(): FractalOutlineProjection {
  return projectOutline(
    selectActiveProject(useProjectStore.getState()) ?? EMPTY_PROJECT,
    useStudioDocumentStore.getState().docs,
    useWorkspaceSessionStore.getState().zoomRootNodeId
  );
}

function subscribeOutlineInputs(onChange: () => void): () => void {
  const unsubscribers = [
    useProjectStore.subscribe(onChange),
    useStudioDocumentStore.subscribe(onChange),
    useWorkspaceSessionStore.subscribe(onChange),
  ];
  return () => unsubscribers.forEach((u) => u());
}

/**
 * 투영에서 필요한 값만 구독한다. 선택 결과가 같으면(원시값 · 같은 객체) 다시 그리지 않는다.
 * 예전에는 페이지 최상위가 `docs` 를 통째로 구독해, 슬롯 한 칸이 바뀌어도 앱 전체가 두 번씩 다시 그려졌다.
 */
export function useOutlineSelector<T>(select: (projection: FractalOutlineProjection) => T): T {
  return useSyncExternalStore(subscribeOutlineInputs, () => select(getOutlineProjection()));
}

/** 현재 줌 상태의 아웃라인 투영 (읽기 전용). 투영 내용이 실제로 바뀔 때만 다시 그린다. */
export function useOutlineProjection(): FractalOutlineProjection {
  return useSyncExternalStore(subscribeOutlineInputs, getOutlineProjection);
}

/** 노드가 가리키는 문서 · 페이지 · 블록 · 슬롯을 캔버스에서 고르고 보여준다. */
function focusNodeOnCanvas(node: OutlinerNode): void {
  const documents = useStudioDocumentStore.getState();
  const selection = useSlotSelectionStore.getState();
  // 같은 문서를 다시 고르면 활성 페이지가 첫 페이지로 튀었다가 돌아오며 캔버스 창이 두 번 바뀐다.
  if (node.targetDocId && node.targetDocId !== documents.activeDocId) documents.setActiveDocId(node.targetDocId);
  if (node.targetPageId) documents.setActivePageId(node.targetPageId);
  // 스크롤은 한 번만: 요소가 있으면 요소로, 없으면 페이지로 (두 부드러운 스크롤이 겹치면 끊긴다).
  const fallbackPageId = node.targetPageId ?? null;
  if (node.targetSlotId) {
    selection.setSelectedSlotId(node.targetSlotId);
    revealCanvasElement({ slotId: node.targetSlotId, fallbackPageId });
  } else if (node.targetBlockId) {
    // 블록 · 구역 · 행 컨테이너 노드는 해당 블록을 선택하고 테두리 링을 강조한다.
    selection.setSelectedBlockId(node.targetBlockId);
    revealCanvasElement({ blockId: node.targetBlockId, fallbackPageId });
  } else {
    // 페이지나 문서 전체 조망으로 돌아올 때는 블록 선택 및 디밍을 즉시 해제
    selection.clearSelection();
    if (node.targetPageId) scrollToCanvasPage(node.targetPageId);
  }
}

function openProjectFirstDocument(): void {
  useSlotSelectionStore.getState().clearSelection();
  const firstDocId = selectActiveProject(useProjectStore.getState())?.docIds[0];
  if (firstDocId) useStudioDocumentStore.getState().setActiveDocId(firstDocId);
}

/** 아웃라인 줌 · 선택 명령 (구독 없음 — 투영은 실행 순간에 읽는다). */
export const outlineCommands = {
  zoomIntoNode(node: OutlinerNode) {
    useWorkspaceSessionStore.getState().zoomIntoNode(node.nodeId);
    focusNodeOnCanvas(node);
  },

  selectNode(node: OutlinerNode) {
    useWorkspaceSessionStore.getState().setSelectedOutlinerNodeId(node.nodeId);
    focusNodeOnCanvas(node);
  },

  breadcrumbClick(nodeId: string) {
    useWorkspaceSessionStore.getState().zoomIntoNode(nodeId);
    const found = getOutlineProjection().allNodes.find((n) => n.nodeId === nodeId);
    if (found) {
      focusNodeOnCanvas(found);
      if (!found.targetBlockId && !found.targetSlotId) {
        useSlotSelectionStore.getState().clearSelection();
      }
    } else if (nodeId === PROJECT_ROOT_CRUMB_ID) {
      openProjectFirstDocument();
    }
  },

  zoomOutOneLevel() {
    const projection = getOutlineProjection();
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

    // 줌아웃 시 상위가 블록/슬롯이 아니면(페이지·문서·홈) 포커스 디밍을 완전히 해제
    if (!targetNode?.targetBlockId && !targetNode?.targetSlotId) {
      useSlotSelectionStore.getState().clearSelection();
    } else {
      focusNodeOnCanvas(targetNode);
    }
  },
};

/** 투영 + 명령. 투영 전체가 필요한 곳(아웃라이너 · 브레드크럼)만 쓴다. */
export function useFractalZoomNavigation() {
  const projection = useOutlineProjection();
  return {
    projection,
    handleBulletZoomIn: outlineCommands.zoomIntoNode,
    handleSelectOutlineNode: outlineCommands.selectNode,
    handleBreadcrumbClick: outlineCommands.breadcrumbClick,
    handleZoomOutOneLevel: outlineCommands.zoomOutOneLevel,
  };
}

/**
 * 줌 위계의 전역 부작용. 페이지에서 한 번만 마운트한다.
 * - `Alt+↑`: 한 단계 줌아웃
 * - 줌 루트가 가리키는 문서가 활성 문서와 다르면 활성 문서를 맞춘다
 */
export function useZoomHierarchySync(): void {
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const zoomedDocId = useOutlineSelector((p) => p.allNodes.find((n) => n.nodeId === p.rootNodeId)?.targetDocId ?? null);

  useEffect(() => {
    // 줌 루트의 문서와 활성 문서가 다르면, 사용자가 전환한 활성 문서를 존중하여 줌을 프로젝트 루트로 맞춘다.
    // 이전 문서를 강제로 다시 불러오는 역방향 핑퐁 루프를 방지한다.
    if (zoomedDocId && activeDocId && zoomedDocId !== activeDocId) {
      useWorkspaceSessionStore.getState().zoomIntoNode(PROJECT_ROOT_CRUMB_ID);
    }
  }, [activeDocId, zoomedDocId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        outlineCommands.zoomOutOneLevel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
