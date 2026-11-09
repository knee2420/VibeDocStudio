import type { TextBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { ALIGN_PROP, outlineSingleSlot } from "./shared";

export const textBlock = defineBlockKind<TextBlockDef>({
  kinds: ["text"],
  label: "텍스트",
  category: "text",
  icon: "type",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  ai: { editableProps: { align: ALIGN_PROP } },
});
