import type { HeroBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSlotGroup } from "./shared";

const heroSlots = (b: HeroBlockDef) => [b.titleSlotId, ...(b.subtitleSlotId ? [b.subtitleSlotId] : [])].filter(Boolean);

/** 사진 표지 — 배경 사진 + 제목 · 부제 슬롯. */
export const heroBlock = defineBlockKind<HeroBlockDef>({
  kinds: ["hero"],
  label: "사진 표지",
  category: "media",
  icon: "image",
  slotIds: heroSlots,
  units: (b) => [
    ...(b.image ? [{ unitId: `${b.blockId}:image`, kind: "media" as const, label: "표지 사진" }] : []),
    ...heroSlots(b).map((slotId) => ({ unitId: slotId, kind: "slot" as const, slotId })),
  ],
  outline: (b, ctx) => outlineSlotGroup(heroSlots(b), ctx, "사진 표지", (n) => `사진 표지 · ${n}칸`),
  insertable: {
    label: "사진 표지",
    description: "배경 사진 위 제목 · 부제",
    order: 7,
    shortcut: 7,
    defaultFrameHeight: 280,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const title = makeSlot(slots, `slot_hero_title_${suffix}`, "표지 제목", "<p>제목</p>", defaultBackdataRefs);
      const subtitle = makeSlot(slots, `slot_hero_sub_${suffix}`, "표지 부제", "<p>부제</p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_hero_${suffix}`, kind: "hero", title: "사진 표지", titleSlotId: title, subtitleSlotId: subtitle, height: 280, overlay: 0.35 },
        slots,
        focusSlotId: title,
      };
    },
  },
  ai: {
    describe: (b) => [`배경 사진: ${b.image ? b.image.slice(0, 120) : "(없음)"}`, `높이: ${b.height ?? 280}px`],
    editableProps: {
      image: { type: "string", description: "배경 사진 (resource:<id> 또는 주소)" },
      height: { type: "number", description: "높이 (px)" },
      align: { type: "string", description: "글자 위치", enum: ["left", "center"] },
      overlay: { type: "number", description: "사진 어둡게 (0~0.8)" },
    },
  },
});
