import type { FormTitleBlockDef, HeadingBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const headingView = defineBlockView<HeadingBlockDef | FormTitleBlockDef>({
  kinds: ["heading", "form-title"],
  View: ({ block, ctx }) => {
    const alignClass = block.align === "left" ? "text-left" : block.align === "right" ? "text-right" : "text-center";
    const deco = block.kind === "heading" ? block.decoration ?? "none" : "none";
    const accent = block.kind === "heading" ? block.accent : undefined;
    return (
      <div
        className={`flex flex-col pt-1 pb-3 ${
          block.align === "left" ? "items-start" : block.align === "right" ? "items-end" : "items-center"
        }`}
      >
        {deco === "quote" && (
          <div className="font-serif text-[30px] leading-none select-none -mb-1" style={{ color: accent || "#94a3b8" }}>
            &ldquo;
          </div>
        )}
        <div
          className={`font-bold text-slate-950 w-full ${deco === "bar" ? "border-l-4 pl-3" : ""}`}
          style={{
            letterSpacing: block.letterSpacing || (block.kind === "form-title" ? "0.35em" : undefined),
            color: accent,
            borderColor: deco === "bar" ? accent || "#0f172a" : undefined,
          }}
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
