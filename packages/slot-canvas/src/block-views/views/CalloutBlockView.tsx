import type { CalloutBoxBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

const TONES: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-50/80",
  info: "border-sky-200 bg-sky-50/70",
  warning: "border-amber-200 bg-amber-50/70",
};

export const calloutView = defineBlockView<CalloutBoxBlockDef>({
  kinds: ["callout-box"],
  View: ({ block, ctx }) => (
    <div className={`rounded-md border p-3.5 my-2 ${TONES[block.tone ?? "neutral"] ?? TONES.neutral}`}>{ctx.renderSlot(block.slotId)}</div>
  ),
});
