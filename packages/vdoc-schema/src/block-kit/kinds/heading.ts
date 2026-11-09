import type { FormTitleBlockDef, HeadingBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { ALIGN_PROP, outlineSingleSlot } from "./shared";

/** 제목 · 서식 제목 (가운데 큰 글씨 + 밑줄). */
export const headingBlock = defineBlockKind<HeadingBlockDef | FormTitleBlockDef>({
  kinds: ["heading", "form-title"],
  label: "제목",
  category: "text",
  icon: "heading",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  ai: {
    describe: (b) => [`정렬: ${b.align ?? "center"}`],
    editableProps: { align: ALIGN_PROP, letterSpacing: { type: "string", description: "자간 (예: 0.35em)" } },
  },
});
