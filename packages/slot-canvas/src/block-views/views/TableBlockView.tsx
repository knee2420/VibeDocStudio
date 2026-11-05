import type { StructuredTableBlockDef } from "@vibe/vdoc-schema";

import { InteractiveTable } from "../../InteractiveTable";
import { defineBlockView } from "../contract";

export const tableView = defineBlockView<StructuredTableBlockDef>({
  kinds: ["structured-table", "table"],
  View: ({ block, ctx }) => (
    <InteractiveTable
      table={block}
      borderRules={block.borderRules}
      headerStyle={block.headerStyle}
      cellPadding={block.cellPadding}
      {...ctx.tableBindings(null)}
      footer={block.footerSummary && ctx.renderSummary(block.footerSummary, "mt-3")}
    />
  ),
});
