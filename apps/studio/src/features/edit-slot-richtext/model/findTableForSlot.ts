import {
  getTableCellPlacements,
  type TableCellRange,
  type TableModel,
  type VDocDocument,
} from "@vibe/vdoc-schema";

export interface TableLocation {
  pageId: string;
  blockId: string;
  sectionId: string | null;
  table: TableModel;
}

function eachTable(doc: VDocDocument, visit: (loc: TableLocation) => boolean): TableLocation | null {
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const tables: { sectionId: string | null; table: TableModel }[] =
        block.kind === "structured-table" || block.kind === "table"
          ? [{ sectionId: null, table: block }]
          : block.kind === "composite-form-frame"
            ? block.sections.map((s) => ({ sectionId: s.sectionId, table: s }))
            : [];
      for (const t of tables) {
        const loc = { pageId: page.pageId, blockId: block.blockId, ...t };
        if (visit(loc)) return loc;
      }
    }
  }
  return null;
}

/** The table (or composite section) whose cell holds `slotId`, plus that cell's grid range. */
export function findTableForSlot(
  doc: VDocDocument,
  slotId: string
): (TableLocation & { cellRange: TableCellRange }) | null {
  let cellRange: TableCellRange | null = null;
  const loc = eachTable(doc, ({ table }) => {
    const p = getTableCellPlacements(table).find((pl) => pl.cell.slotId === slotId);
    if (!p) return false;
    cellRange = {
      anchor: { row: p.row, col: p.col },
      head: { row: p.row + p.rowSpan - 1, col: p.col + p.colSpan - 1 },
    };
    return true;
  });
  return loc && cellRange ? { ...loc, cellRange } : null;
}

export function findTable(doc: VDocDocument, blockId: string, sectionId: string | null): TableLocation | null {
  return eachTable(doc, (loc) => loc.blockId === blockId && loc.sectionId === sectionId);
}

export function wholeTableRange(table: TableModel): TableCellRange {
  return {
    anchor: { row: 0, col: 0 },
    head: { row: table.rows.length - 1, col: table.columnWidths.length - 1 },
  };
}
