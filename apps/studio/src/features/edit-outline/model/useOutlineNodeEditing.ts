import type React from "react";

import type { OutlinerNode, WorkbenchPhase } from "@vibe/vdoc-schema";

import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/** 문서 루트 노드 여부 (`+ 페이지` 삽입 대상). 모든 단계에서 허용된다. */
export function isDocumentTargetNode(node: OutlinerNode): boolean {
  return node.zoomLevel === "document" && Boolean(node.targetDocId);
}

/**
 * 실제 페이지를 가리키는 페이지 행 여부 (자동 `auto-page-*` 및 페이지에 연결된 기획 노드 포함).
 * 이름 변경 · 사본 만들기 · 페이지 삭제 같은 "채울 대상 관리" 는 집필 단계를 포함한 모든 단계에서 허용된다.
 */
export function isPageTargetNode(node: OutlinerNode): boolean {
  return node.zoomLevel === "page" && Boolean(node.targetPageId) && !node.targetBlockId;
}

/**
 * 사용자가 만든 기획 노드의 아웃라인 구조 변경(이동 · 들여쓰기 · 형제 추가 · 기획 노드 삭제) 허용 여부.
 * 아웃라인 구조 편집은 1·2단계(`storylining`, `templating`)에서만 허용된다.
 */
export function isEditableOutlineNode(node: OutlinerNode, phase: WorkbenchPhase = "storylining"): boolean {
  return phase !== "drafting" && !node.nodeId.startsWith("auto-") && node.parentId !== null;
}

export interface OutlineNodeEditingHandlers {
  onStartRename?: (node: OutlinerNode) => void;
  onRemovePage?: (docId: string | undefined, pageId: string) => void;
}

/**
 * 아웃라이너 편집 규칙 (Workflowy 식 + 단계별 가드).
 * - 페이지 행 (`Delete` / `F2`): 모든 단계에서 페이지 삭제 · 이름 변경 허용
 * - 기획 노드 (`Enter` / `Tab` / `Delete` / 이동): 1·2단계에서만 허용 (실행부에서 이중 차단)
 */
export function useOutlineNodeEditing(
  activeDocId: string | undefined,
  callbacks: OutlineNodeEditingHandlers = {}
) {
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const deleteStorylineNode = useProjectStore((s) => s.deleteStorylineNode);
  const moveStorylineNode = useProjectStore((s) => s.moveStorylineNode);
  const indentOutlinerNode = useProjectStore((s) => s.indentOutlinerNode);

  const isStructurePhase = () => useWorkspaceSessionStore.getState().currentPhase !== "drafting";

  const addRootNode = (existingCount: number) => {
    if (!isStructurePhase()) return Promise.resolve();
    return insertStorylineNode(null, {
      title: `신규 노드 #${existingCount + 1}`,
      summary: "추가된 아웃라인 노드",
      zoomLevel: "page",
      targetDocId: activeDocId,
    });
  };

  const addSiblingAfter = (node: OutlinerNode) => {
    if (!isStructurePhase()) return Promise.resolve();
    return insertStorylineNode(node.parentId, {
      title: `${node.title.slice(0, 18)} (후속 섹션)`,
      summary: "Enter로 추가된 형제 노드",
      zoomLevel: node.zoomLevel === "project" ? "page" : node.zoomLevel,
      targetDocId: node.targetDocId || activeDocId,
    });
  };

  const handleNodeKeyDown = (e: React.KeyboardEvent, node: OutlinerNode) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }

    const phase = useWorkspaceSessionStore.getState().currentPhase;

    if (e.key === "F2") {
      if (isPageTargetNode(node) || isEditableOutlineNode(node, phase)) {
        e.preventDefault();
        callbacks.onStartRename?.(node);
      }
      return;
    }

    if (e.key === "Delete") {
      if (isPageTargetNode(node) && node.targetPageId) {
        e.preventDefault();
        callbacks.onRemovePage?.(node.targetDocId || activeDocId, node.targetPageId);
      } else if (isEditableOutlineNode(node, phase)) {
        e.preventDefault();
        void deleteStorylineNode(node.nodeId);
      }
      return;
    }

    if (phase === "drafting") return;

    if (e.key === "Enter") {
      e.preventDefault();
      void addSiblingAfter(node);
    } else if (e.key === "Tab") {
      e.preventDefault();
      void indentOutlinerNode(node.nodeId, e.shiftKey ? -1 : 1);
    }
  };

  return {
    currentPhase,
    addRootNode,
    handleNodeKeyDown,
    moveNode: (node: OutlinerNode, direction: -1 | 1) => {
      if (!isEditableOutlineNode(node, useWorkspaceSessionStore.getState().currentPhase)) return Promise.resolve();
      return moveStorylineNode(node.nodeId, direction);
    },
    deleteNode: (node: OutlinerNode) => {
      if (!isEditableOutlineNode(node, useWorkspaceSessionStore.getState().currentPhase)) return Promise.resolve();
      return deleteStorylineNode(node.nodeId);
    },
  };
}
