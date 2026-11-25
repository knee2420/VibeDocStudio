/**
 * 다른 데이터 → 에셋 (맞추기 · 적용).
 *
 * 정확히 같은 모양이 아닌 데이터라도 이름표(머리칸 글 · 힌트)의 유사도로 에셋 자리에 맞춘다.
 * - 같은 id → 같은 이름표 → 비슷한 이름표 순으로 짝짓는다
 * - 반복 단위는 레코드 수만큼 늘린다 (늘리기)
 * - 짝 없는 값은 버리지 않고 `unmapped` 로 남긴다 (에셋을 고칠지는 사람이 정한다)
 */
import type { LayoutBlock, VDocSlot } from "../types";
import { decomposeBlocks } from "./decompose";
import { instantiateAssetV3, type InstantiateResult } from "./instantiate";
import { collectFields, normalizeLabel, type AssetRecords, type AssetV3, type FieldRef, type SkelNode } from "./skeleton";

/** 바깥 데이터 한 항목 — 이름표와 값 (반복이면 레코드 배열). */
export interface SourceItem {
  readonly label: string;
  readonly value?: string;
  /** 반복 데이터 (표의 행들) — 각 레코드는 이름표 → 값 */
  readonly rows?: readonly Readonly<Record<string, string>>[];
}

export interface FieldMatch {
  readonly from: string;
  readonly to: string;
  readonly score: number;
}

export interface MapResult {
  readonly records: AssetRecords;
  readonly matches: FieldMatch[];
  /** 에셋에 자리가 없는 바깥 데이터 */
  readonly unmapped: string[];
  /** 데이터가 없는 에셋 자리 */
  readonly missing: string[];
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out.length ? out : s ? [s] : [];
}

/** 이름표 유사도 0..1 — 같음 1, 포함 0.85, 아니면 글자 두 개 묶음 Dice. */
export function labelSimilarity(a: string, b: string): number {
  const x = normalizeLabel(a);
  const y = normalizeLabel(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // 짧은 쪽이 긴 쪽 안에 통째로 있으면 (예: "분류" ⊂ "요구사항 분류") 같은 항목일 가능성이 크다
  if ((x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) >= 2) return 0.55 + 0.45 * (Math.min(x.length, y.length) / Math.max(x.length, y.length));
  const A = bigrams(x);
  const B = bigrams(y);
  const pool = new Map<string, number>();
  for (const g of B) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of A) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

const THRESHOLD = 0.5;

/** 가장 비슷한 짝부터 하나씩 묶는다 (한 자리에 한 값). */
function assign(sources: readonly { key: string; label: string }[], targets: readonly { key: string; label: string; id: string }[]) {
  const pairs: { s: number; t: number; score: number }[] = [];
  sources.forEach((s, i) =>
    targets.forEach((t, j) => {
      const score = Math.max(s.key === t.id ? 1 : 0, labelSimilarity(s.label, t.label), labelSimilarity(s.key, t.id) * 0.9);
      if (score >= THRESHOLD) pairs.push({ s: i, t: j, score });
    })
  );
  pairs.sort((a, b) => b.score - a.score);
  const usedS = new Set<number>();
  const usedT = new Set<number>();
  const out: { s: number; t: number; score: number }[] = [];
  for (const p of pairs) {
    if (usedS.has(p.s) || usedT.has(p.t)) continue;
    usedS.add(p.s);
    usedT.add(p.t);
    out.push(p);
  }
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 에이전트가 값으로 목록 · 숫자 · 객체를 줘도 칸 글로 바꾼다 (버리지 않는다). */
export function coerceValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `<ul>${v.map((x) => `<li>${esc(coerceValue(x).replace(/<[^>]*>/g, ""))}</li>`).join("")}</ul>`;
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${coerceValue(x).replace(/<[^>]*>/g, "")}`).join(" · ");
  return String(v);
}

/** 바깥 데이터를 에셋 자리에 맞춘 레코드로. */
export function mapItemsToAsset(rawItems: readonly SourceItem[], asset: AssetV3): MapResult {
  const items: SourceItem[] = rawItems.map((i) => ({
    label: String(i.label ?? ""),
    ...(i.value !== undefined ? { value: coerceValue(i.value) } : {}),
    ...(Array.isArray(i.rows) ? { rows: i.rows.map((r) => Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, coerceValue(v)]))) } : {}),
  }));
  const fields = collectFields(asset.nodes);
  const top = fields.filter((f) => !f.repeat);
  const byRepeat = new Map<string, FieldRef[]>();
  for (const f of fields) if (f.repeat) byRepeat.set(f.repeat, [...(byRepeat.get(f.repeat) ?? []), f]);

  const records: Record<string, string | AssetRecords[]> = {};
  const matches: FieldMatch[] = [];
  const unmapped: string[] = [];

  const scalar = items.filter((i) => !i.rows);
  const tgt = top.map((f) => ({ key: f.field.id, id: f.field.id, label: f.label ?? f.field.hint ?? f.field.id }));
  const pairs = assign(
    scalar.map((i) => ({ key: i.label, label: i.label })),
    tgt
  );
  for (const p of pairs) {
    records[tgt[p.t].id] = scalar[p.s].value ?? "";
    matches.push({ from: scalar[p.s].label, to: tgt[p.t].id, score: Math.round(p.score * 100) / 100 });
  }
  scalar.forEach((s, i) => {
    if (!pairs.some((p) => p.s === i) && (s.value ?? "").trim()) unmapped.push(s.label);
  });

  // 반복 데이터: 이름표 묶음이 가장 잘 맞는 반복 단위에
  const tables = items.filter((i) => i.rows && i.rows.length);
  const freeUnits = new Set(byRepeat.keys());
  for (const t of tables) {
    const cols = [...new Set(t.rows!.flatMap((r) => Object.keys(r)))];
    let best: { unit: string; colMap: { s: number; t: number; score: number }[]; tf: { key: string; id: string; label: string }[]; score: number } | null = null;
    for (const unit of freeUnits) {
      const tf = byRepeat.get(unit)!.map((f) => ({ key: f.field.id, id: f.field.id, label: f.label ?? f.field.hint ?? f.field.id }));
      const colMap = assign(
        cols.map((c) => ({ key: c, label: c })),
        tf
      );
      const score = colMap.reduce((a, p) => a + p.score, 0) / Math.max(cols.length, tf.length);
      if (!best || score > best.score) best = { unit, colMap, tf, score };
    }
    if (!best || best.score < 0.3) {
      unmapped.push(`${t.label} (${t.rows!.length}행)`);
      continue;
    }
    freeUnits.delete(best.unit);
    records[best.unit] = t.rows!.map((r) => Object.fromEntries(best!.colMap.map((p) => [best!.tf[p.t].id, r[cols[p.s]] ?? ""])));
    for (const p of best.colMap) matches.push({ from: `${t.label}.${cols[p.s]}`, to: `${best.unit}.${best.tf[p.t].id}`, score: Math.round(p.score * 100) / 100 });
    cols.forEach((c, i) => {
      if (!best!.colMap.some((p) => p.s === i)) unmapped.push(`${t.label}.${c}`);
    });
  }

  const missing = top.filter((f) => records[f.field.id] === undefined).map((f) => f.field.id);
  for (const u of freeUnits) missing.push(`${u}[]`);
  return { records, matches, unmapped, missing };
}

/** 골격 + 레코드 → 이름표 붙은 바깥 데이터 (다른 에셋에 다시 맞출 때). */
export function recordsToItems(nodes: readonly SkelNode[], records: AssetRecords): SourceItem[] {
  const fields = collectFields(nodes);
  const items: SourceItem[] = [];
  const units = new Map<string, FieldRef[]>();
  for (const f of fields) {
    if (f.repeat) units.set(f.repeat, [...(units.get(f.repeat) ?? []), f]);
    else if (typeof records[f.field.id] === "string") items.push({ label: f.label ?? f.field.hint ?? f.field.id, value: records[f.field.id] as string });
  }
  for (const [unit, fs] of units) {
    const list = records[unit];
    if (!Array.isArray(list)) continue;
    items.push({
      label: unit,
      rows: list.map((r) => Object.fromEntries(fs.map((f) => [f.label ?? f.field.hint ?? f.field.id, String((r as AssetRecords)[f.field.id] ?? "")]))),
    });
  }
  return items;
}

export interface ApplyAssetResult extends InstantiateResult {
  readonly map: MapResult;
  /** 원래 채워져 있던 값 중 새 모양으로 옮겨진 비율 */
  readonly preserved: { readonly kept: number; readonly total: number };
}

/** 이미 있는 블록들을 다른 에셋 모양으로 재편한다 (내용 · 칸 정체성 보존, 못 옮긴 것은 보고). */
export function applyAssetToBlocks(
  source: { readonly blocks: readonly LayoutBlock[]; readonly slots: Readonly<Record<string, VDocSlot>> },
  asset: AssetV3,
  options: { readonly idPrefix?: string; readonly applyStyle?: boolean } = {}
): ApplyAssetResult {
  const src = decomposeBlocks(source);
  const items = recordsToItems(src.nodes, src.records);
  const map = mapItemsToAsset(items, asset);
  // 칸 정체성: 같은 값을 옮긴 자리는 원래 칸 id 를 이어받는다
  const keepSlotIds: Record<string, string> = {};
  const srcFields = collectFields(src.nodes);
  for (const m of map.matches) {
    if (m.from.includes(".")) continue;
    const f = srcFields.find((x) => !x.repeat && (x.label ?? x.field.hint ?? x.field.id) === m.from);
    const sid = f ? src.slotOf[f.field.id] : undefined;
    if (sid) keepSlotIds[m.to] = sid;
  }
  const inst = instantiateAssetV3(asset, map.records, { ...options, keepSlotIds });
  const plain = (s: string) => s.replace(/<[^>]*>/g, "").trim();
  const filledItems = items.flatMap((i) => (i.rows ? i.rows.flatMap((r) => Object.values(r)) : [i.value ?? ""])).filter((v) => plain(v));
  return { ...inst, map, preserved: { kept: Math.max(0, filledItems.length - countLost(items, map)), total: filledItems.length } };
}

function countLost(items: readonly SourceItem[], map: MapResult): number {
  const plain = (s: string) => s.replace(/<[^>]*>/g, "").trim();
  let lost = 0;
  for (const it of items) {
    if (!it.rows) {
      if (plain(it.value ?? "") && map.unmapped.includes(it.label)) lost++;
      continue;
    }
    if (map.unmapped.some((u) => u.startsWith(`${it.label} (`))) {
      lost += it.rows.flatMap((r) => Object.values(r)).filter((v) => plain(v)).length;
      continue;
    }
    for (const r of it.rows) for (const [col, v] of Object.entries(r)) if (plain(v) && map.unmapped.includes(`${it.label}.${col}`)) lost++;
  }
  return lost;
}
