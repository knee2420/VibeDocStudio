import type { FillableGroupBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const fillableView = defineBlockView<FillableGroupBlockDef>({
  kinds: ["fillable-group"],
  View: ({ block, ctx }) => (
    <div className="rounded-lg border-2 border-dashed border-amber-400/80 bg-amber-50/30 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-amber-900">📌 {block.title}</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold border border-amber-300">
          👤 담당: {block.assigneeName || "미지정"}
        </span>
      </div>
      {ctx.renderSlot(block.slotId)}
    </div>
  ),
});
