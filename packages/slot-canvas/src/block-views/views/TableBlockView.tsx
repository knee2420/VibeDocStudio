import { adaptLegacyBlockOverrides, resolveTableCellStyle, resolveTableGridStyle } from "@vibe/style-core";
import type { StructuredTableBlockDef } from "@vibe/vdoc-schema";

import { InteractiveTable } from "../../InteractiveTable";
import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

function isUniformDefaultWidths(widths: readonly string[]): boolean {
  if (widths.length <= 1) return true;
  const nums = widths.map((w) => parseFloat(w));
  if (nums.some((n) => !Number.isFinite(n))) return false;
  const expected = 100 / widths.length;
  return nums.every((n) => Math.abs(n - expected) <= 0.15);
}

export const tableView = defineBlockView<StructuredTableBlockDef>({
  kinds: ["structured-table", "table"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const tableGrid = docStyle
      ? resolveTableGridStyle(
          docStyle.resolvedPack,
          block.styleKey ?? "default",
          undefined,
          adaptLegacyBlockOverrides(block)
        )
      : null;

    const effectiveTable =
      tableGrid?.columnWidths &&
      tableGrid.columnWidths.length === block.columnWidths.length &&
      isUniformDefaultWidths(block.columnWidths)
        ? { ...block, columnWidths: tableGrid.columnWidths }
        : block;

    const effectiveBorders = block.borderRules ?? tableGrid?.borders;
    const effectiveHeaderStyle =
      block.headerStyle ??
      (tableGrid
        ? {
            bg: tableGrid.headerFill,
            textColor: tableGrid.headerTextColor,
            fontWeight: tableGrid.headerFontWeight,
            fontSize: tableGrid.headerFontSize,
            padding: tableGrid.cellPadding,
          }
        : undefined);

    return (
      <InteractiveTable
        table={effectiveTable}
        borderRules={effectiveBorders}
        headerStyle={effectiveHeaderStyle}
        cellPadding={block.cellPadding ?? tableGrid?.cellPadding}
        resolveCellRoleStyle={
          tableGrid ? (role) => resolveTableCellStyle(tableGrid, role) : undefined
        }
        {...ctx.tableBindings(null)}
        footer={block.footerSummary && ctx.renderSummary(block.footerSummary, "mt-3")}
      />
    );
  },
});
