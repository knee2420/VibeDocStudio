/**
 * WorkingOutline 스키마 — Phase 1(Workflowy Outliner) 자유 편집 트리와
 * Phase 3(`.vdoc`) 원본 연결 꼬리표(`sourceRef`) 계약.
 */
import type { ElementKind } from "../element-kit";

export interface WorkingOutlineSourceRef {
  docId: string;
  pageId?: string | null;
  blockId?: string | null;
  slotId?: string | null;
  rowId?: string | null;
  cellId?: string | null;
  sectionId?: string | null;
  /** 추출/커밋 시점 슬롯 내용 지문 (`contentHash`). Phase 3 복귀·충돌 판단에 사용. */
  baseHash?: string;
}

export interface WorkingOutlineNode {
  nodeId: string;
  text: string;
  note?: string;
  elementKind: ElementKind;
  isFolded?: boolean;
  isCompleted?: boolean;
  /** 이미지/파일 첨부 대상 (`resource:...`, URL 등). */
  mediaTarget?: string | null;
  recommendedTemplateId?: string | null;
  sourceRef?: WorkingOutlineSourceRef | null;
  children: WorkingOutlineNode[];
}

export interface WorkingOutlineDocument {
  projectId: string;
  revision: number;
  baseDocRevisions: Record<string, number>;
  dirty: boolean;
  updatedAt: string;
  nodes: WorkingOutlineNode[];
}

export function flattenWorkingOutlineNodes(
  nodes: readonly WorkingOutlineNode[],
  parentId: string | null = null,
  depth = 0
): Array<{ node: WorkingOutlineNode; parentId: string | null; depth: number }> {
  const out: Array<{ node: WorkingOutlineNode; parentId: string | null; depth: number }> = [];
  for (const node of nodes) {
    out.push({ node, parentId, depth });
    if (node.children.length > 0) {
      out.push(...flattenWorkingOutlineNodes(node.children, node.nodeId, depth + 1));
    }
  }
  return out;
}

export function findWorkingOutlineNode(
  nodes: readonly WorkingOutlineNode[],
  nodeId: string
): WorkingOutlineNode | undefined {
  for (const node of nodes) {
    if (node.nodeId === nodeId) return node;
    const found = findWorkingOutlineNode(node.children, nodeId);
    if (found) return found;
  }
  return undefined;
}
