/**
 * 에셋 v3 사양 검증 — 사람이 만든 것이든 에이전트가 처음 보는 양식을 분해한 것이든 같은 문으로 들어온다.
 * 오류는 고칠 수 있게 위치(path)와 이유를 준다 (에이전트가 다시 분해할 때 그대로 읽는다).
 */
import { FIELD_TYPES, getComponent, getRole, isFixedRole } from "./registry";
import { ASSET_SCHEMA_V3, gridGeometry, repeatUnits, type AssetV3, type GridCell, type SkelNode } from "./skeleton";

export interface AssetIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AssetValidation {
  readonly ok: boolean;
  readonly errors: readonly AssetIssue[];
  readonly warnings: readonly AssetIssue[];
}

const NODE_KEYS: Record<SkelNode["t"], readonly string[]> = {
  label: ["t", "role", "text", "variant"],
  field: ["t", "role", "field", "variant"],
  grid: ["t", "component", "variant", "caption", "rows"],
  container: ["t", "component", "variant", "role", "children"],
  repeat: ["t", "id", "min", "children"],
  divider: ["t", "variant"],
};
const CELL_KEYS = ["role", "rs", "cs", "mergeSame", "text", "field", "nodes"];
const ROW_KEYS = ["repeat", "cells"];
const FIELD_KEYS = ["id", "type", "required", "hint", "options", "multi"];
const GRID_COMPONENTS = new Set(["table", "columns", "kv"]);
const CONTAINER_COMPONENTS = new Set(["frame", "cover", "card", "section"]);
const STYLE_LEAK = /#[0-9a-f]{3,8}\b|\b\d+(\.\d+)?px\b|\brgba?\(|font-weight|background|border\s*:/i;
const FIELD_ID = /^[\p{L}\p{N}_.-]+$/u;
const SELECTOR = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){0,3}$/;

export function validateAssetV3(asset: unknown): AssetValidation {
  const errors: AssetIssue[] = [];
  const warnings: AssetIssue[] = [];
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const warn = (path: string, code: string, message: string) => warnings.push({ path, code, message });

  if (!asset || typeof asset !== "object") {
    err("", "not-object", "에셋은 JSON 객체여야 합니다.");
    return { ok: false, errors, warnings };
  }
  const a = asset as Partial<AssetV3> & Record<string, unknown>;
  if (a.schema !== ASSET_SCHEMA_V3) err("schema", "schema", `schema 는 "${ASSET_SCHEMA_V3}" 여야 합니다.`);
  if (typeof a.title !== "string" || !a.title.trim()) err("title", "title", "title 이 비었습니다.");
  if (a.scope !== "element" && a.scope !== "section" && a.scope !== "page") err("scope", "scope", "scope 는 element · section · page 중 하나입니다.");
  if (!Array.isArray(a.nodes) || a.nodes.length === 0) {
    err("nodes", "empty", "nodes 가 비었습니다.");
    return { ok: false, errors, warnings };
  }

  const checkKeys = (obj: Record<string, unknown>, allowed: readonly string[], path: string) => {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) {
        err(`${path}.${k}`, "unknown-key", `모르는 키 "${k}" — 구조에는 스타일(색 · 굵기 · 선 · 크기)을 두지 않습니다. 스타일은 style.tokens 로 옮기세요.`);
      }
    }
  };

  const isSummaryRole = (role: string) => role === "total" || role.startsWith("total.");
  const isCellLabelRole = (role: string) => {
    const base = role.includes(".") ? role.slice(0, role.indexOf(".")) : role;
    return base === "label" || base === "group-label" || base === "sub-label" || base === "column-header";
  };

  const checkRole = (role: unknown, path: string, expect?: "fixed" | "fill", inGridCell = false) => {
    if (typeof role !== "string" || !role) {
      err(`${path}.role`, "role-missing", "role 이 없습니다.");
      return;
    }
    if (!getRole(role)) {
      warn(`${path}.role`, "role-unknown", `역할 어휘에 없는 "${role}" — 새 역할 후보로 보고합니다. 가능하면 기존 역할을 쓰세요.`);
      return;
    }
    // 표 셀에서는 소계/합계 행의 고정 라벨(`{total.subtotal}소계`, `{total}합계`)과
    // 동적 분류 칸(`{group-label}{{category}}`, `{label}{{sub}}`)이 같은 스타일 역할을 공유할 수 있다.
    if (inGridCell) {
      if (expect === "fixed" && isSummaryRole(role)) return;
      if (expect === "fill" && isCellLabelRole(role)) return;
    }
    if (expect === "fixed" && !isFixedRole(role)) err(`${path}.role`, "role-kind", `고정 글(text)에 채울 역할 "${role}" 을 붙였습니다.`);
    if (expect === "fill" && isFixedRole(role)) err(`${path}.role`, "role-kind", `채울 자리(field)에 고정 역할 "${role}" 을 붙였습니다.`);
  };

  const checkText = (text: unknown, path: string) => {
    if (typeof text !== "string" || !text.trim()) err(path, "text-empty", "고정 글이 비었습니다 — 빈 칸이면 field 로 두세요.");
    else if (STYLE_LEAK.test(text)) warn(path, "style-in-text", "고정 글에 스타일 값처럼 보이는 것이 있습니다.");
  };

  const checkField = (field: unknown, path: string, scope: Set<string>) => {
    if (!field || typeof field !== "object") {
      err(path, "field-missing", "field 가 객체가 아닙니다.");
      return;
    }
    const f = field as Record<string, unknown>;
    checkKeys(f, FIELD_KEYS, path);
    if (typeof f.id !== "string" || !FIELD_ID.test(f.id)) err(`${path}.id`, "field-id", "field.id 는 글자 · 숫자 · _ . - 로만 된 비지 않은 이름이어야 합니다.");
    else if (scope.has(f.id)) err(`${path}.id`, "field-dup", `field.id "${f.id}" 가 같은 범위에 두 번 있습니다.`);
    else scope.add(f.id);
    if (!FIELD_TYPES.includes(f.type as never)) err(`${path}.type`, "field-type", `field.type 은 ${FIELD_TYPES.join(" · ")} 중 하나입니다.`);
    if (f.type === "choice" && (!Array.isArray(f.options) || f.options.length < 2)) err(`${path}.options`, "choice-options", "choice 필드는 선택지(options)가 둘 이상 필요합니다.");
  };

  const walk = (nodes: readonly SkelNode[], path: string, scope: Set<string>, repeatIds: Set<string>) => {
    nodes.forEach((n, i) => {
      const p = `${path}[${i}]`;
      if (!n || typeof n !== "object" || !(n.t in NODE_KEYS)) {
        err(p, "node-type", `노드 종류(t)는 ${Object.keys(NODE_KEYS).join(" · ")} 중 하나입니다.`);
        return;
      }
      checkKeys(n as unknown as Record<string, unknown>, NODE_KEYS[n.t], p);
      switch (n.t) {
        case "label":
          checkRole(n.role, p, "fixed");
          checkText(n.text, `${p}.text`);
          break;
        case "field":
          checkRole(n.role, p, "fill");
          checkField(n.field, `${p}.field`, scope);
          break;
        case "divider":
          break;
        case "repeat": {
          if (typeof n.id !== "string" || !n.id) err(`${p}.id`, "repeat-id", "repeat.id 가 없습니다.");
          else if (repeatIds.has(n.id)) err(`${p}.id`, "repeat-dup", `repeat.id "${n.id}" 가 두 번 있습니다.`);
          else repeatIds.add(n.id);
          if (!Array.isArray(n.children) || !n.children.length) err(`${p}.children`, "empty", "반복 단위가 비었습니다.");
          else walk(n.children, `${p}.children`, new Set(), repeatIds);
          break;
        }
        case "container":
          if (!CONTAINER_COMPONENTS.has(n.component)) err(`${p}.component`, "component", `container.component 는 ${[...CONTAINER_COMPONENTS].join(" · ")} 중 하나입니다.`);
          if (n.role) checkRole(n.role, p);
          if (!Array.isArray(n.children) || !n.children.length) err(`${p}.children`, "empty", "container 가 비었습니다.");
          else walk(n.children, `${p}.children`, scope, repeatIds);
          break;
        case "grid":
          checkGrid(n, p, scope, repeatIds);
          break;
      }
    });
  };

  const checkCell = (cell: GridCell, p: string, scope: Set<string>, repeatIds: Set<string>) => {
    checkKeys(cell as unknown as Record<string, unknown>, CELL_KEYS, p);
    const kinds = [cell.text !== undefined, cell.field !== undefined, cell.nodes !== undefined].filter(Boolean).length;
    if (kinds !== 1) err(p, "cell-kind", "칸은 text(고정 글) · field(채울 자리) · nodes(칸 안 블록) 중 정확히 하나만 가집니다.");
    if (cell.text !== undefined) {
      checkRole(cell.role, p, "fixed", true);
      checkText(cell.text, `${p}.text`);
    } else if (cell.field !== undefined) {
      checkRole(cell.role, p, "fill", true);
      checkField(cell.field, `${p}.field`, scope);
    } else if (cell.nodes !== undefined) {
      if (!Array.isArray(cell.nodes) || !cell.nodes.length) err(`${p}.nodes`, "empty", "칸 안 블록이 비었습니다.");
      else walk(cell.nodes, `${p}.nodes`, scope, repeatIds);
    }
    for (const k of ["rs", "cs"] as const) {
      const v = cell[k];
      if (k === "rs" && v === "repeat") continue;
      if (v !== undefined && (!Number.isInteger(v) || (v as number) < 1)) err(`${p}.${k}`, "span", `${k} 는 1 이상의 정수입니다${k === "rs" ? ' (또는 반복 단위를 덮는 "repeat")' : ""}.`);
    }
    if (cell.mergeSame !== undefined && typeof cell.mergeSame !== "boolean") {
      err(`${p}.mergeSame`, "merge-same", "mergeSame 은 boolean 이어야 합니다.");
    }
  };

  const checkGrid = (n: Extract<SkelNode, { t: "grid" }>, p: string, scope: Set<string>, repeatIds: Set<string>) => {
    if (!GRID_COMPONENTS.has(n.component)) err(`${p}.component`, "component", `grid.component 는 ${[...GRID_COMPONENTS].join(" · ")} 중 하나입니다.`);
    if (!Array.isArray(n.rows) || !n.rows.length) {
      err(`${p}.rows`, "empty", "격자에 행이 없습니다.");
      return;
    }
    const unitScopes = new Map<string, Set<string>>();
    n.rows.forEach((row, r) => {
      const rp = `${p}.rows[${r}]`;
      checkKeys(row as unknown as Record<string, unknown>, ROW_KEYS, rp);
      if (!Array.isArray(row.cells) || !row.cells.length) {
        err(`${rp}.cells`, "empty", "행에 칸이 없습니다.");
        return;
      }
      let rowScope = scope;
      if (row.repeat) {
        if (!unitScopes.has(row.repeat)) unitScopes.set(row.repeat, new Set());
        rowScope = unitScopes.get(row.repeat)!;
      }
      row.cells.forEach((cell: GridCell, c: number) => checkCell(cell, `${rp}.cells[${c}]`, rowScope, repeatIds));
    });
    const geo = gridGeometry(n.rows);
    for (const e of geo.errors) err(`${p}.rows`, "geometry", e);
    const units = repeatUnits(n.rows);
    const seen = new Set<string>();
    for (const u of units) {
      if (seen.has(u.id) || repeatIds.has(u.id)) err(`${p}.rows`, "repeat-split", `반복 단위 "${u.id}" 가 이어지지 않거나 다른 곳과 이름이 겹칩니다.`);
      seen.add(u.id);
      for (const pc of geo.placed) {
        const inside = pc.row >= u.start && pc.row <= u.end;
        const crosses = pc.row < u.start ? pc.row + pc.rs - 1 >= u.start : inside && pc.row + pc.rs - 1 > u.end;
        if (crosses) err(`${p}.rows[${pc.row}]`, "repeat-span", `반복 단위 "${u.id}" 경계를 넘는 세로 병합이 있습니다.`);
      }
      const unitCells = geo.placed.filter((pc) => pc.row >= u.start && pc.row <= u.end);
      if (!unitCells.some((pc) => pc.cell.field || pc.cell.nodes)) warn(`${p}.rows`, "repeat-no-field", `반복 단위 "${u.id}" 에 채울 자리가 없습니다.`);
    }
    for (const id of seen) repeatIds.add(id);
    if (n.component === "table" && !geo.placed.some((pc) => pc.cell.field || pc.cell.nodes)) warn(p, "grid-no-field", "표에 채울 자리가 하나도 없습니다.");
  };

  walk(a.nodes as readonly SkelNode[], "nodes", new Set(), new Set());

  if (a.style !== undefined) {
    const s = a.style as unknown as Record<string, unknown>;
    if (!Array.isArray(s.selectors)) err("style.selectors", "style", "style.selectors 는 배열입니다.");
    else
      for (const sel of s.selectors as unknown[]) {
        if (typeof sel !== "string" || !SELECTOR.test(sel)) err("style.selectors", "selector", `선택자 "${String(sel)}" 는 컴포넌트[.변형][.역할] 모양이어야 합니다.`);
        else if (!getComponent(sel.split(".")[0])) warn("style.selectors", "selector-component", `선택자 "${sel}" 의 컴포넌트를 모릅니다.`);
      }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** 사람 · 에이전트가 읽기 좋은 한 줄씩 요약. */
export function formatAssetIssues(v: AssetValidation, max = 12): string {
  const lines = [
    ...v.errors.slice(0, max).map((e) => `✕ ${e.path}: ${e.message}`),
    ...v.warnings.slice(0, Math.max(0, max - v.errors.length)).map((w) => `△ ${w.path}: ${w.message}`),
  ];
  const more = v.errors.length + v.warnings.length - lines.length;
  return lines.join("\n") + (more > 0 ? `\n… 외 ${more}건` : "");
}
