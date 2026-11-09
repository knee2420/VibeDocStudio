import type { SectionBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const sectionView = defineBlockView<SectionBlockDef>({
  kinds: ["section-block"],
  View: ({ block, ctx }) => (
    <div className="space-y-3">
      {ctx.renderSlot(block.headingSlotId)}
      {ctx.renderSlot(block.bodySlotId)}
    </div>
  ),
});
