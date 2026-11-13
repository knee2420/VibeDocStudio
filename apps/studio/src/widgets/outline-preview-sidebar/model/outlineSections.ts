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

/** 문서 · 페이지 컨테이너 행 (블록 · 슬롯을 가리키지 않는 행). 참조(#참조) 노드나 대상 페이지가 없는 노드는 제외된다. */
export function isPageTreeNode(node: OutlinerNode): boolean {
  if (node.provenanceSourceProjectId) return false;
  return node.zoomLevel === "document" || (node.zoomLevel === "page" && Boolean(node.targetPageId) && !node.targetBlockId && !node.targetSlotId);
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

/**
 * Documents & Pages 의 줌 규칙 (Workflowy 처럼 줌한 노드가 목록의 뿌리가 된다). 이 구역은 페이지 수준까지만
 * 따라간다:
 * - 줌 없음 · 프로젝트 줌: 전체 목록
 * - 문서 줌: 그 문서와 그 페이지들만
 * - 페이지 줌: 그 페이지만
 * - 엘리먼트(블록 · 구역 · 슬롯) 줌: 페이지 줌과 같다 — 그 엘리먼트의 페이지만 (더 깊은 줌은 Elements · 캔버스가 맡는다)
 * 문서를 접은 상태(`collapsedIds`)는 어느 경우에나 그대로 반영한다.
 */
export function selectPageTreeForZoom(allNodes: OutlinerNode[], collapsedIds: readonly string[], zoomRoot: OutlinerNode | undefined): OutlinerNode[] {
  const base = selectPageTreeNodes(allNodes, collapsedIds);
  if (!zoomRoot || zoomRoot.zoomLevel === "project") return base;

  if (zoomRoot.zoomLevel === "document" && isPageTreeNode(zoomRoot)) {
    const subtree = collectSubtreeIds(allNodes, zoomRoot.nodeId);
    return base.filter((n) => subtree.has(n.nodeId));
  }

  const isolated = isolatedPageOf(zoomRoot);
  if (!isolated) return base;
  const page = base.find(
    (n) => n.zoomLevel === "page" && isPageTreeNode(n) && n.targetPageId === isolated.pageId && (n.targetDocId ?? null) === isolated.docId
  );
  return page ? [page] : base;
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

/**
 * 지금 줌이 캔버스를 한 페이지로 격리하는가 (페이지 · 블록 · 슬롯 줌). 격리된 페이지를 돌려준다.
 * `VDocPageCanvas` 의 격리 조건(줌 수준이 프로젝트 · 문서가 아니고 대상 페이지가 있음)과 같다.
 */
export function isolatedPageOf(zoomRoot: OutlinerNode | undefined): { docId: string | null; pageId: string } | null {
  if (!zoomRoot || zoomRoot.zoomLevel === "project" || zoomRoot.zoomLevel === "document" || !zoomRoot.targetPageId) return null;
  return { docId: zoomRoot.targetDocId ?? null, pageId: zoomRoot.targetPageId };
}

/**
 * 페이지 격리 중에 같은 문서의 다른 페이지 행을 고르면 줌을 그 페이지로 옮긴다 — 옮기지 않으면 캔버스가
 * 고른 페이지를 그리지 않는다. 옮길 필요가 없으면 null (그냥 선택). 다른 문서의 페이지는 문서 전환이
 * 줌을 풀어 주므로 여기서 다루지 않는다.
 */
export function zoomTargetOnSelect(node: OutlinerNode, zoomRoot: OutlinerNode | undefined, activeDocId: string): OutlinerNode | null {
  const isolated = isolatedPageOf(zoomRoot);
  if (!isolated) return null;
  const isPageRow = node.zoomLevel === "page" && Boolean(node.targetPageId) && !node.targetBlockId && !node.targetSlotId;
  if (!isPageRow) return null;
  if ((node.targetDocId || activeDocId) !== (isolated.docId || activeDocId)) return null;
  return node.targetPageId === isolated.pageId ? null : node;
}

/** 브레드크럼 표시 항목: 경로 한 칸, 또는 접힌 중간 경로. */
export type CrumbItem<T> = { kind: "crumb"; crumb: T } | { kind: "gap"; hidden: T[] };

/**
 * 좁은 사이드바용 경로 줄이기: `maxVisible` 칸을 넘으면 첫 칸(Home) · 접힌 중간 · 마지막 `maxVisible - 2` 칸.
 */
export function compactCrumbs<T>(crumbs: readonly T[], maxVisible = 4): CrumbItem<T>[] {
  if (crumbs.length <= maxVisible) return crumbs.map((crumb) => ({ kind: "crumb", crumb }));
  const tailCount = Math.max(1, maxVisible - 2);
  return [
    { kind: "crumb", crumb: crumbs[0] },
    { kind: "gap", hidden: crumbs.slice(1, crumbs.length - tailCount) },
    ...crumbs.slice(crumbs.length - tailCount).map((crumb): CrumbItem<T> => ({ kind: "crumb", crumb })),
  ];
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
