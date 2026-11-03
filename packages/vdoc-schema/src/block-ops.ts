import type { LayoutBlock, VDocPage, VDocSlot } from "./types";

/** Every slotId a layout block renders, in reading order. */
export function getBlockSlotIds(block: LayoutBlock): string[] {
  switch (block.kind) {
    case "heading":
    case "form-title":
    case "fillable-group":
    case "text":
      return [block.slotId];
    case "section-block":
      return [block.headingSlotId, block.bodySlotId];
    case "cover-banner":
      return [block.headlineSlotId, block.preparedBySlotId, block.preparedForSlotId];
    case "columns-grid":
      return block.columns
        ? block.columns.flatMap((c) => (c.slotId ? [c.slotId] : []))
        : block.slotIds ?? [];
    case "structured-table":
    case "table":
      return [
        ...block.rows.flatMap((r) => r.cells.map((c) => c.slotId)),
        ...(block.footerSummary?.items.flatMap((i) =>
          [i.slotId, i.labelSlotId, i.valueSlotId].filter((s): s is string => Boolean(s))
        ) ?? []),
      ];
    case "composite-form-frame":
      return block.sections.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => c.slotId)));
    case "summary-list":
      return block.items.flatMap((i) =>
        [i.slotId, i.labelSlotId, i.valueSlotId].filter((s): s is string => Boolean(s))
      );
    case "image":
      return [];
  }
}

/** A block is locked when it has slots and every one of them is locked. */
export function isBlockLocked(block: LayoutBlock, slots: Record<string, VDocSlot>): boolean {
  const ids = getBlockSlotIds(block);
  return ids.length > 0 && ids.every((id) => Boolean(slots[id]?.constraints?.locked));
}

/**
 * Deep-copies a block with fresh block/row/cell/slot ids so the copy edits independently.
 * Returns the cloned block and the slot map with the cloned slots added.
 */
export function cloneBlockWithSlots(
  block: LayoutBlock,
  slots: Record<string, VDocSlot>,
  newId: () => string
): { block: LayoutBlock; slots: Record<string, VDocSlot> } {
  const nextSlots = { ...slots };
  const slotMap = new Map<string, string>();
  for (const id of getBlockSlotIds(block)) {
    const source = slots[id];
    if (!source) continue;
    const copyId = `${id}_copy_${newId()}`;
    slotMap.set(id, copyId);
    nextSlots[copyId] = { ...source, slotId: copyId, label: `${source.label} (복제)`, backDataRefs: [...source.backDataRefs] };
  }
  const json = JSON.stringify(block, (key, value) => {
    if (typeof value !== "string") return value;
    if (/(^|[a-z])(slotId|SlotId)$/.test(key) && slotMap.has(value)) return slotMap.get(value);
    if (key === "slotIds") return value;
    if (key === "blockId" || key === "rowId" || key === "cellId" || key === "sectionId" || key === "itemId") {
      return `${value}_copy_${newId()}`;
    }
    return value;
  });
  const cloned = JSON.parse(json, (key, value) =>
    key === "slotIds" && Array.isArray(value) ? value.map((v: string) => slotMap.get(v) ?? v) : value
  ) as LayoutBlock;
  return { block: cloned, slots: nextSlots };
}

/**
 * Every slot a page references (header/footer + all blocks), found by walking `*SlotId` / `slotIds`
 * keys so new block kinds are covered without changes. Mirrors the API's `iter_slot_refs`.
 */
export function* iterPageSlotIds(page: VDocPage): Generator<string> {
  const stack: unknown[] = [page];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const lowered = key.toLowerCase();
        if (typeof value === "string" && lowered.endsWith("slotid")) yield value;
        else if (lowered === "slotids" && Array.isArray(value)) {
          for (const id of value) if (typeof id === "string") yield id;
        } else if (value && typeof value === "object") stack.push(value);
      }
    }
  }
}
