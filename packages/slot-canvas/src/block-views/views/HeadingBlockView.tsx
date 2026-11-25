import { resolveTextRoleStyle } from "@vibe/style-core";
import type { FormTitleBlockDef, HeadingBlockDef } from "@vibe/vdoc-schema";

import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

export const headingView = defineBlockView<HeadingBlockDef | FormTitleBlockDef>({
  kinds: ["heading", "form-title"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const roleText =
      docStyle && block.styleKey
        ? resolveTextRoleStyle(docStyle.resolvedPack, block.styleKey, undefined, undefined, block.styleOverrides)
        : null;
    const effectiveAlign = block.align ?? roleText?.align;
    const alignClass =
      effectiveAlign === "left" ? "text-left" : effectiveAlign === "right" ? "text-right" : "text-center";
    const deco = block.kind === "heading" ? block.decoration ?? "none" : "none";
    const accent = block.kind === "heading" ? block.accent ?? roleText?.color : roleText?.color;
    const prefix = block.kind === "heading" ? block.prefix ?? roleText?.prefix : roleText?.prefix;
    const prefixColor =
      (block.kind === "heading" ? block.prefixColor : undefined) ?? roleText?.prefixColor ?? accent;

    return (
      <div
        className={`flex flex-col pt-1 pb-3 ${
          effectiveAlign === "left" ? "items-start" : effectiveAlign === "right" ? "items-end" : "items-center"
        }`}
      >
        {deco === "quote" && (
          <div className="font-serif text-[30px] leading-none select-none -mb-1" style={{ color: accent || "#94a3b8" }}>
            &ldquo;
          </div>
        )}
        <div
          className={`font-bold text-slate-950 w-full ${deco === "bar" ? "border-l-4 pl-3" : ""} ${
            prefix ? "flex items-baseline gap-1" : ""
          }`}
          style={{
            letterSpacing:
              block.letterSpacing ||
              roleText?.letterSpacing ||
              (block.kind === "form-title" ? "0.35em" : undefined),
            color: accent,
            fontFamily: roleText?.fontFamily,
            fontSize: roleText?.fontSize,
            fontWeight: roleText?.fontWeight,
            lineHeight: roleText?.lineHeight,
            borderColor: deco === "bar" ? accent || "#0f172a" : undefined,
          }}
        >
          {prefix && (
            <span
              data-heading-prefix=""
              className="shrink-0 select-none"
              style={{ color: prefixColor }}
            >
              {prefix}
            </span>
          )}
          <div className={prefix ? "min-w-0 flex-1" : "w-full"}>
            {ctx.renderSlot(block.slotId, {
              className: `${alignClass} ${
                roleText?.fontSize
                  ? ""
                  : block.kind === "form-title"
                    ? "text-[24px]"
                    : "text-[20px]"
              } font-bold`,
              style: roleText
                ? {
                    fontSize: roleText.fontSize,
                    fontWeight: roleText.fontWeight,
                    lineHeight: roleText.lineHeight,
                    color: accent,
                  }
                : undefined,
            })}
          </div>
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
