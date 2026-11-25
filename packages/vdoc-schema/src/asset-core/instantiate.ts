/**
 * 에셋 v3 → 블록 (인스턴스화).
 *
 * 골격 + 레코드(채울 값) + 스타일 짝 → `.vdoc` 블록 · 칸.
 * - 반복 단위는 레코드 수만큼 펼친다 (없으면 빈 단위 하나)
 * - 고정 글은 머리칸(`isHeader`)으로, 채울 자리는 칸 글로 — 고정 글 칸의 label 은 `label:<역할>` (에셋 소유 표시)
 * - 스타일은 역할 선택자 토큰으로 블록에 풀어 그린다 (정본은 에셋의 스타일 짝 · 문서 팩)
 * - 쓰이지 않은 레코드 값은 버리지 않고 `leftover` 로 보고한다
 */
import type { LayoutBlock, TableCellSlotDef, VDocSlot } from "../types";
import { isFixedRole } from "./registry";
import type { AssetRecords, AssetStyleCompanion, AssetV3, GridCell, SkelNode } from "./skeleton";

export interface InstantiateOptions {
  /** 블록 · 칸 id 접두 (문서 안에서 겹치지 않게) */
  readonly idPrefix?: string;
  /** 스타일 짝 토큰을 블록에 그린다 (기본 true) */
  readonly applyStyle?: boolean;
  /** 기존 칸 id 를 이어받을 필드 (필드 id → slotId) — 재편 시 내용 · 근거 보존 */
  readonly keepSlotIds?: Readonly<Record<string, string>>;
}

export interface InstantiateReport {
  readonly filled: number;
  readonly empty: string[];
  /** 레코드에 있었지만 에셋에 자리가 없는 값 */
  readonly leftover: { key: string; value: string }[];
  readonly repeats: Record<string, number>;
}

export interface InstantiateResult {
  readonly blocks: LayoutBlock[];
  readonly slots: Record<string, VDocSlot>;
  readonly report: InstantiateReport;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const asHtml = (v: string) => (!v ? "<p></p>" : /^\s*</.test(v) ? v : `<p>${esc(v)}</p>`);
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function tokenValue(v: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^[[{]/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

export function instantiateAssetV3(asset: AssetV3, records: AssetRecords = {}, options: InstantiateOptions = {}): InstantiateResult {
  const prefix = options.idPrefix ?? `a${Date.now().toString(36).slice(-5)}`;
  const applyStyle = options.applyStyle !== false;
  const tokens: Readonly<Record<string, Readonly<Record<string, string>>>> = (asset.style as AssetStyleCompanion | undefined)?.tokens ?? {};
  const slots: Record<string, VDocSlot> = {};
  const used = new Set<string>();
  const empty: string[] = [];
  const repeats: Record<string, number> = {};
  let seq = 0;
  let filled = 0;
  const nid = (k: string) => `${prefix}_${k}${++seq}`;

  const tok = (sel: string): Record<string, unknown> => {
    if (!applyStyle) return {};
    const parts = sel.split(".");
    // 넓은 선택자부터 좁은 선택자로 덮는다: table → table.variant → table.variant.role
    const out: Record<string, unknown> = {};
    for (let i = 1; i <= parts.length; i++) {
      const t = tokens[parts.slice(0, i).join(".")];
      if (t) for (const [k, v] of Object.entries(t)) out[k] = tokenValue(v);
    }
    return out;
  };

  const newSlot = (label: string, html: string, keepKey?: string): string => {
    const kept = keepKey ? options.keepSlotIds?.[keepKey] : undefined;
    const slotId = kept ?? nid("s");
    slots[slotId] = { slotId, label, role: "editable-slot", content: html, backDataRefs: [] };
    return slotId;
  };

  const fieldSlot = (id: string, hint: string | undefined, rec: AssetRecords, scopeKey: string): string => {
    const raw = rec[id];
    const val = typeof raw === "string" ? raw : "";
    if (typeof raw === "string") used.add(scopeKey);
    if (plain(val)) filled++;
    else empty.push(scopeKey);
    return newSlot(hint ?? id, asHtml(val), scopeKey);
  };

  const recordValue = (id: string, rec: AssetRecords, scopeKey: string): string => {
    const raw = rec[id];
    if (typeof raw === "string") {
      used.add(scopeKey);
      if (raw.trim()) filled++;
      else empty.push(scopeKey);
      return raw;
    }
    empty.push(scopeKey);
    return "";
  };

  const repeatList = (id: string, rec: AssetRecords): AssetRecords[] => {
    const v = rec[id];
    if (Array.isArray(v)) {
      used.add(id);
      return v.length ? (v as AssetRecords[]) : [{}];
    }
    return [{}];
  };

  const build = (nodes: readonly SkelNode[], rec: AssetRecords, scope: string): LayoutBlock[] => {
    const out: LayoutBlock[] = [];
    for (const n of nodes) out.push(...buildNode(n, rec, scope));
    return out;
  };

  const key = (scope: string, id: string) => (scope ? `${scope}.${id}` : id);

  const buildNode = (n: SkelNode, rec: AssetRecords, scope: string): LayoutBlock[] => {
    switch (n.t) {
      case "label": {
        const level = /^h([1-4])$/.exec(n.variant ?? "")?.[1];
        const headingStyleKey = n.variant && !level ? n.variant : undefined;
        if (n.role === "title" || n.role === "subtitle" || level || headingStyleKey) {
          return [{
            blockId: nid("b"),
            kind: "heading",
            title: n.text,
            level: (Number(level ?? (n.role === "title" ? 1 : 2)) as 1 | 2 | 3 | 4),
            ...(headingStyleKey ? { styleKey: headingStyleKey } : {}),
            slotId: newSlot(`label:${n.role}`, asHtml(n.text)),
            ...tok(`heading.${n.variant ?? (n.role === "title" ? "h1" : "h2")}`),
          } as LayoutBlock];
        }
        return [{ blockId: nid("b"), kind: "text", title: n.role, slotId: newSlot(`label:${n.role}`, asHtml(n.text)), ...tok("text") } as LayoutBlock];
      }
      case "field": {
        const k = key(scope, n.field.id);
        if (n.field.type === "image") {
          const src = recordValue(n.field.id, rec, k);
          return [{ blockId: nid("b"), kind: "image", title: n.field.hint ?? "사진", src, alt: n.field.hint ?? "", ...tok("media") } as LayoutBlock];
        }
        if (n.role === "heading") {
          const levelMatch = /^h([1-4])$/.exec(n.variant ?? "");
          const level = Number(levelMatch?.[1] ?? 2) as 1 | 2 | 3 | 4;
          const headingStyleKey = n.variant && !levelMatch ? n.variant : undefined;
          return [{
            blockId: nid("b"),
            kind: "heading",
            title: n.field.hint ?? "제목",
            level,
            ...(headingStyleKey ? { styleKey: headingStyleKey } : {}),
            slotId: fieldSlot(n.field.id, n.field.hint, rec, k),
            ...tok(`heading.${n.variant ?? `h${level}`}`),
          } as LayoutBlock];
        }
        return [{ blockId: nid("b"), kind: "text", title: n.field.hint ?? n.role, slotId: fieldSlot(n.field.id, n.field.hint, rec, k), ...tok("text") } as LayoutBlock];
      }
      case "divider":
        return [{ blockId: nid("b"), kind: "divider", title: "구분선", ...tok("divider"), ...(n.variant ? { variant: n.variant } : {}) } as LayoutBlock];
      case "repeat": {
        const list = repeatList(n.id, rec);
        repeats[key(scope, n.id)] = list.length;
        return list.flatMap((r, i) => build(n.children, r, key(scope, `${n.id}[${i}]`)));
      }
      case "container":
        return buildContainer(n, rec, scope);
      case "grid":
        return [buildGrid(n, rec, scope)];
    }
  };

  const buildContainer = (n: Extract<SkelNode, { t: "container" }>, rec: AssetRecords, scope: string): LayoutBlock[] => {
    const fields = n.children.filter((c): c is Extract<SkelNode, { t: "field" }> => c.t === "field");
    const sel = `${n.component}${n.variant ? `.${n.variant}` : ""}`;
    if (n.component === "frame") {
      const body = fields.find((f) => f.field.type !== "image");
      const kvGrid = n.children.find((c): c is Extract<SkelNode, { t: "grid" }> => c.t === "grid" && c.component === "kv");
      const kvItems = kvGrid?.rows.map((row) => {
        const k = row.cells.find((c) => c.text !== undefined)?.text ?? "";
        const f = row.cells.find((c) => c.field)?.field;
        return { key: k, value: f ? plain(recordValue(f.id, rec, key(scope, f.id))) : "" };
      });
      const block = {
        blockId: nid("b"),
        kind: "callout-box",
        title: "프레임",
        slotId: body ? fieldSlot(body.field.id, body.field.hint, rec, key(scope, body.field.id)) : newSlot("body", "<p></p>"),
        ...(n.variant ? { variant: n.variant } : {}),
        ...(kvItems?.length ? { kvItems } : {}),
        ...tok(sel),
      } as LayoutBlock;
      const rest = n.children.filter((c) => c !== body && c !== kvGrid);
      return [block, ...build(rest, rec, scope)];
    }
    if (n.component === "cover") {
      const img = fields.find((f) => f.field.type === "image");
      const texts = fields.filter((f) => f.field.type !== "image");
      const title = texts.find((f) => f.role === "heading") ?? texts[0];
      const sub = texts.find((f) => f !== title);
      const labelTitle = n.children.find((c): c is Extract<SkelNode, { t: "label" }> => c.t === "label");
      return [
        {
          blockId: nid("b"),
          kind: "hero",
          title: "표지",
          ...(img ? { image: recordValue(img.field.id, rec, key(scope, img.field.id)) } : {}),
          titleSlotId: title ? fieldSlot(title.field.id, title.field.hint, rec, key(scope, title.field.id)) : newSlot("title", asHtml(labelTitle?.text ?? "")),
          ...(sub ? { subtitleSlotId: fieldSlot(sub.field.id, sub.field.hint, rec, key(scope, sub.field.id)) } : {}),
          ...tok(sel),
        } as LayoutBlock,
      ];
    }
    if (n.component === "card" && fields.some((f) => f.field.type === "url")) {
      const url = fields.find((f) => f.field.type === "url");
      const text = fields.find((f) => f !== url);
      return [
        {
          blockId: nid("b"),
          kind: "link-card",
          title: "링크 카드",
          url: url ? recordValue(url.field.id, rec, key(scope, url.field.id)) : "",
          slotId: text ? fieldSlot(text.field.id, text.field.hint, rec, key(scope, text.field.id)) : newSlot("link", "<p></p>"),
          ...(n.variant && n.variant !== "card" ? { variant: n.variant } : {}),
          ...tok(sel),
        } as LayoutBlock,
      ];
    }
    return build(n.children, rec, scope);
  };

  const cellStyle = (role: string, variant?: string): Partial<TableCellSlotDef> => {
    const baseTok = tok(`table.${role}`);
    const varTok = variant ? tok(`table.${variant}.${role}`) : {};
    const merged = { ...baseTok, ...varTok };
    const allowed = [
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
      "whiteSpace",
      "fontVariantNumeric",
      "listIndent",
      "hangingIndent",
    ];
    return Object.fromEntries(
      Object.entries(merged)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => [k, String(v)])
    ) as Partial<TableCellSlotDef>;
  };

  const buildGrid = (n: Extract<SkelNode, { t: "grid" }>, rec: AssetRecords, scope: string): LayoutBlock => {
    if (n.component === "columns") {
      const cells = n.rows[0]?.cells ?? [];
      const t = tok("columns");
      const widths = typeof t.widths === "string" ? String(t.widths).split(",") : Array.isArray(t.widths) ? (t.widths as string[]) : [];
      return {
        blockId: nid("b"),
        kind: "columns-grid",
        title: "다단",
        ...t,
        widths: widths.length === cells.length ? widths : cells.map(() => `${Math.round(100 / Math.max(1, cells.length))}%`),
        columns: cells.map((c) => columnOf(c, rec, scope)),
      } as LayoutBlock;
    }
    // table · kv → structured-table (반복 펼치기 + mergeSame 동적 세로 병합)
    const expanded: { cells: GridCell[]; rec: AssetRecords; scope: string; repeatId?: string; unitRowOffset?: number }[] = [];
    for (let r = 0; r < n.rows.length; r++) {
      const row = n.rows[r];
      if (!row.repeat) {
        expanded.push({ cells: [...row.cells], rec, scope });
        continue;
      }
      let end = r;
      while (end + 1 < n.rows.length && n.rows[end + 1].repeat === row.repeat) end++;
      const list = repeatList(row.repeat, rec);
      repeats[key(scope, row.repeat)] = list.length;
      const unitRows = end - r + 1;
      list.forEach((rr, i) => {
        for (let k = r; k <= end; k++) {
          // 묶음 머리칸(rs "repeat")은 첫 레코드에만 두고 펼친 행 전체를 덮는다
          const cells = n.rows[k].cells
            .filter((c) => c.rs !== "repeat" || i === 0)
            .map((c) => (c.rs === "repeat" ? { ...c, rs: list.length * unitRows } : c));
          expanded.push({
            cells,
            rec: rr,
            scope: key(scope, `${row.repeat}[${i}]`),
            repeatId: row.repeat,
            unitRowOffset: k - r,
          });
        }
      });
      r = end;
    }
    const baseComp = n.component === "kv" ? "kv" : "table";
    const t = n.variant ? tok(`${baseComp}.${n.variant}`) : tok(baseComp);
    const borderRules: Record<string, unknown> = {};
    const headerStyle: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      if (k.startsWith("border.")) borderRules[k.slice(7)] = String(v);
      else if (k.startsWith("header.")) headerStyle[k.slice(7)] = String(v);
      else if (k !== "columnWidths") rest[k] = v;
    }
    let colCount = 0;
    {
      const occ: boolean[][] = expanded.map(() => []);
      expanded.forEach((row, r) => {
        let c = 0;
        for (const cell of row.cells) {
          while (occ[r][c]) c++;
          const rsN = typeof cell.rs === "number" ? cell.rs : 1;
          for (let dr = 0; dr < rsN && r + dr < expanded.length; dr++) for (let dc = 0; dc < (cell.cs ?? 1); dc++) occ[r + dr][c + dc] = true;
          c += cell.cs ?? 1;
        }
        colCount = Math.max(colCount, occ[r].length);
      });
    }
    const widthTok = typeof t.columnWidths === "string" ? String(t.columnWidths).split(",") : [];
    // 너비 토큰이 없으면: 고정 글만 있는 열(머리칸 열)은 좁게, 채울 자리가 있는 열은 넓게 (1 : 3)
    const defaultWidths = () => {
      const fillCol = new Array<boolean>(colCount).fill(false);
      const occ: boolean[][] = expanded.map(() => []);
      expanded.forEach((row, r) => {
        let c = 0;
        for (const cell of row.cells) {
          while (occ[r][c]) c++;
          const rsN = typeof cell.rs === "number" ? cell.rs : 1;
          const cs = cell.cs ?? 1;
          for (let dr = 0; dr < rsN && r + dr < expanded.length; dr++) for (let dc = 0; dc < cs; dc++) occ[r + dr][c + dc] = true;
          if (cell.text === undefined && cs === 1) fillCol[c] = true;
          c += cs;
        }
      });
      const weights = fillCol.map((f) => (f ? 3 : 1));
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      return weights.map((w) => `${((100 * w) / sum).toFixed(2)}%`);
    };
    const builtRows = expanded.map((row) => ({
      rowId: nid("r"),
      repeatId: row.repeatId,
      unitRowOffset: row.unitRowOffset,
      cells: row.cells.map((cell): { def: TableCellSlotDef; mergeSame: boolean } => {
        const rsN = typeof cell.rs === "number" ? cell.rs : 1;
        const span = { ...(rsN > 1 ? { rowSpan: rsN } : {}), ...(cell.cs && cell.cs > 1 ? { colSpan: cell.cs } : {}) };
        const base: Partial<TableCellSlotDef> & { cellId: string } = {
          cellId: nid("c"),
          cellRole: cell.role,
          ...span,
          ...cellStyle(cell.role, n.variant),
        };
        if (cell.text !== undefined) {
          return {
            def: { ...base, slotId: newSlot(`label:${cell.role}`, asHtml(cell.text)), isHeader: isFixedRole(cell.role) },
            mergeSame: Boolean(cell.mergeSame),
          };
        }
        if (cell.field) {
          return {
            def: { ...base, slotId: fieldSlot(cell.field.id, cell.field.hint, row.rec, key(row.scope, cell.field.id)) },
            mergeSame: Boolean(cell.mergeSame),
          };
        }
        return {
          def: { ...base, slotId: newSlot("cell", "<p></p>"), blocks: build(cell.nodes ?? [], row.rec, row.scope) },
          mergeSame: false,
        };
      }),
    }));

    // 동적 세로 병합(`mergeSame`): 동일 반복 단위 안에서 연속 행의 같은 열 값이 동일하면 rowSpan 으로 병합한다.
    if (builtRows.some((r) => r.cells.some((c) => c.mergeSame))) {
      // 각 셀의 시작 열(col) 좌표를 계산
      const occ: boolean[][] = builtRows.map(() => []);
      const rowColCoords: number[][] = builtRows.map((row, r) => {
        let c = 0;
        return row.cells.map(({ def }) => {
          while (occ[r][c]) c++;
          const rsN = def.rowSpan ?? 1;
          const csN = def.colSpan ?? 1;
          for (let dr = 0; dr < rsN && r + dr < builtRows.length; dr++) {
            for (let dc = 0; dc < csN; dc++) occ[r + dr][c + dc] = true;
          }
          const startCol = c;
          c += csN;
          return startCol;
        });
      });

      const keptSlotValues = new Set(Object.values(options.keepSlotIds ?? {}));
      const droppedCells = new Set<string>();
      const activeRuns = new Map<
        number,
        { repeatId: string; unitRowOffset: number; value: string; headDef: TableCellSlotDef; cs: number }
      >();

      builtRows.forEach((row, r) => {
        if (!row.repeatId) {
          activeRuns.clear();
          return;
        }
        const seenCols = new Set<number>();
        row.cells.forEach((entry, idx) => {
          const col = rowColCoords[r][idx];
          seenCols.add(col);
          const def = entry.def;
          const rsN = def.rowSpan ?? 1;
          const csN = def.colSpan ?? 1;
          if (!entry.mergeSame || rsN > 1) {
            activeRuns.delete(col);
            return;
          }
          const val = plain(slots[def.slotId]?.content ?? "");
          const prev = activeRuns.get(col);
          if (
            val &&
            prev &&
            prev.repeatId === row.repeatId &&
            prev.unitRowOffset === (row.unitRowOffset ?? 0) &&
            prev.cs === csN &&
            prev.value === val
          ) {
            (prev.headDef as { rowSpan?: number }).rowSpan = (prev.headDef.rowSpan ?? 1) + 1;
            droppedCells.add(def.cellId);
            if (!keptSlotValues.has(def.slotId)) {
              delete slots[def.slotId];
            }
          } else if (val) {
            activeRuns.set(col, {
              repeatId: row.repeatId!,
              unitRowOffset: row.unitRowOffset ?? 0,
              value: val,
              headDef: def,
              cs: csN,
            });
          } else {
            activeRuns.delete(col);
          }
        });
        for (const col of [...activeRuns.keys()]) {
          if (!seenCols.has(col)) activeRuns.delete(col);
        }
      });

      for (const row of builtRows) {
        row.cells = row.cells.filter((entry) => !droppedCells.has(entry.def.cellId));
      }
    }

    const rows = builtRows.map((row) => ({
      rowId: row.rowId,
      cells: row.cells.map((entry) => entry.def),
    }));
    return {
      blockId: nid("b"),
      kind: "structured-table",
      title: n.caption ?? asset.title,
      ...(n.variant ? { styleKey: n.variant } : {}),
      ...(n.caption ? { caption: n.caption } : {}),
      columnWidths: widthTok.length === colCount ? widthTok : defaultWidths(),
      ...(Object.keys(borderRules).length ? { borderRules } : {}),
      ...(Object.keys(headerStyle).length ? { headerStyle } : {}),
      ...rest,
      rows,
    } as LayoutBlock;
  };

  const columnOf = (cell: GridCell, rec: AssetRecords, scope: string) => {
    const nodes = cell.nodes ?? (cell.field ? [{ t: "field", role: cell.role, field: cell.field } as SkelNode] : []);
    const simpleBody = nodes.length === 1 && nodes[0].t === "field" && nodes[0].field.type !== "image" ? nodes[0] : null;
    const imgBody =
      nodes.length === 2 && nodes[0].t === "field" && nodes[0].field.type === "image" && nodes[1].t === "field" && nodes[1].field.type !== "image" ? nodes : null;
    if (simpleBody && simpleBody.t === "field") return { slotId: fieldSlot(simpleBody.field.id, simpleBody.field.hint, rec, key(scope, simpleBody.field.id)) };
    if (imgBody && imgBody[0].t === "field" && imgBody[1].t === "field") {
      const src = recordValue(imgBody[0].field.id, rec, key(scope, imgBody[0].field.id));
      return { image: { src, alt: imgBody[0].field.hint ?? "" }, slotId: fieldSlot(imgBody[1].field.id, imgBody[1].field.hint, rec, key(scope, imgBody[1].field.id)) };
    }
    return { blocks: build(nodes, rec, scope) };
  };

  const blocks = build(asset.nodes, records, "").map((b) => ({ ...b, assetRef: { assetId: asset.assetId, appliedAt: new Date().toISOString() } }) as LayoutBlock);

  const leftover: { key: string; value: string }[] = [];
  const scan = (rec: AssetRecords, scope: string) => {
    for (const [k, v] of Object.entries(rec)) {
      const sk = key(scope, k);
      if (Array.isArray(v)) {
        if (!used.has(sk) && !used.has(k)) leftover.push({ key: sk, value: `${v.length}개 레코드` });
        else v.forEach((r, i) => scan(r as AssetRecords, key(scope, `${k}[${i}]`)));
      } else if (!used.has(sk) && typeof v === "string" && plain(v)) leftover.push({ key: sk, value: v });
    }
  };
  scan(records, "");

  return { blocks, slots, report: { filled, empty, leftover, repeats } };
}
