import type { SummaryListBlockDef, TableSummaryItem } from "../../types";
import { defineBlockKind } from "../contract";

export const summaryItemSlotIds = (items: TableSummaryItem[]) =>
  items.flatMap((i) => [i.slotId, i.labelSlotId, i.valueSlotId].filter((s): s is string => Boolean(s)));

/** 요약 목록 (라벨 · 값 줄 — 합계 등). */
export const summaryBlock = defineBlockKind<SummaryListBlockDef>({
  kinds: ["summary-list"],
  label: "요약 목록",
  category: "table",
  icon: "list",
  slotIds: (b) => summaryItemSlotIds(b.items),
  outline: (b, ctx) => {
    const node = ctx.emitContainer(ctx.pageNode, ctx.blockNodeId, ctx.blockTitle || "요약 목록", `요약 목록 · ${b.items.length}항목`);
    ctx.emitSlotGroup(node, ctx.summaryItemEntries(b.items));
  },
  ai: {
    describe: (b) => b.items.filter((i) => !i.valueSlotId && !i.slotId).map((i) => `고정 값: ${i.label ?? ""} = ${i.value ?? ""}`),
  },
});
