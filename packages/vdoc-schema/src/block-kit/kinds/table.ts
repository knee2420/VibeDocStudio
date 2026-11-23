import { isBlockLocked } from "../../block-ops";
import type { LayoutBlock, StructuredTableBlockDef } from "../../types";
import { defineBlockKind, type SceneGraphNode } from "../contract";
import { getBlockKind } from "../registry";
import { makeSlot } from "./shared";
import { summaryItemSlotIds } from "./summary";

function nestedBlockSlotIds(blocks: readonly LayoutBlock[] | undefined): string[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks.flatMap((nb) => getBlockKind(nb.kind).slotIds(nb));
}

function isTopRowHeader(b: StructuredTableBlockDef): boolean {
  const firstRow = b.rows[0];
  return Boolean(firstRow && firstRow.cells.length > 0 && firstRow.cells.every((c) => Boolean(c.isHeader)));
}

function formatTableRatioBadge(b: StructuredTableBlockDef): string {
  const widths = b.columnWidths;
  if (widths.length === 2) {
    const a = Number.parseFloat(widths[0]);
    const c = Number.parseFloat(widths[1]);
    if (Number.isFinite(a) && Number.isFinite(c) && Math.abs(a - c) > 1) {
      return `${Math.round(a)}:${Math.round(c)}`;
    }
  }
  return `${b.rows.length}×${widths.length}`;
}

/** 표 (행 · 열 · 병합 칸 · 재귀 블록 셀, 아래 합계 줄). */
export const tableBlock = defineBlockKind<StructuredTableBlockDef>({
  kinds: ["structured-table", "table"],
  label: "표",
  category: "table",
  icon: "table",
  outlineTag: (b) => (isTopRowHeader(b) ? "<<view:table:header>>" : "<<view:table>>"),
  slotIds: (b) => [
    ...b.rows.flatMap((r) =>
      r.cells.flatMap((c) => [c.slotId, ...nestedBlockSlotIds(c.blocks)])
    ),
    ...summaryItemSlotIds(b.footerSummary?.items ?? []),
  ],
  sceneNode: (b, ctx) => {
    const rowTag = ctx.resolveTag("table", "row-container", "<<row>>");
    const cellTag = ctx.resolveTag("table", "cell-container", "<<cell>>");
    const locked = isBlockLocked(b, ctx.slots);
    const hidden = ctx.hiddenBlockIds.has(b.blockId);

    const rowNodes: SceneGraphNode[] = b.rows.map((row, rIdx) => {
      const rowIsHeader = row.cells.length > 0 && row.cells.every((c) => Boolean(c.isHeader));
      const firstCellText = row.cells
        .map((c) => ctx.plainText(c.slotId))
        .find((t) => t.length > 0);
      const rowLabel = firstCellText
        ? `${rIdx + 1}행 · ${firstCellText.slice(0, 24)}`
        : `${rIdx + 1}행`;

      const cellNodes: SceneGraphNode[] = row.cells.map((cell, cIdx) => {
        const hasNestedBlocks = Boolean(cell.blocks && cell.blocks.length > 0);
        if (hasNestedBlocks && cell.blocks) {
          const nestedChildren = cell.blocks.map((nb) => ctx.compileBlock(nb));
          // Name the container cell using its sibling label cell if column > 0 (e.g. `법률` -> `법률 · 셀`)
          const prevLabelText = cIdx > 0 ? ctx.plainText(row.cells[cIdx - 1]?.slotId) : "";
          const cellLabel = prevLabelText ? `${prevLabelText} 셀` : `셀 (${rIdx + 1},${cIdx + 1})`;
          return {
            id: cell.cellId,
            role: "cell",
            outlineTag: cellTag,
            label: cellLabel,
            icon: "square",
            badge: `${nestedChildren.length}`,
            selectBlockId: b.blockId,
            selectSlotId: cell.slotId,
            active: cell.slotId === ctx.selectedSlotId,
            children: nestedChildren,
          };
        }

        const plain = ctx.plainText(cell.slotId);
        const slot = ctx.slots[cell.slotId];
        return {
          id: cell.cellId,
          role: "cell",
          label: plain ? plain.slice(0, 36) : slot?.label || `빈 칸 (${rIdx + 1},${cIdx + 1})`,
          icon: cell.isHeader ? "heading" : "type",
          badge: cell.isHeader ? "TH" : undefined,
          selectBlockId: b.blockId,
          selectSlotId: cell.slotId,
          locked: Boolean(slot?.constraints?.locked),
          active: cell.slotId === ctx.selectedSlotId,
        };
      });

      return {
        id: row.rowId,
        role: "row",
        outlineTag: rowTag,
        label: rowLabel,
        icon: "rows",
        badge: rowIsHeader ? "Header" : undefined,
        selectBlockId: b.blockId,
        children: cellNodes,
      };
    });

    return {
      id: b.blockId,
      role: "block",
      outlineTag: isTopRowHeader(b) ? "<<view:table:header>>" : "<<view:table>>",
      label: b.title || "표",
      icon: "table",
      badge: b.frame ? "2D" : formatTableRatioBadge(b),
      selectBlockId: b.blockId,
      sourceNodeId: b.sourceNodeId,
      isBlock: true,
      locked,
      hidden,
      active: b.blockId === ctx.selectedBlockId,
      children: rowNodes,
    };
  },
  outline: (b, ctx) => ctx.emitTable(b),
  tables: (b) => [{ sectionId: null, title: b.title, table: b }],
  replaceTable: (b, _sectionId, table) => ({ ...b, ...table }) as StructuredTableBlockDef,
  layout: { ownGrip: true },
  insertable: {
    label: "표",
    description: "행/열 데이터 테이블",
    order: 3,
    shortcut: 3,
    defaultFrameHeight: 140,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const h1 = makeSlot(slots, `slot_th1_${suffix}`, "표 헤더 1", "<p>항목</p>", []);
      const h2 = makeSlot(slots, `slot_th2_${suffix}`, "표 헤더 2", "<p>내용</p>", []);
      const c1 = makeSlot(slots, `slot_tc1_${suffix}`, "표 1행 1열", "<p></p>", defaultBackdataRefs);
      const c2 = makeSlot(slots, `slot_tc2_${suffix}`, "표 1행 2열", "<p></p>", defaultBackdataRefs);
      return {
        block: {
          blockId: `blk_tbl_${suffix}`,
          kind: "structured-table",
          title: "표",
          columnWidths: ["32%", "68%"],
          borderRules: { outer: "1px solid #eaeaea", rowBottom: "1px solid #eaeaea", vertical: "1px solid #eaeaea" },
          headerStyle: { bg: "#f5f5f6", fontWeight: "600", padding: "8px" },
          cellPadding: "8px",
          rows: [
            {
              rowId: `r_h_${suffix}`,
              cells: [
                { cellId: `ch1_${suffix}`, slotId: h1, isHeader: true, hAlign: "center", vAlign: "middle" },
                { cellId: `ch2_${suffix}`, slotId: h2, isHeader: true, hAlign: "center", vAlign: "middle" },
              ],
            },
            {
              rowId: `r_1_${suffix}`,
              cells: [
                { cellId: `cc1_${suffix}`, slotId: c1, vAlign: "middle" },
                { cellId: `cc2_${suffix}`, slotId: c2, vAlign: "middle" },
              ],
            },
          ],
        },
        slots,
        focusSlotId: c1,
      };
    },
  },
  ai: { describe: (b) => [`열 너비: ${b.columnWidths.join(" / ")}`] },
});
