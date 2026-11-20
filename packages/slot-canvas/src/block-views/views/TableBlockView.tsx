import { adaptLegacyBlockOverrides, resolveTableGridStyle } from "@vibe/style-core";
import type { StructuredTableBlockDef } from "@vibe/vdoc-schema";

import { InteractiveTable } from "../../InteractiveTable";
import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

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
        table={block}
        borderRules={effectiveBorders}
        headerStyle={effectiveHeaderStyle}
        cellPadding={block.cellPadding ?? tableGrid?.cellPadding}
        {...ctx.tableBindings(null)}
        footer={block.footerSummary && ctx.renderSummary(block.footerSummary, "mt-3")}
      />
    );
  },
});
