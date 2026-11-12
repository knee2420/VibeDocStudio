import { collectDescendantIds, collectSubtreeIds, type OutlinerNode } from "@vibe/vdoc-schema";

/**
 * 좌측 사이드바의 두 구역이 아웃라인 투영에서 무엇을 보여줄지 정하는 순수 함수들.
 *
 * - Documents & Pages 구역: 문서 · 페이지 행만. 줌 · 검색과 무관하게 늘 전체 목록 (문서 접힘만 반영).
 * - Elements 구역: 활성 페이지의 블록 · 슬롯만. 검색 · 접힘 · (그 페이지 안으로의) 줌을 반영.
 * - All 모드: 줌 범위 전체 트리에 검색 · 접힘을 반영.
 *
 * 예전에는 검색어 · 접힘이 투영(`visibleNodes`) 자체에 들어가 있어서, Elements 를 검색하면 Documents & Pages 목록까지
 * 같이 걸러지고, 엘리먼트 안으로 줌하면 Documents & Pages 목록이 통째로 사라졌다.
 */

/** 문서 · 페이지 컨테이너 행 (블록 · 슬롯을 가리키지 않는 행). */
export function isPageTreeNode(node: OutlinerNode): boolean {
  return node.zoomLevel === "document" || (node.zoomLevel === "page" && !node.targetBlockId && !node.targetSlotId);
}

/** 페이지 안의 블록 · 구역 · 슬롯 행. */
export function isLayerNode(node: OutlinerNode): boolean {
  return node.zoomLevel === "slot" || (node.zoomLevel === "page" && Boolean(node.targetBlockId || node.targetSlotId));
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** 투영의 검색 규칙과 같다: 제목 · 요약 · 추천 서식 id. `query` 는 `normalizeQuery` 를 거친 값. */
export function nodeMatchesQuery(node: OutlinerNode, query: string): boolean {
  return (
    node.title.toLowerCase().includes(query) ||
    node.summary.toLowerCase().includes(query) ||
    (node.recommendedTemplateId ?? "").toLowerCase().includes(query)
  );
}

/**
 * 검색어가 있으면 일치하는 행만(접힘 무시), 없으면 접힌 행의 자손을 숨긴다.
 * 접힘은 이 목록 안에 보이는 행만 따진다. 목록 밖의 부모(예: Documents & Pages 의 페이지 행)가
 * 접혀 있다고 Elements 가 통째로 비면 안 된다.
 */
function applyQueryAndCollapse(nodes: OutlinerNode[], query: string, collapsedIds: readonly string[]): OutlinerNode[] {
  if (query) return nodes.filter((n) => nodeMatchesQuery(n, query));
  if (collapsedIds.length === 0) return nodes;
  const inList = new Set(nodes.map((n) => n.nodeId));
  const roots = collapsedIds.filter((id) => inList.has(id));
  if (roots.length === 0) return nodes;
  const hidden = collectDescendantIds(nodes, roots);
  return hidden.size === 0 ? nodes : nodes.filter((n) => !hidden.has(n.nodeId));
}

export function minDepth(nodes: readonly OutlinerNode[]): number {
  if (nodes.length === 0) return 0;
  let min = Infinity;
  for (const n of nodes) if (n.depth < min) min = n.depth;
  return min;
}

/** 자식이 있는 행 id (이 목록 안에서). 구역별 `모두 접기 · 펴기` 대상. */
export function parentIdsWithin(nodes: readonly OutlinerNode[], hasChildrenMap: Record<string, boolean>): string[] {
  const out: string[] = [];
  for (const n of nodes) if (hasChildrenMap[n.nodeId]) out.push(n.nodeId);
  return out;
}

export function selectPageTreeNodes(allNodes: OutlinerNode[], collapsedIds: readonly string[]): OutlinerNode[] {
  const pageTree = allNodes.filter(isPageTreeNode);
  if (collapsedIds.length === 0) return pageTree;
  // 문서를 접으면 그 페이지들을 숨긴다. 자손 계산은 전체 트리 기준 (페이지 행은 문서의 손자일 수도 있다).
  const inTree = new Set(pageTree.map((n) => n.nodeId));
  const roots = collapsedIds.filter((id) => inTree.has(id));
  if (roots.length === 0) return pageTree;
  const hidden = collectDescendantIds(allNodes, roots);
  return pageTree.filter((n) => !hidden.has(n.nodeId));
}

export interface LayerScope {
  docId: string;
  pageId: string;
  /** 투영의 줌 루트. 이 페이지의 엘리먼트를 가리킬 때만 그 하위로 좁힌다. */
  zoomRootId: string;
}

/** 활성 페이지의 엘리먼트 행 전체 (검색 · 접힘 적용 전). */
export function selectPageLayerNodes(allNodes: OutlinerNode[], { docId, pageId, zoomRootId }: LayerScope): OutlinerNode[] {
  const layers = allNodes.filter(
    (n) => isLayerNode(n) && n.targetDocId === docId && (!pageId || n.targetPageId === pageId)
  );
  if (!layers.some((n) => n.nodeId === zoomRootId)) return layers;
  const subtree = collectSubtreeIds(layers, zoomRootId);
  return layers.filter((n) => subtree.has(n.nodeId));
}

export function filterLayerNodes(layers: OutlinerNode[], query: string, collapsedIds: readonly string[]): OutlinerNode[] {
  return applyQueryAndCollapse(layers, query, collapsedIds);
}

/** All 모드: 줌 범위(`visibleNodes`) 전체에 검색 · 접힘. */
export function selectAllModeNodes(scopedNodes: OutlinerNode[], query: string, collapsedIds: readonly string[]): OutlinerNode[] {
  return applyQueryAndCollapse(scopedNodes, query, collapsedIds);
}

/** 아웃라인 노드가 캔버스에서 가리키는 대상 (호버 강조 · 첨부 묶음 판정에 쓴다). */
export function outlineNodeTargetId(node: OutlinerNode): string {
  return node.targetSlotId || node.targetBlockId || node.targetPageId || node.nodeId;
}

/** 행의 선택 표시: `on` 선택됨 (#E5F4FF) · `child` 선택된 노드의 자손 (#F2F9FF, 피그마와 같다). */
export type RowSelection = "on" | "child";

/** 사이드바 · 캔버스 양쪽의 선택 상태. */
export interface SelectionSources {
  /** 사이드바에서 고른 노드 (캔버스 대상이 없는 문서 · 페이지 · 기획 노드에만 쓴다). */
  selectedNodeId: string | null;
  /** 캔버스에서 고른 슬롯 · 선택 단위 (단일 선택 + 드래그 범위 다중 선택). */
  slotIds: ReadonlySet<string>;
  /** 캔버스에서 고른 블록. */
  blockIds: ReadonlySet<string>;
  /** Ctrl/Shift+클릭으로 고른 사이드바 다중 선택 (`outlineNodeTargetId` 또는 nodeId). */
  pickedIds: ReadonlySet<string>;
}

function isDirectlySelected(node: OutlinerNode, src: SelectionSources): boolean {
  if (src.pickedIds.has(node.nodeId) || src.pickedIds.has(outlineNodeTargetId(node))) return true;
  if (node.targetSlotId) return src.slotIds.has(node.targetSlotId);
  if (node.targetBlockId) return src.blockIds.has(node.targetBlockId) || src.slotIds.has(node.targetBlockId);
  return src.selectedNodeId === node.nodeId;
}

/**
 * 보이는 행(깊이 우선 순서)마다 선택 표시를 정한다. 선택된 노드 아래 행은 `child` 로 옅게 칠한다.
 * 캔버스의 단일 · 다중 선택이 그대로 사이드바에 보인다 (예전에는 사이드바 클릭만 표시됐다).
 */
export function computeRowSelection(nodes: readonly OutlinerNode[], src: SelectionSources): Map<string, RowSelection> {
  const out = new Map<string, RowSelection>();
  let ancestorDepth = -1;
  for (const node of nodes) {
    if (ancestorDepth >= 0 && node.depth <= ancestorDepth) ancestorDepth = -1;
    if (isDirectlySelected(node, src)) {
      out.set(node.nodeId, "on");
      if (ancestorDepth < 0) ancestorDepth = node.depth;
    } else if (ancestorDepth >= 0) {
      out.set(node.nodeId, "child");
    }
  }
  return out;
}
