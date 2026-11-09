import type { ColumnsGridBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

export const gridView = defineBlockView<ColumnsGridBlockDef>({
  kinds: ["columns-grid"],
  View: ({ block, ctx }) => {
    const cardClass =
      block.cardStyle === "plain" ? "min-w-0 bg-transparent p-0" : "min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5";
    return (
      <div
        className={`grid ${block.cardStyle === "plain" ? "gap-6" : "gap-4"} items-start w-full`}
        style={{ gridTemplateColumns: block.widths.map((w) => (w.endsWith("fr") ? `minmax(0, ${w})` : w)).join(" ") }}
      >
        {block.columns
          ? block.columns.map((col, cIdx) => (
              <div key={cIdx} className={cardClass}>
                {col.image ? (
                  <div
                    {...ctx.unitAttrs(`${block.blockId}:col${cIdx}`, "media")}
                    className={`flex py-1 ${col.image.align === "right" ? "justify-end" : col.image.align === "center" ? "justify-center" : "justify-start"}`}
                  >
                    <img
                      src={col.image.src}
                      alt={col.image.alt || "Image"}
                      draggable={false}
                      style={{
                        width: col.image.width || "auto",
                        height: col.image.height || "auto",
                        maxHeight: col.image.maxHeight || "90px",
                        objectFit: col.image.objectFit || "contain",
                      }}
                    />
                  </div>
                ) : col.slotId ? (
                  ctx.renderSlot(col.slotId)
                ) : null}
              </div>
            ))
          : block.slotIds?.map((sid) => (
              <div key={sid} className={cardClass}>
                {ctx.renderSlot(sid)}
              </div>
            ))}
      </div>
    );
  },
});
