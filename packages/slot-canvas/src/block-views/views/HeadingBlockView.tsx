import type { FormTitleBlockDef, HeadingBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const headingView = defineBlockView<HeadingBlockDef | FormTitleBlockDef>({
  kinds: ["heading", "form-title"],
  View: ({ block, ctx }) => {
    const alignClass = block.align === "left" ? "text-left" : block.align === "right" ? "text-right" : "text-center";
    return (
      <div
        className={`flex flex-col pt-1 pb-3 ${
          block.align === "left" ? "items-start" : block.align === "right" ? "items-end" : "items-center"
        }`}
      >
        <div
          className="font-bold text-slate-950 w-full"
          style={{ letterSpacing: block.letterSpacing || (block.kind === "form-title" ? "0.35em" : undefined) }}
        >
          {ctx.renderSlot(block.slotId, {
            className: `${alignClass} ${block.kind === "form-title" ? "text-[24px]" : "text-[20px]"} font-bold`,
          })}
        </div>
        {(block.underline || block.underlineWidth) && (
          <div
            style={{
              width: block.underline?.width || block.underlineWidth || "286px",
              height: block.underline?.thickness || block.underlineThickness || "2px",
              backgroundColor: block.underline?.color || "#0f172a",
              marginTop: block.underline?.marginTop || "4px",
            }}
          />
        )}
      </div>
    );
  },
});
