import { genericBlockKind, getBlockKind, type BlockOutlineContext } from "./block-kit";
import { PROJECT_ROOT_CRUMB_ID } from "./layout-constants";
import {
  dedupeNames,
  nameStandaloneSlot,
  nameTableValueCell,
  placeTableCells,
  plainText,
  tidyBlockTitle,
  tidyName,
  type OutlineName,
  type PlacedCell,
} from "./outline-naming";
import type {
  OutlineBreadcrumbItem,
  OutlinerNode,
  VProjectManifest,
  ZoomLevel,
} from "./project-manifest";
import type {
  LayoutBlock,
  StructuredTableSectionDef,
  TableSummaryItem,
  VDocDocument,
  VDocPage,
} from "./types";

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

/** 아직 문서에 대상이 없는 스토리라인(기획) 노드는 실제 노드 뒤에 원래 순서대로 둔다. */
const PLANNED_SEQ = Number.MAX_SAFE_INTEGER / 2;

/** 같은 구조의 입력 행이 3줄 이상 반복되면 반복 영역(출석부 · 품목)으로 보고 행 노드로 묶는다. */
function isRepeatingGrid(grid: PlacedCell[][]): boolean {
  const bodyRows = grid.filter((row) => row.some((c) => c.role === "value"));
  if (bodyRows.length < 3) return false;
  const shape = (row: PlacedCell[]) => row.map((c) => c.role).join(",");
  return bodyRows.every((row) => shape(row) === shape(bodyRows[0]));
}

/** 이름이 없는 import 표는 처음 나오는 라벨 두 개로 부른다 (`회의일시 · 회의장소 외`). */
function titleFromLabels(grid: PlacedCell[][]): string {
  const labels = grid
    .flat()
    .filter((c) => c.role === "label")
    .map((c) => tidyName(plainText(c.slot.content)))
    .filter(Boolean);
  if (labels.length === 0) return "";
  return labels.length > 2 ? `${labels.slice(0, 2).join(" · ")} 외` : labels.join(" · ");
}

/**
 * Combines explicit `project.storylineNodes` with live `.vdoc` Documents -> Pages -> Blocks -> Slots
 * into a unified Fractal Outliner Tree (`Project` -> `Document` -> `Page` -> `Block/구역/행` -> `Slot`).
 *
 * - 모든 블록 종류가 컨테이너 노드를 가진다 (복합 서식 프레임 → 구역 → 반복 행, 다단 그리드, 구획, 표지, 표).
 * - 라벨 칸은 노드가 되지 않고 옆 입력 칸의 이름이 된다 (`outline-naming.ts`).
 * - 형제 순서는 문서 순서(seq)로 정렬한 뒤 DFS 전위 순회로 펼친다. 슬롯을 가리키는
 *   스토리라인 노드는 그 슬롯이 실제로 놓인 블록 아래로 옮겨 붙인다.
 */
export function buildProjectFractalTree(
  project: VProjectManifest,
  docs: VDocDocument[],
  rootNodeId?: string | null,
  quickFilter?: string,
  collapsedNodeIds?: string[]
): FractalOutlineProjection {
  const storyNodes = project.storylineNodes;
  const seqById = new Map<string, number>();
  storyNodes.forEach((n, i) => seqById.set(n.nodeId, PLANNED_SEQ + i));

  const docsById = new Map(docs.map((d) => [d.docId, d]));
  const docNodeByDocId = new Map<string, OutlinerNode>();
  const pageNodeByKey = new Map<string, OutlinerNode>();
  const storySlotByKey = new Map<string, OutlinerNode>();
  storyNodes.forEach((node, i) => {
    if (!node.targetDocId) return;
    if (node.zoomLevel === "document" && !docNodeByDocId.has(node.targetDocId)) {
      docNodeByDocId.set(node.targetDocId, node);
      seqById.set(node.nodeId, i);
    } else if (node.zoomLevel === "page" && node.targetPageId) {
      const key = `${node.targetDocId}\u0000${node.targetPageId}`;
      if (!pageNodeByKey.has(key)) pageNodeByKey.set(key, node);
    } else if (node.zoomLevel === "slot" && node.targetSlotId) {
      const key = `${node.targetDocId}\u0000${node.targetSlotId}`;
      if (!storySlotByKey.has(key)) storySlotByKey.set(key, node);
    }
  });

  const candidateNodes: OutlinerNode[] = [];
  let seq = storyNodes.length;
  const emit = (node: OutlinerNode): OutlinerNode => {
    candidateNodes.push(node);
    seqById.set(node.nodeId, seq++);
    return node;
  };

  const rootId = storyNodes.find((n) => n.parentId === null)?.nodeId ?? null;
  for (const docId of project.docIds) {
    const doc = docsById.get(docId);
    if (!doc) continue;

    let docNode = docNodeByDocId.get(doc.docId);
    if (!docNode) {
      docNode = emit({
        nodeId: `auto-doc-${doc.docId}`,
        parentId: rootId,
        depth: 1,
        zoomLevel: "document",
        title: doc.title,
        summary: `${doc.pages.length}p · 슬롯 ${Object.keys(doc.slots).length}개`,
        targetDocId: doc.docId,
        aiStatus: "idle",
      });
      docNodeByDocId.set(doc.docId, docNode);
    }
    const docParent = docNode;
    const emittedSlotKeys = new Set<string>();

    const emitSlot = (
      parent: OutlinerNode,
      page: VDocPage,
      blockId: string,
      slotId: string,
      name: OutlineName,
      isStatic = false,
      blockKind?: string
    ): OutlinerNode | undefined => {
      const slot = doc.slots[slotId];
      const key = `${doc.docId}\u0000${slotId}`;
      if (!slot || emittedSlotKeys.has(key)) return undefined;
      emittedSlotKeys.add(key);
      const story = storySlotByKey.get(key);
      if (story) {
        return emit({
          ...story,
          parentId: parent.nodeId,
          targetPageId: story.targetPageId ?? page.pageId,
          targetBlockId: blockId,
          recommendedTemplateId: story.recommendedTemplateId ?? blockKind ?? parent.recommendedTemplateId ?? undefined,
        });
      }
      return emit({
        nodeId: `auto-slot-${doc.docId}-${slotId}`,
        parentId: parent.nodeId,
        depth: parent.depth + 1,
        zoomLevel: "slot",
        title: name.title,
        summary: plainText(slot.content).slice(0, 90) || "(빈 슬롯)",
        targetDocId: doc.docId,
        targetPageId: page.pageId,
        targetSlotId: slotId,
        targetBlockId: blockId,
        recommendedTemplateId: blockKind ?? parent.recommendedTemplateId ?? undefined,
        aiStatus: slot.isEdited ? "applied" : "idle",
        ...(isStatic ? { isStatic: true } : {}),
        ...(name.needsReview ? { nameNeedsReview: true } : {}),
      });
    };

    const emitContainer = (
      parent: OutlinerNode,
      nodeId: string,
      page: VDocPage,
      blk: LayoutBlock,
      title: string,
      summary: string,
      needsReview = false
    ): OutlinerNode =>
      emit({
        nodeId,
        parentId: parent.nodeId,
        depth: parent.depth + 1,
        zoomLevel: "page",
        title,
        summary,
        targetDocId: doc.docId,
        targetPageId: page.pageId,
        targetBlockId: blk.blockId,
        recommendedTemplateId: blk.kind,
        aiStatus: "idle",
        ...(needsReview ? { nameNeedsReview: true } : {}),
      });

    /** 합계 · 요약 항목: 값 칸 하나를 항목 라벨(직접 값 또는 라벨 슬롯의 글자) 이름으로 붙인다. */
    const summaryItemEntries = (items: TableSummaryItem[]) =>
      items.flatMap((item) => {
        const slotId = item.valueSlotId ?? item.slotId;
        if (!slotId) return [];
        const label =
          tidyName(item.label) ||
          tidyName(plainText(item.labelSlotId ? doc.slots[item.labelSlotId]?.content : ""));
        return [{ slotId, name: { title: label || item.itemId, needsReview: !label } }];
      });

    /** 이름이 겹치지 않게 정리한 뒤 같은 부모 아래 슬롯들을 붙인다. */
    const emitSlotGroup = (
      parent: OutlinerNode,
      page: VDocPage,
      blockId: string,
      entries: { slotId: string; name: OutlineName; isStatic?: boolean }[],
      blockKind?: string
    ) => {
      const named = dedupeNames(entries.map((e) => ({ ...e, title: e.name.title })));
      for (const e of named) {
        emitSlot(parent, page, blockId, e.slotId, { ...e.name, title: e.title }, e.isStatic, blockKind);
      }
    };

    /** 표 · 구역 공통: 반복 영역이면 행 노드로, 아니면 입력 칸을 바로 붙인다. */
    const emitCellGrid = (
      parent: OutlinerNode,
      page: VDocPage,
      blk: LayoutBlock,
      grid: PlacedCell[][],
      scopeTitle: string,
      rowNodePrefix: string
    ) => {
      if (isRepeatingGrid(grid)) {
        let rowNo = 0;
        grid.forEach((row, r) => {
          const values = row.filter((c) => c.role === "value");
          if (values.length === 0) return;
          rowNo++;
          const rowNode = emitContainer(
            parent,
            `${rowNodePrefix}-r${r}`,
            page,
            blk,
            `${rowNo}행`,
            values.map((c) => plainText(c.slot.content)).filter(Boolean).join(" · ").slice(0, 90)
          );
          emitSlotGroup(
            rowNode,
            page,
            blk.blockId,
            values.map((c) => ({
              slotId: c.cell.slotId,
              name: nameTableValueCell(grid, c, scopeTitle, { preferColumnHeader: true }),
            }))
          );
        });
        return;
      }
      emitSlotGroup(
        parent,
        page,
        blk.blockId,
        grid
          .flat()
          .filter((c) => c.role === "value")
          .map((c) => ({ slotId: c.cell.slotId, name: nameTableValueCell(grid, c, scopeTitle) }))
      );
    };

    const emitTable = (pageNode: OutlinerNode, page: VDocPage, blk: LayoutBlock & { kind: "structured-table" | "table" }) => {
      const grid = placeTableCells(blk.rows, doc.slots);
      const title = tidyBlockTitle(blk.title) || titleFromLabels(grid) || "표";
      const tableNode = emitContainer(
        pageNode,
        `auto-blk-${doc.docId}-${blk.blockId}`,
        page,
        blk,
        `[표] ${title}`,
        `표 (${blk.rows.length}행)`,
        !tidyBlockTitle(blk.title)
      );

      for (const row of grid) {
        const values = row.filter((c) => c.role === "value");
        if (values.length === 0) continue;
        const [first] = row;
        if (first.role === "value" && values.length > 1) {
          // 첫 칸이 행의 이름(키)인 매트릭스 표: 첫 칸 노드 아래에 나머지 칸을 열 머리 이름으로 붙인다.
          const rowKey = tidyName(plainText(first.slot.content)).slice(0, 40);
          const rowNode = emitSlot(
            tableNode,
            page,
            blk.blockId,
            first.cell.slotId,
            rowKey ? { title: rowKey, needsReview: false } : nameTableValueCell(grid, first, title)
          );
          emitSlotGroup(
            rowNode ?? tableNode,
            page,
            blk.blockId,
            values.slice(1).map((c) => ({
              slotId: c.cell.slotId,
              name: nameTableValueCell(grid, c, title, { preferColumnHeader: true }),
            }))
          );
        } else {
          emitSlotGroup(
            tableNode,
            page,
            blk.blockId,
            values.map((c) => ({ slotId: c.cell.slotId, name: nameTableValueCell(grid, c, title) }))
          );
        }
      }

      emitSlotGroup(tableNode, page, blk.blockId, summaryItemEntries(blk.footerSummary?.items ?? []));
    };

    const emitFrame = (
      pageNode: OutlinerNode,
      page: VDocPage,
      blk: LayoutBlock & { kind: "composite-form-frame" }
    ) => {
      const grids = blk.sections.map((sec) => placeTableCells(sec.rows, doc.slots));
      const blockTitle = tidyBlockTitle(blk.title);
      const frameTitle = blockTitle || titleFromLabels(grids.flat()) || "서식 프레임";
      const frameNode = emitContainer(
        pageNode,
        `auto-blk-${doc.docId}-${blk.blockId}`,
        page,
        blk,
        frameTitle,
        `서식 프레임 · ${blk.sections.length}구역`,
        !blockTitle
      );
      blk.sections.forEach((sec: StructuredTableSectionDef, i) => {
        const grid = grids[i];
        // 구역이 하나뿐이면 구역 단계를 건너뛰고 프레임 바로 아래에 붙인다.
        let sectionNode = frameNode;
        if (blk.sections.length > 1) {
          const secTitle = tidyBlockTitle(sec.title) || titleFromLabels(grid) || `${i + 1}구역`;
          const hasValues = grid.some((row) => row.some((c) => c.role === "value"));
          sectionNode = emitContainer(
            frameNode,
            `auto-sec-${doc.docId}-${blk.blockId}-${sec.sectionId}`,
            page,
            blk,
            secTitle,
            hasValues ? `구역 · ${sec.rows.length}행` : "고정 텍스트 구역",
            !tidyBlockTitle(sec.title)
          );
          if (!hasValues) {
            sectionNode.isStatic = true;
            return;
          }
        }
        emitCellGrid(
          sectionNode,
          page,
          blk,
          grid,
          sec.title || frameTitle,
          `auto-row-${doc.docId}-${blk.blockId}-${sec.sectionId}`
        );
      });
    };

    /** 블록 종류마다 아웃라인 모양은 그 정의(`block-kit`)가 정하고, 여기서는 이 블록에 묶인 도구를 넘긴다. */
    const emitBlock = (pageNode: OutlinerNode, page: VDocPage, blk: LayoutBlock) => {
      const blockTitle = tidyBlockTitle(blk.title);
      const blockNodeId = `auto-blk-${doc.docId}-${blk.blockId}`;
      const ctx: BlockOutlineContext = {
        doc,
        page,
        pageNode,
        blockNodeId,
        blockTitle,
        emitSlot: (parent, slotId, name, isStatic) => emitSlot(parent, page, blk.blockId, slotId, name, isStatic, blk.kind),
        emitContainer: (parent, nodeId, title, summary, needsReview) => emitContainer(parent, nodeId, page, blk, title, summary, needsReview),
        emitSlotGroup: (parent, entries) => emitSlotGroup(parent, page, blk.blockId, entries, blk.kind),
        emitStatic: (title, summary) =>
          emit({
            nodeId: blockNodeId,
            parentId: pageNode.nodeId,
            depth: pageNode.depth + 1,
            zoomLevel: "slot",
            title,
            summary,
            targetDocId: doc.docId,
            targetPageId: page.pageId,
            targetBlockId: blk.blockId,
            recommendedTemplateId: blk.kind,
            aiStatus: "idle",
            isStatic: true,
          }),
        emitTable: (table) => emitTable(pageNode, page, table),
        emitFrame: (frame) => emitFrame(pageNode, page, frame),
        summaryItemEntries,
        nameStandaloneSlot,
        plainText,
        tidyName,
      };
      const def = getBlockKind(blk.kind);
      def.outline ? def.outline(blk, ctx) : genericBlockKind.outline!(blk, ctx);
    };

    for (const page of doc.pages) {
      const pageKey = `${doc.docId}\u0000${page.pageId}`;
      let pageNode = pageNodeByKey.get(pageKey);
      if (pageNode) {
        seqById.set(pageNode.nodeId, seq++);
      } else {
        pageNode = emit({
          nodeId: `auto-page-${doc.docId}-${page.pageId}`,
          parentId: docParent.nodeId,
          depth: docParent.depth + 1,
          zoomLevel: "page",
          title: `Page ${page.pageNumber} · ${page.pageLabel}`,
          summary: `블록 ${page.blocks.length}개`,
          targetDocId: doc.docId,
          targetPageId: page.pageId,
          recommendedTemplateId: page.blocks[0]?.kind || "section-block",
          aiStatus: "idle",
        });
        pageNodeByKey.set(pageKey, pageNode);
      }
      for (const blk of page.blocks) emitBlock(pageNode, page, blk);
    }
  }

  // 슬롯 위치로 옮겨 붙인 스토리라인 노드는 원본을 빼고, 나머지 기획 노드를 더한다.
  const emittedIds = new Set(candidateNodes.map((n) => n.nodeId));
  for (const node of storyNodes) {
    if (!emittedIds.has(node.nodeId)) candidateNodes.push(node);
  }

  // 형제를 문서 순서로 정렬한 뒤 DFS 전위 순회로 펼치고 깊이를 다시 매긴다.
  const childrenMap = new Map<string | null, OutlinerNode[]>();
  for (const node of candidateNodes) {
    const pId = node.parentId ?? null;
    const list = childrenMap.get(pId) || [];
    list.push(node);
    childrenMap.set(pId, list);
  }
  const seqOf = (n: OutlinerNode) => seqById.get(n.nodeId) ?? PLANNED_SEQ;
  for (const list of childrenMap.values()) list.sort((a, b) => seqOf(a) - seqOf(b));

  const allNodes: OutlinerNode[] = [];
  const visited = new Set<string>();

  function traverseDfs(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.nodeId)) continue;
      visited.add(child.nodeId);
      allNodes.push(child.depth === depth ? child : { ...child, depth });
      traverseDfs(child.nodeId, depth + 1);
    }
  }

  traverseDfs(null, 0);

  // Safety fallback for any unvisited nodes (부모를 잃은 노드)
  for (const node of candidateNodes) {
    if (!visited.has(node.nodeId)) {
      visited.add(node.nodeId);
      allNodes.push(node);
      traverseDfs(node.nodeId, node.depth + 1);
    }
  }

  const byId = new Map<string, OutlinerNode>(allNodes.map((n) => [n.nodeId, n]));
  const breadcrumbs: OutlineBreadcrumbItem[] = [
    { nodeId: PROJECT_ROOT_CRUMB_ID, title: project.title, zoomLevel: "project" },
  ];

  const projectStoryRootId = project.storylineNodes.find((n) => n.parentId === null)?.nodeId ?? null;
  const isProjectRoot = (id: string | null | undefined): boolean =>
    !id || id === PROJECT_ROOT_CRUMB_ID || (projectStoryRootId !== null && id === projectStoryRootId);

  let scopedNodes = allNodes;
  let activeZoomLevel: ZoomLevel = "project";
  const resolvedRootId =
    rootNodeId && !isProjectRoot(rootNodeId) && byId.has(rootNodeId)
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
    const rawParentId = targetNode?.parentId;
    parentZoomNodeId =
      !rawParentId || isProjectRoot(rawParentId)
        ? PROJECT_ROOT_CRUMB_ID
        : rawParentId;
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

