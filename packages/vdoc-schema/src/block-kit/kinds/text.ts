import type { TextBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { ALIGN_PROP, makeSlot, outlineSingleSlot } from "./shared";

export const textBlock = defineBlockKind<TextBlockDef>({
  kinds: ["text"],
  label: "텍스트",
  category: "text",
  icon: "type",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  insertable: {
    label: "텍스트",
    description: "단락 텍스트 입력",
    order: 1,
    shortcut: 1,
    defaultFrameHeight: 48,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const slotId = makeSlot(slots, `slot_txt_${suffix}`, "텍스트", "<p></p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_txt_${suffix}`, kind: "text", title: "텍스트", slotId },
        slots,
        focusSlotId: slotId,
      };
    },
  },
  ai: { editableProps: { align: ALIGN_PROP } },
});
