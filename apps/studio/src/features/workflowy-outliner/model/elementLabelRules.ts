import type { OutlineNode } from "@vibe/outliner";
import {
  inferChildElementKind,
  reconcileElementKindOnReparent,
  type ElementKind,
  type WorkingOutlineDocument,
  type WorkingOutlineNode,
} from "@vibe/vdoc-schema";

export interface IndexedWorkingMeta {
  node: WorkingOutlineNode;
  parentId: string | null;
}

export function indexWorkingNodes(
  nodes: readonly WorkingOutlineNode[],
  parentId: string | null = null,
  acc = new Map<string, IndexedWorkingMeta>()
): Map<string, IndexedWorkingMeta> {
  for (const node of nodes) {
    acc.set(node.nodeId, { node, parentId });
    if (node.children.length > 0) {
      indexWorkingNodes(node.children, node.nodeId, acc);
    }
  }
  return acc;
}

export function workingToOutlinerNodes(nodes: readonly WorkingOutlineNode[]): OutlineNode[] {
  return nodes.map((node) => ({
    id: node.nodeId,
    text: node.text,
    ...(node.note ? { note: node.note } : null),
    ...(node.isFolded ? { isFolded: true } : null),
    ...(node.isCompleted ? { isCompleted: true } : null),
    ...(node.mediaTarget ? { file: { target: node.mediaTarget } } : null),
    children: workingToOutlinerNodes(node.children),
  }));
}

/**
 * `@vibe/outliner` 편집 결과(`OutlineNode[]`)를 기존 `WorkingOutlineNode[]` 와 대조해
 * - 기존 `sourceRef` / `recommendedTemplateId` / `elementKind` 보존
 * - 새로 생긴 자식 노드는 부모 `elementKind` 규칙(`inferChildElementKind`) 자동 부여
 * - 부모가 바뀐 노드(Tab / Shift+Tab / D&D)는 `reconcileElementKindOnReparent` 로 문맥 보정
 */
export function outlinerToWorkingNodes(
  nextRoots: readonly OutlineNode[],
  prevNodes: readonly WorkingOutlineNode[]
): WorkingOutlineNode[] {
  const prevIndex = indexWorkingNodes(prevNodes);

  const convert = (
    nodes: readonly OutlineNode[],
    parentId: string | null,
    parentKind: ElementKind | null
  ): WorkingOutlineNode[] => {
    return nodes.map((item) => {
      const existing = prevIndex.get(item.id);
      let elementKind: ElementKind;
      if (!existing) {
        elementKind = inferChildElementKind(parentKind ?? "project");
      } else if (existing.parentId !== parentId) {
        elementKind = reconcileElementKindOnReparent(existing.node.elementKind, parentKind ?? "project");
      } else {
        elementKind = existing.node.elementKind;
      }

      return {
        nodeId: item.id,
        text: item.text,
        ...(item.note ? { note: item.note } : null),
        elementKind,
        ...(item.isFolded ? { isFolded: true } : null),
        ...(item.isCompleted ? { isCompleted: true } : null),
        ...(item.file?.target ? { mediaTarget: item.file.target } : null),
        ...(existing?.node.recommendedTemplateId
          ? { recommendedTemplateId: existing.node.recommendedTemplateId }
          : null),
        ...(existing?.node.sourceRef ? { sourceRef: existing.node.sourceRef } : null),
        children: convert(item.children, item.id, elementKind),
      };
    });
  };

  return convert(nextRoots, null, null);
}

export function findElementKind(
  outline: WorkingOutlineDocument | null,
  nodeId: string
): ElementKind {
  if (!outline) return "text";
  return indexWorkingNodes(outline.nodes).get(nodeId)?.node.elementKind ?? "text";
}
