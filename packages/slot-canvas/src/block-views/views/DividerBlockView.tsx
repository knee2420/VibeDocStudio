import { Minus } from "lucide-react";

import type { DividerBlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

const ORDER = ["line", "short", "dots", "space"] as const;
const LABEL: Record<string, string> = { line: "가로 선", short: "짧은 선", dots: "점 세 개", space: "빈 여백" };

/** 구분선 — 블록 전체가 static 단위 하나. */
export const dividerView = defineBlockView<DividerBlockDef>({
  kinds: ["divider"],
  View: ({ block, ctx }) => {
    const variant = block.variant ?? "line";
    const pad = Math.max(0, Math.min(120, block.spacing ?? 16));
    return (
      <div {...ctx.unitAttrs(block.blockId, "static")} className="flex w-full items-center justify-center" style={{ paddingTop: pad, paddingBottom: pad }}>
        {variant === "line" && <div className="h-px w-full bg-slate-200" />}
        {variant === "short" && <div className="h-px w-12 bg-slate-300" />}
        {variant === "dots" && <div className="tracking-[0.6em] text-slate-300 text-sm select-none">•••</div>}
        {variant === "space" && <div className="h-px w-full" />}
      </div>
    );
  },
  controls: (block, api) => {
    const variant = block.variant ?? "line";
    const next = ORDER[(ORDER.indexOf(variant) + 1) % ORDER.length];
    return [
      {
        id: "variant",
        label: `모양: ${LABEL[variant]}`,
        icon: Minus,
        showLabel: true,
        run: () => api.updateBlock((prev) => ({ ...prev, variant: next }) as DividerBlockDef),
      },
    ];
  },
});
