import { resolveTextRoleStyle } from "@vibe/style-core";
import type { TextBlockDef } from "@vibe/vdoc-schema";

import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

export const textView = defineBlockView<TextBlockDef>({
  kinds: ["text"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const role = docStyle
      ? resolveTextRoleStyle(docStyle.resolvedPack, "body", "text", undefined, block.styleOverrides)
      : null;
    const effectiveAlign = block.align ?? role?.align;
    const alignClass =
      effectiveAlign === "right"
        ? "text-right"
        : effectiveAlign === "center"
          ? "text-center"
          : effectiveAlign === "left"
            ? "text-left"
            : "";

    return (
      <div
        style={
          role
            ? {
                fontFamily: role.fontFamily,
                fontSize: role.fontSize,
                fontWeight: role.fontWeight,
                lineHeight: role.lineHeight,
                letterSpacing: role.letterSpacing,
                color: role.color,
                textAlign: effectiveAlign,
              }
            : undefined
        }
      >
        {ctx.renderSlot(block.slotId, { className: alignClass })}
      </div>
    );
  },
});
