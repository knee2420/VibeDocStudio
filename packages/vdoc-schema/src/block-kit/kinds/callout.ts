import type { CalloutBoxBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { outlineSingleSlot } from "./shared";

/** 안내 · 강조 상자 (본문 슬롯 하나). */
export const calloutBlock = defineBlockKind<CalloutBoxBlockDef>({
  kinds: ["callout-box"],
  label: "안내 상자",
  category: "text",
  icon: "message-square-quote",
  outlineTag: (b) =>
    b.variant === "accent-bar" ? "!" : b.variant === "disclosure" ? "[embed]" : ">",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  ai: {
    editableProps: {
      tone: { type: "string", description: "상자 색", enum: ["neutral", "info", "warning"] },
      variant: {
        type: "string",
        description: "표현 변형 (기본 · 중앙 인용구 · 스팟 정보 프레임 · 하이라이트 바 · 고지 배지)",
        enum: ["default", "quote", "info-frame", "accent-bar", "disclosure"],
      },
      align: { type: "string", description: "정렬", enum: ["left", "center", "right"] },
    },
  },
});
