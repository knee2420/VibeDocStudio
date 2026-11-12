import type { SectionBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot } from "./shared";

/** 텍스트 섹션 (제목 + 본문). */
export const sectionBlock = defineBlockKind<SectionBlockDef>({
  kinds: ["section-block"],
  label: "텍스트 섹션",
  category: "text",
  icon: "file-text",
  slotIds: (b) => [b.headingSlotId, b.bodySlotId].filter(Boolean),
  outline: (b, ctx) => {
    const heading = ctx.doc.slots[b.headingSlotId];
    const title = ctx.tidyName(ctx.plainText(heading?.content)).slice(0, 60) || ctx.blockTitle || "구획";
    if (!heading) {
      // 제목이 고정 텍스트면 구획 = 본문 한 칸이다.
      ctx.emitSlot(ctx.pageNode, b.bodySlotId, { title, needsReview: false });
      return;
    }
    const node = ctx.emitContainer(ctx.pageNode, ctx.blockNodeId, title, "구획 · 제목 + 본문");
    ctx.emitSlotGroup(node, [
      { slotId: b.headingSlotId, name: { title: "제목", needsReview: false } },
      { slotId: b.bodySlotId, name: { title: "본문", needsReview: false } },
    ]);
  },
  insertable: {
    label: "텍스트 섹션",
    description: "제목 + 본문 단락",
    order: 5,
    shortcut: 5,
    defaultFrameHeight: 120,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const heading = makeSlot(slots, `slot_sec_h_${suffix}`, "섹션 제목", "<h2>새 섹션</h2>", []);
      const body = makeSlot(slots, `slot_sec_b_${suffix}`, "섹션 본문", "<p></p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_sec_${suffix}`, kind: "section-block", title: "텍스트 섹션", headingSlotId: heading, bodySlotId: body },
        slots,
        focusSlotId: body,
      };
    },
  },
});
