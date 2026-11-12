import { useEffect } from "react";

import { PROJECT_ROOT_CRUMB_ID, type OutlinerNode } from "@vibe/vdoc-schema";

import { useSlotSelectionStore, type SlotSelectionState } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { getOutlineProjection } from "@/features/zoom-hierarchy";

type CanvasTarget = { kind: "slot" | "block"; id: string };

/** 캔버스 선택에서 사이드바가 따라갈 대상 (단일 슬롯 → 범위의 첫 슬롯 → 블록 → 표 전체 선택). */
export function canvasSelectionTarget(s: Pick<SlotSelectionState, "selectedSlotId" | "slotRange" | "selectedBlockId" | "tableSelection">): CanvasTarget | null {
  if (s.selectedSlotId) return { kind: "slot", id: s.selectedSlotId };
  const firstRangeSlot = s.slotRange?.slotIds[0];
  if (firstRangeSlot) return { kind: "slot", id: firstRangeSlot };
  if (s.selectedBlockId) return { kind: "block", id: s.selectedBlockId };
  if (s.tableSelection?.tableSelected) return { kind: "block", id: s.tableSelection.blockId };
  return null;
}

export function findTargetNode(allNodes: readonly OutlinerNode[], target: CanvasTarget): OutlinerNode | undefined {
  return target.kind === "slot"
    ? allNodes.find((n) => n.targetSlotId === target.id)
    : allNodes.find((n) => n.targetBlockId === target.id && !n.targetSlotId);
}

/** 조상 노드 id (가까운 것부터). */
export function ancestorIds(allNodes: readonly OutlinerNode[], node: OutlinerNode): string[] {
  const byId = new Map(allNodes.map((n) => [n.nodeId, n]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (let p = node.parentId ? byId.get(node.parentId) : undefined; p && !seen.has(p.nodeId); p = p.parentId ? byId.get(p.parentId) : undefined) {
    seen.add(p.nodeId);
    out.push(p.nodeId);
  }
  return out;
}

/**
 * 캔버스 → 사이드바 따라가기 (피그마처럼): 캔버스에서 엘리먼트를 고르면
 * 1) 그 페이지를 현재 페이지로 (Documents & Pages 가 그 페이지를 표시하고 Elements 가 그 페이지로 바뀐다)
 * 2) 접혀 있던 조상(문서 · 블록 · 구역)을 펼치고
 * 3) Elements 를 다른 엘리먼트 안으로 줌해 두었다면 줌을 풀어 보이게 한다.
 * 하늘색 강조와 스크롤은 각 구역이 맡는다 (`useRowSelection` · 선택 행 scrollIntoView).
 * 키보드 포커스는 옮기지 않는다 — 캔버스에서 바로 타이핑하던 손을 빼앗지 않게.
 */
export function revealCanvasTargetInSidebar(target: CanvasTarget): void {
  const projection = getOutlineProjection();
  const node = findTargetNode(projection.allNodes, target);
  if (!node) return;

  const documents = useStudioDocumentStore.getState();
  if (node.targetPageId && node.targetPageId !== documents.activePageId && (node.targetDocId || documents.activeDocId) === documents.activeDocId) {
    documents.setActivePageId(node.targetPageId);
  }

  const ancestors = ancestorIds(projection.allNodes, node);
  const session = useWorkspaceSessionStore.getState();
  const collapsed = new Set(session.collapsedNodeIds);
  session.setNodesCollapsed(
    ancestors.filter((id) => collapsed.has(id)),
    false
  );

  const zoomRoot = projection.rootNodeId;
  if (zoomRoot !== PROJECT_ROOT_CRUMB_ID && zoomRoot !== node.nodeId && !ancestors.includes(zoomRoot)) {
    const rootNode = projection.allNodes.find((n) => n.nodeId === zoomRoot);
    // 다른 엘리먼트(블록 · 슬롯) 안으로 줌해 둔 경우: 그 엘리먼트의 페이지로 줌을 넓힌다. 캔버스의 페이지 격리 보기는
    // 그대로 유지되고 Elements 는 페이지 전체를 보여준다. 페이지 · 문서 줌은 건드리지 않는다.
    if (rootNode && (rootNode.targetBlockId || rootNode.targetSlotId)) {
      const byId = new Map(projection.allNodes.map((n) => [n.nodeId, n]));
      const pageNodeId = ancestors.find((id) => {
        const a = byId.get(id);
        return a?.zoomLevel === "page" && !a.targetBlockId && !a.targetSlotId;
      });
      session.zoomIntoNode(pageNodeId ?? PROJECT_ROOT_CRUMB_ID);
    }
  }
}

/** 사이드바 탐색기에 한 번 마운트한다. 캔버스 선택이 바뀔 때만 동작한다 (렌더를 일으키지 않는 구독). */
export function useRevealCanvasSelection(): void {
  useEffect(
    () =>
      useSlotSelectionStore.subscribe((state, prev) => {
        const next = canvasSelectionTarget(state);
        if (!next) return;
        const before = canvasSelectionTarget(prev);
        if (before && before.kind === next.kind && before.id === next.id) return;
        revealCanvasTargetInSidebar(next);
      }),
    []
  );
}
