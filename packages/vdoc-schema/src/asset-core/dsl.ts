/**
 * `.vsyntax` 구조 문법 DSL ↔ `AssetV3` (`vibe-asset/3`) 양방향 컴파일러.
 *
 * 사람 · `.outline` · `.vasset` · AI Composer 가 **단일 구조 언어(`.vsyntax`)**를 공유하도록 한다:
 * - 에이전트와 사람은 간결한 `.vsyntax` 기호(`|`, `[-]`, `[<]`, `[^]`, `*` 반복, `{{id:type!^|힌트}}`, `{role}`, `::`, `>`, `[img:]`, `---`)로
 *   구조 스키마를 작성하고,
 * - 이 결정적 컴파일러가 `AssetV3` 내부 IR(`SkelNode[]`)로 컴파일 · 검증한다.
 * - 반대로 기존 블록에서 `decomposeBlocks`로 뽑은 `AssetV3`도 `renderAssetV3ToVsyntaxDsl()`로 깔끔한 `.vsyntax` DSL 로 직렬화할 수 있다.
 */
import type { ElementRegistrySnapshot } from "../element-syntax/contract";
import { FIELD_TYPES, isFixedRole, type FieldType } from "./registry";
import {
  ASSET_SCHEMA_V3,
  type AssetStyleCompanion,
  type AssetV3,
  type AssetV3Origin,
  type FieldSpec,
  type GridCell,
  type GridRow,
  type SkelNode,
} from "./skeleton";
import { validateAssetV3, type AssetValidation } from "./validate";

export interface CompileVsyntaxDslMeta {
  readonly title: string;
  readonly scope?: "element" | "section" | "page";
  readonly assetId?: string;
  readonly summary?: string;
  readonly style?: AssetStyleCompanion;
  readonly uncertain?: readonly string[];
  readonly origin?: AssetV3Origin;
  /** 볼트의 라이브 `.vibedoc/element-registry.vsyntax` 스냅샷 (사용자 커스텀 기호 반영) */
  readonly registry?: ElementRegistrySnapshot;
}

export interface CompileVsyntaxDslResult {
  readonly asset: AssetV3;
  readonly validation: AssetValidation;
}

interface ActiveSymbols {
  readonly colSplit: string;
  readonly emptySlot: string;
  readonly mergeLeft: string;
  readonly mergeUp: string;
  readonly kvMeta: string;
  readonly frameBox: string;
  readonly dividerLine: string;
}

function resolveSymbols(registry?: ElementRegistrySnapshot): ActiveSymbols {
  const findSym = (elId: string, ruleId: string, fallback: string): string => {
    const el = registry?.elements.find((e) => e.id === elId);
    const rule = el?.rules.find((r) => r.id === ruleId);
    return rule?.symbol?.trim() || fallback;
  };
  return {
    colSplit: findSym("table", "col-split", "|"),
    emptySlot: findSym("table", "empty-slot", "[-]"),
    mergeLeft: findSym("table", "merge-left", "[<]"),
    mergeUp: findSym("table", "merge-up", "[^]"),
    kvMeta: findSym("section", "kv-meta", "::"),
    frameBox: findSym("section", "frame-box", ">"),
    dividerLine: findSym("section", "divider-line", "---"),
  };
}

interface RawDslLine {
  readonly indent: number;
  readonly text: string;
  readonly children: RawDslLine[];
}

function parseDslTree(input: string | readonly string[]): RawDslLine[] {
  const rawLines = Array.isArray(input) ? input : String(input ?? "").replace(/\r\n/g, "\n").split("\n");
  const roots: RawDslLine[] = [];
  const stack: RawDslLine[] = [];

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const expanded = raw.replace(/\t/g, "  ");
    const indent = expanded.length - expanded.trimStart().length;
    const node: RawDslLine = { indent, text: expanded.trim(), children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return roots;
}

function sanitizeFieldId(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^\p{L}\p{N}_.-]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

/**
 * `{{id}}`, `{{id:type}}`, `{{id:type!}}`, `{{id:type^}}`, `{{id^|힌트}}`, `{{id:choice(a,b)|힌트}}` 파싱.
 */
function parseFieldToken(
  rawToken: string,
  takeId: (base: string) => string
): { field: FieldSpec; mergeSame: boolean } | null {
  const m = /^\{\{\s*([\s\S]+?)\s*\}\}$/.exec(rawToken.trim());
  if (!m) return null;
  const body = m[1];
  const pipeIdx = body.indexOf("|");
  const left = (pipeIdx >= 0 ? body.slice(0, pipeIdx) : body).trim();
  const hint = pipeIdx >= 0 ? body.slice(pipeIdx + 1).trim() : undefined;

  let mergeSame = false;
  let required = false;
  let specStr = left;
  while (specStr.endsWith("^") || specStr.endsWith("!")) {
    if (specStr.endsWith("^")) {
      mergeSame = true;
      specStr = specStr.slice(0, -1).trim();
    }
    if (specStr.endsWith("!")) {
      required = true;
      specStr = specStr.slice(0, -1).trim();
    }
  }

  let idRaw = specStr;
  let typeRaw = "text";
  let options: string[] | undefined;
  const colonIdx = specStr.indexOf(":");
  if (colonIdx >= 0) {
    idRaw = specStr.slice(0, colonIdx).trim();
    const afterColon = specStr.slice(colonIdx + 1).trim();
    const optMatch = /^([a-z]+)\(([^)]+)\)$/i.exec(afterColon);
    if (optMatch) {
      typeRaw = optMatch[1].toLowerCase();
      options = optMatch[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      typeRaw = afterColon.toLowerCase();
    }
  }

  const type: FieldType = FIELD_TYPES.includes(typeRaw as FieldType) ? (typeRaw as FieldType) : "text";
  const id = takeId(sanitizeFieldId(idRaw, "field"));
  const resolvedHint = hint || (idRaw !== id ? idRaw : undefined);
  const field: FieldSpec = {
    id,
    type,
    ...(required ? { required: true } : {}),
    ...(resolvedHint ? { hint: resolvedHint } : {}),
    ...(type === "choice" && options && options.length >= 2 ? { options } : {}),
  };
  return { field, mergeSame };
}

/**
 * `|` 열 분할 — `{{id|힌트}}` 안의 파이프는 열 구분으로 자르지 않는다.
 */
function splitTableCells(line: string, colSplit: string): string[] {
  const out: string[] = [];
  let buf = "";
  let braceDepth = 0;
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("{{", i)) {
      braceDepth++;
      buf += "{{";
      i += 2;
      continue;
    }
    if (line.startsWith("}}", i) && braceDepth > 0) {
      braceDepth--;
      buf += "}}";
      i += 2;
      continue;
    }
    if (braceDepth === 0 && line.startsWith(colSplit, i)) {
      out.push(buf.trim());
      buf = "";
      i += colSplit.length;
      continue;
    }
    buf += line[i];
    i++;
  }
  out.push(buf.trim());
  return out;
}

interface ParsedCellToken {
  readonly kind: "merge-left" | "merge-up" | "empty-slot" | "field" | "label";
  readonly explicitRole?: string;
  readonly text?: string;
  readonly field?: FieldSpec;
  readonly mergeSame?: boolean;
}

function parseCellToken(
  raw: string,
  sym: ActiveSymbols,
  takeId: (base: string) => string
): ParsedCellToken {
  let token = raw.trim();
  let explicitRole: string | undefined;
  const roleM = /^\{([a-z][a-z0-9.-]*)\}\s*([\s\S]*)$/i.exec(token);
  if (roleM) {
    explicitRole = roleM[1].toLowerCase();
    token = roleM[2].trim();
  }

  if (token === sym.mergeLeft || token === "[<]") {
    return { kind: "merge-left", explicitRole };
  }
  if (token === sym.mergeUp || token === "[^]") {
    return { kind: "merge-up", explicitRole };
  }
  if (token === sym.emptySlot || token === "[-]" || token === "") {
    return { kind: "empty-slot", explicitRole };
  }
  const fieldParsed = parseFieldToken(token, takeId);
  if (fieldParsed) {
    return {
      kind: "field",
      explicitRole,
      field: fieldParsed.field,
      mergeSame: fieldParsed.mergeSame,
    };
  }
  return { kind: "label", explicitRole, text: token };
}

interface MutableCell {
  role: string;
  explicitRole: boolean;
  rs: number | "repeat";
  cs: number;
  mergeSame?: boolean;
  text?: string;
  field?: FieldSpec;
}

interface MutableRow {
  repeat?: string;
  cells: MutableCell[];
}

function compileTableBlock(
  caption: string | undefined,
  variant: string | undefined,
  rowNodes: readonly RawDslLine[],
  sym: ActiveSymbols,
  usedRepeatIds: Set<string>
): Extract<SkelNode, { t: "grid" }> {
  // 평탄화: 트리 들여쓰기(자식을 가진 부모 행 without `|`) → 첫 열 group-label + 하위 행들에 `[^]` 주입
  const flatRows: { repeat?: string; rawCells: string[] }[] = [];

  const extractRepeatPrefix = (text: string): { repeat?: string; body: string } => {
    const named = /^\*\[([a-zA-Z0-9_-]+)\]\s+([\s\S]+)$/.exec(text);
    if (named) return { repeat: named[1], body: named[2].trim() };
    const plainStar = /^\*\s+([\s\S]+)$/.exec(text);
    if (plainStar) return { repeat: "rows", body: plainStar[1].trim() };
    return { body: text };
  };

  for (const node of rowNodes) {
    const { repeat, body } = extractRepeatPrefix(node.text);
    const hasColSplit = splitTableCells(body, sym.colSplit).length > 1;
    if (node.children.length > 0 && !hasColSplit) {
      // `.vsyntax` tree-rowspan: 부모 텍스트가 좌측 세로 병합 그룹 헤더 셀이 된다.
      node.children.forEach((child, idx) => {
        const childRep = extractRepeatPrefix(child.text);
        const childCells = splitTableCells(childRep.body, sym.colSplit);
        const firstCell = idx === 0 ? `{group-label}${body}` : sym.mergeUp;
        flatRows.push({
          repeat: childRep.repeat ?? repeat,
          rawCells: [firstCell, ...childCells],
        });
      });
    } else {
      flatRows.push({
        repeat,
        rawCells: splitTableCells(body, sym.colSplit),
      });
    }
  }

  // 반복 단위 스코프별 필드 ID 중복 방지
  const scopeIds = new Map<string, Set<string>>();
  let anonSeq = 0;
  const takeIdFor = (scopeKey: string) => (base: string): string => {
    let set = scopeIds.get(scopeKey);
    if (!set) scopeIds.set(scopeKey, (set = new Set()));
    let id = base;
    let k = 2;
    while (set.has(id)) id = `${base}_${k++}`;
    set.add(id);
    return id;
  };

  // 각 행의 열 좌표 그리드 구축 (`[<]` / `[^]` 병합 적용)
  const gridOwner: (MutableCell | null)[][] = [];
  const mutRows: MutableRow[] = [];

  for (let r = 0; r < flatRows.length; r++) {
    const fr = flatRows[r];
    if (fr.repeat) usedRepeatIds.add(fr.repeat);
    const scopeKey = fr.repeat ? `rep:${fr.repeat}` : "top";
    const takeId = takeIdFor(scopeKey);
    const rowCells: MutableCell[] = [];
    const ownerRow: (MutableCell | null)[] = [];
    gridOwner.push(ownerRow);

    let col = 0;
    for (let rawIdx = 0; rawIdx < fr.rawCells.length; rawIdx++) {
      const tok = parseCellToken(fr.rawCells[rawIdx], sym, takeId);
      if (tok.kind === "merge-left") {
        const left = rowCells[rowCells.length - 1];
        if (left) {
          left.cs += 1;
          ownerRow[col] = left;
        }
        col++;
        continue;
      }
      if (tok.kind === "merge-up") {
        const above = r > 0 ? gridOwner[r - 1]?.[col] : null;
        if (above) {
          if (typeof above.rs === "number") {
            above.rs += 1;
          }
          ownerRow[col] = above;
        }
        col++;
        continue;
      }

      if (tok.kind === "empty-slot") {
        const leftLabel = rowCells[rowCells.length - 1]?.text;
        const topLabel = r > 0 ? gridOwner[0]?.[col]?.text : undefined;
        const hint = leftLabel || topLabel || `항목 ${++anonSeq}`;
        const id = takeId(sanitizeFieldId(hint, `f${++anonSeq}`));
        const cell: MutableCell = {
          role: tok.explicitRole || "value",
          explicitRole: Boolean(tok.explicitRole),
          rs: 1,
          cs: 1,
          field: { id, type: "text", hint },
        };
        rowCells.push(cell);
        ownerRow[col] = cell;
        col++;
        continue;
      }

      if (tok.kind === "field" && tok.field) {
        // 명시적 `{role}` (예: `{group-label}{{major}}`, `{value.score}{{pts}}`) 은 덮어쓰지 않고 그대로 보존한다.
        const role = tok.explicitRole || "value";
        const cell: MutableCell = {
          role,
          explicitRole: Boolean(tok.explicitRole),
          rs: 1,
          cs: 1,
          ...(tok.mergeSame ? { mergeSame: true } : {}),
          field: tok.field,
        };
        rowCells.push(cell);
        ownerRow[col] = cell;
        col++;
        continue;
      }

      // label (fixed text) — 명시적 `{role}` (예: `{total.subtotal}소계`, `{total}합계`) 은 그대로 보존한다.
      const role = tok.explicitRole || "label";
      const cell: MutableCell = {
        role,
        explicitRole: Boolean(tok.explicitRole),
        rs: 1,
        cs: 1,
        text: tok.text ?? "",
      };
      rowCells.push(cell);
      ownerRow[col] = cell;
      col++;
    }

    mutRows.push({
      ...(fr.repeat ? { repeat: fr.repeat } : {}),
      cells: rowCells,
    });
  }

  // 스마트 역할 추론:
  // 1) 0행이 모두 고정 글이고 아래에 채울 자리가 있으면 → 0행은 `column-header`
  const hasAnyFieldBelow = mutRows.slice(1).some((r) => r.cells.some((c) => Boolean(c.field)));
  if (
    mutRows.length > 1 &&
    hasAnyFieldBelow &&
    mutRows[0].cells.length > 0 &&
    mutRows[0].cells.every((c) => c.text !== undefined)
  ) {
    for (const c of mutRows[0].cells) {
      if (!c.explicitRole) c.role = "column-header";
    }
  }
  // 2) rs > 1 인 고정 글 셀은 `group-label`, 그 오른쪽 고정 글 셀은 `sub-label`
  mutRows.forEach((row) => {
    for (let i = 0; i < row.cells.length; i++) {
      const c = row.cells[i];
      if (!c.explicitRole && c.text !== undefined && typeof c.rs === "number" && c.rs > 1) {
        c.role = "group-label";
      }
    }
  });
  for (let r = 0; r < mutRows.length; r++) {
    for (let c = 1; c < (gridOwner[r]?.length ?? 0); c++) {
      const cell = gridOwner[r][c];
      const leftOwner = gridOwner[r][c - 1];
      if (
        cell &&
        !cell.explicitRole &&
        cell.text !== undefined &&
        leftOwner &&
        leftOwner !== cell &&
        leftOwner.role === "group-label"
      ) {
        cell.role = "sub-label";
      }
    }
  }

  const finalRows: GridRow[] = mutRows.map((r) => ({
    ...(r.repeat ? { repeat: r.repeat } : {}),
    cells: r.cells.map((c): GridCell => ({
      role: c.role,
      ...(c.rs !== 1 ? { rs: c.rs } : {}),
      ...(c.cs !== 1 ? { cs: c.cs } : {}),
      ...(c.mergeSame ? { mergeSame: true } : {}),
      ...(c.text !== undefined ? { text: c.text } : {}),
      ...(c.field !== undefined ? { field: c.field } : {}),
    })),
  }));

  return {
    t: "grid",
    component: "table",
    ...(variant ? { variant } : {}),
    ...(caption ? { caption } : {}),
    rows: finalRows,
  };
}

function collectAutoSelectors(nodes: readonly SkelNode[]): string[] {
  const set = new Set<string>();
  const walk = (list: readonly SkelNode[]) => {
    for (const n of list) {
      if (n.t === "grid") {
        set.add(n.variant ? `${n.component}.${n.variant}` : n.component);
        for (const row of n.rows) {
          for (const cell of row.cells) {
            if (cell.role) {
              set.add(
                n.variant
                  ? `${n.component}.${n.variant}.${cell.role}`
                  : `${n.component}.${cell.role}`
              );
            }
            if (cell.nodes) walk(cell.nodes);
          }
        }
      } else if (n.t === "container") {
        set.add(n.variant ? `${n.component}.${n.variant}` : n.component);
        walk(n.children);
      } else if (n.t === "repeat") {
        walk(n.children);
      } else if (n.t === "label" || n.t === "field") {
        if (n.role === "title" || n.role === "subtitle" || n.role === "heading") {
          set.add(`heading.${n.variant ?? "h2"}`);
        } else if (n.t === "field" && n.field.type === "image") {
          set.add("media");
        } else {
          set.add("text");
        }
      } else if (n.t === "divider") {
        set.add("divider");
      }
    }
  };
  walk(nodes);
  return [...set].sort();
}

/**
 * `.vsyntax` DSL 줄 배열(또는 멀티라인 문자열)을 `AssetV3` (`vibe-asset/3`)로 결정적 컴파일한다.
 */
export function compileVsyntaxDslToAssetV3(
  dslInput: string | readonly string[],
  meta: CompileVsyntaxDslMeta
): CompileVsyntaxDslResult {
  const sym = resolveSymbols(meta.registry);
  const rawLines = (
    Array.isArray(dslInput) ? dslInput : String(dslInput ?? "").replace(/\r\n/g, "\n").split("\n")
  ).filter((l) => l.trim().length > 0);
  const tree = parseDslTree(rawLines);
  const usedRepeatIds = new Set<string>();
  const topIds = new Set<string>();
  const takeTopId = (base: string): string => {
    let id = base;
    let k = 2;
    while (topIds.has(id)) id = `${base}_${k++}`;
    topIds.add(id);
    return id;
  };

  const compileNodes = (list: readonly RawDslLine[]): SkelNode[] => {
    const out: SkelNode[] = [];
    let i = 0;
    while (i < list.length) {
      const node = list[i];
      const txt = node.text;

      // 1) <<view:table[:variant]>> [제목]
      const tblM = /^<<\s*view\s*:\s*table(?::([a-z0-9-]+))?\s*>>(.*)$/i.exec(txt);
      if (tblM) {
        const variant = tblM[1]?.trim() || undefined;
        const caption = tblM[2]?.trim() || undefined;
        out.push(compileTableBlock(caption, variant, node.children, sym, usedRepeatIds));
        i++;
        continue;
      }

      // 2) <<view:kv[:variant]>>
      const kvM = /^<<\s*view\s*:\s*kv(?::([a-z0-9-]+))?\s*>>(.*)$/i.exec(txt);
      if (kvM) {
        const kvRows: GridRow[] = [];
        for (const ch of node.children) {
          const sep = ch.text.indexOf(sym.kvMeta);
          if (sep >= 0) {
            const k = ch.text.slice(0, sep).trim();
            const vRaw = ch.text.slice(sep + sym.kvMeta.length).trim();
            const f = parseFieldToken(vRaw, takeTopId);
            kvRows.push({
              cells: [
                { role: "meta-key", text: k || "항목" },
                f
                  ? { role: "meta-value", field: f.field }
                  : {
                    role: "meta-value",
                    field: { id: takeTopId(sanitizeFieldId(k, "meta")), type: "text", hint: k || "값" },
                  },
              ],
            });
          }
        }
        if (kvRows.length > 0) {
          out.push({
            t: "grid",
            component: "kv",
            ...(kvM[1] ? { variant: kvM[1] } : {}),
            rows: kvRows,
          });
        }
        i++;
        continue;
      }

      // 3) <<view:section|frame|cover|card[:variant]>>
      const contM = /^<<\s*view\s*:\s*(section|frame|cover|card)(?::([a-z0-9-]+))?\s*>>(.*)$/i.exec(txt);
      if (contM) {
        const comp = contM[1].toLowerCase() as "section" | "frame" | "cover" | "card";
        const variant = contM[2]?.trim() || undefined;
        const headerRest = contM[3]?.trim() || "";
        const children = compileNodes(node.children);
        if (headerRest) {
          const f = parseFieldToken(headerRest, takeTopId);
          children.unshift(
            f
              ? { t: "field", role: "heading", field: f.field, variant: "h2" }
              : { t: "label", role: "title", text: headerRest, variant: "h2" }
          );
        }
        if (comp === "section" && list.length === 1 && children.length > 0) {
          out.push(...children);
        } else if (children.length > 0) {
          out.push({
            t: "container",
            component: comp,
            ...(variant ? { variant } : {}),
            children,
          });
        }
        i++;
        continue;
      }

      // 4) <<repeat:id>>
      const repM = /^<<\s*repeat\s*:\s*([a-zA-Z0-9_-]+)\s*>>$/i.exec(txt);
      if (repM) {
        const repId = repM[1];
        usedRepeatIds.add(repId);
        const children = compileNodes(node.children);
        if (children.length > 0) {
          out.push({ t: "repeat", id: repId, children });
        }
        i++;
        continue;
      }

      // 5) <<view:title[:h1-h4|styleKey]>> ... 또는 # / ## 제목
      const titleM = /^<<\s*view\s*:\s*title(?::([a-z0-9-]+))?\s*>>\s*([\s\S]+)$/i.exec(txt);
      if (titleM) {
        const variant = titleM[1]?.toLowerCase() ?? "h1";
        const body = titleM[2].trim();
        const f = parseFieldToken(body, takeTopId);
        out.push(
          f
            ? { t: "field", role: "heading", field: f.field, variant }
            : { t: "label", role: "title", text: body, variant }
        );
        i++;
        continue;
      }
      const mdHead = /^(#{1,4})\s+([\s\S]+)$/.exec(txt);
      if (mdHead) {
        const variant = `h${mdHead[1].length}`;
        const body = mdHead[2].trim();
        const f = parseFieldToken(body, takeTopId);
        out.push(
          f
            ? { t: "field", role: "heading", field: f.field, variant }
            : { t: "label", role: mdHead[1].length === 1 ? "title" : "subtitle", text: body, variant }
        );
        i++;
        continue;
      }

      // 6) 구분선 (---)
      if (txt === sym.dividerLine || txt === "---") {
        out.push({ t: "divider" });
        i++;
        continue;
      }

      // 7) 이미지 슬롯 `[img:{{photo|대표 이미지}}]` 또는 `[img:라벨]`
      const imgM = /^\[img\s*:\s*([\s\S]+?)\]$/i.exec(txt);
      if (imgM) {
        const inner = imgM[1].trim();
        const f = parseFieldToken(inner, takeTopId);
        out.push({
          t: "field",
          role: "image",
          field: f
            ? { ...f.field, type: "image" }
            : { id: takeTopId(sanitizeFieldId(inner, "image")), type: "image", hint: inner },
        });
        i++;
        continue;
      }

      // 8) 프레임 박스 (`> ...`)
      if (txt.startsWith(`${sym.frameBox} `) || txt === sym.frameBox) {
        const body = txt.slice(sym.frameBox.length).trim();
        const children = compileNodes(node.children);
        if (body) {
          const f = parseFieldToken(body, takeTopId);
          children.unshift(
            f ? { t: "field", role: "body", field: f.field } : { t: "label", role: "note", text: body }
          );
        }
        if (children.length > 0) {
          out.push({ t: "container", component: "frame", children });
        }
        i++;
        continue;
      }

      // 9) 연속된 `키 :: 값` 행 묶음 → `grid(kv)`
      if (txt.includes(sym.kvMeta)) {
        const kvRows: GridRow[] = [];
        while (i < list.length && list[i].text.includes(sym.kvMeta)) {
          const cur = list[i].text;
          const sep = cur.indexOf(sym.kvMeta);
          const k = cur.slice(0, sep).trim();
          const vRaw = cur.slice(sep + sym.kvMeta.length).trim();
          const f = parseFieldToken(vRaw, takeTopId);
          kvRows.push({
            cells: [
              { role: "meta-key", text: k || "항목" },
              f
                ? { role: "meta-value", field: f.field }
                : {
                  role: "meta-value",
                  field: { id: takeTopId(sanitizeFieldId(k, "meta")), type: "text", hint: k || "값" },
                },
            ],
          });
          i++;
        }
        if (kvRows.length > 0) {
          out.push({ t: "grid", component: "kv", rows: kvRows });
        }
        continue;
      }

      // 10) 연속된 파이프(`|`) 표 행들 (별도 `<<view:table>>` 래퍼 없이 바로 표만 적은 경우)
      if (splitTableCells(txt, sym.colSplit).length > 1) {
        const tableLines: RawDslLine[] = [];
        while (
          i < list.length &&
          (splitTableCells(list[i].text, sym.colSplit).length > 1 ||
            (list[i].children.length > 0 && !list[i].text.startsWith("<<")))
        ) {
          tableLines.push(list[i]);
          i++;
        }
        out.push(compileTableBlock(meta.title, undefined, tableLines, sym, usedRepeatIds));
        continue;
      }

      // 11) 단일 필드 또는 고정 라벨
      const f = parseFieldToken(txt, takeTopId);
      if (f) {
        out.push({ t: "field", role: "body", field: f.field });
      } else {
        const roleM = /^\{([a-z][a-z0-9-]*)\}\s*([\s\S]+)$/i.exec(txt);
        const role = roleM ? roleM[1].toLowerCase() : "note";
        const body = roleM ? roleM[2].trim() : txt;
        out.push({ t: "label", role: isFixedRole(role) ? role : "note", text: body });
      }
      i++;
    }
    return out;
  };

  const nodes = compileNodes(tree);
  const autoSelectors = collectAutoSelectors(nodes);
  const mergedStyle: AssetStyleCompanion = meta.style
    ? {
      selectors: Array.from(new Set([...(meta.style.selectors ?? []), ...autoSelectors])).sort(),
      ...(meta.style.tokens && Object.keys(meta.style.tokens).length > 0
        ? { tokens: meta.style.tokens }
        : {}),
    }
    : { selectors: autoSelectors };

  const asset: AssetV3 = {
    schema: ASSET_SCHEMA_V3,
    assetId: meta.assetId ?? "",
    title: meta.title,
    scope: meta.scope ?? "element",
    ...(meta.summary ? { summary: meta.summary } : {}),
    dsl: rawLines,
    nodes,
    style: mergedStyle,
    ...(meta.uncertain && meta.uncertain.length > 0 ? { uncertain: [...meta.uncertain] } : {}),
    ...(meta.origin ? { origin: meta.origin } : {}),
  };

  const validation = validateAssetV3(asset);
  return { asset, validation };
}

function formatFieldToken(field: FieldSpec, mergeSame?: boolean): string {
  const typePart = field.type !== "text" ? `:${field.type}` : "";
  const reqPart = field.required ? "!" : "";
  const mergePart = mergeSame ? "^" : "";
  const hintPart = field.hint && field.hint !== field.id ? `|${field.hint}` : "";
  return `{{${field.id}${typePart}${reqPart}${mergePart}${hintPart}}}`;
}

/**
 * `AssetV3` 구조 골격을 `.vsyntax` 표면 문법 DSL 줄 배열로 직렬화한다.
 * (이미 `asset.dsl`이 있으면 그대로, 없으면 `nodes`에서 결정적으로 생성)
 */
export function renderAssetV3ToVsyntaxDsl(asset: AssetV3): string[] {
  if (Array.isArray(asset.dsl) && asset.dsl.length > 0) {
    return [...asset.dsl];
  }
  const lines: string[] = [];

  const emitNodes = (nodes: readonly SkelNode[], pad: string) => {
    for (const n of nodes) {
      if (n.t === "divider") {
        lines.push(`${pad}---`);
      } else if (n.t === "label") {
        if (n.role === "title" || n.role === "subtitle") {
          lines.push(`${pad}<<view:title${n.variant ? `:${n.variant}` : ""}>> ${n.text}`);
        } else {
          lines.push(`${pad}{${n.role}}${n.text}`);
        }
      } else if (n.t === "field") {
        if (n.field.type === "image") {
          lines.push(`${pad}[img:${formatFieldToken(n.field)}]`);
        } else if (n.role === "heading") {
          lines.push(`${pad}<<view:title${n.variant ? `:${n.variant}` : ""}>> ${formatFieldToken(n.field)}`);
        } else {
          lines.push(`${pad}${formatFieldToken(n.field)}`);
        }
      } else if (n.t === "repeat") {
        lines.push(`${pad}<<repeat:${n.id}>>`);
        emitNodes(n.children, `${pad}  `);
      } else if (n.t === "container") {
        lines.push(`${pad}<<view:${n.component}${n.variant ? `:${n.variant}` : ""}>>`);
        emitNodes(n.children, `${pad}  `);
      } else if (n.t === "grid") {
        if (n.component === "kv") {
          lines.push(`${pad}<<view:kv${n.variant ? `:${n.variant}` : ""}>>`);
          for (const row of n.rows) {
            const k = row.cells[0]?.text ?? "항목";
            const vCell = row.cells[1];
            const v = vCell?.field ? formatFieldToken(vCell.field) : vCell?.text ?? "[-]";
            lines.push(`${pad}  ${k} :: ${v}`);
          }
          continue;
        }
        const cap = n.caption ? ` ${n.caption}` : "";
        lines.push(`${pad}<<view:${n.component}${n.variant ? `:${n.variant}` : ""}>>${cap}`);

        // 격자 좌표 전개해 `[<]` / `[^]` 복원
        const occ: boolean[][] = n.rows.map(() => []);
        const rowStrs: string[][] = n.rows.map(() => []);
        n.rows.forEach((row, r) => {
          let c = 0;
          for (const cell of row.cells) {
            while (occ[r][c]) {
              rowStrs[r][c] = "[^]";
              c++;
            }
            const rsN = typeof cell.rs === "number" ? cell.rs : 1;
            const csN = cell.cs ?? 1;
            const rolePrefix =
              cell.role &&
                cell.role !== "label" &&
                cell.role !== "value" &&
                cell.role !== "column-header"
                ? `{${cell.role}}`
                : "";
            const body =
              cell.text !== undefined
                ? `${rolePrefix}${cell.text.replace(/\n+/g, " ")}`
                : cell.field
                  ? `${rolePrefix}${formatFieldToken(cell.field, cell.mergeSame)}`
                  : "[-]";
            rowStrs[r][c] = body;
            for (let dc = 1; dc < csN; dc++) {
              rowStrs[r][c + dc] = "[<]";
            }
            for (let dr = 0; dr < rsN && r + dr < n.rows.length; dr++) {
              for (let dc = 0; dc < csN; dc++) {
                occ[r + dr][c + dc] = true;
              }
            }
            c += csN;
          }
          while (c < occ[r].length && occ[r][c]) {
            if (!rowStrs[r][c]) rowStrs[r][c] = "[^]";
            c++;
          }
        });

        n.rows.forEach((row, r) => {
          const repPrefix = row.repeat ? (row.repeat === "rows" ? "* " : `*[${row.repeat}] `) : "";
          lines.push(`${pad}  ${repPrefix}${rowStrs[r].join(" | ")}`);
        });
      }
    }
  };

  emitNodes(asset.nodes, "");
  return lines;
}
