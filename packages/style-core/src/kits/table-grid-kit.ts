/**
 * @vibe/style-core/kits — Table Grid Kit (직교 4변 외곽선 · 내부 격자 · 열린 셀 역할 맵 해석).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridBorderMatrix } from "../core/grid-contract";
import type {
  CellStyleDef,
  ResolvedStylePack,
  StyleOverrideDelta,
  TableStyleDef,
} from "../core/token-contract";

export interface ResolvedTableBorders {
  outer: string;
  outerTop: string;
  outerRight: string;
  outerBottom: string;
  outerLeft: string;
  headerTop: string;
  headerBottom: string;
  rowBottom: string;
  vertical: string;
  radius: string;
}

export interface ResolvedTableGrid {
  borders: ResolvedTableBorders;
  headerFill: string;
  headerTextColor: string;
  headerFontWeight: string;
  headerFontSize: string;
  headerLetterSpacing: string;
  zebraFill: string;
  cellPadding: string;
  radius: string;
  autoFormHeader: boolean;
  columnWidths?: string[];
  cells: Record<string, CellStyleDef>;
}

function mergeCells(
  ...maps: readonly (Record<string, CellStyleDef> | undefined)[]
): Record<string, CellStyleDef> {
  const out: Record<string, CellStyleDef> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [role, def] of Object.entries(map)) {
      out[role] = out[role] ? { ...out[role], ...def } : { ...def };
    }
  }
  return out;
}

export function resolveTableGridStyle(
  resolvedPack: ResolvedStylePack,
  styleKey = "default",
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedTableGrid {
  // 우선순위: default/base binding < 명시적 styles.table[styleKey] < sectionOverride < instanceOverride
  const baseBinding = resolveCascadedStyle(resolvedPack, "structured-table").table;
  const variantBinding =
    styleKey && styleKey !== "default"
      ? resolveCascadedStyle(resolvedPack, `structured-table[styleKey=${styleKey}]`).table
      : {};
  const direct: TableStyleDef =
    resolvedPack.styles.table[styleKey] ??
    (styleKey === "default" ? resolvedPack.styles.table.default : undefined) ??
    {};
  const overrides = {
    ...sectionOverride?.table,
    ...instanceOverride?.table,
  };

  const borders: GridBorderMatrix = {
    ...baseBinding.borders,
    ...variantBinding.borders,
    ...direct.borders,
    ...sectionOverride?.table?.borders,
    ...instanceOverride?.table?.borders,
  };

  const outerFallback = borders.outer ?? "1px solid #94a3b8";
  const outerTop = borders.outerTop ?? outerFallback;
  const outerRight = borders.outerRight ?? outerFallback;
  const outerBottom = borders.outerBottom ?? outerFallback;
  const outerLeft = borders.outerLeft ?? outerFallback;

  const pick = <K extends keyof TableStyleDef>(key: K): TableStyleDef[K] =>
    instanceOverride?.table?.[key] ??
    sectionOverride?.table?.[key] ??
    direct[key] ??
    variantBinding[key] ??
    baseBinding[key];

  return {
    borders: {
      outer: outerFallback,
      outerTop,
      outerRight,
      outerBottom,
      outerLeft,
      headerTop: borders.headerTop ?? outerTop,
      headerBottom: borders.headerBottom ?? "1px solid #94a3b8",
      rowBottom: borders.rowBottom ?? "1px solid #cbd5e1",
      vertical: borders.vertical ?? "1px solid #cbd5e1",
      radius: borders.radius ?? pick("radius") ?? "0px",
    },
    headerFill: pick("headerFill") ?? "#e6ecf5",
    headerTextColor: pick("headerTextColor") ?? "#1e293b",
    headerFontWeight: pick("headerFontWeight") ?? "600",
    headerFontSize: pick("headerFontSize") ?? "13px",
    headerLetterSpacing: pick("headerLetterSpacing") ?? "normal",
    zebraFill: pick("zebraFill") ?? "transparent",
    cellPadding: pick("cellPadding") ?? "8px 10px",
    radius: pick("radius") ?? borders.radius ?? "0px",
    autoFormHeader: pick("autoFormHeader") ?? true,
    columnWidths: pick("columnWidths"),
    cells: mergeCells(
      baseBinding.cells,
      variantBinding.cells,
      direct.cells,
      overrides.cells
    ),
  };
}

/**
 * 표 그리드에서 특정 열린 역할 키(`cellRole`)에 대응하는 직교 셀 스타일을 해석한다.
 * 점(`.`) 계층 키(예: `"value.code"`)는 상위(`"value"`) → 하위(`"value.code"`) 순서로 병합한다.
 */
export function resolveTableCellStyle(
  tableGrid: ResolvedTableGrid,
  cellRole?: string
): CellStyleDef {
  if (!cellRole) return {};
  const parts = cellRole.split(".");
  let resolved: CellStyleDef = {};
  for (let i = 1; i <= parts.length; i++) {
    const key = parts.slice(0, i).join(".");
    const hit = tableGrid.cells[key];
    if (hit) resolved = { ...resolved, ...hit };
  }
  return resolved;
}
