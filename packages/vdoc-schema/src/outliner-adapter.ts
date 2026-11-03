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
 * 모든 조회는 Map/Set 색인으로 한다 (노드 · 페이지 · 슬롯 수에 선형).
 */
export function buildProjectFractalTree(
  project: VProjectManifest,
  docs: VDocDocument[],
  rootNodeId?: string | null,
  quickFilter?: string,
  collapsedNodeIds?: string[]
): FractalOutlineProjection {
  const allNodes: OutlinerNode[] = [...project.storylineNodes];
  const docsById = new Map(docs.map((d) => [d.docId, d]));
  const docNodeByDocId = new Map<string, OutlinerNode>();
  const pageNodeByKey = new Map<string, OutlinerNode>();
  const slotKeys = new Set<string>();
  for (const node of allNodes) {
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

  // Enrich with live Document -> Page -> Slot nodes from bound docs if not already represented
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
      allNodes.push(docNode);
      docNodeByDocId.set(doc.docId, docNode);
    }

    for (const page of doc.pages) {
      const pageKey = `${doc.docId}\u0000${page.pageId}`;
      let pageNode = pageNodeByKey.get(pageKey);
      if (!pageNode) {
        pageNode = {
          nodeId: `auto-page-${doc.docId}-${page.pageId}`,
          parentId: docNode.nodeId,
          depth: 2,
          zoomLevel: "page",
          title: `Page ${page.pageNumber} · ${page.pageLabel}`,
          summary: `블록 ${page.blocks.length}개`,
          targetDocId: doc.docId,
          targetPageId: page.pageId,
          recommendedTemplateId: page.blocks[0]?.kind || "section-block",
          aiStatus: "idle",
        };
        allNodes.push(pageNode);
        pageNodeByKey.set(pageKey, pageNode);
      }

      // Add up to 6 key editable slots per page for Level 4 Slot Zoom
      const pageSlotIds = page.blocks.flatMap((blk) => getBlockSlotIds(blk));
      for (const slotId of pageSlotIds.slice(0, 6)) {
        const slot = doc.slots[slotId];
        const slotKey = `${doc.docId}\u0000${slotId}`;
        if (!slot || slotKeys.has(slotKey)) continue;
        slotKeys.add(slotKey);
        allNodes.push({
          nodeId: `auto-slot-${doc.docId}-${slotId}`,
          parentId: pageNode.nodeId,
          depth: 3,
          zoomLevel: "slot",
          title: slot.label || slotId,
          summary: stripHtml(slot.content).slice(0, 90) || "(빈 슬롯)",
          targetDocId: doc.docId,
          targetPageId: page.pageId,
          targetSlotId: slotId,
          aiStatus: slot.isEdited ? "applied" : "idle",
        });
      }
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

