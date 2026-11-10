import type { ColumnsGridBlockDef } from "../../types";
import type { BlockUnit } from "../contract";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSlotGroup } from "./shared";

const gridSlotIds = (b: ColumnsGridBlockDef) =>
  b.columns ? b.columns.flatMap((c) => (c.slotId ? [c.slotId] : [])) : (b.slotIds ?? []);

/** 다단 그리드 — 칸마다 슬롯 또는 이미지(로고). */
export const gridBlock = defineBlockKind<ColumnsGridBlockDef>({
  kinds: ["columns-grid"],
  label: "다단 그리드",
  category: "layout",
  icon: "columns-2",
  slotIds: gridSlotIds,
  units: (b) => {
    if (!b.columns) return (b.slotIds ?? []).map((slotId) => ({ unitId: slotId, kind: "slot" as const, slotId }));
    return b.columns.flatMap((col, i): BlockUnit[] =>
      col.image
        ? [{ unitId: `${b.blockId}:col${i}`, kind: "media", label: col.image.alt || `${i + 1}열 이미지` }]
        : col.slotId
          ? [{ unitId: col.slotId, kind: "slot", slotId: col.slotId }]
          : []
    );
  },
  outline: (b, ctx) => outlineSlotGroup(gridSlotIds(b), ctx, "다단 그리드", (n) => `다단 그리드 · ${n}칸`),
  insertable: {
    label: "2단 그리드",
    description: "좌우 분할 2단 슬롯",
    order: 4,
    shortcut: 4,
    defaultFrameHeight: 96,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const left = makeSlot(slots, `slot_col1_${suffix}`, "좌측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      const right = makeSlot(slots, `slot_col2_${suffix}`, "우측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_cols_${suffix}`, kind: "columns-grid", title: "2단 그리드", widths: ["1fr", "1fr"], cardStyle: "plain", slotIds: [left, right] },
        slots,
        focusSlotId: left,
      };
    },
  },
  ai: {
    describe: (b) => [
      `칸 너비: ${b.widths.join(" / ")}`,
      ...(b.columns ?? []).flatMap((c, i) => (c.image ? [`${i + 1}열 이미지: ${c.image.alt || c.image.src.slice(0, 80)}`] : [])),
    ],
  },
});
