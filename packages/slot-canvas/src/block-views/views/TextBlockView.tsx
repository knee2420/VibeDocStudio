import type { TextBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const textView = defineBlockView<TextBlockDef>({
  kinds: ["text"],
  View: ({ block, ctx }) => (
    <>
      {ctx.renderSlot(block.slotId, {
        className: block.align === "right" ? "text-right" : block.align === "center" ? "text-center" : "",
      })}
    </>
  ),
});
