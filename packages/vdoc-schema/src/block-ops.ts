import { getBlockKind } from "./block-kit";
import type { LayoutBlock, VDocPage, VDocSlot } from "./types";

/** Every slotId a layout block renders, in reading order (각 블록 종류의 정의가 정한다 — `block-kit`). */
export function getBlockSlotIds(block: LayoutBlock): string[] {
  if (!block) return [];
  return getBlockKind(block.kind).slotIds(block);
}

/** A block is locked when it has slots and every one of them is locked. */
export function isBlockLocked(block: LayoutBlock, slots: Record<string, VDocSlot>): boolean {
  const ids = getBlockSlotIds(block) ?? [];
  return ids.length > 0 && ids.every((id) => Boolean(slots[id]?.constraints?.locked));
}

export interface CloneBlockOptions {
  /** 복제된 슬롯 라벨 뒤에 `" (복제)"` 접미사를 붙일지 여부 (기본 `true`). 붙여넣기에서는 `false`. */
  copySuffix?: boolean;
}

/**
 * Deep-copies a block with fresh block/row/cell/slot ids so the copy edits independently.
 * Returns the cloned block and the slot map with the cloned slots added.
 */
export function cloneBlockWithSlots(
  block: LayoutBlock,
  slots: Record<string, VDocSlot>,
  newId: () => string,
  options: CloneBlockOptions = {}
): { block: LayoutBlock; slots: Record<string, VDocSlot> } {
  const copySuffix = options.copySuffix ?? true;
  const nextSlots = { ...slots };
  const slotMap = new Map<string, string>();
  for (const id of getBlockSlotIds(block)) {
    const source = slots[id];
    if (!source) continue;
    const copyId = `${id}_copy_${newId()}`;
    slotMap.set(id, copyId);
    nextSlots[copyId] = {
      ...source,
      slotId: copyId,
      label: copySuffix ? `${source.label} (복제)` : source.label,
      backDataRefs: [...source.backDataRefs],
    };
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
