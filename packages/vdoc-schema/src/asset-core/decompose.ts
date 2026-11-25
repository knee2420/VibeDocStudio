/**
 * 기존 블록 → 에셋 v3 분해 (결정적).
 *
 * 블록 하나 또는 여러 개를 구조 골격 · 스타일 짝 · 레코드(내용)로 가른다.
 * - 구조: 격자 · 병합 · 칸 역할 · 고정 글 · 채울 자리 · 반복
 * - 스타일: 블록 · 칸에 박힌 서식 값을 역할 선택자별 토큰으로
 * - 내용: 필드 id → HTML
 * 같은 모양의 다른 인스턴스(`peers`)를 주면, 모든 인스턴스에서 같은 글은 고정 글(label)로 올린다.
 */
import { getBlockSlotIds } from "../block-ops";
import { getTableCellPlacements } from "../table-ops";
import type { GridColumnDef, LayoutBlock, TableCellSlotDef, VDocSlot } from "../types";
import { isFixedRole, type FieldType } from "./registry";
import type { AssetRecords, AssetStyleCompanion, FieldSpec, GridCell, GridRow, SkelNode } from "./skeleton";

export interface DecomposeSource {
  readonly blocks: readonly LayoutBlock[];
  readonly slots: Readonly<Record<string, VDocSlot>>;
}

export interface DecomposeResult {
  readonly nodes: SkelNode[];
  readonly style: AssetStyleCompanion;
  readonly records: AssetRecords;
  /** 필드 키(반복 안이면 `rows[0].id`) → 원래 칸 id — 재편할 때 칸 정체성(내용 · 근거)을 잇는다 */
  readonly slotOf: Record<string, string>;
  /** 근사로 처리한 블록 등 */
  readonly notes: string[];
}

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const inferType = (html: string): FieldType => (/<(ul|ol)\b/i.test(html) ? "list" : /<p\b[\s\S]*<p\b|<(h\d|blockquote|table)\b/i.test(html) ? "rich" : "text");

function slugify(text: string, fallback: string): string {
  const s = plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return s || fallback;
}

class IdScope {
  private used = new Set<string>();
  private n = 0;
  take(base: string): string {
    const b = base || `f${++this.n}`;
    let id = b;
    let k = 2;
    while (this.used.has(id)) id = `${b}_${k++}`;
    this.used.add(id);
    return id;
  }
}

class StyleCollector {
  private bags = new Map<string, Map<string, Map<string, number>>>();
  add(selector: string, props: Record<string, unknown>) {
    let bag = this.bags.get(selector);
    if (!bag) this.bags.set(selector, (bag = new Map()));
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === "") continue;
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      let counts = bag.get(k);
      if (!counts) bag.set(k, (counts = new Map()));
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }
  /** 이 선택자는 서식 값이 없어도 쓰인다 */
  touch(selector: string) {
    if (!this.bags.has(selector)) this.bags.set(selector, new Map());
  }
  build(): AssetStyleCompanion {
    const tokens: Record<string, Record<string, string>> = {};
    for (const [sel, bag] of this.bags) {
      const t: Record<string, string> = {};
      for (const [k, counts] of bag) {
        const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) t[k] = best[0];
      }
      if (Object.keys(t).length) tokens[sel] = t;
    }
    return { selectors: [...this.bags.keys()].sort(), ...(Object.keys(tokens).length ? { tokens } : {}) };
  }
}

const CELL_STYLE_KEYS: (keyof TableCellSlotDef)[] = [
  "backgroundColor",
  "color",
  "fontWeight",
  "fontSize",
  "hAlign",
  "vAlign",
  "padding",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "letterSpacing",
  "lineHeight",
  "fontFamily",
];

const looksHeader = (cell: TableCellSlotDef) =>
  Boolean(cell.isHeader) || (Boolean(cell.backgroundColor) && Number.parseInt(String(cell.fontWeight ?? "400"), 10) >= 600);

interface Ctx {
  readonly slots: Readonly<Record<string, VDocSlot>>;
  readonly ids: IdScope;
  readonly style: StyleCollector;
  readonly records: Record<string, string | AssetRecords[]>;
  readonly slotOf: Record<string, string>;
  readonly notes: string[];
}

const content = (ctx: Ctx, slotId: string | undefined) => (slotId ? ctx.slots[slotId]?.content ?? "" : "");

/** 에셋이 놓은 고정 글 칸 (`label:<역할>`) — 내용이 아니라 구조다. */
const fixedRoleOf = (ctx: Ctx, slotId: string | undefined): string | null => {
  const label = slotId ? ctx.slots[slotId]?.label ?? "" : "";
  const m = /^label:([a-z-]+)$/.exec(label);
  return m && isFixedRole(m[1]) ? m[1] : null;
};

function fieldNode(ctx: Ctx, role: string, base: string, value: string, type?: FieldType, hint?: string, variant?: string, slotId?: string): SkelNode {
  const id = ctx.ids.take(base);
  ctx.records[id] = value;
  if (slotId) ctx.slotOf[id] = slotId;
  const field: FieldSpec = { id, type: type ?? inferType(value), ...(hint ? { hint } : {}) };
  return { t: "field", role, field, ...(variant ? { variant } : {}) };
}

function decomposeTable(block: Extract<LayoutBlock, { kind: "structured-table" | "table" }>, ctx: Ctx): SkelNode {
  const placements = getTableCellPlacements(block);
  const rowCount = block.rows.length;
  const colCount = Math.max(block.columnWidths.length, ...placements.map((p) => p.col + p.colSpan));
  const header = new Map(placements.map((p) => [p.cell.cellId, looksHeader(p.cell)]));
  const topRow = placements.filter((p) => p.row === 0);
  const topHeader = rowCount > 1 && topRow.length > 0 && topRow.every((p) => header.get(p.cell.cellId)) && placements.some((p) => p.row > 0 && !header.get(p.cell.cellId));

  const roleOf = (p: (typeof placements)[number]): string => {
    if (!header.get(p.cell.cellId)) return "value";
    if (topHeader && p.row === 0) return "column-header";
    const rightHeaders = placements.filter((o) => o.row >= p.row && o.row < p.row + p.rowSpan && o.col === p.col + p.colSpan && header.get(o.cell.cellId));
    if (p.rowSpan > 1 && rightHeaders.length > 0) return "group-label";
    const leftGroup = placements.find(
      (o) => o.col + o.colSpan === p.col && o.row <= p.row && o.row + o.rowSpan > p.row && header.get(o.cell.cellId) && o.rowSpan > 1
    );
    if (leftGroup) return "sub-label";
    return "label";
  };

  // 데이터 행 반복: 맨 윗줄이 머리칸이고 그 아래가 병합 없는 같은 모양의 값 행들
  const rowsCells = block.rows.map((_, r) => placements.filter((p) => p.row === r));
  const isDataRow = (r: number) => rowsCells[r].length === colCount && rowsCells[r].every((p) => p.rowSpan === 1 && p.colSpan === 1 && !header.get(p.cell.cellId));
  let repeatEnd = 0;
  if (topHeader && topRow.length === colCount && topRow.every((p) => p.colSpan === 1 && p.rowSpan === 1)) {
    let r = 1;
    while (r < rowCount && isDataRow(r)) r++;
    repeatEnd = r - 1;
  }

  const selector = (role: string) => `table.${role}`;
  ctx.style.add("table", {
    columnWidths: block.columnWidths.join(","),
    tableVariant: block.tableVariant,
    cellPadding: block.cellPadding,
    ...(block.borderRules ? Object.fromEntries(Object.entries(block.borderRules).map(([k, v]) => [`border.${k}`, v])) : {}),
    ...(block.headerStyle ? Object.fromEntries(Object.entries(block.headerStyle).map(([k, v]) => [`header.${k}`, v])) : {}),
  });

  const labelText = (p: (typeof placements)[number]) => plain(content(ctx, p.cell.slotId));
  const hintFor = (p: (typeof placements)[number]): string | undefined => {
    const left = placements
      .filter((o) => header.get(o.cell.cellId) && o.row <= p.row && o.row + o.rowSpan > p.row && o.col < p.col)
      .sort((a, b) => b.col - a.col)[0];
    if (left) return labelText(left) || undefined;
    const top = placements
      .filter((o) => header.get(o.cell.cellId) && o.col <= p.col && o.col + o.colSpan > p.col && o.row < p.row)
      .sort((a, b) => b.row - a.row)[0];
    return top ? labelText(top) || undefined : undefined;
  };

  const repeatRecords: AssetRecords[] = [];
  const unitIds = new IdScope();
  const rows: GridRow[] = [];
  // 묶음 머리칸 반복: 왼쪽 묶음 머리칸(세로 병합) 아래 행들이 머리칸 없이 같은 모양이면 → 반복 단위 + rs "repeat"
  const topHint = (p: (typeof placements)[number]) => {
    const top = placements
      .filter((o) => header.get(o.cell.cellId) && o.col <= p.col && o.col + o.colSpan > p.col && o.row < p.row)
      .sort((a, b) => b.row - a.row)[0];
    return top ? labelText(top) || undefined : undefined;
  };
  const groupAt = new Map<number, { end: number; group: (typeof placements)[number] }>();
  for (const g of placements) {
    if (g.rowSpan < 2 || !header.get(g.cell.cellId) || g.col !== 0 || (topHeader && g.row === 0)) continue;
    const sig = (r: number) => rowsCells[r].filter((p) => p !== g).map((p) => `${p.colSpan}:${p.rowSpan}:${header.get(p.cell.cellId) ? "H" : "V"}`).join(",");
    const first = sig(g.row);
    let same = !first.includes("H") && rowsCells[g.row].every((p) => p === g || p.rowSpan === 1);
    for (let r = g.row + 1; same && r < g.row + g.rowSpan; r++) same = sig(r) === first && rowsCells[r].every((p) => p.rowSpan === 1);
    if (same) groupAt.set(g.row, { end: g.row + g.rowSpan - 1, group: g });
  }
  for (let r = 0; r < rowCount; r++) {
    const grp = groupAt.get(r);
    if (grp) {
      const unitId = ctx.ids.take(slugify(labelText(grp.group), `group${r + 1}`));
      const scope = new IdScope();
      const unitCells: GridCell[] = [{ role: "group-label", rs: "repeat", text: labelText(grp.group) }];
      const recs: AssetRecords[] = [];
      ctx.style.add(selector("group-label"), pickCellStyle(grp.group.cell));
      const ids: string[] = [];
      for (const p of rowsCells[r].filter((x) => x !== grp.group)) {
        const hint = topHint(p) ?? hintFor(p);
        const id = scope.take(slugify(hint ?? "", `c${p.col + 1}`));
        ids.push(id);
        unitCells.push({ role: "value", ...(p.colSpan > 1 ? { cs: p.colSpan } : {}), field: { id, type: inferType(content(ctx, p.cell.slotId)), ...(hint ? { hint } : {}) } });
      }
      for (let k = r; k <= grp.end; k++) {
        const rec: Record<string, string> = {};
        rowsCells[k]
          .filter((x) => x !== grp.group)
          .forEach((p, i) => {
            rec[ids[i]] = content(ctx, p.cell.slotId);
            ctx.slotOf[`${unitId}[${k - r}].${ids[i]}`] = p.cell.slotId;
            ctx.style.add(selector("value"), pickCellStyle(p.cell));
          });
        recs.push(rec);
      }
      rows.push({ repeat: unitId, cells: unitCells });
      ctx.records[unitId] = recs;
      r = grp.end;
      continue;
    }
    if (repeatEnd >= 1 && r >= 1 && r <= repeatEnd) {
      const rec: Record<string, string> = {};
      const cellsOut: GridCell[] = [];
      for (const p of rowsCells[r]) {
        const hint = hintFor(p);
        const base = slugify(hint ?? "", `c${p.col + 1}`);
        const html = content(ctx, p.cell.slotId);
        if (r === 1) {
          const id = unitIds.take(base);
          cellsOut.push({ role: "value", field: { id, type: inferType(html), ...(hint ? { hint } : {}) } });
        }
        ctx.style.add(selector("value"), pickCellStyle(p.cell));
        const fid = (rows[1]?.cells ?? cellsOut)[rowsCells[r].indexOf(p)]?.field?.id ?? base;
        rec[fid] = html;
        ctx.slotOf[`rows[${r - 1}].${fid}`] = p.cell.slotId;
      }
      if (r === 1) rows.push({ repeat: "rows", cells: cellsOut });
      repeatRecords.push(rec);
      continue;
    }
    const cells: GridCell[] = [];
    for (const p of rowsCells[r]) {
      const role = roleOf(p);
      const span = { ...(p.rowSpan > 1 ? { rs: p.rowSpan } : {}), ...(p.colSpan > 1 ? { cs: p.colSpan } : {}) };
      ctx.style.add(selector(role), pickCellStyle(p.cell));
      if (p.cell.blocks && p.cell.blocks.length) {
        cells.push({ role: "value", ...span, nodes: decomposeBlocksInto(p.cell.blocks, ctx) });
      } else if (role !== "value") {
        const text = labelText(p);
        if (text) cells.push({ role, ...span, text });
        else cells.push({ role: "value", ...span, field: specFor(ctx, "", hintFor(p), `r${r + 1}c${p.col + 1}`) });
      } else {
        const hint = hintFor(p);
        const html = content(ctx, p.cell.slotId);
        const id = ctx.ids.take(slugify(hint ?? "", `r${r + 1}c${p.col + 1}`));
        ctx.records[id] = html;
        ctx.slotOf[id] = p.cell.slotId;
        cells.push({ role, ...span, field: { id, type: inferType(html), ...(hint ? { hint } : {}) } });
      }
    }
    rows.push({ cells });
  }
  if (repeatRecords.length) ctx.records.rows = repeatRecords;
  const caption = (block as { caption?: string }).caption;
  return { t: "grid", component: "table", ...(caption ? { caption } : {}), rows };
}

function specFor(ctx: Ctx, value: string, hint: string | undefined, fallback: string): FieldSpec {
  const id = ctx.ids.take(slugify(hint ?? "", fallback));
  ctx.records[id] = value;
  return { id, type: "text", ...(hint ? { hint } : {}) };
}

function pickCellStyle(cell: TableCellSlotDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CELL_STYLE_KEYS) if (cell[k] !== undefined) out[k] = cell[k];
  return out;
}

function decomposeBlock(block: LayoutBlock, ctx: Ctx): SkelNode | null {
  const styleOf = (sel: string, keys: string[]) => {
    const rec = block as unknown as Record<string, unknown>;
    ctx.style.add(sel, Object.fromEntries(keys.map((k) => [k, rec[k]])));
  };
  switch (block.kind) {
    case "structured-table":
    case "table":
      return decomposeTable(block, ctx);
    case "heading":
    case "form-title": {
      const level = block.kind === "heading" ? block.level ?? 2 : 1;
      const variant = `h${level}`;
      styleOf(`heading.${variant}`, ["align", "decoration", "accent", "letterSpacing"]);
      const html = content(ctx, block.slotId);
      const fixed = fixedRoleOf(ctx, block.slotId);
      if (fixed && plain(html)) return { t: "label", role: fixed, text: plain(html), variant };
      return fieldNode(ctx, "heading", slugify(html, "heading"), html, "text", undefined, variant, block.slotId);
    }
    case "text": {
      styleOf("text", ["align", "listMarker"]);
      const html = content(ctx, block.slotId);
      const fixed = fixedRoleOf(ctx, block.slotId);
      if (fixed && plain(html)) return { t: "label", role: fixed, text: plain(html) };
      return fieldNode(ctx, "body", "body", html, inferType(html), undefined, undefined, block.slotId);
    }
    case "image": {
      styleOf("media", ["width", "height", "maxHeight", "align", "objectFit", "fit"]);
      const node = fieldNode(ctx, "image", "image", block.src, "image", block.alt || undefined);
      if (block.caption) {
        return { t: "container", component: "section", children: [node, fieldNode(ctx, "image-caption", "caption", block.caption, "text")] };
      }
      return node;
    }
    case "columns-grid": {
      styleOf("columns", ["widths", "gap", "cardStyle"]);
      const cols: GridColumnDef[] = block.columns ?? (block.slotIds ?? []).map((slotId) => ({ slotId }));
      const cells: GridCell[] = cols.map((col) => {
        const nodes: SkelNode[] = [];
        if (col.image) nodes.push(fieldNode(ctx, "image", "image", col.image.src, "image", col.image.alt || undefined));
        if (col.slotId) nodes.push(fieldNode(ctx, "body", "body", content(ctx, col.slotId), undefined, undefined, undefined, col.slotId));
        if (col.blocks?.length) nodes.push(...decomposeBlocksInto(col.blocks, ctx));
        if (!nodes.length) nodes.push(fieldNode(ctx, "body", "body", ""));
        return { role: "value", nodes };
      });
      return { t: "grid", component: "columns", rows: [{ cells }] };
    }
    case "callout-box": {
      const variant = block.variant && block.variant !== "default" ? block.variant : undefined;
      styleOf(`frame${variant ? `.${variant}` : ""}`, ["tone", "accentColor", "align"]);
      const children: SkelNode[] = [];
      const body = content(ctx, block.slotId);
      if (plain(body) || !block.kvItems?.length) children.push(fieldNode(ctx, "body", "body", body, undefined, undefined, undefined, block.slotId));
      if (block.kvItems?.length) {
        children.push({
          t: "grid",
          component: "kv",
          rows: block.kvItems.map((kv) => {
            const id = ctx.ids.take(slugify(kv.key, "value"));
            ctx.records[id] = kv.value;
            return { cells: [{ role: "meta-key", text: kv.key }, { role: "meta-value", field: { id, type: "text", hint: kv.key } }] };
          }),
        });
      }
      return { t: "container", component: "frame", ...(variant ? { variant } : {}), children };
    }
    case "hero": {
      styleOf("cover", ["height", "align", "overlay"]);
      const children: SkelNode[] = [];
      if (block.image !== undefined) children.push(fieldNode(ctx, "image", "cover_image", block.image ?? "", "image"));
      children.push(fieldNode(ctx, "heading", "title", content(ctx, block.titleSlotId), "text", undefined, "h1", block.titleSlotId));
      if (block.subtitleSlotId) children.push(fieldNode(ctx, "body", "subtitle", content(ctx, block.subtitleSlotId), "text", undefined, undefined, block.subtitleSlotId));
      return { t: "container", component: "cover", children };
    }
    case "link-card": {
      const variant = block.variant && block.variant !== "card" ? block.variant : undefined;
      styleOf(`card${variant ? `.${variant}` : ""}`, ["layout", "width", "ctaChevron"]);
      return {
        t: "container",
        component: "card",
        ...(variant ? { variant } : {}),
        children: [fieldNode(ctx, "link", "url", block.url, "url"), fieldNode(ctx, "link", "link_title", content(ctx, block.slotId), "text", undefined, undefined, block.slotId)],
      };
    }
    case "divider":
      styleOf("divider", ["variant", "spacing"]);
      return { t: "divider", ...(block.variant && block.variant !== "line" ? { variant: block.variant } : {}) };
    default: {
      const ids = getBlockSlotIds(block);
      ctx.notes.push(`${block.kind} 블록은 아직 컴포넌트가 없어 글 자리로 근사했습니다 (${block.blockId}).`);
      if (!ids.length) return null;
      return { t: "container", component: "section", children: ids.map((sid) => fieldNode(ctx, "body", "body", content(ctx, sid))) };
    }
  }
}

function decomposeBlocksInto(blocks: readonly LayoutBlock[], ctx: Ctx): SkelNode[] {
  const out: SkelNode[] = [];
  for (const b of blocks) {
    const n = decomposeBlock(b, ctx);
    if (n) out.push(n);
  }
  return out;
}

/** 블록들 → 골격 · 스타일 짝 · 레코드. */
export function decomposeBlocks(source: DecomposeSource, options: { readonly peers?: readonly DecomposeSource[] } = {}): DecomposeResult {
  const run = (src: DecomposeSource) => {
    const ctx: Ctx = { slots: src.slots, ids: new IdScope(), style: new StyleCollector(), records: {}, slotOf: {}, notes: [] };
    const nodes = decomposeBlocksInto(src.blocks, ctx);
    return { nodes, ctx };
  };
  const main = run(source);
  let nodes = main.nodes;
  const records = main.ctx.records;
  const peers = (options.peers ?? []).map(run);
  if (peers.length) {
    // 모든 인스턴스에서 같은 값인 자리 = 내용이 아니라 구조(고정 글)
    const fixed = new Set<string>();
    for (const [id, v] of Object.entries(records)) {
      if (typeof v !== "string" || !plain(v)) continue;
      if (peers.every((p) => typeof p.ctx.records[id] === "string" && plain(p.ctx.records[id] as string) === plain(v))) fixed.add(id);
    }
    if (fixed.size) {
      nodes = promoteFixed(nodes, fixed, records);
      for (const id of fixed) delete records[id];
    }
  }
  return { nodes, style: main.ctx.style.build(), records, slotOf: main.ctx.slotOf, notes: main.ctx.notes };
}

/** 고정으로 판정된 필드 → 고정 글. */
function promoteFixed(nodes: readonly SkelNode[], fixed: Set<string>, records: Readonly<Record<string, unknown>>): SkelNode[] {
  const text = (id: string) => plain(String(records[id] ?? ""));
  const fixRole = (role: string) => (role === "heading" ? "title" : role === "body" || role === "item" ? "note" : role === "meta-value" ? "meta-key" : "label");
  return nodes.map((n): SkelNode => {
    if (n.t === "field" && fixed.has(n.field.id)) return { t: "label", role: fixRole(n.role), text: text(n.field.id), ...(n.variant ? { variant: n.variant } : {}) };
    if (n.t === "container") return { ...n, children: promoteFixed(n.children, fixed, records) };
    if (n.t === "repeat") return n;
    if (n.t === "grid")
      return {
        ...n,
        rows: n.rows.map((row) =>
          row.repeat
            ? row
            : {
                ...row,
                cells: row.cells.map((c) => {
                  if (c.field && fixed.has(c.field.id)) {
                    const { field: _f, ...rest } = c;
                    return { ...rest, role: fixRole(c.role), text: text(c.field.id) };
                  }
                  if (c.nodes) return { ...c, nodes: promoteFixed(c.nodes, fixed, records) };
                  return c;
                }),
              }
        ),
      };
    return n;
  });
}
