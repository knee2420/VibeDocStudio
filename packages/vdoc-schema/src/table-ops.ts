import type { LayoutBlock, TableCellSlotDef, VDocSlot } from "./types";

/**
 * Pure table mutations for `structured-table` / `table` blocks.
 * Mirrors the yesform editor's table affordances dissected in `_dissections/yesform/04.affordances.md`:
 * add row/column buttons, cell insert ▸ (4 directions), merge, equal column widths,
 * header row/column toggle, row/column delete, column border drag and corner width drag.
 */

export type StructuredTableBlock = Extract<
  LayoutBlock,
  { kind: "structured-table" | "table" }
>;

/** The part of a table both `structured-table` blocks and `composite-form-frame` sections share. */
export interface TableModel {
  title: string;
  columnWidths: string[];
  tableWidthRatio?: number;
  rows: { rowId: string; height?: string; cells: TableCellSlotDef[] }[];
}

export interface TableGridPos {
  row: number;
  col: number;
}

export interface TableCellRange {
  anchor: TableGridPos;
  head: TableGridPos;
}

export type TableCommand =
  | { type: "addRowEnd" }
  | { type: "addColumnEnd" }
  | { type: "insertRow"; at: number; side: "above" | "below" }
  | { type: "insertColumn"; at: number; side: "left" | "right" }
  | { type: "deleteRow"; at: number }
  | { type: "deleteColumn"; at: number }
  | { type: "mergeCells"; range: TableCellRange }
  | { type: "equalizeColumns" }
  | { type: "toggleHeaderRow"; at: number }
  | { type: "toggleHeaderColumn"; at: number }
  | { type: "setColumnWidths"; widths: string[] }
  | { type: "setWidthRatio"; ratio: number }
  | { type: "setCellBackground"; range: TableCellRange; color: string | null }
  | { type: "setBorders"; range: TableCellRange; mode: TableBorderMode; line: string };

/** yesform `표 편집` border buttons, in their panel order. */
export type TableBorderMode =
  | "all"
  | "inner"
  | "innerH"
  | "innerV"
  | "outer"
  | "left"
  | "top"
  | "right"
  | "bottom"
  | "none";

/** yesform `표 선 종류` options mapped to CSS border shorthands (color appended by the caller). */
export const TABLE_LINE_STYLES: { id: string; label: string; css: string }[] = [
  { id: "none", label: "선 없음", css: "hidden" },
  { id: "solid", label: "실선", css: "1px solid" },
  { id: "dashed", label: "파선", css: "1px dashed" },
  { id: "dashed-bold", label: "굵은 파선", css: "2px dashed" },
  { id: "dotted", label: "점선", css: "1px dotted" },
  { id: "solid-bold", label: "굵은 실선", css: "2px solid" },
  { id: "double", label: "두 줄", css: "3px double" },
  { id: "double-bold", label: "굵은 두 줄", css: "5px double" },
];

export interface TableCellPlacement {
  cell: TableCellSlotDef;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

type RowDef = TableModel["rows"][number];

/** Dense grid: `owner[r][c]` is the cellId covering that grid position. */
interface DenseTable {
  owner: string[][];
  cells: Map<string, TableCellSlotDef>;
  rowMeta: Omit<RowDef, "cells">[];
}

export const MIN_COLUMN_PERCENT = 3;
export const MIN_TABLE_WIDTH_RATIO = 0.2;

function toDense(block: TableModel): DenseTable {
  const owner: string[][] = block.rows.map(() => []);
  const cells = new Map<string, TableCellSlotDef>();
  block.rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (owner[r][c] !== undefined) c++;
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      cells.set(cell.cellId, cell);
      for (let dr = 0; dr < rowSpan && r + dr < owner.length; dr++) {
        for (let dc = 0; dc < colSpan; dc++) owner[r + dr][c + dc] = cell.cellId;
      }
      c += colSpan;
    }
  });
  const colCount = Math.max(block.columnWidths.length, ...owner.map((o) => o.length));
  // Pad ragged rows so every grid position has an owner.
  owner.forEach((o, r) => {
    for (let c = 0; c < colCount; c++) {
      if (o[c] === undefined) o[c] = `__hole_${r}_${c}`;
    }
  });
  return {
    owner,
    cells,
    rowMeta: block.rows.map(({ cells: _cells, ...meta }) => meta),
  };
}

function fromDense(dense: DenseTable): RowDef[] {
  const extents = new Map<string, { r0: number; c0: number; r1: number; c1: number }>();
  dense.owner.forEach((o, r) =>
    o.forEach((id, c) => {
      const e = extents.get(id);
      if (!e) extents.set(id, { r0: r, c0: c, r1: r, c1: c });
      else {
        e.r1 = Math.max(e.r1, r);
        e.c1 = Math.max(e.c1, c);
      }
    })
  );
  return dense.rowMeta.map((meta, r) => {
    const rowCells: TableCellSlotDef[] = [];
    dense.owner[r]?.forEach((id, c) => {
      const e = extents.get(id);
      const cell = dense.cells.get(id);
      if (!e || !cell || e.r0 !== r || e.c0 !== c) return;
      const rowSpan = e.r1 - e.r0 + 1;
      const colSpan = e.c1 - e.c0 + 1;
      const { rowSpan: _rs, colSpan: _cs, ...rest } = cell;
      rowCells.push({
        ...rest,
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
      });
    });
    return { ...meta, cells: rowCells };
  });
}

/** Grid placement of every cell (origin row/col and spans), for hit-testing and menus. */
export function getTableCellPlacements(block: TableModel): TableCellPlacement[] {
  const dense = toDense(block);
  const rows = fromDense(dense);
  const placements: TableCellPlacement[] = [];
  const seen = new Set<string>();
  dense.owner.forEach((o, r) =>
    o.forEach((id, c) => {
      if (seen.has(id)) return;
      seen.add(id);
      const cell = rows[r]?.cells.find((x) => x.cellId === id);
      if (cell) {
        placements.push({
          cell,
          row: r,
          col: c,
          rowSpan: cell.rowSpan ?? 1,
          colSpan: cell.colSpan ?? 1,
        });
      }
    })
  );
  return placements;
}

export function getTableColumnCount(block: TableModel): number {
  return toDense(block).owner[0]?.length ?? block.columnWidths.length;
}

export function normalizeRange(range: TableCellRange) {
  return {
    r0: Math.min(range.anchor.row, range.head.row),
    r1: Math.max(range.anchor.row, range.head.row),
    c0: Math.min(range.anchor.col, range.head.col),
    c1: Math.max(range.anchor.col, range.head.col),
  };
}

/**
 * Expands a range until no spanning cell crosses its border, like ProseMirror CellSelection.
 */
export function expandRangeToCells(block: TableModel, range: TableCellRange) {
  const { owner } = toDense(block);
  let { r0, r1, c0, c1 } = normalizeRange(range);
  let changed = true;
  while (changed) {
    changed = false;
    const inside = new Set<string>();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) inside.add(owner[r]?.[c]);
    owner.forEach((o, r) =>
      o.forEach((id, c) => {
        if (!inside.has(id)) return;
        if (r < r0) { r0 = r; changed = true; }
        if (r > r1) { r1 = r; changed = true; }
        if (c < c0) { c0 = c; changed = true; }
        if (c > c1) { c1 = c; changed = true; }
      })
    );
  }
  return { r0, r1, c0, c1 };
}

export function isRowHeader(block: TableModel, row: number): boolean {
  const placements = getTableCellPlacements(block).filter((p) => p.row === row);
  return placements.length > 0 && placements.every((p) => p.cell.isHeader);
}

export function isColumnHeader(block: TableModel, col: number): boolean {
  const placements = getTableCellPlacements(block).filter((p) => p.col === col);
  return placements.length > 0 && placements.every((p) => p.cell.isHeader);
}

function parsePercents(widths: string[], count: number): number[] {
  const nums = Array.from({ length: count }, (_, i) => {
    const v = parseFloat(widths[i] ?? "");
    return Number.isFinite(v) && v > 0 ? v : 100 / count;
  });
  const total = nums.reduce((a, b) => a + b, 0);
  return nums.map((n) => (n / total) * 100);
}

export function formatPercents(nums: number[]): string[] {
  const total = nums.reduce((a, b) => a + b, 0) || 1;
  return nums.map((n) => `${Math.round((n / total) * 10000) / 100}%`);
}

interface ApplyContext {
  slots: Record<string, VDocSlot>;
  newId: () => string;
}

function createCell(
  ctx: ApplyContext,
  block: TableModel,
  ref: TableCellSlotDef | undefined,
  isHeader: boolean
): TableCellSlotDef {
  const id = ctx.newId();
  const slotId = `slot_cell_${id}`;
  ctx.slots[slotId] = {
    slotId,
    label: `${block.title} 셀`,
    role: "editable-slot",
    content: "<p></p>",
    backDataRefs: [],
  };
  return {
    cellId: `cell_${id}`,
    slotId,
    ...(isHeader ? { isHeader: true } : {}),
    ...(ref?.hAlign ? { hAlign: ref.hAlign } : {}),
    ...(ref?.vAlign ? { vAlign: ref.vAlign } : {}),
  };
}

function insertRow(ctx: ApplyContext, block: TableModel, dense: DenseTable, index: number, refRow: number) {
  const cols = dense.owner[0]?.length ?? 0;
  const newRow: string[] = [];
  for (let c = 0; c < cols; c++) {
    const above = dense.owner[index - 1]?.[c];
    const below = dense.owner[index]?.[c];
    if (above !== undefined && above === below) {
      newRow.push(above); // a rowspan crossing the insert line just grows
      continue;
    }
    const refId = dense.owner[refRow]?.[c];
    const ref = refId ? dense.cells.get(refId) : undefined;
    const headerColumn = dense.owner.every((o) => dense.cells.get(o[c])?.isHeader);
    const cell = createCell(ctx, block, ref, headerColumn);
    dense.cells.set(cell.cellId, cell);
    newRow.push(cell.cellId);
  }
  dense.owner.splice(index, 0, newRow);
  dense.rowMeta.splice(index, 0, { rowId: `row_${ctx.newId()}` });
}

function insertColumn(ctx: ApplyContext, block: TableModel, dense: DenseTable, index: number, refCol: number) {
  dense.owner.forEach((o) => {
    const left = o[index - 1];
    const right = o[index];
    if (left !== undefined && left === right) {
      o.splice(index, 0, left); // a colspan crossing the insert line just grows
      return;
    }
    const ref = dense.cells.get(o[refCol]);
    const headerRow = o.every((id) => dense.cells.get(id)?.isHeader);
    const cell = createCell(ctx, block, ref, headerRow);
    dense.cells.set(cell.cellId, cell);
    o.splice(index, 0, cell.cellId);
  });
}

function removeOrphanSlots(ctx: ApplyContext, before: DenseTable, after: DenseTable) {
  const alive = new Set(after.owner.flat());
  for (const [id, cell] of before.cells) {
    if (!alive.has(id)) delete ctx.slots[cell.slotId];
  }
}

/**
 * Applies a table command and returns the next block and slot map (both new objects).
 * Returns `null` when the command does not apply (e.g. deleting the last row).
 */
export function applyTableCommand<T extends TableModel>(
  block: T,
  slots: Record<string, VDocSlot>,
  cmd: TableCommand,
  newId: () => string
): { block: T; slots: Record<string, VDocSlot> } | null {
  const ctx: ApplyContext = { slots: { ...slots }, newId };
  const dense = toDense(block);
  const before: DenseTable = { ...dense, owner: dense.owner.map((o) => [...o]), cells: new Map(dense.cells) };
  const rowCount = dense.owner.length;
  const colCount = dense.owner[0]?.length ?? 0;
  let widths = parsePercents(block.columnWidths, colCount);

  switch (cmd.type) {
    case "addRowEnd":
      insertRow(ctx, block, dense, rowCount, rowCount - 1);
      break;
    case "insertRow":
      insertRow(ctx, block, dense, cmd.side === "above" ? cmd.at : cmd.at + 1, cmd.at);
      break;
    case "addColumnEnd":
    case "insertColumn": {
      const at = cmd.type === "addColumnEnd" ? colCount - 1 : cmd.at;
      const index = cmd.type === "addColumnEnd" || cmd.side === "right" ? at + 1 : at;
      insertColumn(ctx, block, dense, index, at);
      // The new column copies its neighbour's width; the table width stays the same.
      widths.splice(index, 0, widths[at] ?? 100 / (colCount + 1));
      break;
    }
    case "deleteRow":
      if (rowCount <= 1) return null;
      dense.owner.splice(cmd.at, 1);
      dense.rowMeta.splice(cmd.at, 1);
      break;
    case "deleteColumn":
      if (colCount <= 1) return null;
      dense.owner.forEach((o) => o.splice(cmd.at, 1));
      widths.splice(cmd.at, 1);
      break;
    case "mergeCells": {
      const { r0, r1, c0, c1 } = expandRangeToCells(block, cmd.range);
      const target = dense.owner[r0][c0];
      const merged: string[] = [];
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = dense.owner[r][c];
          if (id !== target && !merged.includes(id)) merged.push(id);
          dense.owner[r][c] = target;
        }
      }
      if (merged.length === 0) return null;
      const targetSlot = ctx.slots[dense.cells.get(target)!.slotId];
      const extra = merged
        .map((id) => ctx.slots[dense.cells.get(id)?.slotId ?? ""]?.content ?? "")
        .filter((html) => html.replace(/<[^>]*>/g, "").trim() !== "");
      if (targetSlot && extra.length > 0) {
        ctx.slots[targetSlot.slotId] = { ...targetSlot, content: targetSlot.content + extra.join("") };
      }
      break;
    }
    case "equalizeColumns":
      widths = widths.map(() => 100 / colCount);
      break;
    case "toggleHeaderRow": {
      const on = !isRowHeader(block, cmd.at);
      new Set(dense.owner[cmd.at]).forEach((id) => {
        const cell = dense.cells.get(id);
        if (cell) dense.cells.set(id, { ...cell, isHeader: on || undefined });
      });
      break;
    }
    case "toggleHeaderColumn": {
      const on = !isColumnHeader(block, cmd.at);
      new Set(dense.owner.map((o) => o[cmd.at])).forEach((id) => {
        const cell = dense.cells.get(id);
        if (cell) dense.cells.set(id, { ...cell, isHeader: on || undefined });
      });
      break;
    }
    case "setCellBackground":
    case "setBorders": {
      const { r0, r1, c0, c1 } = expandRangeToCells(block, cmd.range);
      for (const p of getTableCellPlacements(block)) {
        const pr1 = p.row + p.rowSpan - 1;
        const pc1 = p.col + p.colSpan - 1;
        if (p.row < r0 || pr1 > r1 || p.col < c0 || pc1 > c1) continue;
        const cell = dense.cells.get(p.cell.cellId);
        if (!cell) continue;
        if (cmd.type === "setCellBackground") {
          dense.cells.set(cell.cellId, { ...cell, backgroundColor: cmd.color ?? undefined });
          continue;
        }
        const edge = {
          top: p.row === r0,
          bottom: pr1 === r1,
          left: p.col === c0,
          right: pc1 === c1,
        };
        const pick: Record<"top" | "right" | "bottom" | "left", boolean> = {
          all: { top: true, right: true, bottom: true, left: true },
          none: { top: true, right: true, bottom: true, left: true },
          outer: edge,
          inner: { top: !edge.top, right: !edge.right, bottom: !edge.bottom, left: !edge.left },
          innerH: { top: !edge.top, right: false, bottom: !edge.bottom, left: false },
          innerV: { top: false, right: !edge.right, bottom: false, left: !edge.left },
          left: { top: false, right: false, bottom: false, left: edge.left },
          top: { top: edge.top, right: false, bottom: false, left: false },
          right: { top: false, right: edge.right, bottom: false, left: false },
          bottom: { top: false, right: false, bottom: edge.bottom, left: false },
        }[cmd.mode];
        const line = cmd.mode === "none" ? "hidden" : cmd.line;
        dense.cells.set(cell.cellId, {
          ...cell,
          ...(pick.top ? { borderTop: line } : {}),
          ...(pick.right ? { borderRight: line } : {}),
          ...(pick.bottom ? { borderBottom: line } : {}),
          ...(pick.left ? { borderLeft: line } : {}),
        });
      }
      break;
    }
    case "setColumnWidths":
      return { block: { ...block, columnWidths: cmd.widths }, slots };
    case "setWidthRatio": {
      const ratio = Math.min(1, Math.max(MIN_TABLE_WIDTH_RATIO, cmd.ratio));
      return { block: { ...block, tableWidthRatio: ratio >= 0.999 ? undefined : ratio }, slots };
    }
  }

  removeOrphanSlots(ctx, before, dense);
  return {
    block: { ...block, columnWidths: formatPercents(widths), rows: fromDense(dense) },
    slots: ctx.slots,
  };
}
