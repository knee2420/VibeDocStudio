import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Columns3,
  MoveHorizontal,
  PanelLeft,
  PanelTop,
  Rows3,
  Table,
  TableCellsMerge,
  Trash2,
} from "lucide-react";

import {
  expandRangeToCells,
  formatPercents,
  getTableCellPlacements,
  isColumnHeader,
  isRowHeader,
  MIN_COLUMN_PERCENT,
  MIN_TABLE_WIDTH_RATIO,
  type TableBorderRules,
  type TableCellRange,
  type TableCellSlotDef,
  type TableCommand,
  type TableGridPos,
  type TableHeaderStyle,
  type TableModel,
} from "@vibe/vdoc-schema";

import { ACCENT, AFFORDANCE_BORDER, ADD_ICON_COLOR, GRIP_COLOR, MENU_SHADOW } from "./tokens";

export interface TableSelectionInfo {
  range: TableCellRange | null;
  tableSelected: boolean;
}

export interface InteractiveTableProps {
  table: TableModel;
  borderRules?: TableBorderRules;
  headerStyle?: TableHeaderStyle;
  cellPadding?: string;
  defaultVAlign?: "top" | "middle" | "bottom";
  /** Rounded outer frame (structured-table look); composite frames draw their own outer border. */
  roundedOuter?: boolean;
  editable: boolean;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onCommand: (cmd: TableCommand) => void;
  onDeleteTable: () => void;
  onSelectionChange?: (info: TableSelectionInfo | null) => void;
  /** Attached to the table-select grip so dragging it moves the whole block. */
  gripDragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  renderCell: (
    cell: TableCellSlotDef,
    opts: { hAlignClass: string; isHeaderRow: boolean }
  ) => React.ReactNode;
  footer?: React.ReactNode;
}

interface ContextMenuState {
  x: number;
  y: number;
  pos: TableGridPos;
  submenu: boolean;
}

type DragState =
  | { kind: "column"; index: number; startX: number; tableWidth: number; startWidths: number[] }
  | { kind: "width"; startX: number; startWidth: number; containerWidth: number };

const DEFAULT_RULES: TableBorderRules = {
  outer: "1px solid #cbd5e1",
  rowBottom: "1px solid #e2e8f0",
  vertical: "1px solid #e2e8f0",
};

const DEFAULT_HEADER: TableHeaderStyle = { fontWeight: "600", padding: "8px 10px" };

export const GripIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[9, 15].flatMap((cx) =>
      [5, 12, 19].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />)
    )}
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const MenuItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  trailing?: React.ReactNode;
  onHover?: () => void;
}> = ({ label, icon, onSelect, disabled, danger, trailing, onHover }) => (
  <div
    role="menuitem"
    aria-disabled={disabled || undefined}
    onPointerEnter={onHover}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onSelect();
    }}
    className={`flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] select-none ${
      disabled
        ? "text-slate-300 cursor-default"
        : `cursor-pointer hover:bg-neutral-100 ${danger ? "text-rose-600" : "text-gray-800"}`
    }`}
  >
    <span className="flex w-4 justify-center">{icon}</span>
    <span className="flex-1 whitespace-nowrap">{label}</span>
    {trailing}
  </div>
);

/**
 * Table renderer with the yesform click/hover affordances (`_dissections/yesform/04.affordances.md`):
 * focused-cell outline, table-select grip (click selects, drag moves the block), corner handles
 * (bottom-right resizes width), add row/column buttons, column border drag, drag or Shift+click
 * cell ranges, and the right-click table menu.
 */
export const InteractiveTable: React.FC<InteractiveTableProps> = ({
  table,
  borderRules = DEFAULT_RULES,
  headerStyle = DEFAULT_HEADER,
  cellPadding,
  defaultVAlign = "top",
  roundedOuter = true,
  editable,
  selectedSlotId,
  onSelectSlot,
  onCommand,
  onDeleteTable,
  onSelectionChange,
  gripDragProps,
  renderCell,
  footer,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const [hovered, setHovered] = useState(false);
  /** The caret/click is inside this table: affordances stay up after the mouse leaves (yesform). */
  const [active, setActive] = useState(false);
  const [nearRightEdge, setNearRightEdge] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const [range, setRange] = useState<TableCellRange | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewWidths, setPreviewWidths] = useState<number[] | null>(null);
  const [previewRatio, setPreviewRatio] = useState<number | null>(null);
  const selectingFrom = useRef<TableGridPos | null>(null);
  const previewWidthsRef = useRef<number[] | null>(null);
  const previewRatioRef = useRef<number | null>(null);
  previewWidthsRef.current = previewWidths;
  previewRatioRef.current = previewRatio;

  const placements = useMemo(() => getTableCellPlacements(table), [table]);
  const placementByCellId = useMemo(
    () => new Map(placements.map((p) => [p.cell.cellId, p])),
    [placements]
  );
  const columnCount = table.columnWidths.length;
  const columnPercents = useMemo(
    () => previewWidths ?? table.columnWidths.map((w) => parseFloat(w) || 100 / columnCount),
    [table.columnWidths, previewWidths, columnCount]
  );
  const widthRatio = previewRatio ?? table.tableWidthRatio ?? 1;
  const selectedRect = range ? expandRangeToCells(table, range) : null;
  const rangeIsMultiCell =
    selectedRect !== null &&
    placements.filter(
      (p) =>
        p.row >= selectedRect.r0 && p.row <= selectedRect.r1 &&
        p.col >= selectedRect.c0 && p.col <= selectedRect.c1
    ).length > 1;

  useEffect(() => {
    onSelectionChange?.(
      rangeIsMultiCell || tableSelected
        ? { range: rangeIsMultiCell ? range : null, tableSelected }
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIsMultiCell, tableSelected, range]);

  // Clicking outside clears the table/range selection; Escape closes everything.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest?.("[data-table-menu]")) return;
      setMenu(null);
      // Toolbar clicks keep the range so table-edit commands can apply to it.
      if (target.closest?.("[data-keep-table-selection]")) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setActive(false);
        setTableSelected(false);
        setRange(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setRange(null);
        setTableSelected(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Column border and corner-handle drags.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.kind === "column") {
        const deltaPct = ((e.clientX - drag.startX) / drag.tableWidth) * 100;
        const next = [...drag.startWidths];
        const pair = next[drag.index] + next[drag.index + 1];
        const left = Math.min(
          pair - MIN_COLUMN_PERCENT,
          Math.max(MIN_COLUMN_PERCENT, next[drag.index] + deltaPct)
        );
        next[drag.index] = left;
        next[drag.index + 1] = pair - left;
        setPreviewWidths(next);
      } else {
        const width = drag.startWidth + (e.clientX - drag.startX);
        setPreviewRatio(Math.min(1, Math.max(MIN_TABLE_WIDTH_RATIO, width / drag.containerWidth)));
      }
    };
    const onUp = () => {
      if (drag.kind === "column" && previewWidthsRef.current) {
        onCommand({ type: "setColumnWidths", widths: formatPercents(previewWidthsRef.current) });
      }
      if (drag.kind === "width" && previewRatioRef.current !== null) {
        onCommand({ type: "setWidthRatio", ratio: previewRatioRef.current });
      }
      setDrag(null);
      setPreviewWidths(null);
      setPreviewRatio(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onCommand]);

  const posFromTarget = (target: EventTarget | null): TableGridPos | null => {
    const td = (target as Element | null)?.closest?.("td[data-cell-id]");
    const p = td ? placementByCellId.get(td.getAttribute("data-cell-id") ?? "") : undefined;
    return p ? { row: p.row, col: p.col } : null;
  };

  const run = (cmd: TableCommand) => {
    onCommand(cmd);
    setMenu(null);
    setRange(null);
  };

  const showAffordances = editable && (hovered || active || tableSelected || drag !== null);
  const showAddColumn = editable && (tableSelected || nearRightEdge);
  const rowSep = borderRules.rowBottom || "1px solid #e2e8f0";
  const colSep = borderRules.vertical === "none" ? undefined : borderRules.vertical || "1px solid #e2e8f0";

  return (
    <div className="w-full">
      <div
        ref={rootRef}
        className="relative"
        style={{ width: `${widthRatio * 100}%` }}
        onPointerEnter={() => setHovered(true)}
        onPointerDownCapture={() => setActive(true)}
        onFocusCapture={() => setActive(true)}
        onPointerLeave={() => {
          setHovered(false);
          setNearRightEdge(false);
        }}
        onPointerMove={(e) => {
          const rect = tableRef.current?.getBoundingClientRect();
          if (rect) setNearRightEdge(e.clientX > rect.right - 40);
        }}
        onKeyDownCapture={(e) => {
          // Tab / Shift+Tab walk the cells in reading order; the last cell stays put (yesform).
          if (e.key !== "Tab" || !editable) return;
          const td = (e.target as Element).closest("td[data-cell-id]");
          const cells = [...(tableRef.current?.querySelectorAll("td[data-cell-id]") ?? [])];
          const next = cells[cells.indexOf(td as Element) + (e.shiftKey ? -1 : 1)];
          e.preventDefault();
          const editor = next?.querySelector<HTMLElement>("[contenteditable=true], [data-lazy-slot-editor]");
          if (!editor) return;
          editor.focus();
          const sel = window.getSelection();
          sel?.selectAllChildren(editor);
          sel?.collapseToEnd();
        }}
        onContextMenu={(e) => {
          if (!editable) return;
          const pos = posFromTarget(e.target);
          if (!pos) return;
          e.preventDefault();
          const inRange =
            selectedRect &&
            pos.row >= selectedRect.r0 && pos.row <= selectedRect.r1 &&
            pos.col >= selectedRect.c0 && pos.col <= selectedRect.c1;
          if (!inRange) setRange(null);
          setMenu({ x: e.clientX, y: e.clientY, pos, submenu: false });
        }}
      >
        <div
          className="w-full overflow-hidden"
          style={{
            border: borderRules.outer === "none" ? undefined : borderRules.outer || "1px solid #cbd5e1",
            borderRadius: roundedOuter && borderRules.outer && borderRules.outer !== "none" ? "6px" : undefined,
          }}
        >
          <table ref={tableRef} className="w-full border-collapse table-fixed">
            <colgroup>
              {columnPercents.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <tbody>
              {table.rows.map((row, rowIndex) => {
                const isHeaderRow = row.cells.some((c) => c.isHeader);
                return (
                  <tr key={row.rowId} style={{ height: row.height }}>
                    {row.cells.map((cell) => {
                      const placement = placementByCellId.get(cell.cellId);
                      const lastRow = placement
                        ? placement.row + placement.rowSpan >= table.rows.length
                        : rowIndex === table.rows.length - 1;
                      const lastCol = placement ? placement.col + placement.colSpan >= columnCount : false;
                      const vAlign = cell.vAlign ?? defaultVAlign;
                      const vAlignClass =
                        vAlign === "middle" ? "align-middle" : vAlign === "bottom" ? "align-bottom" : "align-top";
                      const hAlignClass =
                        cell.hAlign === "center" ? "text-center" : cell.hAlign === "right" ? "text-right" : "text-left";
                      const inRange =
                        rangeIsMultiCell && placement && selectedRect &&
                        placement.row >= selectedRect.r0 && placement.row <= selectedRect.r1 &&
                        placement.col >= selectedRect.c0 && placement.col <= selectedRect.c1;
                      const focused = editable && !rangeIsMultiCell && selectedSlotId === cell.slotId;
                      const headerTop = isHeaderRow && rowIndex === 0 ? borderRules.headerTop || headerStyle.borderTop : undefined;
                      const separator = isHeaderRow
                        ? borderRules.headerBottom || headerStyle.borderBottom || rowSep
                        : rowSep;
                      return (
                        <td
                          key={cell.cellId}
                          data-cell-id={cell.cellId}
                          data-slot-id={cell.slotId}
                          data-vdoc-unit={cell.slotId}
                          data-unit-kind="slot"
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                          onPointerDown={(e) => {
                            if (!editable || e.button !== 0 || !placement) return;
                            const pos = { row: placement.row, col: placement.col };
                            if (e.shiftKey) {
                              const anchor = placements.find((p) => p.cell.slotId === selectedSlotId);
                              if (anchor) {
                                e.preventDefault();
                                setRange({ anchor: { row: anchor.row, col: anchor.col }, head: pos });
                                return;
                              }
                            }
                            selectingFrom.current = pos;
                            setRange(null);
                            setTableSelected(false);
                          }}
                          onPointerEnter={(e) => {
                            const from = selectingFrom.current;
                            if (!from || !placement || (e.buttons & 1) === 0) return;
                            if (from.row === placement.row && from.col === placement.col) return;
                            window.getSelection()?.removeAllRanges();
                            setRange({ anchor: from, head: { row: placement.row, col: placement.col } });
                          }}
                          onPointerUp={() => {
                            selectingFrom.current = null;
                          }}
                          onClick={() => onSelectSlot(cell.slotId)}
                          style={{
                            padding:
                              cell.padding || cellPadding || (isHeaderRow ? headerStyle.padding || "8px 10px" : "8px 10px"),
                            borderTop: cell.borderTop ?? headerTop,
                            borderBottom: cell.borderBottom ?? (lastRow ? undefined : separator),
                            borderRight: cell.borderRight ?? (lastCol ? undefined : colSep),
                            borderLeft: cell.borderLeft,
                            backgroundColor:
                              cell.backgroundColor ||
                              (cell.isHeader
                                ? cell.whiteHeader
                                  ? "#ffffff"
                                  : headerStyle.bg || "#f1f5f9"
                                : "transparent"),
                            color: cell.color || (cell.isHeader ? headerStyle.textColor : undefined),
                            fontWeight: cell.fontWeight || (cell.isHeader ? headerStyle.fontWeight || "600" : undefined),
                            fontSize: cell.fontSize,
                            lineHeight: cell.lineHeight,
                            fontFamily: cell.fontFamily,
                            letterSpacing: cell.letterSpacing,
                          }}
                          className={`relative ${vAlignClass} ${hAlignClass} ${
                            focused
                              ? "after:pointer-events-none after:absolute after:-inset-px after:z-[3] after:border-2 after:border-[#0472e3] after:content-['']"
                              : ""
                          } ${
                            inRange
                              ? "after:pointer-events-none after:absolute after:inset-0 after:z-[3] after:bg-[#0472e3]/10 after:content-['']"
                              : ""
                          }`}
                        >
                          {renderCell(cell, { hAlignClass, isHeaderRow })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editable && tableSelected && (
          <div className="pointer-events-none absolute -inset-px z-[32] border-2" style={{ borderColor: ACCENT }} />
        )}

        {/* Column border drag handles: adjacent columns trade width, table width is kept. */}
        {editable &&
          columnPercents.slice(0, -1).map((_, i) => {
            const left = columnPercents.slice(0, i + 1).reduce((a, b) => a + b, 0);
            return (
              <div
                key={i}
                title="열 너비 조절"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const width = tableRef.current?.getBoundingClientRect().width ?? 1;
                  setDrag({ kind: "column", index: i, startX: e.clientX, tableWidth: width, startWidths: columnPercents });
                }}
                className="absolute top-0 bottom-0 z-[31] w-[7px] -translate-x-1/2 cursor-col-resize"
                style={{ left: `${left}%` }}
              />
            );
          })}

        {showAffordances && (
          <>
            <div
              title="표 선택"
              {...gripDragProps}
              onClick={(e) => {
                e.stopPropagation();
                setTableSelected(true);
                setRange(null);
              }}
              className="absolute top-0 -left-[30px] z-[33] flex h-4 w-[30px] cursor-pointer items-center justify-start transition-opacity duration-150"
              style={{ color: GRIP_COLOR }}
            >
              <GripIcon />
            </div>

            {(["tl", "tr", "bl", "br"] as const).map((corner) => (
              <div
                key={corner}
                onPointerDown={
                  corner === "br"
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = rootRef.current?.getBoundingClientRect();
                        const container = rootRef.current?.parentElement?.getBoundingClientRect();
                        if (rect && container) {
                          setDrag({ kind: "width", startX: e.clientX, startWidth: rect.width, containerWidth: container.width });
                        }
                      }
                    : undefined
                }
                className={`absolute z-[33] h-2.5 w-2.5 rounded-full border border-white ${
                  corner === "tl" || corner === "br" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                } ${corner[0] === "t" ? "-top-[5px]" : "-bottom-[5px]"} ${corner[1] === "l" ? "-left-[5px]" : "-right-[5px]"}`}
                style={{ backgroundColor: ACCENT }}
              />
            ))}

            <div className="absolute left-1/2 top-full z-[33] -translate-x-1/2 pt-[9px]">
              <button
                type="button"
                title="행 추가"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommand({ type: "addRowEnd" });
                }}
                className="flex h-6 w-[42px] cursor-pointer items-center justify-center rounded bg-white transition-colors duration-150 hover:bg-neutral-100"
                style={{ border: `1px solid ${AFFORDANCE_BORDER}`, color: ADD_ICON_COLOR }}
              >
                <PlusIcon />
              </button>
            </div>
          </>
        )}

        {showAddColumn && (
          <div className="absolute left-full top-1/2 z-[33] -translate-y-1/2 pl-[10px]">
            <button
              type="button"
              title="열 추가"
              onClick={(e) => {
                e.stopPropagation();
                onCommand({ type: "addColumnEnd" });
              }}
              className="flex h-[42px] w-6 cursor-pointer items-center justify-center rounded bg-white transition-colors duration-150 hover:bg-neutral-100"
              style={{ border: `1px solid ${AFFORDANCE_BORDER}`, color: ADD_ICON_COLOR }}
            >
              <PlusIcon />
            </button>
          </div>
        )}
      </div>

      {footer}

      {menu && (
        <div
          data-table-menu
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-[1000] w-[184px] rounded-lg border bg-white p-1"
          style={{ left: menu.x, top: menu.y, borderColor: AFFORDANCE_BORDER, boxShadow: MENU_SHADOW }}
        >
          <div className="relative">
            <MenuItem
              label="셀 삽입"
              icon={<Table className="w-4 h-4" />}
              onSelect={() => setMenu({ ...menu, submenu: !menu.submenu })}
              onHover={() => setMenu({ ...menu, submenu: true })}
              trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
            />
            {menu.submenu && (
              <div
                role="menu"
                className="absolute left-full top-0 ml-1 w-[160px] rounded-lg border bg-white p-1"
                style={{ borderColor: AFFORDANCE_BORDER, boxShadow: MENU_SHADOW }}
              >
                <MenuItem label="왼쪽에 삽입" icon={<ArrowLeft className="w-4 h-4" />} onSelect={() => run({ type: "insertColumn", at: menu.pos.col, side: "left" })} />
                <MenuItem label="오른쪽에 삽입" icon={<ArrowRight className="w-4 h-4" />} onSelect={() => run({ type: "insertColumn", at: menu.pos.col, side: "right" })} />
                <MenuItem label="위로 삽입" icon={<ArrowUp className="w-4 h-4" />} onSelect={() => run({ type: "insertRow", at: menu.pos.row, side: "above" })} />
                <MenuItem label="아래로 삽입" icon={<ArrowDown className="w-4 h-4" />} onSelect={() => run({ type: "insertRow", at: menu.pos.row, side: "below" })} />
              </div>
            )}
          </div>
          <div onPointerEnter={() => menu.submenu && setMenu({ ...menu, submenu: false })}>
            <MenuItem
              label="셀 병합"
              icon={<TableCellsMerge className="w-4 h-4" />}
              onSelect={() => range && run({ type: "mergeCells", range })}
              disabled={!rangeIsMultiCell}
            />
            <MenuItem
              label="열 너비 균등하게"
              icon={<MoveHorizontal className="w-4 h-4" />}
              onSelect={() => run({ type: "equalizeColumns" })}
              disabled={columnCount < 2}
            />
            <div className="my-1 border-t" style={{ borderColor: AFFORDANCE_BORDER }} />
            <MenuItem
              label={isRowHeader(table, menu.pos.row) ? "가로 헤더 해제" : "가로 헤더 추가"}
              icon={<PanelTop className="w-4 h-4" />}
              onSelect={() => run({ type: "toggleHeaderRow", at: menu.pos.row })}
            />
            <MenuItem
              label={isColumnHeader(table, menu.pos.col) ? "세로 헤더 해제" : "세로 헤더 추가"}
              icon={<PanelLeft className="w-4 h-4" />}
              onSelect={() => run({ type: "toggleHeaderColumn", at: menu.pos.col })}
            />
            <div className="my-1 border-t" style={{ borderColor: AFFORDANCE_BORDER }} />
            <MenuItem
              label="열 삭제"
              icon={<Columns3 className="w-4 h-4" />}
              onSelect={() => run({ type: "deleteColumn", at: menu.pos.col })}
              disabled={columnCount < 2}
            />
            <MenuItem
              label="행 삭제"
              icon={<Rows3 className="w-4 h-4" />}
              onSelect={() => run({ type: "deleteRow", at: menu.pos.row })}
              disabled={table.rows.length < 2}
            />
            <MenuItem
              label="삭제"
              icon={<Trash2 className="w-4 h-4" />}
              onSelect={() => {
                setMenu(null);
                onDeleteTable();
              }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
};
