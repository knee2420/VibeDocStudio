import { Palette } from "lucide-react";

import type { CalloutBoxBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

const TONES: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-50/80",
  info: "border-sky-200 bg-sky-50/70",
  warning: "border-amber-200 bg-amber-50/70",
};
const TONE_ORDER = ["neutral", "info", "warning"] as const;
const TONE_LABEL: Record<string, string> = { neutral: "기본", info: "정보", warning: "주의" };

export const calloutView = defineBlockView<CalloutBoxBlockDef>({
  kinds: ["callout-box"],
  View: ({ block, ctx }) => (
    <div className={`rounded-md border p-3.5 my-2 ${TONES[block.tone ?? "neutral"] ?? TONES.neutral}`}>{ctx.renderSlot(block.slotId)}</div>
  ),
  controls: (block, api) => {
    const tone = block.tone ?? "neutral";
    const next = TONE_ORDER[(TONE_ORDER.indexOf(tone) + 1) % TONE_ORDER.length];
    return [
      {
        id: "tone",
        label: `상자 색: ${TONE_LABEL[tone]}`,
        icon: Palette,
        showLabel: true,
        run: () => api.updateBlock((prev) => ({ ...prev, tone: next }) as CalloutBoxBlockDef),
      },
    ];
  },
});
