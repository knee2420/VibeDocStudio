import type { LinkCardBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSingleSlot } from "./shared";

/** 링크 카드 — 썸네일 + 제목 · 설명 슬롯 + 주소 한 덩어리. */
export const linkCardBlock = defineBlockKind<LinkCardBlockDef>({
  kinds: ["link-card"],
  label: "링크 카드",
  category: "media",
  icon: "link",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  units: (b) => [
    ...(b.thumbnail ? [{ unitId: `${b.blockId}:thumb`, kind: "media" as const, label: "링크 카드 썸네일" }] : []),
    ...(b.slotId ? [{ unitId: b.slotId, kind: "slot" as const, slotId: b.slotId }] : []),
  ],
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  insertable: {
    label: "링크 카드",
    description: "썸네일 · 제목 · 설명 · 주소 카드",
    order: 8,
    shortcut: 8,
    defaultFrameHeight: 120,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const body = makeSlot(slots, `slot_link_card_${suffix}`, "링크 카드", "<p><strong>제목</strong></p><p>설명</p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_link_card_${suffix}`, kind: "link-card", title: "링크 카드", slotId: body, url: "", layout: "thumb-top", width: "72%" },
        slots,
        focusSlotId: body,
      };
    },
  },
  ai: {
    describe: (b) => [`주소: ${b.url || "(없음)"}`, `썸네일: ${b.thumbnail ? b.thumbnail.slice(0, 120) : "(없음)"}`],
    editableProps: {
      url: { type: "string", description: "링크 주소" },
      thumbnail: { type: "string", description: "썸네일 (resource:<id> 또는 주소)" },
      layout: { type: "string", description: "썸네일 위치", enum: ["thumb-top", "thumb-left"] },
      width: { type: "string", description: "카드 폭 (예: 72%)" },
    },
  },
});
