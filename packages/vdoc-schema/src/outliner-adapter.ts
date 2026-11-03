import { getBlockSlotIds } from "./block-ops";
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
  breadcrumbs: OutlineBreadcrumbItem[];
  visibleNodes: OutlinerNode[];
  allNodes: OutlinerNode[];
}

/**
 * Combines explicit `project.storylineNodes` with live `.vdoc` Documents -> Pages -> Slots
 * into a unified 4-Level Fractal Outliner Tree (`Project` -> `Document` -> `Page/Element` -> `Slot`).
 */
export function buildProjectFractalTree(
  project: VProjectManifest,
  docs: VDocDocument[],
  rootNodeId?: string | null,
  quickFilter?: string
): FractalOutlineProjection {
  const allNodes: OutlinerNode[] = [];
  const existingIds = new Set<string>();

  // 1. Add project storyline nodes first
  for (const node of project.storylineNodes) {
    allNodes.push(node);
    existingIds.add(node.nodeId);
  }

  // 2. Enrich with live Document -> Page -> Slot nodes from bound docs if not already represented
  const rootId = project.storylineNodes[0]?.nodeId || "node-proj-root";
  for (const docId of project.docIds) {
    const doc = docs.find((d) => d.docId === docId);
    if (!doc) continue;

    let docNode = allNodes.find(
      (n) => n.zoomLevel === "document" && n.targetDocId === doc.docId
    );
    if (!docNode) {
      const docNodeId = `auto-doc-${doc.docId}`;
      docNode = {
        nodeId: docNodeId,
        parentId: rootId,
        depth: 1,
        zoomLevel: "document",
        title: doc.title,
        summary: `${doc.pages.length}p · 슬롯 ${Object.keys(doc.slots).length}개`,
        targetDocId: doc.docId,
        aiStatus: "idle",
      };
      allNodes.push(docNode);
      existingIds.add(docNodeId);
    }

    for (const page of doc.pages) {
      let pageNode = allNodes.find(
        (n) =>
          n.zoomLevel === "page" &&
          n.targetDocId === doc.docId &&
          n.targetPageId === page.pageId
      );
      if (!pageNode) {
        const pageNodeId = `auto-page-${doc.docId}-${page.pageId}`;
        pageNode = {
          nodeId: pageNodeId,
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
        existingIds.add(pageNodeId);
      }

      // Add up to 6 key editable slots per page for Level 4 Slot Zoom
      const pageSlotIds = page.blocks.flatMap((blk) => getBlockSlotIds(blk));
      for (const slotId of pageSlotIds.slice(0, 6)) {
        const slot = doc.slots[slotId];
        if (!slot) continue;
        const alreadyExists = allNodes.some(
          (n) =>
            n.zoomLevel === "slot" &&
            n.targetDocId === doc.docId &&
            n.targetSlotId === slotId
        );
        if (!alreadyExists) {
          const slotNodeId = `auto-slot-${doc.docId}-${slotId}`;
          allNodes.push({
            nodeId: slotNodeId,
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
          existingIds.add(slotNodeId);
        }
      }
    }
  }

  const byId = new Map<string, OutlinerNode>(allNodes.map((n) => [n.nodeId, n]));
  const breadcrumbs: OutlineBreadcrumbItem[] = [
    {
      nodeId: "project-root",
      title: project.title,
      zoomLevel: "project",
    },
  ];

  let scopedNodes = allNodes;
  let activeZoomLevel: ZoomLevel = "project";
  const resolvedRootId =
    rootNodeId && rootNodeId !== "project-root" && byId.has(rootNodeId)
      ? rootNodeId
      : "project-root";

  if (resolvedRootId !== "project-root") {
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
        breadcrumbs.push({
          nodeId: item.nodeId,
          title: item.title,
          zoomLevel: item.zoomLevel,
        });
      }
    }

    const allowed = new Set<string>([resolvedRootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of allNodes) {
        if (n.parentId && allowed.has(n.parentId) && !allowed.has(n.nodeId)) {
          allowed.add(n.nodeId);
          changed = true;
        }
      }
    }
    scopedNodes = allNodes.filter((n) => allowed.has(n.nodeId));
    activeZoomLevel = byId.get(resolvedRootId)?.zoomLevel || "project";
  }

  const filterText = (quickFilter || "").trim().toLowerCase();
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
    breadcrumbs,
    visibleNodes,
    allNodes,
  };
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

