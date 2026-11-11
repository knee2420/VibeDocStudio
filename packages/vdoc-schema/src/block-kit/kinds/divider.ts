import type { DividerBlockDef } from "../../types";
import { defineBlockKind } from "../contract";

/** 구분선 — 슬롯 없는 장식. 블록 전체가 static 단위 하나. */
export const dividerBlock = defineBlockKind<DividerBlockDef>({
  kinds: ["divider"],
  label: "구분선",
  category: "layout",
  icon: "minus",
  slotIds: () => [],
  units: (b) => [{ unitId: b.blockId, kind: "static", label: "구분선" }],
  outline: (_b, ctx) => {
    ctx.emitStatic("구분선", "구분선");
  },
  insertable: {
    label: "구분선",
    description: "섹션 사이 선 · 여백",
    order: 9,
    shortcut: 9,
    defaultFrameHeight: 32,
    create: ({ suffix }) => ({
      block: { blockId: `blk_divider_${suffix}`, kind: "divider", title: "구분선", variant: "short", spacing: 24 },
      slots: {},
    }),
  },
  ai: {
    describe: (b) => [`모양: ${b.variant ?? "line"} · 여백: ${b.spacing ?? 16}px`],
    editableProps: {
      variant: { type: "string", description: "모양", enum: ["line", "short", "dots", "space"] },
      spacing: { type: "number", description: "위아래 여백 (px)" },
    },
  },
});
