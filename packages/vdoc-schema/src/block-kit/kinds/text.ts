import { isBlockLocked } from "../../block-ops";
import type { TextBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { ALIGN_PROP, makeSlot, outlineSingleSlot } from "./shared";

const MARKER_GLYPH: Record<string, string> = {
  disc: "•",
  circle: "◦",
  square: "▪",
  dash: "-",
  decimal: "1.",
};

function countListItems(html: string): number {
  const matches = html.match(/<li\b/gi);
  return matches ? matches.length : 0;
}

export const textBlock = defineBlockKind<TextBlockDef>({
  kinds: ["text"],
  label: "텍스트",
  category: "text",
  icon: "type",
  outlineTag: (b, slots) => {
    const html = b.slotId ? (slots[b.slotId]?.content ?? "") : "";
    return /<(?:ul|ol)\b/i.test(html) ? "<<view:list>>" : "text";
  },
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  sceneNode: (b, ctx) => {
    const slot = b.slotId ? ctx.slots[b.slotId] : undefined;
    const html = slot?.content ?? "";
    const isList = /<(?:ul|ol)\b/i.test(html);
    const itemCount = isList ? countListItems(html) : 0;
    const plain = ctx.plainText(b.slotId);
    const locked = isBlockLocked(b, ctx.slots);
    const hidden = ctx.hiddenBlockIds.has(b.blockId);

    const listBadge = isList
      ? `${b.listMarker ? `${MARKER_GLYPH[b.listMarker] ?? ""} ` : ""}${itemCount}항목`.trim()
      : undefined;

    return {
      id: b.blockId,
      role: "block",
      outlineTag: isList ? ctx.resolveTag("section", "list-view", "<<view:list>>") : undefined,
      label: isList
        ? b.title && b.title !== "목록"
          ? b.title
          : plain
            ? `목록 · ${plain.slice(0, 22)}`
            : "목록"
        : b.title || plain.slice(0, 36) || "텍스트",
      icon: isList ? "list" : "type",
      badge: b.frame ? "2D" : listBadge,
      selectBlockId: b.blockId,
      selectSlotId: b.slotId,
      sourceNodeId: b.sourceNodeId,
      isBlock: true,
      locked,
      hidden,
      active: b.blockId === ctx.selectedBlockId || Boolean(b.slotId && b.slotId === ctx.selectedSlotId),
    };
  },
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
