import { UserRoundPen } from "lucide-react";

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
  controls: (block, api) => [
    {
      id: "assignee",
      label: `담당: ${block.assigneeName || "미지정"}`,
      icon: UserRoundPen,
      showLabel: true,
      run: () => {
        const name = api.prompt("담당자 이름", block.assigneeName);
        if (name !== null) api.updateBlock((prev) => ({ ...prev, assigneeName: name.trim() }) as FillableGroupBlockDef);
      },
    },
  ],
});
