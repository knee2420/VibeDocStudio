import type { SummaryListBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const summaryView = defineBlockView<SummaryListBlockDef>({
  kinds: ["summary-list"],
  View: ({ block, ctx }) => <>{ctx.renderSummary(block, "my-2")}</>,
});
