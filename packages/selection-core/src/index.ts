/**
 * @vibe/selection-core — 화면 어디서나 같은 규칙으로 동작하는 다중 선택 모델.
 *
 * 2D 캔버스(블록 · 칸 · 표 하위 노드) · 탐색기(파일) · 아웃라인(노드)이 모두 이 하나를 쓴다.
 * - 선택 집합은 고른 순서를 지키는 목록 + 주 항목(마지막으로 고른 것 · 인스펙터 · 편집 대상) + 범위 앵커.
 * - 바뀌지 않으면 같은 객체를 돌려준다 (구독자가 참조 비교로 다시 그리기를 건너뛸 수 있다).
 * - React · 문서 형식 · DOM 을 모른다. 마키 적중 판정은 사각형 목록만 받는다.
 */

export interface SelectionItem {
  readonly id: string;
  /** 같은 id 라도 종류가 다르면 다른 항목 (예: "block" · "slot" · "cell" · "file" · "node"). */
  readonly kind: string;
}

export interface SelectionSet<T extends SelectionItem = SelectionItem> {
  readonly items: readonly T[];
  /** 주 항목 키 (`selectionKey`) — 인스펙터 · 편집 · 키보드 포커스가 따른다. */
  readonly primaryKey: string | null;
  /** Shift 범위 선택의 시작점 키. */
  readonly anchorKey: string | null;
}

export const EMPTY_SELECTION: SelectionSet<never> = Object.freeze({
  items: Object.freeze([]) as readonly never[],
  primaryKey: null,
  anchorKey: null,
});

export const emptySelection = <T extends SelectionItem>(): SelectionSet<T> => EMPTY_SELECTION as unknown as SelectionSet<T>;

export const selectionKey = (item: Pick<SelectionItem, "id" | "kind">): string => `${item.kind}:${item.id}`;

export function isSelected<T extends SelectionItem>(set: SelectionSet<T>, item: Pick<SelectionItem, "id" | "kind">): boolean {
  const key = selectionKey(item);
  return set.items.some((it) => selectionKey(it) === key);
}

export function primaryItem<T extends SelectionItem>(set: SelectionSet<T>): T | null {
  if (!set.primaryKey) return null;
  return set.items.find((it) => selectionKey(it) === set.primaryKey) ?? null;
}

/** 종류별 id 목록 (고른 순서). `kind` 가 없으면 전부. */
export function selectedIds<T extends SelectionItem>(set: SelectionSet<T>, kind?: string | readonly string[]): string[] {
  const kinds = kind === undefined ? null : new Set(typeof kind === "string" ? [kind] : kind);
  return set.items.filter((it) => !kinds || kinds.has(it.kind)).map((it) => it.id);
}

function dedupe<T extends SelectionItem>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = selectionKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function sameItems<T extends SelectionItem>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (selectionKey(a[i]) !== selectionKey(b[i])) return false;
  return true;
}

/** 새 집합을 만들되 바뀐 것이 없으면 이전 객체를 그대로 돌려준다. */
function settle<T extends SelectionItem>(prev: SelectionSet<T>, items: readonly T[], primaryKey: string | null, anchorKey: string | null): SelectionSet<T> {
  const next = dedupe(items);
  const keys = new Set(next.map(selectionKey));
  const primary = primaryKey && keys.has(primaryKey) ? primaryKey : next.length ? selectionKey(next[next.length - 1]) : null;
  const anchor = anchorKey && keys.has(anchorKey) ? anchorKey : primary;
  if (sameItems(prev.items, next) && prev.primaryKey === primary && prev.anchorKey === anchor) return prev;
  if (!next.length) return emptySelection<T>();
  return { items: next, primaryKey: primary, anchorKey: anchor };
}

export function setSelection<T extends SelectionItem>(prev: SelectionSet<T>, items: readonly T[], primaryKey?: string | null): SelectionSet<T> {
  const primary = primaryKey === undefined ? (items.length ? selectionKey(items[items.length - 1]) : null) : primaryKey;
  return settle(prev, items, primary, primary);
}

export function selectOnly<T extends SelectionItem>(prev: SelectionSet<T>, item: T | null): SelectionSet<T> {
  return item ? settle(prev, [item], selectionKey(item), selectionKey(item)) : clearSelection(prev);
}

export function clearSelection<T extends SelectionItem>(prev: SelectionSet<T>): SelectionSet<T> {
  return prev.items.length === 0 ? prev : emptySelection<T>();
}

/** Ctrl/⌘+클릭: 있으면 빼고 없으면 더한다. 더한 항목이 주 항목 · 새 앵커가 된다. */
export function toggleItem<T extends SelectionItem>(prev: SelectionSet<T>, item: T): SelectionSet<T> {
  const key = selectionKey(item);
  if (isSelected(prev, item)) {
    const rest = prev.items.filter((it) => selectionKey(it) !== key);
    return settle(prev, rest, prev.primaryKey === key ? null : prev.primaryKey, prev.anchorKey === key ? null : prev.anchorKey);
  }
  return settle(prev, [...prev.items, item], key, key);
}

export function addItems<T extends SelectionItem>(prev: SelectionSet<T>, items: readonly T[], primaryKey?: string | null): SelectionSet<T> {
  return settle(prev, [...prev.items, ...items], primaryKey ?? prev.primaryKey, prev.anchorKey);
}

export function removeItems<T extends SelectionItem>(prev: SelectionSet<T>, pred: (item: T) => boolean): SelectionSet<T> {
  const rest = prev.items.filter((it) => !pred(it));
  return rest.length === prev.items.length ? prev : settle(prev, rest, prev.primaryKey, prev.anchorKey);
}

/**
 * Shift+클릭: 앵커부터 대상까지 `order`(읽는 순서) 안의 항목을 고른다. 앵커는 그대로 둔다.
 * 앵커가 없거나 `order` 밖이면 대상 하나만 고른다. `additive` 면 기존 선택에 더한다 (Ctrl+Shift).
 */
export function selectRange<T extends SelectionItem>(prev: SelectionSet<T>, item: T, order: readonly T[], additive = false): SelectionSet<T> {
  const key = selectionKey(item);
  const keys = order.map(selectionKey);
  const to = keys.indexOf(key);
  const from = prev.anchorKey ? keys.indexOf(prev.anchorKey) : -1;
  if (to < 0 || from < 0) return selectOnly(prev, item);
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const range = order.slice(lo, hi + 1);
  return settle(prev, additive ? [...prev.items, ...range] : range, key, prev.anchorKey);
}

// --- 포인터 의도 ------------------------------------------------------------------------------------

export type SelectIntent = "replace" | "toggle" | "range" | "range-add";

export interface ModifierState {
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

/** 모든 화면이 같은 키 규칙을 쓴다: Shift = 범위, Ctrl/⌘ = 토글, Ctrl/⌘+Shift = 범위 더하기. */
export function intentFromModifiers(ev: ModifierState): SelectIntent {
  const toggle = Boolean(ev.ctrlKey || ev.metaKey);
  if (ev.shiftKey) return toggle ? "range-add" : "range";
  return toggle ? "toggle" : "replace";
}

export function applyIntent<T extends SelectionItem>(prev: SelectionSet<T>, intent: SelectIntent, item: T, order: readonly T[] = []): SelectionSet<T> {
  switch (intent) {
    case "toggle":
      return toggleItem(prev, item);
    case "range":
      return selectRange(prev, item, order);
    case "range-add":
      return selectRange(prev, item, order, true);
    default:
      return selectOnly(prev, item);
  }
}

// --- 마키(사각형) 적중 판정 -------------------------------------------------------------------------

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Rect {
  return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
}

export const rectArea = (r: Rect): number => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
}

/** 마키가 끌린 거리가 이보다 짧으면 클릭으로 본다 (px). */
export const MARQUEE_DRAG_THRESHOLD = 4;

export function isMarqueeDrag(x0: number, y0: number, x1: number, y1: number, threshold = MARQUEE_DRAG_THRESHOLD): boolean {
  return Math.abs(x1 - x0) >= threshold || Math.abs(y1 - y0) >= threshold;
}

/**
 * 마키에 걸린 항목 (후보 순서 유지).
 * - "intersect": 조금이라도 겹치면 (Figma 기본)
 * - "contain": 완전히 들어온 것만 (Alt 로 바꿀 때)
 */
export function hitTestRects<T extends SelectionItem>(
  candidates: readonly { readonly item: T; readonly rect: Rect }[],
  marquee: Rect,
  mode: "intersect" | "contain" = "intersect"
): T[] {
  const test = mode === "contain" ? (r: Rect) => rectContains(marquee, r) : (r: Rect) => rectsIntersect(marquee, r);
  return candidates.filter((c) => rectArea(c.rect) > 0 && test(c.rect)).map((c) => c.item);
}
