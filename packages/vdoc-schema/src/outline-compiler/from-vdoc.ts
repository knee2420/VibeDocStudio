/**
 * `.vdoc` 정본(Phase 3) → `WorkingOutlineDocument`(Phase 1) 초기 추출기.
 *
 * `element-kit` 의 `ElementKind` 를 모든 노드에 명시적으로 붙여
 * 문자열 추측 없이 표·행·열·이미지·문서·페이지 계층을 보존한다.
 */
import { getBlockSlotIds } from "../block-ops";
import type { ElementKind } from "../element-kit";
import { contentHash } from "../evidence";
import { tidyBlockTitle, tidyName } from "../outline-naming";
import type { VProjectManifest } from "../project-manifest";
import { htmlToPlainText } from "../slot-ops";
import type {
  LayoutBlock,
  StructuredTableSectionDef,
  VDocDocument,
  VDocPage,
  VDocSlot,
} from "../types";
import type { WorkingOutlineDocument, WorkingOutlineNode, WorkingOutlineSourceRef } from "./working-outline";

function slotTextAndHash(doc: VDocDocument, slotId: string | undefined): {
  slot?: VDocSlot;
  text: string;
  hash?: string;
} {
  if (!slotId) return { text: "" };
  const slot = doc.slots[slotId];
  if (!slot) return { text: "" };
  const plain = htmlToPlainText(slot.content);
  return { slot, text: plain, hash: contentHash(slot.content) };
}

function tableSectionRowsToOutline(
  doc: VDocDocument,
  page: VDocPage,
  blockId: string,
  sectionId: string | null,
  rows: StructuredTableSectionDef["rows"]
): WorkingOutlineNode[] {
  return rows.map((row, rIdx) => ({
    nodeId: `wo-row-${doc.docId}-${blockId}-${sectionId ?? "main"}-${row.rowId}`,
    text: `${rIdx + 1}행`,
    elementKind: "table-row",
    sourceRef: {
      docId: doc.docId,
      pageId: page.pageId,
      blockId,
      sectionId,
      rowId: row.rowId,
    },
    children: row.cells.map((cell, cIdx) => {
      const { slot, text, hash } = slotTextAndHash(doc, cell.slotId);
      const label = tidyName(slot?.label);
      return {
        nodeId: `wo-cell-${doc.docId}-${cell.slotId}-${cell.cellId}`,
        text: text || label || `${rIdx + 1}행 ${cIdx + 1}열`,
        ...(label && text && label !== text ? { note: label } : null),
        elementKind: "table-cell",
        sourceRef: {
          docId: doc.docId,
          pageId: page.pageId,
          blockId,
          sectionId,
          rowId: row.rowId,
          cellId: cell.cellId,
          slotId: cell.slotId,
          baseHash: hash,
        },
        children: [],
      };
    }),
  }));
}

function blockToWorkingNodes(doc: VDocDocument, page: VDocPage, blk: LayoutBlock): WorkingOutlineNode {
  const baseRef = (slotId?: string | null, hash?: string): WorkingOutlineSourceRef => ({
    docId: doc.docId,
    pageId: page.pageId,
    blockId: blk.blockId,
    ...(slotId ? { slotId } : null),
    ...(hash ? { baseHash: hash } : null),
  });
  const blkTitle = tidyBlockTitle(blk.title);

  if (blk.kind === "structured-table" || blk.kind === "table") {
    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: blkTitle || "표",
      elementKind: "structured-table",
      ...(blk.rows.length >= 2 ? { isFolded: true } : null),
      sourceRef: baseRef(),
      children: tableSectionRowsToOutline(doc, page, blk.blockId, null, blk.rows),
    };
  }

  if (blk.kind === "composite-form-frame") {
    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: blkTitle || "복합 양식",
      elementKind: "composite-form-frame",
      isFolded: true,
      sourceRef: baseRef(),
      children: blk.sections.map((sec, idx) => ({
        nodeId: `wo-sec-${doc.docId}-${blk.blockId}-${sec.sectionId}`,
        text: tidyBlockTitle(sec.title) || `${idx + 1}구역`,
        elementKind: "section",
        sourceRef: {
          docId: doc.docId,
          pageId: page.pageId,
          blockId: blk.blockId,
          sectionId: sec.sectionId,
        },
        children: tableSectionRowsToOutline(doc, page, blk.blockId, sec.sectionId, sec.rows),
      })),
    };
  }

  if (blk.kind === "columns-grid") {
    const colChildren: WorkingOutlineNode[] = blk.columns
      ? blk.columns.map((col, idx) => {
          if (col.image) {
            return {
              nodeId: `wo-col-${doc.docId}-${blk.blockId}-${idx}`,
              text: col.image.alt || `${idx + 1}열 이미지`,
              elementKind: "image",
              mediaTarget: col.image.src,
              sourceRef: baseRef(),
              children: [],
            };
          }
          const { slot, text, hash } = slotTextAndHash(doc, col.slotId);
          return {
            nodeId: `wo-col-${doc.docId}-${blk.blockId}-${col.slotId ?? idx}`,
            text: text || tidyName(slot?.label) || `${idx + 1}열`,
            elementKind: "grid-col",
            sourceRef: baseRef(col.slotId, hash),
            children: [],
          };
        })
      : (blk.slotIds ?? []).map((sid, idx) => {
          const { slot, text, hash } = slotTextAndHash(doc, sid);
          return {
            nodeId: `wo-col-${doc.docId}-${blk.blockId}-${sid}`,
            text: text || tidyName(slot?.label) || `${idx + 1}열`,
            elementKind: "grid-col",
            sourceRef: baseRef(sid, hash),
            children: [],
          };
        });

    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: blkTitle || "다단 그리드",
      elementKind: "columns-grid",
      sourceRef: baseRef(),
      children: colChildren,
    };
  }

  if (blk.kind === "image") {
    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: blk.caption || blk.alt || blkTitle || "이미지",
      elementKind: "image",
      mediaTarget: blk.src,
      sourceRef: baseRef(),
      children: [],
    };
  }

  if (blk.kind === "divider") {
    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: blkTitle || "구분선",
      elementKind: "divider",
      sourceRef: baseRef(),
      children: [],
    };
  }

  const slotIds = getBlockSlotIds(blk);
  if (slotIds.length === 1) {
    const sid = slotIds[0];
    const { slot, text, hash } = slotTextAndHash(doc, sid);
    const label = tidyName(slot?.label);
    return {
      nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
      text: text || blkTitle || label || "(빈 슬롯)",
      ...(label && text && label !== text && blk.kind !== "heading" && blk.kind !== "text" ? { note: label } : null),
      elementKind: blk.kind as ElementKind,
      sourceRef: baseRef(sid, hash),
      children: [],
    };
  }

  // 다중 슬롯 블록 (hero, section-block, cover-banner, summary-list, fillable-group 등)
  return {
    nodeId: `wo-blk-${doc.docId}-${blk.blockId}`,
    text: blkTitle || blk.kind,
    elementKind: blk.kind as ElementKind,
    ...(blk.kind === "hero" && blk.image ? { mediaTarget: blk.image } : null),
    sourceRef: baseRef(),
    children: slotIds.map((sid) => {
      const { slot, text, hash } = slotTextAndHash(doc, sid);
      const label = tidyName(slot?.label);
      return {
        nodeId: `wo-slot-${doc.docId}-${sid}`,
        text: text || label || sid,
        ...(label && text && label !== text ? { note: label } : null),
        elementKind: "slot",
        sourceRef: baseRef(sid, hash),
        children: [],
      };
    }),
  };
}

export function buildWorkingOutlineFromProjectDocs(
  project: VProjectManifest,
  docs: readonly VDocDocument[]
): WorkingOutlineDocument {
  const docsById = new Map(docs.map((d) => [d.docId, d]));
  const baseDocRevisions: Record<string, number> = {};
  const docNodes: WorkingOutlineNode[] = [];

  for (const docId of project.docIds) {
    const doc = docsById.get(docId);
    if (!doc) continue;
    baseDocRevisions[doc.docId] = doc.revision ?? 0;

    const pageNodes: WorkingOutlineNode[] = doc.pages.map((page, pIdx) => ({
      nodeId: `wo-page-${doc.docId}-${page.pageId}`,
      text: page.pageLabel || `Page ${page.pageNumber}`,
      elementKind: "page",
      ...(pIdx > 0 && doc.pages.length > 3 ? { isFolded: true } : null),
      sourceRef: { docId: doc.docId, pageId: page.pageId },
      children: page.blocks.map((blk) => blockToWorkingNodes(doc, page, blk)),
    }));

    docNodes.push({
      nodeId: `wo-doc-${doc.docId}`,
      text: doc.title,
      elementKind: "document",
      ...(docNodes.length > 0 ? { isFolded: true } : null),
      sourceRef: { docId: doc.docId },
      children: pageNodes,
    });
  }

  return {
    projectId: project.projectId,
    revision: 1,
    baseDocRevisions,
    dirty: false,
    updatedAt: new Date().toISOString(),
    nodes: docNodes,
  };
}
