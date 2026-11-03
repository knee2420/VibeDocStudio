import { getBlockSlotIds } from "./block-ops";
import { PROJECT_ROOT_CRUMB_ID } from "./layout-constants";
import type {
  OutlineBreadcrumbItem,
  OutlinerNode,
  VProjectManifest,
  ZoomLevel,
} from "./project-manifest";
import type { VDocDocument } from "./types";

const stripHtml = (raw: string): string =>
  (raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function extractSlotTitle(slot: any, fallbackId: string): string {
  if (!slot) return fallbackId;
  const raw = slot.content || "";
  const strongMatch = raw.match(/<(?:strong|b|h[1-6])>([^<]+)<\/(?:strong|b|h[1-6])>/i);
  if (strongMatch && strongMatch[1]) {
    const text = strongMatch[1].trim();
    if (text.length > 1 && !text.endsWith(":") && text !== "몰름") {
      return text;
    }
  }
  if (slot.label && slot.label.trim()) {
    return slot.label.trim();
  }
  return fallbackId;
}

export interface FractalOutlineProjection {
  activeZoomLevel: ZoomLevel;
  rootNodeId: string;
  parentZoomNodeId: string | null;
  parentZoomTitle: string | null;
  breadcrumbs: OutlineBreadcrumbItem[];
  visibleNodes: OutlinerNode[];
  allNodes: OutlinerNode[];
  hasChildrenMap: Record<string, boolean>;
}

/**
 * Combines explicit `project.storylineNodes` with live `.vdoc` Documents -> Pages -> Slots
 * into a unified 4-Level Fractal Outliner Tree (`Project` -> `Document` -> `Page/Element` -> `Slot`).
 *
 * 엄격한 DFS 전위 순회(Pre-order Traversal)로 계층 순서를 보장하여 부모-자식 역전이나 누락을 원천 차단합니다.
 */
export function buildProjectFractalTree(
  project: VProjectManifest,
  docs: VDocDocument[],
  rootNodeId?: string | null,
  quickFilter?: string,
  collapsedNodeIds?: string[]
): FractalOutlineProjection {
  const candidateNodes: OutlinerNode[] = [...project.storylineNodes];
  const docsById = new Map(docs.map((d) => [d.docId, d]));
  const docNodeByDocId = new Map<string, OutlinerNode>();
  const pageNodeByKey = new Map<string, OutlinerNode>();
  const slotKeys = new Set<string>();

  for (const node of candidateNodes) {
    if (!node.targetDocId) continue;
    if (node.zoomLevel === "document" && !docNodeByDocId.has(node.targetDocId)) {
      docNodeByDocId.set(node.targetDocId, node);
    } else if (node.zoomLevel === "page" && node.targetPageId) {
      const key = `${node.targetDocId}\u0000${node.targetPageId}`;
      if (!pageNodeByKey.has(key)) pageNodeByKey.set(key, node);
    } else if (node.zoomLevel === "slot" && node.targetSlotId) {
      slotKeys.add(`${node.targetDocId}\u0000${node.targetSlotId}`);
    }
  }

  // Enrich with live Document -> Page -> Slot nodes from bound docs
  const rootId = project.storylineNodes.find((n) => n.parentId === null)?.nodeId ?? null;
  for (const docId of project.docIds) {
    const doc = docsById.get(docId);
    if (!doc) continue;

    let docNode = docNodeByDocId.get(doc.docId);
    if (!docNode) {
      docNode = {
        nodeId: `auto-doc-${doc.docId}`,
        parentId: rootId,
        depth: 1,
        zoomLevel: "document",
        title: doc.title,
        summary: `${doc.pages.length}p · 슬롯 ${Object.keys(doc.slots).length}개`,
        targetDocId: doc.docId,
        aiStatus: "idle",
      };
      candidateNodes.push(docNode);
      docNodeByDocId.set(doc.docId, docNode);
    }

    for (const page of doc.pages) {
      const pageKey = `${doc.docId}\u0000${page.pageId}`;
      let pageNode = pageNodeByKey.get(pageKey);
      if (!pageNode) {
        pageNode = {
          nodeId: `auto-page-${doc.docId}-${page.pageId}`,
          parentId: docNode.nodeId,
          depth: docNode.depth + 1,
          zoomLevel: "page",
          title: `Page ${page.pageNumber} · ${page.pageLabel}`,
          summary: `블록 ${page.blocks.length}개`,
          targetDocId: doc.docId,
          targetPageId: page.pageId,
          recommendedTemplateId: page.blocks[0]?.kind || "section-block",
          aiStatus: "idle",
        };
        candidateNodes.push(pageNode);
        pageNodeByKey.set(pageKey, pageNode);
      }

      // Extract blocks and slots with hierarchical table grouping and row sub-indentation
      for (const blk of page.blocks) {
        if (blk.kind === "structured-table" || blk.kind === "table") {
          const tableBlockNodeId = `auto-blk-${doc.docId}-${blk.blockId}`;
          const tableBlockNode: OutlinerNode = {
            nodeId: tableBlockNodeId,
            parentId: pageNode.nodeId,
            depth: pageNode.depth + 1,
            zoomLevel: "page",
            title: blk.title ? `[표] ${blk.title}` : "구조화 표",
            summary: `표 (${blk.rows.length}행)`,
            targetDocId: doc.docId,
            targetPageId: page.pageId,
            targetBlockId: blk.blockId,
            recommendedTemplateId: "structured-table",
            aiStatus: "idle",
          };
          candidateNodes.push(tableBlockNode);

          for (let rIdx = 0; rIdx < blk.rows.length; rIdx++) {
            const row = blk.rows[rIdx];
            const isHeaderRow = row.cells.some((c) => c.isHeader);

            if (isHeaderRow) {
              for (const cell of row.cells) {
                const slot = doc.slots[cell.slotId];
                const slotKey = `${doc.docId}\u0000${cell.slotId}`;
                if (!slot || slotKeys.has(slotKey)) continue;
                slotKeys.add(slotKey);
                candidateNodes.push({
                  nodeId: `auto-slot-${doc.docId}-${cell.slotId}`,
                  parentId: tableBlockNode.nodeId,
                  depth: tableBlockNode.depth + 1,
                  zoomLevel: "slot",
                  title: extractSlotTitle(slot, cell.slotId),
                  summary: stripHtml(slot.content).slice(0, 90) || "(빈 슬롯)",
                  targetDocId: doc.docId,
                  targetPageId: page.pageId,
                  targetSlotId: cell.slotId,
                  targetBlockId: blk.blockId,
                  aiStatus: slot.isEdited ? "applied" : "idle",
                });
              }
            } else {
              const [firstCell, ...restCells] = row.cells;
              let rowParentId = tableBlockNode.nodeId;
              let rowParentDepth = tableBlockNode.depth + 1;

              if (firstCell) {
                const firstSlot = doc.slots[firstCell.slotId];
                const firstSlotKey = `${doc.docId}\u0000${firstCell.slotId}`;
                if (firstSlot && !slotKeys.has(firstSlotKey)) {
                  slotKeys.add(firstSlotKey);
                  const firstCellNode: OutlinerNode = {
                    nodeId: `auto-slot-${doc.docId}-${firstCell.slotId}`,
                    parentId: tableBlockNode.nodeId,
                    depth: tableBlockNode.depth + 1,
                    zoomLevel: "slot",
                    title: extractSlotTitle(firstSlot, firstCell.slotId),
                    summary: stripHtml(firstSlot.content).slice(0, 90) || "(빈 슬롯)",
                    targetDocId: doc.docId,
                    targetPageId: page.pageId,
                    targetSlotId: firstCell.slotId,
                    targetBlockId: blk.blockId,
                    aiStatus: firstSlot.isEdited ? "applied" : "idle",
                  };
                  candidateNodes.push(firstCellNode);
                  rowParentId = firstCellNode.nodeId;
                  rowParentDepth = firstCellNode.depth + 1;
                }
              }

              for (const cell of restCells) {
                const slot = doc.slots[cell.slotId];
                const slotKey = `${doc.docId}\u0000${cell.slotId}`;
                if (!slot || slotKeys.has(slotKey)) continue;
                slotKeys.add(slotKey);
                candidateNodes.push({
                  nodeId: `auto-slot-${doc.docId}-${cell.slotId}`,
                  parentId: rowParentId,
                  depth: rowParentDepth,
                  zoomLevel: "slot",
                  title: extractSlotTitle(slot, cell.slotId),
                  summary: stripHtml(slot.content).slice(0, 90) || "(빈 슬롯)",
                  targetDocId: doc.docId,
                  targetPageId: page.pageId,
                  targetSlotId: cell.slotId,
                  targetBlockId: blk.blockId,
                  aiStatus: slot.isEdited ? "applied" : "idle",
                });
              }
            }
          }
        } else if (blk.kind === "fillable-group") {
          const slot = doc.slots[blk.slotId];
          const slotKey = `${doc.docId}\u0000${blk.slotId}`;
          if (slot && !slotKeys.has(slotKey)) {
            slotKeys.add(slotKey);
            candidateNodes.push({
              nodeId: `auto-slot-${doc.docId}-${blk.slotId}`,
              parentId: pageNode.nodeId,
              depth: pageNode.depth + 1,
              zoomLevel: "slot",
              title: blk.title || extractSlotTitle(slot, blk.slotId),
              summary: stripHtml(slot.content).slice(0, 90) || "(빈 슬롯)",
              targetDocId: doc.docId,
              targetPageId: page.pageId,
              targetSlotId: blk.slotId,
              targetBlockId: blk.blockId,
              aiStatus: slot.isEdited ? "applied" : "idle",
            });
          }
        } else {
          const blockSlotIds = getBlockSlotIds(blk);
          for (const slotId of blockSlotIds) {
            const slot = doc.slots[slotId];
            const slotKey = `${doc.docId}\u0000${slotId}`;
            if (!slot || slotKeys.has(slotKey)) continue;
            slotKeys.add(slotKey);
            candidateNodes.push({
              nodeId: `auto-slot-${doc.docId}-${slotId}`,
              parentId: pageNode.nodeId,
              depth: pageNode.depth + 1,
              zoomLevel: "slot",
              title: extractSlotTitle(slot, slotId),
              summary: stripHtml(slot.content).slice(0, 90) || "(빈 슬롯)",
              targetDocId: doc.docId,
              targetPageId: page.pageId,
              targetSlotId: slotId,
              targetBlockId: blk.blockId,
              aiStatus: slot.isEdited ? "applied" : "idle",
            });
          }
        }
      }
    }
  }

  // Hierarchical DFS Pre-order traversal to guarantee strict parent-child ordering
  const childrenMap = new Map<string | null, OutlinerNode[]>();
  for (const node of candidateNodes) {
    const pId = node.parentId ?? null;
    const list = childrenMap.get(pId) || [];
    list.push(node);
    childrenMap.set(pId, list);
  }

  const allNodes: OutlinerNode[] = [];
  const visited = new Set<string>();

  function traverseDfs(parentId: string | null) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.nodeId)) continue;
      visited.add(child.nodeId);
      allNodes.push(child);
      traverseDfs(child.nodeId);
    }
  }

  traverseDfs(null);

  // Safety fallback for any unvisited nodes
  for (const node of candidateNodes) {
    if (!visited.has(node.nodeId)) {
      visited.add(node.nodeId);
      allNodes.push(node);
      traverseDfs(node.nodeId);
    }
  }

  const byId = new Map<string, OutlinerNode>(allNodes.map((n) => [n.nodeId, n]));
  const breadcrumbs: OutlineBreadcrumbItem[] = [
    { nodeId: PROJECT_ROOT_CRUMB_ID, title: project.title, zoomLevel: "project" },
  ];

  let scopedNodes = allNodes;
  let activeZoomLevel: ZoomLevel = "project";
  const resolvedRootId =
    rootNodeId && rootNodeId !== PROJECT_ROOT_CRUMB_ID && byId.has(rootNodeId)
      ? rootNodeId
      : PROJECT_ROOT_CRUMB_ID;

  const hasChildrenMap: Record<string, boolean> = {};
  for (const n of allNodes) {
    if (n.parentId) {
      hasChildrenMap[n.parentId] = true;
    }
  }

  let parentZoomNodeId: string | null = null;
  let parentZoomTitle: string | null = null;

  if (resolvedRootId !== PROJECT_ROOT_CRUMB_ID) {
    const targetNode = byId.get(resolvedRootId);
    parentZoomNodeId = targetNode?.parentId || PROJECT_ROOT_CRUMB_ID;
    parentZoomTitle =
      parentZoomNodeId === PROJECT_ROOT_CRUMB_ID
        ? "프로젝트 최상위 (L1)"
        : byId.get(parentZoomNodeId)?.title || "상위 계층";

    const chain: OutlinerNode[] = [];
    let curr = byId.get(resolvedRootId);
    const visited = new Set<string>();
    while (curr && !visited.has(curr.nodeId)) {
      visited.add(curr.nodeId);
      chain.push(curr);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
    chain.reverse();
    for (const item of chain) {
      if (item.nodeId !== rootId) {
        breadcrumbs.push({ nodeId: item.nodeId, title: item.title, zoomLevel: item.zoomLevel });
      }
    }

    const allowed = collectSubtreeIds(allNodes, resolvedRootId);
    scopedNodes = allNodes.filter((n) => allowed.has(n.nodeId));
    activeZoomLevel = byId.get(resolvedRootId)?.zoomLevel || "project";
  }

  const filterText = (quickFilter || "").trim().toLowerCase();

  // 검색어가 없을 때는 접힌(Collapsed) 노드의 하위 자손을 숨긴다
  if (collapsedNodeIds && collapsedNodeIds.length > 0 && !filterText) {
    const hiddenDescendantIds = collectDescendantIds(allNodes, collapsedNodeIds);
    scopedNodes = scopedNodes.filter((n) => !hiddenDescendantIds.has(n.nodeId));
  }

  const visibleNodes = filterText
    ? scopedNodes.filter(
        (n) =>
          n.title.toLowerCase().includes(filterText) ||
          n.summary.toLowerCase().includes(filterText) ||
          (n.recommendedTemplateId || "").toLowerCase().includes(filterText)
      )
    : scopedNodes;

  return {
    activeZoomLevel,
    rootNodeId: resolvedRootId,
    parentZoomNodeId,
    parentZoomTitle,
    breadcrumbs,
    visibleNodes,
    allNodes,
    hasChildrenMap,
  };
}

/** `rootIds` 에 속한 노드들의 모든 순수 자손(자식, 손자 등) ID를 모은다 (`rootIds` 자체는 제외). */
export function collectDescendantIds(nodes: OutlinerNode[], rootIds: string[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n.nodeId);
    else children.set(n.parentId, [n.nodeId]);
  }
  const descendants = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const child of children.get(current) ?? []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }
  return descendants;
}

/** `rootId` 와 그 모든 자손의 ID (자식 색인 + BFS, 노드 수에 선형). */
export function collectSubtreeIds(nodes: OutlinerNode[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n.nodeId);
    else children.set(n.parentId, [n.nodeId]);
  }
  const found = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const child of children.get(current) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}

export function getZoomLevelMeta(level: ZoomLevel): {
  badge: string;
  shortLabel: string;
  colorClass: string;
} {
  switch (level) {
    case "project":
      return {
        badge: "L1 · Project",
        shortLabel: "프로젝트",
        colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    case "document":
      return {
        badge: "L2 · Document",
        shortLabel: "문서(.vdoc)",
        colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "page":
      return {
        badge: "L3 · Page/Block",
        shortLabel: "페이지·블록",
        colorClass: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "slot":
      return {
        badge: "L4 · Slot",
        shortLabel: "슬롯",
        colorClass: "bg-amber-50 text-amber-800 border-amber-200",
      };
  }
}

