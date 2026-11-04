import type React from "react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useProjectStore } from "@/entities/vdoc-project";

/** 자동 생성(문서 구조에서 읽어 온) 노드는 `auto-` 로 시작하며 사용자가 옮기거나 지울 수 없다. */
export function isEditableOutlineNode(node: OutlinerNode): boolean {
  return !node.nodeId.startsWith("auto-") && node.parentId !== null;
}

/**
 * 아웃라이너 편집 규칙 (Workflowy 식).
 * - `Enter`: 아래에 형제 노드 추가 · `Tab` / `Shift+Tab`: 들여쓰기 / 내어쓰기 · `Delete`: 삭제
 * 트리 규칙(깊이 · 연쇄 삭제 · 읽기 전용)은 서버 애그리거트가 지킨다.
 */
export function useOutlineNodeEditing(activeDocId: string | undefined) {
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const deleteStorylineNode = useProjectStore((s) => s.deleteStorylineNode);
  const moveStorylineNode = useProjectStore((s) => s.moveStorylineNode);
  const indentOutlinerNode = useProjectStore((s) => s.indentOutlinerNode);

  const addRootNode = (existingCount: number) =>
    insertStorylineNode(null, {
      title: `신규 노드 #${existingCount + 1}`,
      summary: "추가된 아웃라인 노드",
      zoomLevel: "page",
      targetDocId: activeDocId,
    });

  const addSiblingAfter = (node: OutlinerNode) =>
    insertStorylineNode(node.parentId, {
      title: `${node.title.slice(0, 18)} (후속 섹션)`,
      summary: "Enter로 추가된 형제 노드",
      zoomLevel: node.zoomLevel === "project" ? "page" : node.zoomLevel,
      targetDocId: node.targetDocId || activeDocId,
    });

  const handleNodeKeyDown = (e: React.KeyboardEvent, node: OutlinerNode) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void addSiblingAfter(node);
    } else if (e.key === "Tab") {
      e.preventDefault();
      void indentOutlinerNode(node.nodeId, e.shiftKey ? -1 : 1);
    } else if (e.key === "Delete" && node.parentId !== null) {
      e.preventDefault();
      void deleteStorylineNode(node.nodeId);
    }
  };

  return {
    addRootNode,
    handleNodeKeyDown,
    moveNode: (nodeId: string, direction: -1 | 1) => moveStorylineNode(nodeId, direction),
    deleteNode: (nodeId: string) => deleteStorylineNode(nodeId),
  };
}
