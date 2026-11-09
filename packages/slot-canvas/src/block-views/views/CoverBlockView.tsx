import type { CoverBannerBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const coverView = defineBlockView<CoverBannerBlockDef>({
  kinds: ["cover-banner"],
  View: ({ block, ctx }) => (
    <div className="rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-8 min-h-[540px] flex flex-col justify-between shadow-inner">
      <div className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">PandaDoc Kolas Cover Container · WYSIWYM</div>
      <div className="my-auto py-8">{ctx.renderSlot(block.headlineSlotId, { className: "text-3xl font-bold", darkTheme: true })}</div>
      <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/15">
        {ctx.renderSlot(block.preparedBySlotId, { className: "bg-white/5 rounded-lg p-2", darkTheme: true })}
        {ctx.renderSlot(block.preparedForSlotId, { className: "bg-white/5 rounded-lg p-2", darkTheme: true })}
      </div>
    </div>
  ),
});
