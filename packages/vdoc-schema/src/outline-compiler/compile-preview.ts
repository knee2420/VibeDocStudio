/**
 * `WorkingOutlineDocument` + `Base .vdoc[]` → 가상 `Preview .vdoc[]` 단일 패치 컴파일러.
 *
 * - 제로 베이스 출발(`baseDocs` 없음): `elementKind` 와 계층으로부터 `block-kit` 기본 블록·페이지 합성.
 * - Phase 3 복귀(`baseDocs` 존재): `sourceRef` 가 살아있는 기존 블록·표·슬롯의 스타일·병합·프레임을 보존하고
 *   Workflowy 에서 바꾼 내용·순서·표 분리 이동만 비파괴 Overlay.
 */
import { getBlockSlotIds } from "../block-ops";
import { sectionSlotId } from "../layout-constants";
import { htmlToPlainText, htmlToSummary, plainTextToHtml } from "../slot-ops";
import type {
  ColumnsGridBlockDef,
  CompositeFormFrameBlockDef,
  LayoutBlock,
  StructuredTableBlockDef,
  TableCellSlotDef,
  VDocDocument,
  VDocPage,
  VDocSlot,
} from "../types";
import type { WorkingOutlineDocument, WorkingOutlineNode } from "./working-outline";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class IdCounter {
  private seq = 0;
  next(prefix: string): string {
    this.seq += 1;
    return `${prefix}_cmp_${this.seq}`;
  }
}

function makeSlot(
  slots: Record<string, VDocSlot>,
  slotId: string,
  label: string,
  plainOrHtml: string,
  baseSlot?: VDocSlot
): string {
  const html = plainOrHtml.trim().startsWith("<") ? plainOrHtml : plainTextToHtml(plainOrHtml);
  if (baseSlot) {
    const unchanged = htmlToSummary(baseSlot.content) === htmlToSummary(html);
    slots[slotId] = {
      ...cloneJson(baseSlot),
      slotId,
      content: unchanged ? baseSlot.content : html,
      ...(unchanged ? null : { isEdited: true }),
    };
  } else {
    slots[slotId] = {
      slotId,
      label,
      role: "editable-slot",
      content: html,
      backDataRefs: [],
    };
  }
  return slotId;
}

function findBaseBlock(
  baseDoc: VDocDocument | undefined,
  blockId: string | null | undefined
): LayoutBlock | undefined {
  if (!baseDoc || !blockId) return undefined;
  for (const page of baseDoc.pages) {
    const found = page.blocks.find((b) => b.blockId === blockId);
    if (found) return found;
  }
  return undefined;
}

function findBasePage(
  baseDoc: VDocDocument | undefined,
  pageId: string | null | undefined
): VDocPage | undefined {
  if (!baseDoc || !pageId) return undefined;
  return baseDoc.pages.find((p) => p.pageId === pageId);
}

function findBaseCell(
  baseBlock: LayoutBlock | undefined,
  cellId: string | null | undefined,
  slotId: string | null | undefined
): TableCellSlotDef | undefined {
  if (!baseBlock) return undefined;
  if (baseBlock.kind === "structured-table" || baseBlock.kind === "table") {
    for (const row of baseBlock.rows) {
      const hit = row.cells.find((c) => (cellId && c.cellId === cellId) || (slotId && c.slotId === slotId));
      if (hit) return hit;
    }
  }
  if (baseBlock.kind === "composite-form-frame") {
    for (const sec of baseBlock.sections) {
      for (const row of sec.rows) {
        const hit = row.cells.find((c) => (cellId && c.cellId === cellId) || (slotId && c.slotId === slotId));
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

function compileTableBlock(
  node: WorkingOutlineNode,
  baseDoc: VDocDocument | undefined,
  baseBlock: LayoutBlock | undefined,
  slots: Record<string, VDocSlot>,
  ids: IdCounter,
  usedSlotIds: Set<string>
): StructuredTableBlockDef {
  const existing =
    baseBlock && (baseBlock.kind === "structured-table" || baseBlock.kind === "table")
      ? cloneJson(baseBlock)
      : null;
  const rowNodes = node.children.length > 0 ? node.children : [];

  const maxCols = Math.max(
    1,
    existing?.columnWidths.length ?? 0,
    ...rowNodes.map((r) => Math.max(1, r.children.length))
  );
  const columnWidths =
    existing && existing.columnWidths.length >= maxCols
      ? existing.columnWidths
      : Array.from({ length: maxCols }, () => `${Math.floor(100 / maxCols)}%`);

  const rows: StructuredTableBlockDef["rows"] = rowNodes.map((rowNode, rIdx) => {
    const cellNodes = rowNode.children.length > 0 ? rowNode.children : [rowNode];
    return {
      rowId: rowNode.sourceRef?.rowId || ids.next("row"),
      cells: cellNodes.map((cellNode, cIdx) => {
        const baseCell = findBaseCell(baseBlock, cellNode.sourceRef?.cellId, cellNode.sourceRef?.slotId);
        const rawSlotId = cellNode.sourceRef?.slotId;
        const slotId = rawSlotId && !usedSlotIds.has(rawSlotId) ? rawSlotId : ids.next("slot_tc");
        usedSlotIds.add(slotId);
        const baseSlot = rawSlotId ? baseDoc?.slots[rawSlotId] : undefined;
        makeSlot(slots, slotId, cellNode.note || `${rIdx + 1}행 ${cIdx + 1}열`, cellNode.text, baseSlot);
        if (baseCell) {
          return { ...cloneJson(baseCell), cellId: baseCell.cellId, slotId };
        }
        return {
          cellId: ids.next("cell"),
          slotId,
          isHeader: rIdx === 0 && !existing,
          vAlign: "middle",
        };
      }),
    };
  });

  if (rows.length === 0) {
    const s1 = ids.next("slot_tc1");
    const s2 = ids.next("slot_tc2");
    makeSlot(slots, s1, "항목", "항목");
    makeSlot(slots, s2, "내용", "내용");
    rows.push({
      rowId: ids.next("row"),
      cells: [
        { cellId: ids.next("cell"), slotId: s1, isHeader: true, vAlign: "middle" },
        { cellId: ids.next("cell"), slotId: s2, isHeader: true, vAlign: "middle" },
      ],
    });
  }

  if (existing) {
    if (existing.footerSummary?.items && baseDoc?.slots) {
      for (const item of existing.footerSummary.items) {
        for (const sid of [item.slotId, item.labelSlotId, item.valueSlotId]) {
          if (!sid || slots[sid] || !baseDoc.slots[sid]) continue;
          slots[sid] = cloneJson(baseDoc.slots[sid]);
          usedSlotIds.add(sid);
        }
      }
    }
    return {
      ...existing,
      title: node.text || existing.title,
      columnWidths,
      rows,
    };
  }

  return {
    blockId: ids.next("blk_tbl"),
    kind: "structured-table",
    title: node.text || "표",
    columnWidths,
    borderRules: { outer: "1px solid #eaeaea", rowBottom: "1px solid #eaeaea", vertical: "1px solid #eaeaea" },
    headerStyle: { bg: "#f5f5f6", fontWeight: "600", padding: "8px" },
    cellPadding: "8px",
    rows,
  };
}

function compileBlockNode(
  node: WorkingOutlineNode,
  baseDoc: VDocDocument | undefined,
  slots: Record<string, VDocSlot>,
  ids: IdCounter,
  usedSlotIds: Set<string>
): LayoutBlock[] {
  const baseBlock = findBaseBlock(baseDoc, node.sourceRef?.blockId);
  const kind = node.elementKind;

  // 1. 표 블록
  if (kind === "structured-table" || kind === "table") {
    return [compileTableBlock(node, baseDoc, baseBlock, slots, ids, usedSlotIds)];
  }

  // 2. 복합 양식 프레임 (기존 프레임이 있으면 구역별 행·셀 Overlay, 없으면 신규 생성)
  if (kind === "composite-form-frame" && baseBlock?.kind === "composite-form-frame") {
    const cloned: CompositeFormFrameBlockDef = cloneJson(baseBlock);
    cloned.title = node.text || cloned.title;
    const sectionNodes = node.children.filter((c) => c.elementKind === "section");
    const targetSections =
      sectionNodes.length > 0
        ? sectionNodes
        : node.children.length > 0
          ? [{ ...node, nodeId: ids.next("sec_wrap"), text: node.text || "1구역", elementKind: "section" as const, children: node.children }]
          : [];
    if (targetSections.length > 0) {
      cloned.sections = cloned.sections.map((sec, sIdx) => {
        const secNode =
          targetSections.find((n) => n.sourceRef?.sectionId === sec.sectionId) ?? targetSections[sIdx];
        if (!secNode || secNode.children.length === 0) {
          for (const row of sec.rows) {
            for (const cell of row.cells) {
              if (!cell.slotId || slots[cell.slotId] || !baseDoc?.slots[cell.slotId]) continue;
              slots[cell.slotId] = cloneJson(baseDoc.slots[cell.slotId]);
              usedSlotIds.add(cell.slotId);
            }
          }
          return sec;
        }
        const rowNodes = secNode.children;
        return {
          ...sec,
          title: secNode.text || sec.title,
          rows: rowNodes.map((rNode, rIdx) => ({
            rowId: rNode.sourceRef?.rowId || ids.next("row"),
            cells: (rNode.children.length > 0 ? rNode.children : [rNode]).map((cNode, cIdx) => {
              const baseCell = findBaseCell(baseBlock, cNode.sourceRef?.cellId, cNode.sourceRef?.slotId);
              const rawSid = cNode.sourceRef?.slotId;
              const slotId = rawSid && !usedSlotIds.has(rawSid) ? rawSid : ids.next("slot_fc");
              usedSlotIds.add(slotId);
              makeSlot(
                slots,
                slotId,
                cNode.note || `${rIdx + 1}행 ${cIdx + 1}열`,
                cNode.text,
                rawSid ? baseDoc?.slots[rawSid] : undefined
              );
              return baseCell
                ? { ...cloneJson(baseCell), cellId: baseCell.cellId, slotId }
                : { cellId: ids.next("cell"), slotId, vAlign: "middle" };
            }),
          })),
        };
      });
    } else {
      for (const sec of cloned.sections) {
        for (const row of sec.rows) {
          for (const cell of row.cells) {
            if (!cell.slotId || slots[cell.slotId] || !baseDoc?.slots[cell.slotId]) continue;
            slots[cell.slotId] = cloneJson(baseDoc.slots[cell.slotId]);
            usedSlotIds.add(cell.slotId);
          }
        }
      }
    }
    return [cloned];
  }

  if (kind === "composite-form-frame") {
    const secNodes = node.children.filter((c) => c.elementKind === "section");
    const targetSections =
      secNodes.length > 0
        ? secNodes
        : [{ ...node, nodeId: ids.next("sec_wrap"), text: node.text || "1구역", elementKind: "section" as const, children: node.children }];
    const sections = targetSections.map((secNode, sIdx) => {
      const rowNodes = secNode.children;
      const maxCols = Math.max(1, ...rowNodes.map((r) => Math.max(1, r.children.length)));
      const columnWidths = Array.from({ length: maxCols }, () => `${Math.floor(100 / maxCols)}%`);
      const rows = rowNodes.map((rNode, rIdx) => ({
        rowId: rNode.sourceRef?.rowId || ids.next("row"),
        cells: (rNode.children.length > 0 ? rNode.children : [rNode]).map((cNode, cIdx) => {
          const rawSid = cNode.sourceRef?.slotId;
          const slotId = rawSid && !usedSlotIds.has(rawSid) ? rawSid : ids.next("slot_fc");
          usedSlotIds.add(slotId);
          makeSlot(slots, slotId, cNode.note || `${rIdx + 1}행 ${cIdx + 1}열`, cNode.text, rawSid ? baseDoc?.slots[rawSid] : undefined);
          return { cellId: ids.next("cell"), slotId, isHeader: rIdx === 0, vAlign: "middle" as const };
        }),
      }));
      return {
        sectionId: secNode.sourceRef?.sectionId || ids.next("sec"),
        title: secNode.text || `${sIdx + 1}구역`,
        columnWidths,
        borderRules: { outer: "1px solid #1e293b", rowBottom: "1px solid #cbd5e1", vertical: "1px solid #cbd5e1" },
        headerStyle: { bg: "#f1f5f9", fontWeight: "700", padding: "8px" },
        rows,
      };
    });
    return [
      {
        blockId: ids.next("blk_frame"),
        kind: "composite-form-frame",
        title: node.text || "서식 프레임",
        sections,
      } satisfies CompositeFormFrameBlockDef,
    ];
  }

  // 3. 다단 그리드
  if (kind === "columns-grid") {
    const existing = baseBlock?.kind === "columns-grid" ? cloneJson(baseBlock) : null;
    const colNodes = node.children;
    if (existing && existing.columns) {
      if (colNodes.length === 0) {
        for (const orig of existing.columns) {
          if (orig.slotId && !slots[orig.slotId] && baseDoc?.slots[orig.slotId]) {
            slots[orig.slotId] = cloneJson(baseDoc.slots[orig.slotId]);
            usedSlotIds.add(orig.slotId);
          }
        }
        return [{ ...existing, title: node.text || existing.title } satisfies ColumnsGridBlockDef];
      }
      const columns = colNodes.map((cNode, idx) => {
        const orig = existing.columns?.[idx];
        if (cNode.elementKind === "image" || orig?.image) {
          return {
            image: {
              ...(orig?.image ?? { src: cNode.mediaTarget || "", width: "100%" }),
              src: cNode.mediaTarget || orig?.image?.src || "",
              alt: cNode.text,
            },
          };
        }
        const rawSid = cNode.sourceRef?.slotId || orig?.slotId;
        const slotId = rawSid && !usedSlotIds.has(rawSid) ? rawSid : ids.next("slot_col");
        usedSlotIds.add(slotId);
        makeSlot(slots, slotId, cNode.note || `${idx + 1}열`, cNode.text, rawSid ? baseDoc?.slots[rawSid] : undefined);
        return { slotId };
      });
      return [{ ...existing, title: node.text || existing.title, columns } satisfies ColumnsGridBlockDef];
    }

    const colSlotIds = (colNodes.length > 0 ? colNodes : [{ ...node, nodeId: ids.next("col") }, { ...node, text: "", nodeId: ids.next("col2") }]).map(
      (cNode, idx) => {
        const rawSid = cNode.sourceRef?.slotId;
        const slotId = rawSid && !usedSlotIds.has(rawSid) ? rawSid : ids.next("slot_col");
        usedSlotIds.add(slotId);
        makeSlot(slots, slotId, `${idx + 1}열`, cNode.text, rawSid ? baseDoc?.slots[rawSid] : undefined);
        return slotId;
      }
    );
    return [
      {
        blockId: existing?.blockId || ids.next("blk_cols"),
        kind: "columns-grid",
        title: node.text || "다단 그리드",
        widths: existing?.widths ?? Array.from({ length: colSlotIds.length }, () => "1fr"),
        cardStyle: existing?.cardStyle ?? "plain",
        slotIds: colSlotIds,
      },
    ];
  }

  // 4. 이미지 / 구분선 (슬롯 없음)
  if (kind === "image") {
    const existing = baseBlock?.kind === "image" ? cloneJson(baseBlock) : null;
    return [
      {
        ...(existing ?? {
          blockId: ids.next("blk_img"),
          kind: "image",
          src: node.mediaTarget || "",
          align: "center",
          width: "320px",
        }),
        title: node.text || "이미지",
        alt: node.text || existing?.alt || "이미지",
        ...(node.text ? { caption: node.text } : null),
        ...(node.mediaTarget ? { src: node.mediaTarget } : null),
      },
    ];
  }

  if (kind === "divider") {
    const existing = baseBlock?.kind === "divider" ? cloneJson(baseBlock) : null;
    return [
      existing ?? {
        blockId: ids.next("blk_div"),
        kind: "divider",
        title: node.text || "구분선",
        variant: "short",
        spacing: 24,
      },
    ];
  }

  // 5. 기존 블록이 같은 kind 인 경우 (원래 스타일·프레임 보존 + 슬롯만 Overlay)
  if (baseBlock && baseBlock.kind === kind) {
    const cloned = cloneJson(baseBlock);
    const slotIds = getBlockSlotIds(cloned);
    if (slotIds.length === 1) {
      const sid = slotIds[0];
      usedSlotIds.add(sid);
      makeSlot(slots, sid, baseDoc?.slots[sid]?.label ?? node.text, node.text, baseDoc?.slots[sid]);
      const extraChildren = node.children.flatMap((c) => compileBlockNode(c, baseDoc, slots, ids, usedSlotIds));
      return [cloned, ...extraChildren];
    }
    if (slotIds.length > 1) {
      slotIds.forEach((sid, idx) => {
        usedSlotIds.add(sid);
        const child = node.children.find((c) => c.sourceRef?.slotId === sid) ?? node.children[idx];
        const text = child ? child.text : htmlToPlainText(baseDoc?.slots[sid]?.content ?? "");
        makeSlot(slots, sid, baseDoc?.slots[sid]?.label ?? `슬롯 ${idx + 1}`, text, baseDoc?.slots[sid]);
      });
      return [cloned];
    }
  }

  // 6. 신규 또는 다른 종류에서 전환된 블록 (heading · text · section-block · callout-box · link-card · hero 등)
  const rawSid = node.sourceRef?.slotId;
  const sid = rawSid && !usedSlotIds.has(rawSid) ? rawSid : ids.next("slot");
  usedSlotIds.add(sid);
  const baseSlot = rawSid ? baseDoc?.slots[rawSid] : undefined;

  if (kind === "callout-box") {
    makeSlot(slots, sid, "안내 상자", node.text || node.note || "", baseSlot);
    return [
      {
        blockId: ids.next("blk_box"),
        kind: "callout-box",
        title: "안내 상자",
        slotId: sid,
        tone: "info",
      },
      ...node.children.flatMap((c) => compileBlockNode(c, baseDoc, slots, ids, usedSlotIds)),
    ];
  }

  if (kind === "hero") {
    const subId = ids.next("slot_hero_sub");
    makeSlot(slots, sid, "표지 제목", node.text || "제목", baseSlot);
    makeSlot(slots, subId, "표지 부제", node.note || node.children[0]?.text || "");
    return [
      {
        blockId: ids.next("blk_hero"),
        kind: "hero",
        title: node.text || "사진 표지",
        titleSlotId: sid,
        subtitleSlotId: subId,
        height: 280,
        overlay: 0.35,
        ...(node.mediaTarget ? { image: node.mediaTarget } : null),
      },
    ];
  }

  // 자식을 거느린 일반 불릿이거나 명시적 heading 이면 heading 블록으로 컴파일
  const asHeading = kind === "heading" || kind === "form-title" || (kind === "text" && node.children.length > 0);
  if (asHeading) {
    makeSlot(slots, sid, "소제목", node.text, baseSlot);
    const headingBlock: LayoutBlock = {
      blockId: ids.next("blk_hd"),
      kind: "heading",
      title: node.text.slice(0, 28) || "소제목",
      slotId: sid,
      level: 2,
      align: "left",
    };
    const childBlocks = node.children.flatMap((c) => compileBlockNode(c, baseDoc, slots, ids, usedSlotIds));
    return [headingBlock, ...childBlocks];
  }

  // 기본 텍스트 블록 (note 가 있으면 줄바꿈으로 덧붙임)
  const content = node.note && !node.sourceRef?.slotId ? `${node.text}\n${node.note}` : node.text;
  makeSlot(slots, sid, "본문", content, baseSlot);
  const textBlock: LayoutBlock = {
    blockId: ids.next("blk_txt"),
    kind: "text",
    title: node.text.slice(0, 28) || "텍스트",
    slotId: sid,
    align: "left",
  };
  const extra = node.children.flatMap((c) => compileBlockNode(c, baseDoc, slots, ids, usedSlotIds));
  return [textBlock, ...extra];
}

function compilePageNode(
  pageNode: WorkingOutlineNode,
  pageNumber: number,
  baseDoc: VDocDocument | undefined,
  slots: Record<string, VDocSlot>,
  ids: IdCounter,
  usedSlotIds: Set<string>
): VDocPage {
  const basePage = findBasePage(baseDoc, pageNode.sourceRef?.pageId);
  const pageId = basePage?.pageId || ids.next("page");
  const headerSlotId = basePage?.headerSlotId || sectionSlotId(pageId, "header");
  const footerSlotId = basePage?.footerSlotId || sectionSlotId(pageId, "footer");

  makeSlot(slots, headerSlotId, "머리말", "", baseDoc?.slots[headerSlotId]);
  makeSlot(slots, footerSlotId, "바닥글", "", baseDoc?.slots[footerSlotId]);

  const blocks = pageNode.children.flatMap((child) =>
    compileBlockNode(child, baseDoc, slots, ids, usedSlotIds)
  );

  if (basePage) {
    return {
      ...cloneJson(basePage),
      pageNumber,
      pageLabel: pageNode.text || basePage.pageLabel,
      headerSlotId,
      footerSlotId,
      blocks,
    };
  }

  return {
    pageId,
    pageNumber,
    pageLabel: pageNode.text || `새 페이지 ${pageNumber}`,
    headerSlotId,
    footerSlotId,
    blocks,
  };
}

export function compileOutlineToPreview(
  outline: WorkingOutlineDocument,
  baseDocs: readonly VDocDocument[],
  opts?: { projectTitle?: string }
): VDocDocument[] {
  const baseById = new Map(baseDocs.map((d) => [d.docId, d]));
  const ids = new IdCounter();
  const now = new Date().toISOString();

  // 루트에 document 노드가 없으면 전체를 단일 기본 문서로 감싸 제로 베이스를 지원한다.
  const docNodes: WorkingOutlineNode[] = outline.nodes.some((n) => n.elementKind === "document")
    ? outline.nodes
    : [
      {
        nodeId: "wo-doc-default",
        text: opts?.projectTitle || "새 문서",
        elementKind: "document",
        children: outline.nodes,
      },
    ];

  const compiledDocs: VDocDocument[] = [];

  for (const docNode of docNodes) {
    if (docNode.elementKind !== "document") continue;
    const targetDocId = docNode.sourceRef?.docId;
    const baseDoc = targetDocId ? baseById.get(targetDocId) : baseDocs[0];
    const docId = baseDoc?.docId || targetDocId || ids.next("vdoc");
    const slots: Record<string, VDocSlot> = {};
    const usedSlotIds = new Set<string>();

    // 문서 직속 자식이 page 가 아니면 기본 페이지 하나로 묶는다.
    const pageNodes: WorkingOutlineNode[] = [];
    let looseBuffer: WorkingOutlineNode[] = [];
    const flushLoose = () => {
      if (looseBuffer.length === 0) return;
      pageNodes.push({
        nodeId: ids.next("wo_page"),
        text: "본문",
        elementKind: "page",
        children: looseBuffer,
      });
      looseBuffer = [];
    };

    for (const child of docNode.children) {
      if (child.elementKind === "page") {
        flushLoose();
        pageNodes.push(child);
      } else {
        looseBuffer.push(child);
      }
    }
    flushLoose();

    if (pageNodes.length === 0) {
      pageNodes.push({
        nodeId: ids.next("wo_page"),
        text: "페이지 1",
        elementKind: "page",
        children: [],
      });
    }

    const pages = pageNodes.map((pNode, idx) =>
      compilePageNode(pNode, idx + 1, baseDoc, slots, ids, usedSlotIds)
    );

    compiledDocs.push({
      version: "1.0.0",
      docId,
      title: docNode.text || baseDoc?.title || "새 문서",
      status: baseDoc?.status ?? "Draft",
      updatedAt: now,
      variables: baseDoc ? cloneJson(baseDoc.variables) : {},
      pages,
      slots,
      backdata: baseDoc ? cloneJson(baseDoc.backdata) : {},
      ...(baseDoc?.preview ? { preview: cloneJson(baseDoc.preview) } : null),
      ...(baseDoc?.evidenceLinks ? { evidenceLinks: cloneJson(baseDoc.evidenceLinks) } : null),
      ...(baseDoc?.surface ? { surface: cloneJson(baseDoc.surface) } : null),
      ...(baseDoc?.genre ? { genre: baseDoc.genre } : null),
      ...(baseDoc?.origin ? { origin: baseDoc.origin } : null),
      revision: baseDoc?.revision,
      projectId: outline.projectId,
    });
  }

  return compiledDocs;
}

