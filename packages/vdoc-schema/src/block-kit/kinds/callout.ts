import type { CalloutBoxBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { outlineSingleSlot } from "./shared";

/** 안내 · 강조 상자 (본문 슬롯 하나). */
export const calloutBlock = defineBlockKind<CalloutBoxBlockDef>({
  kinds: ["callout-box"],
  label: "안내 상자",
  category: "text",
  icon: "message-square-quote",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  ai: { editableProps: { tone: { type: "string", description: "상자 색", enum: ["neutral", "info", "warning"] } } },
});
