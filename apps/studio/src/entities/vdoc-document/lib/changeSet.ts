import { getBlockSlotIds, type VDocDocument, type VDocPage, type VDocSlot } from "@vibe/vdoc-schema";

import { diffParagraphs, htmlToPlain, paraStat, sumStats, type CharStat, type ParaDiff } from "@/shared/lib";

/** 이 블록의 글이 그 아래 내용의 "제목" (위치 표시: 3쪽 › 1. 시스템 구현 개요). */
const HEADING_KINDS = new Set(["heading", "form-title", "cover-banner", "hero"]);

export interface SlotLocation {
  pageId: string;
  /** 1부터 */
  pageNo: number;
  pageLabel: string;
  /** 바로 위 제목 글 (없으면 null) */
  heading: string | null;
  /** 문서 안 순서 */
  order: number;
}

/** 칸 → 쪽 번호 · 바로 위 제목. 지금 문서에 없는 칸(지운 칸)은 없다. */
export function slotLocations(pages: VDocPage[], slots: Record<string, VDocSlot>): Map<string, SlotLocation> {
  const map = new Map<string, SlotLocation>();
  let order = 0;
  pages.forEach((page, index) => {
    const base = { pageId: page.pageId, pageNo: index + 1, pageLabel: page.pageLabel };
    if (page.headerSlotId) map.set(page.headerSlotId, { ...base, heading: "머리말", order: order++ });
    let heading: string | null = null;
    for (const block of page.blocks) {
      const ids = getBlockSlotIds(block);
      for (const id of ids) if (!map.has(id)) map.set(id, { ...base, heading, order: order++ });
      if (HEADING_KINDS.has(block.kind) && ids[0]) {
        const text = htmlToPlain(slots[ids[0]]?.content ?? "", 40);
        if (text) heading = text;
      }
    }
    if (page.footerSlotId && !map.has(page.footerSlotId)) map.set(page.footerSlotId, { ...base, heading: "꼬리말", order: order++ });
  });
  return map;
}

/** "3쪽" 뒤에 붙일 쪽 이름 — "3쪽"처럼 번호뿐이면 생략. */
export const pageTitle = (loc: Pick<SlotLocation, "pageNo" | "pageLabel">) =>
  /^\s*\d+\s*(쪽|페이지|page)?\s*$/i.test(loc.pageLabel) ? `${loc.pageNo}쪽` : `${loc.pageNo}쪽 · ${loc.pageLabel}`;

export interface ChangeItem {
  slotId: string;
  /** 칸 이름 (본문 · 소제목 · 표 1행 2열 …) */
  label: string;
  location: SlotLocation | null;
  before: string;
  after: string;
  paras: ParaDiff[];
  stat: CharStat;
  /** 글은 같고 서식 · 속성만 바뀜 */
  formatOnly: boolean;
}

export interface ChangeInput {
  slotIds: string[];
  before: Record<string, string>;
  after: Record<string, string>;
  /** 지금 문서에 없는 칸의 이름 */
  labels?: Record<string, string>;
}

/** 바뀐 칸들 → 문서 순서의 변경 목록. 앞뒤 모두 글이 없는 칸(빈 칸 태그만 바뀜)은 뺀다. */
export function buildChanges(doc: Pick<VDocDocument, "slots"> | null, where: Map<string, SlotLocation>, input: ChangeInput): ChangeItem[] {
  const items: ChangeItem[] = [];
  for (const slotId of input.slotIds) {
    const before = input.before[slotId] ?? "";
    const after = input.after[slotId] ?? "";
    if (before === after) continue;
    const paras = diffParagraphs(before, after);
    if (paras.length === 0) continue;
    const stat = paraStat(paras);
    items.push({
      slotId,
      label: input.labels?.[slotId] ?? doc?.slots[slotId]?.label ?? "칸",
      location: where.get(slotId) ?? null,
      before,
      after,
      paras,
      stat,
      formatOnly: stat.added === 0 && stat.removed === 0,
    });
  }
  return items.sort((a, b) => (a.location?.order ?? Number.MAX_SAFE_INTEGER) - (b.location?.order ?? Number.MAX_SAFE_INTEGER));
}

export interface ChangePageGroup {
  key: string;
  location: SlotLocation | null;
  items: ChangeItem[];
  stat: CharStat;
}

/** 쪽별로 묶기 (지운 칸은 맨 뒤 "지금 문서에 없는 칸"). */
export function groupChangesByPage(items: ChangeItem[]): ChangePageGroup[] {
  const groups = new Map<string, ChangePageGroup>();
  for (const item of items) {
    const key = item.location?.pageId ?? "__missing";
    const g = groups.get(key) ?? { key, location: item.location, items: [], stat: { added: 0, removed: 0 } };
    g.items.push(item);
    groups.set(key, g);
  }
  for (const g of groups.values()) g.stat = sumStats(g.items.map((i) => i.stat));
  return [...groups.values()];
}

export interface ChangeSummary {
  /** 바뀐 곳 (칸) 수 */
  places: number;
  /** 바뀐 쪽 번호 (오름차순) */
  pageNos: number[];
  stat: CharStat;
}

export function summarizeChanges(items: ChangeItem[]): ChangeSummary {
  const pageNos = [...new Set(items.map((i) => i.location?.pageNo).filter((n): n is number => typeof n === "number"))].sort((a, b) => a - b);
  return { places: items.length, pageNos, stat: sumStats(items.map((i) => i.stat)) };
}

/** 쪽 번호 목록을 짧게: [1,2,3,7,9,10] → "1–3, 7, 9–10쪽" */
export function formatPageNos(nos: number[]): string {
  if (nos.length === 0) return "";
  const parts: string[] = [];
  let start = nos[0];
  let prev = nos[0];
  for (const n of [...nos.slice(1), Number.NaN]) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return `${parts.join(", ")}쪽`;
}

/** "+1,240자 −320자" */
export const formatCharStat = ({ added, removed }: CharStat) =>
  `+${added.toLocaleString()}자 −${removed.toLocaleString()}자`;
