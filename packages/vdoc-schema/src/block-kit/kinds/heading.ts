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
    describe: (b) => [`정렬: ${b.align ?? "center"}` + (b.kind === "heading" && b.decoration && b.decoration !== "none" ? ` · 장식: ${b.decoration}` : "")],
    editableProps: {
      align: ALIGN_PROP,
      letterSpacing: { type: "string", description: "자간 (예: 0.35em)" },
      decoration: { type: "string", description: "장식 (quote: 위 따옴표 · bar: 왼쪽 막대)", enum: ["none", "quote", "bar"] },
      accent: { type: "string", description: "강조색 (예: #00a84b)" },
    },
  },
});
