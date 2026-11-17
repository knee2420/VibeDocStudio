import { getBlockKind, getBlockSlotIds, tidyBlockTitle, type LayoutBlock, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

import { htmlToPlain, sumStats, type CharStat } from "@/shared/lib";

import { buildChanges, type ChangeItem, type SlotLocation } from "./changeSet";

/**
 * 블록 단위 변경 — 이 앱의 단위(블록 추가 · 에셋 · 레고 부품)에 맞춰 "블록 몇 개를 고치고 · 넣고 · 지우고 · 옮겼나".
 * 표 · 다단처럼 칸이 여러 개인 블록은 블록 하나로 세고, 안에서 바뀐 칸 수를 따로 붙인다 ("표 · 칸 3개 고침").
 */
export type BlockChangeKind = "added" | "removed" | "edited" | "moved";

export interface BlockChange {
  blockId: string;
  kind: BlockChangeKind;
  /** 블록 종류 이름 ("표", "텍스트", "이미지") */
  kindLabel: string;
  /** 블록 이름 — 블록 제목, 없으면 첫 글 */
  name: string;
  /** 칸이 여러 개인 블록 (표 · 다단 · 서식) */
  multiSlot: boolean;
  /** 글이 바뀐 칸 (표면 칸마다) */
  items: ChangeItem[];
  /** 글 말고 블록 자체(행 · 열 구성, 크기, 배치, 속성)가 바뀜 */
  layoutChanged: boolean;
  stat: CharStat;
}

export interface BlockCounts {
  edited: number;
  added: number;
  removed: number;
  moved: number;
}

export const countBlocks = (changes: BlockChange[]): BlockCounts => {
  const c: BlockCounts = { edited: 0, added: 0, removed: 0, moved: 0 };
  for (const b of changes) c[b.kind] += 1;
  return c;
};

export const addCounts = (list: BlockCounts[]): BlockCounts =>
  list.reduce((a, c) => ({ edited: a.edited + c.edited, added: a.added + c.added, removed: a.removed + c.removed, moved: a.moved + c.moved }), {
    edited: 0,
    added: 0,
    removed: 0,
    moved: 0,
  });

/** "블록 2개 고침 · 1개 추가 · 1개 삭제" (없는 것은 뺀다). */
export function formatBlockCounts(c: BlockCounts): string {
  const parts = [
    c.edited && `${c.edited}개 고침`,
    c.added && `${c.added}개 추가`,
    c.removed && `${c.removed}개 삭제`,
    c.moved && `${c.moved}개 이동`,
  ].filter(Boolean);
  return parts.length ? `블록 ${parts.join(" · ")}` : "";
}

/** 블록 이름: "표 · 중동여행 비용" 의 뒷부분. */
export function blockName(block: LayoutBlock, slots: VDocDocument["slots"]): string {
  const title = tidyBlockTitle(block.title);
  if (title) return title;
  for (const id of getBlockSlotIds(block)) {
    const text = htmlToPlain(slots[id]?.content ?? "", 30);
    if (text) return text;
  }
  return "";
}

/** 공통 블록 중 순서가 바뀐 것 — 가장 긴 "제자리" 줄(LIS)에 들지 않는 블록만 "이동". */
function movedIds(baseOrder: string[], nowOrder: string[]): Set<string> {
  const pos = new Map(baseOrder.map((id, i) => [id, i]));
  const seq = nowOrder.filter((id) => pos.has(id));
  const idx = seq.map((id) => pos.get(id)!);
  // LIS (O(n log n)) 로 제자리에 남은 블록을 고른다.
  const tails: number[] = [];
  const tailAt: number[] = [];
  const prev: number[] = new Array(idx.length).fill(-1);
  idx.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailAt[lo] = i;
    prev[i] = lo > 0 ? tailAt[lo - 1] : -1;
  });
  const stay = new Set<string>();
  for (let i = tailAt[tails.length - 1] ?? -1; i >= 0; i = prev[i]) stay.add(seq[i]);
  return new Set(seq.filter((id) => !stay.has(id)));
}

export interface PageBlockInput {
  /** 지금 쪽 (지운 쪽이면 null) */
  page: VDocPage | null;
  /** 기준 쪽 (새 쪽 · 기준이 없으면 null) */
  basePage: VDocPage | null;
  doc: Pick<VDocDocument, "slots">;
  /** 기준 문서 칸 (없으면 `beforeOf` 로) */
  base: Pick<VDocDocument, "slots"> | null;
  /** 기준이 없을 때 칸의 이전 글 (undefined 면 안 바뀐 칸) */
  beforeOf?: (slotId: string) => string | undefined;
  /** 지금 칸 글 (AI 변경안이 스테이징돼 있으면 그 글) */
  afterOf: (slotId: string) => string;
  where: Map<string, SlotLocation>;
  baseWhere: Map<string, SlotLocation> | null;
  /** 다른 쪽으로 옮겨 간 블록은 "삭제"가 아니다 */
  liveBlockIds: Set<string>;
}

/** 쪽 하나의 블록 변경 (지금 쪽 순서대로, 지운 블록은 뒤에). */
export function pageBlockChanges(input: PageBlockInput): BlockChange[] {
  const { page, basePage, doc, base, beforeOf, afterOf, where, baseWhere, liveBlockIds } = input;
  const baseBlocks = new Map(basePage?.blocks.map((b) => [b.blockId, b]) ?? []);
  const moved = page && basePage ? movedIds(basePage.blocks.map((b) => b.blockId), page.blocks.map((b) => b.blockId)) : new Set<string>();
  const out: BlockChange[] = [];

  const describe = (block: LayoutBlock, slots: VDocDocument["slots"]) => ({
    kindLabel: getBlockKind(block.kind).label,
    name: blockName(block, slots),
    multiSlot: getBlockSlotIds(block).length > 1,
  });

  for (const block of page?.blocks ?? []) {
    const then = baseBlocks.get(block.blockId);
    const added = Boolean(base) && !then;
    const ids = [...new Set([...getBlockSlotIds(block), ...(then ? getBlockSlotIds(then) : [])])];
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const changed: string[] = [];
    for (const id of ids) {
      const now = getBlockSlotIds(block).includes(id) ? afterOf(id) : "";
      const was = added ? "" : base ? (then && getBlockSlotIds(then).includes(id) ? (base.slots[id]?.content ?? "") : "") : beforeOf?.(id);
      if (was === undefined || was === now) continue;
      changed.push(id);
      before[id] = was;
      after[id] = now;
    }
    const items = buildChanges(doc, where, { slotIds: changed, before, after });
    const layoutChanged = Boolean(then) && JSON.stringify(block) !== JSON.stringify(then);
    const kind: BlockChangeKind | null = added ? "added" : items.length || layoutChanged ? "edited" : moved.has(block.blockId) ? "moved" : null;
    if (!kind) continue;
    out.push({ blockId: block.blockId, kind, ...describe(block, doc.slots), items, layoutChanged, stat: sumStats(items.map((i) => i.stat)) });
  }

  if (base && basePage) {
    for (const block of basePage.blocks) {
      if (liveBlockIds.has(block.blockId)) continue;
      const ids = getBlockSlotIds(block).filter((id) => (base.slots[id]?.content ?? "") !== "");
      const items = buildChanges(base, baseWhere ?? where, {
        slotIds: ids,
        before: Object.fromEntries(ids.map((id) => [id, base.slots[id]?.content ?? ""])),
        after: Object.fromEntries(ids.map((id) => [id, ""])),
      });
      out.push({ blockId: block.blockId, kind: "removed", ...describe(block, base.slots), items, layoutChanged: false, stat: sumStats(items.map((i) => i.stat)) });
    }
  }
  return out;
}

/** 블록 한 줄 설명: "칸 3개 고침" · "행 · 열 구성 바뀜" · "추가" · "삭제" · "자리 옮김". */
export function blockChangeDetail(b: BlockChange): string {
  if (b.kind === "added") return "추가";
  if (b.kind === "removed") return "삭제";
  if (b.kind === "moved") return "자리 옮김";
  const parts: string[] = [];
  if (b.items.length) parts.push(b.multiSlot ? `칸 ${b.items.length}개 고침` : "글 고침");
  if (b.layoutChanged) parts.push(b.multiSlot ? "구성 바뀜" : "모양 바뀜");
  return parts.join(" · ");
}

export interface SlotBlock {
  blockId: string;
  kindLabel: string;
  name: string;
  multiSlot: boolean;
}

/** 칸 → 그 칸이 든 블록 (검토 화면에서 표의 칸들을 블록 하나 아래 묶으려고). 앞 문서가 우선. */
export function slotBlockIndex(...docs: (Pick<VDocDocument, "pages" | "slots"> | null | undefined)[]): Map<string, SlotBlock> {
  const map = new Map<string, SlotBlock>();
  for (const doc of docs) {
    if (!doc) continue;
    for (const page of doc.pages) {
      for (const block of page.blocks) {
        const ids = getBlockSlotIds(block);
        const info = { blockId: block.blockId, kindLabel: getBlockKind(block.kind).label, name: blockName(block, doc.slots), multiSlot: ids.length > 1 };
        for (const id of ids) if (!map.has(id)) map.set(id, info);
      }
    }
  }
  return map;
}
