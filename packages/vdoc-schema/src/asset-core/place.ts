/**
 * 에셋 인스턴스 블록을 문서에 놓기 (순수 함수).
 * - insert: 기준 블록 뒤(없으면 첫 쪽 끝)에 끼운다
 * - replace: 바꿀 블록들 중 첫 자리에 새 블록을 놓고 나머지는 지운다 — 새 블록이 이어받지 않은 칸은 지운다
 */
import { getBlockSlotIds } from "../block-ops";
import type { LayoutBlock, VDocDocument, VDocSlot } from "../types";

export interface PlaceAssetBlocksInput {
  readonly mode: "insert" | "replace";
  readonly anchorBlockId?: string;
  readonly replaceBlockIds?: readonly string[];
  readonly blocks: readonly LayoutBlock[];
  readonly slots: Readonly<Record<string, VDocSlot>>;
}

function slotIdsDeep(block: LayoutBlock): string[] {
  const out = [...getBlockSlotIds(block)];
  const rec = block as unknown as { rows?: { cells: { blocks?: LayoutBlock[] }[] }[]; columns?: { blocks?: LayoutBlock[] }[] };
  for (const row of rec.rows ?? []) for (const c of row.cells) for (const b of c.blocks ?? []) out.push(...slotIdsDeep(b));
  for (const col of rec.columns ?? []) for (const b of col.blocks ?? []) out.push(...slotIdsDeep(b));
  return out;
}

export function placeAssetBlocks(doc: VDocDocument, input: PlaceAssetBlocksInput): VDocDocument {
  const pages = doc.pages.map((p) => ({ ...p, blocks: [...p.blocks] }));
  const slots: Record<string, VDocSlot> = { ...doc.slots };
  const find = (id: string) => {
    for (const p of pages) {
      const i = p.blocks.findIndex((b) => b.blockId === id);
      if (i >= 0) return { page: p, index: i };
    }
    return null;
  };

  if (input.mode === "replace") {
    const ids = input.replaceBlockIds ?? [];
    if (!ids.length) throw new Error("바꿀 블록이 없습니다.");
    const first = find(ids[0]);
    if (!first) throw new Error(`바꿀 블록이 문서에 없습니다: ${ids[0]}`);
    const removedSlots = new Set<string>();
    for (const id of ids) {
      const loc = find(id);
      if (!loc) continue;
      for (const s of slotIdsDeep(loc.page.blocks[loc.index])) removedSlots.add(s);
    }
    const anchorPage = first.page;
    const anchorBlock = anchorPage.blocks[first.index];
    for (const id of ids) {
      const loc = find(id);
      if (loc) loc.page.blocks.splice(loc.index, 1);
    }
    const at = Math.min(first.index, anchorPage.blocks.length);
    anchorPage.blocks.splice(at, 0, ...input.blocks.map((b, i) => (i === 0 && anchorBlock.sourceNodeId ? { ...b, sourceNodeId: anchorBlock.sourceNodeId } : b)));
    const kept = new Set(Object.keys(input.slots));
    for (const s of removedSlots) if (!kept.has(s)) delete slots[s];
  } else {
    const loc = input.anchorBlockId ? find(input.anchorBlockId) : null;
    if (input.anchorBlockId && !loc) throw new Error(`기준 블록이 문서에 없습니다: ${input.anchorBlockId}`);
    const page = loc?.page ?? pages[0];
    if (!page) throw new Error("문서에 쪽이 없습니다.");
    page.blocks.splice(loc ? loc.index + 1 : page.blocks.length, 0, ...input.blocks);
  }
  for (const [id, s] of Object.entries(input.slots)) {
    const prev = slots[id];
    // 이어받은 칸은 근거 연결 · 채움 이력을 남긴다
    slots[id] = prev ? { ...prev, content: s.content, label: prev.label || s.label } : s;
  }
  return { ...doc, pages, slots, updatedAt: new Date().toISOString() };
}
