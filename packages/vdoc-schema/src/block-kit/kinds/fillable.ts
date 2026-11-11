import type { FillableGroupBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSingleSlot } from "./shared";

/** 할당형 입력 필드 (담당자가 채우는 칸). */
export const fillableBlock = defineBlockKind<FillableGroupBlockDef>({
  kinds: ["fillable-group"],
  label: "할당형 입력 필드",
  category: "form",
  icon: "user-round-pen",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  insertable: {
    label: "할당형 입력 필드",
    description: "담당자 및 실행과제",
    order: 6,
    shortcut: 6,
    defaultFrameHeight: 72,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const field = makeSlot(slots, `slot_fill_${suffix}`, "할당형 입력 슬롯", "<p></p>", defaultBackdataRefs, { role: "fillable-field" });
      return {
        block: { blockId: `blk_fill_${suffix}`, kind: "fillable-group", title: "할당형 입력 필드", slotId: field, assigneeName: "", fieldType: "text-area" },
        slots,
        focusSlotId: field,
      };
    },
  },
  ai: {
    describe: (b) => [`담당자: ${b.assigneeName || "미지정"}`, `입력 종류: ${b.fieldType}`],
    editableProps: {
      assigneeName: { type: "string", description: "담당자 이름" },
      fieldType: { type: "string", description: "입력 종류", enum: ["text-area", "signature", "date", "kpi-summary"] },
    },
  },
});
