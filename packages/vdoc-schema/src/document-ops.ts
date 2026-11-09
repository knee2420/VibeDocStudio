/**
 * @vibe/vdoc-schema — 블록 단위 순수 문서 연산 (이동 · 삽입 · 삭제 · 복제 · 잠금 · 프레임 · 표).
 * 바뀐 것이 없으면 같은 문서 참조를 돌려준다.
 */
import { getBlockKind } from "./block-kit";
import { cloneBlockWithSlots, getBlockSlotIds, isBlockLocked } from "./block-ops";
import { applyTableCommand, type TableCommand } from "./table-ops";
import type { LayoutBlock, VDocDocument, VDocSlot } from "./types";

export type IdFactory = () => string;

export interface BlockLocation {
  pageId: string;
  index: number;
  block: LayoutBlock;
}

export function findBlock(doc: VDocDocument, blockId: string): BlockLocation | null {
  for (const page of doc.pages) {
    const index = page.blocks.findIndex((b) => b.blockId === blockId);
    if (index >= 0) return { pageId: page.pageId, index, block: page.blocks[index] };
  }
  return null;
}

function mapPageBlocks(
  doc: VDocDocument,
  pageId: string,
  fn: (blocks: LayoutBlock[]) => LayoutBlock[]
): VDocDocument {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.pageId !== pageId) return p;
    const blocks = fn(p.blocks);
    if (blocks === p.blocks) return p;
    changed = true;
    return { ...p, blocks };
  });
  return changed ? { ...doc, pages } : doc;
}

export function mapBlock(
  doc: VDocDocument,
  pageId: string,
  blockId: string,
  fn: (block: LayoutBlock) => LayoutBlock
): VDocDocument {
  return mapPageBlocks(doc, pageId, (blocks) => {
    let changed = false;
    const next = blocks.map((b) => {
      if (b.blockId !== blockId) return b;
      const mapped = fn(b);
      if (mapped !== b) changed = true;
      return mapped;
    });
    return changed ? next : blocks;
  });
}

/** 같은 페이지 안에서 한 칸 위/아래로. */
export function moveBlockByOffset(
  doc: VDocDocument,
  pageId: string,
  blockIndex: number,
  direction: -1 | 1
): VDocDocument {
  return mapPageBlocks(doc, pageId, (blocks) => {
    const target = blockIndex + direction;
    if (target < 0 || target >= blocks.length) return blocks;
    const next = [...blocks];
    const [moved] = next.splice(blockIndex, 1);
    next.splice(target, 0, moved);
    return next;
  });
}

/** 끌어 놓기 이동. `toIndex` 는 대상 페이지에서 빼기 전 기준 삽입 위치. */
export function moveBlockToPosition(
  doc: VDocDocument,
  fromPageId: string,
  blockId: string,
  toPageId: string,
  toIndex: number
): VDocDocument {
  const fromPage = doc.pages.find((p) => p.pageId === fromPageId);
  const fromIndex = fromPage?.blocks.findIndex((b) => b.blockId === blockId) ?? -1;
  if (!fromPage || fromIndex < 0) return doc;
  const block = fromPage.blocks[fromIndex];
  const adjusted = fromPageId === toPageId && fromIndex < toIndex ? toIndex - 1 : toIndex;
  if (fromPageId === toPageId && adjusted === fromIndex) return doc;
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      let blocks = p.blocks;
      if (p.pageId === fromPageId) blocks = blocks.filter((b) => b.blockId !== blockId);
      if (p.pageId === toPageId) {
        blocks = [...blocks];
        blocks.splice(Math.min(adjusted, blocks.length), 0, block);
      }
      return blocks === p.blocks ? p : { ...p, blocks };
    }),
  };
}

export function removeBlock(doc: VDocDocument, pageId: string, blockId: string): VDocDocument {
  return mapPageBlocks(doc, pageId, (blocks) =>
    blocks.some((b) => b.blockId === blockId) ? blocks.filter((b) => b.blockId !== blockId) : blocks
  );
}

/** 블록과 그 블록이 쓰는 새 슬롯을 함께 넣는다 (`atIndex` 생략 시 페이지 끝). */
export function insertBlock(
  doc: VDocDocument,
  pageId: string,
  block: LayoutBlock,
  newSlots: Record<string, VDocSlot>,
  atIndex?: number
): VDocDocument {
  if (!doc.pages.some((p) => p.pageId === pageId)) return doc;
  const withBlock = mapPageBlocks(doc, pageId, (blocks) => {
    const next = [...blocks];
    next.splice(atIndex ?? next.length, 0, block);
    return next;
  });
  return { ...withBlock, slots: { ...doc.slots, ...newSlots } };
}

export function duplicateBlock(
  doc: VDocDocument,
  pageId: string,
  blockId: string,
  newId: IdFactory
): VDocDocument {
  const page = doc.pages.find((p) => p.pageId === pageId);
  const index = page?.blocks.findIndex((b) => b.blockId === blockId) ?? -1;
  if (!page || index < 0) return doc;
  const { block, slots } = cloneBlockWithSlots(page.blocks[index], doc.slots, newId);
  return { ...insertBlock(doc, pageId, block, {}, index + 1), slots };
}

/**
 * 다른 문서(참조 문서 등)의 블록을 슬롯째 복제해 `targetPageId` 끝에 붙인다.
 * 원본 문서는 바뀌지 않는다.
 */
export function importBlockFromDocument(
  target: VDocDocument,
  source: VDocDocument,
  blockId: string,
  targetPageId: string,
  newId: IdFactory
): VDocDocument {
  const found = findBlock(source, blockId);
  if (!found) return target;
  const { block, slots } = cloneBlockWithSlots(found.block, source.slots, newId);
  const clonedSlots = Object.fromEntries(
    getBlockSlotIds(block).flatMap((id) => (slots[id] ? [[id, slots[id]]] : []))
  );
  return insertBlock(target, targetPageId, block, clonedSlots);
}

/** 블록의 모든 슬롯을 함께 잠그거나 푼다. */
export function toggleBlockLock(doc: VDocDocument, pageId: string, blockId: string): VDocDocument {
  const block = doc.pages.find((p) => p.pageId === pageId)?.blocks.find((b) => b.blockId === blockId);
  if (!block) return doc;
  const lock = !isBlockLocked(block, doc.slots);
  const slots = { ...doc.slots };
  for (const id of getBlockSlotIds(block)) {
    const slot = slots[id];
    if (slot) slots[id] = { ...slot, constraints: { ...slot.constraints, locked: lock } };
  }
  return { ...doc, slots };
}

const MIN_FRAME_SIZE = 24;
const DEFAULT_FRAME_SIZE = 100;

/** 고정 위치(frame) 블록의 자유 배치. */
export function moveBlockFrame(doc: VDocDocument, pageId: string, blockId: string, x: number, y: number) {
  return mapBlock(doc, pageId, blockId, (block) =>
    block.frame ? { ...block, frame: { ...block.frame, x: Math.max(0, x), y: Math.max(0, y) } } : block
  );
}

/** 고정 위치(frame) 블록의 크기를 변화량만큼 바꾼다. */
export function resizeBlockFrame(doc: VDocDocument, pageId: string, blockId: string, dw: number, dh: number) {
  return mapBlock(doc, pageId, blockId, (block) => {
    if (!block.frame) return block;
    return {
      ...block,
      frame: {
        ...block.frame,
        w: Math.max(MIN_FRAME_SIZE, Math.round((block.frame.w ?? DEFAULT_FRAME_SIZE) + dw)),
        h: Math.max(MIN_FRAME_SIZE, Math.round((block.frame.h ?? DEFAULT_FRAME_SIZE) + dh)),
      },
    };
  });
}

/**
 * 블록 정의가 허용한 속성(`ai.editableProps`)만 골라 검사한다. 허용되지 않거나 형식이 틀린 값은 이유와 함께 돌려준다.
 */
export function validateBlockProps(
  block: LayoutBlock,
  props: Record<string, unknown>
): { ok: Record<string, string | number | boolean>; rejected: { key: string; why: string }[] } {
  const specs = getBlockKind(block.kind).ai?.editableProps ?? {};
  const ok: Record<string, string | number | boolean> = {};
  const rejected: { key: string; why: string }[] = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    const spec = specs[key];
    if (!spec) rejected.push({ key, why: "이 블록 종류에서 바꿀 수 없는 속성" });
    else if (typeof value !== spec.type) rejected.push({ key, why: `${spec.type} 값이어야 함` });
    else if (spec.enum && !spec.enum.includes(String(value))) rejected.push({ key, why: `허용 값: ${spec.enum.join(", ")}` });
    else ok[key] = value as string | number | boolean;
  }
  return { ok, rejected };
}

/** 검사를 통과한 속성만 블록에 덮어쓴다. */
export function patchBlockProps(doc: VDocDocument, blockId: string, props: Record<string, unknown>): VDocDocument {
  const loc = findBlock(doc, blockId);
  if (!loc) return doc;
  const { ok } = validateBlockProps(loc.block, props);
  if (Object.keys(ok).length === 0) return doc;
  const next = mapBlock(doc, loc.pageId, blockId, (block) => ({ ...block, ...ok }) as LayoutBlock);
  return next === doc ? doc : { ...next, updatedAt: new Date().toISOString() };
}

/** 표 명령을 표 블록 또는 복합 양식 프레임의 한 구역에 적용한다. */
export function applyTableCommandToDocument(
  doc: VDocDocument,
  pageId: string,
  blockId: string,
  sectionId: string | null,
  cmd: TableCommand,
  newId: IdFactory
): VDocDocument {
  let slots = doc.slots;
  const next = mapBlock(doc, pageId, blockId, (block) => {
    // 블록 안의 표(단일 표 · 서식 구역)는 블록 정의가 알려 준다.
    const def = getBlockKind(block.kind);
    const tables = def.tables?.(block) ?? [];
    const target =
      tables.length === 1 && tables[0].sectionId === null ? tables[0] : tables.find((t) => sectionId && t.sectionId === sectionId);
    if (!target || !def.replaceTable) return block;
    const result = applyTableCommand(target.table, slots, cmd, newId);
    if (!result) return block;
    slots = result.slots;
    return def.replaceTable(block, target.sectionId, result.block);
  });
  if (slots === doc.slots && next === doc) return doc;
  return { ...next, slots, updatedAt: new Date().toISOString() };
}
