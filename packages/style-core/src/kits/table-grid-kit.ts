/**
 * @vibe/style-core/kits — Table Grid Kit (한국형 표 5선 테두리 매트릭스 · 헤더 음영 · 균등 자간).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridBorderMatrix } from "../core/grid-contract";
import type { ResolvedStylePack, StyleOverrideDelta, TableStyleDef } from "../core/token-contract";

export interface ResolvedTableGrid {
  borders: Required<GridBorderMatrix>;
  headerFill: string;
  headerTextColor: string;
  headerFontWeight: string;
  headerFontSize: string;
  headerLetterSpacing: string;
  zebraFill: string;
  cellPadding: string;
  radius: string;
  autoFormHeader: boolean;
}

export function resolveTableGridStyle(
  resolvedPack: ResolvedStylePack,
  styleKey = "default",
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedTableGrid {
  const direct: TableStyleDef =
    resolvedPack.styles.table[styleKey] ?? resolvedPack.styles.table.default ?? {};
  const cascaded = resolveCascadedStyle(
    resolvedPack,
    "structured-table",
    sectionOverride,
    instanceOverride
  ).table;

  const borders: GridBorderMatrix = {
    ...(direct.borders ?? {}),
    ...(cascaded.borders ?? {}),
  };

  return {
    borders: {
      outer: borders.outer ?? "1px solid #94a3b8",
      headerTop: borders.headerTop ?? borders.outer ?? "1px solid #94a3b8",
      headerBottom: borders.headerBottom ?? "1px solid #94a3b8",
      rowBottom: borders.rowBottom ?? "1px solid #cbd5e1",
      vertical: borders.vertical ?? "1px solid #cbd5e1",
      radius: borders.radius ?? cascaded.radius ?? direct.radius ?? "0px",
    },
    headerFill: cascaded.headerFill ?? direct.headerFill ?? "#e6ecf5",
    headerTextColor: cascaded.headerTextColor ?? direct.headerTextColor ?? "#1e293b",
    headerFontWeight: cascaded.headerFontWeight ?? direct.headerFontWeight ?? "600",
    headerFontSize: cascaded.headerFontSize ?? direct.headerFontSize ?? "13px",
    headerLetterSpacing: cascaded.headerLetterSpacing ?? direct.headerLetterSpacing ?? "normal",
    zebraFill: cascaded.zebraFill ?? direct.zebraFill ?? "transparent",
    cellPadding: cascaded.cellPadding ?? direct.cellPadding ?? "8px 10px",
    radius: cascaded.radius ?? direct.radius ?? borders.radius ?? "0px",
    autoFormHeader: cascaded.autoFormHeader ?? direct.autoFormHeader ?? true,
  };
}
