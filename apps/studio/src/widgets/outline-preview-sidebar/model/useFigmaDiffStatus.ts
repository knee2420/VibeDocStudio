import { useMemo } from "react";
import type { OutlinerNode, VDocDocument } from "@vibe/vdoc-schema";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export type FigmaDiffKind = "added" | "edited";

export interface NodeDiffState {
  kind: FigmaDiffKind;
  /** 직접 변경된 단말 노드면 true (U / M 표시), 하위 변경이 버블링된 부모면 false (도트 ● 표시) */
  isDirect: boolean;
}

/**
 * 안티그래비티 (VS Code Git 트리) 스타일의 계층적 변경 상태 판정 훅.
 * - 단말 직접 변경 (isDirect: true):
 *   - 슬롯: slot.isEdited === true 면 'edited' (M)
 *   - 신규 페이지: '새 페이지'로 생성된 페이지면 'added' (U)
 * - 상위 컨테이너 버블링 (isDirect: false):
 *   - 하위에 added 또는 edited 자식이 있으면 해당 상태를 부모로 전파하여 우측 도트(●) 표시
 */
export function useFigmaDiffStatusMap(nodes: readonly OutlinerNode[]): Record<string, NodeDiffState> {
  const docs = useStudioDocumentStore((s) => s.docs);
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);

  return useMemo(() => {
    const statusMap: Record<string, NodeDiffState> = {};
    if (!nodes || nodes.length === 0) return statusMap;

    const docsById = new Map<string, VDocDocument>(docs.map((d) => [d.docId, d]));

    // 1. 단말 노드(슬롯, 신규 페이지)의 직접 변경 상태 판정 (isDirect: true)
    for (const node of nodes) {
      if (node.zoomLevel === "slot" && node.targetSlotId && node.targetDocId) {
        const doc = docsById.get(node.targetDocId);
        const slot = doc?.slots[node.targetSlotId];
        if (slot?.isEdited) {
          statusMap[node.nodeId] = { kind: "edited", isDirect: true };
        }
      } else if (node.zoomLevel === "page" && !node.targetBlockId) {
        if (node.title.includes("새 페이지") && !committedPageIds.has(node.targetPageId ?? "")) {
          statusMap[node.nodeId] = { kind: "added", isDirect: true };
        }
      }
    }

    // 2. 부모-자식 관계 구축
    const childrenByParent = new Map<string, OutlinerNode[]>();
    for (const node of nodes) {
      if (node.parentId) {
        const list = childrenByParent.get(node.parentId) || [];
        list.push(node);
        childrenByParent.set(node.parentId, list);
      }
    }

    // 3. 후위 순회(Bottom-up)로 상위 컨테이너(블록, 페이지, 문서)로 상태 전파 (isDirect: false)
    const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);

    for (const node of sortedNodes) {
      if (statusMap[node.nodeId]) continue;

      const children = childrenByParent.get(node.nodeId) || [];
      if (children.length === 0) continue;

      let hasAddedChild = false;
      let hasEditedChild = false;

      for (const child of children) {
        const childStatus = statusMap[child.nodeId];
        if (!childStatus) continue;
        if (childStatus.kind === "added") hasAddedChild = true;
        if (childStatus.kind === "edited") hasEditedChild = true;
      }

      if (hasEditedChild) {
        statusMap[node.nodeId] = { kind: "edited", isDirect: false };
      } else if (hasAddedChild) {
        statusMap[node.nodeId] = { kind: "added", isDirect: false };
      }
    }

    return statusMap;
  }, [nodes, docs, committedPageIds]);
}
