/**
 * 분해 채점 — 정답 에셋과 비교해 "우리 사양대로 올바르게 분해했는가"를 잰다.
 * 처음 보는 양식 평가(evals/asset-forms)와 회귀 테스트가 같은 채점기를 쓴다.
 *
 * 내용 글자는 보지 않는다 — 구조(격자 · 병합 · 칸 종류 · 역할 · 고정 글 · 반복 · 필드 종류)만 본다.
 */
import { roleFamily } from "./registry";
import { labelSimilarity } from "./apply";
import { collectFields, collectLabels, gridGeometry, type AssetV3, type GridRow, type GridPlacedCell, type SkelNode } from "./skeleton";
import { validateAssetV3 } from "./validate";

export interface SkeletonScore {
  readonly overall: number;
  readonly valid: boolean;
  readonly errors: number;
  readonly metrics: {
    /** 블록 순서 (격자 · 묶음 · 글 · 사진 …) */
    readonly blockSeq: number;
    /** 격자 행 · 열 수 */
    readonly gridShape: number;
    /** 칸 종류 (고정 글 / 채울 자리 / 칸 안 블록) */
    readonly cellKind: number;
    /** 병합 */
    readonly span: number;
    /** 역할 (같은 무리면 반점) */
    readonly role: number;
    /** 고정 글 F1 */
    readonly labels: number;
    /** 반복 단위를 알아봤는가 */
    readonly repeat: number;
    /** 채울 자리 종류 (사진 · 목록 · 글 …) */
    readonly fieldType: number;
  };
  readonly notes: string[];
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;

function seqTokens(nodes: readonly SkelNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.t === "grid") out.push(`G:${n.component}`);
    else if (n.t === "container") out.push(`C:${n.component}`, ...seqTokens(n.children), "/C");
    else if (n.t === "repeat") out.push("R", ...seqTokens(n.children), "/R");
    else if (n.t === "field") out.push(n.field.type === "image" ? "F:img" : "F");
    else if (n.t === "label") out.push("L");
    else out.push("D");
  }
  return out;
}

function lcsRatio(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

type Grid = Extract<SkelNode, { t: "grid" }>;

function collectGrids(nodes: readonly SkelNode[]): Grid[] {
  const out: Grid[] = [];
  for (const n of nodes) {
    if (n.t === "grid") {
      out.push(n);
      for (const row of n.rows) for (const c of row.cells) if (c.nodes) out.push(...collectGrids(c.nodes));
    } else if (n.t === "container" || n.t === "repeat") out.push(...collectGrids(n.children));
  }
  return out;
}

/** 펼쳐 적은 데이터 행(병합 없는 채울 자리만의 같은 모양 행)을 반복 하나로 접는다 — 비교 정렬용. */
function collapseRows(rows: readonly GridRow[]): GridRow[] {
  const out: GridRow[] = [];
  const isData = (r: GridRow) => r.cells.every((c) => c.field && (c.rs ?? 1) === 1 && (c.cs ?? 1) === 1);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.repeat) {
      if (out.length && out[out.length - 1].repeat === row.repeat) continue;
      out.push({ ...row, repeat: "unit" });
      continue;
    }
    if (isData(row) && i + 1 < rows.length && isData(rows[i + 1]) && rows[i + 1].cells.length === row.cells.length) {
      let j = i;
      while (j + 1 < rows.length && isData(rows[j + 1]) && rows[j + 1].cells.length === row.cells.length) j++;
      out.push({ ...row, repeat: "unit" });
      i = j;
      continue;
    }
    out.push(row);
  }
  return out;
}

/** 칸 안 블록이 채울 자리 하나뿐이면 그 칸은 채울 자리 칸과 같다 (`{field}` ≡ `{nodes:[field]}`). */
const soleField = (pc: GridPlacedCell) => {
  const n = pc.cell.nodes;
  return n && n.length === 1 && n[0].t === "field" ? n[0] : null;
};
const kindOf = (pc: GridPlacedCell) => (pc.cell.text !== undefined ? "L" : pc.cell.field || soleField(pc) ? "F" : "N");
const roleOf = (pc: GridPlacedCell) => soleField(pc)?.role ?? pc.cell.role;
const fieldOf = (pc: GridPlacedCell) => pc.cell.field ?? soleField(pc)?.field;

function compareGrids(t: Grid, p: Grid) {
  const tRows = collapseRows(t.rows);
  const pRows = collapseRows(p.rows);
  const tg = gridGeometry(tRows);
  const pg = gridGeometry(pRows);
  const shape =
    1 -
    (Math.abs(tg.rowCount - pg.rowCount) / Math.max(tg.rowCount, pg.rowCount, 1) + Math.abs(tg.colCount - pg.colCount) / Math.max(tg.colCount, pg.colCount, 1)) / 2;
  const at = new Map(pg.placed.map((pc) => [`${pc.row}:${pc.col}`, pc]));
  let kind = 0;
  let span = 0;
  let role = 0;
  let ftype = 0;
  let fields = 0;
  for (const tc of tg.placed) {
    const pc = at.get(`${tc.row}:${tc.col}`);
    if (!pc) continue;
    if (kindOf(tc) === kindOf(pc)) kind++;
    if (tc.rs === pc.rs && tc.cs === pc.cs && (tc.cell.rs === "repeat") === (pc.cell.rs === "repeat")) span++;
    const tr = roleOf(tc);
    const pr = roleOf(pc);
    role += tr === pr ? 1 : roleFamily(tr) === roleFamily(pr) ? 0.5 : 0;
    const tf = fieldOf(tc);
    if (tf) {
      fields++;
      const pf = fieldOf(pc);
      if (pf && pf.type === tf.type) ftype++;
    }
  }
  const n = Math.max(tg.placed.length, pg.placed.length, 1);
  const tHas = t.rows.some((r) => r.repeat);
  const pHas = p.rows.some((r) => r.repeat);
  return {
    shape,
    kind: kind / n,
    span: span / n,
    role: role / n,
    ftype: fields ? ftype / fields : 1,
    fieldCount: fields,
    repeat: tHas ? (pHas ? 1 : 0) : pHas ? 0.5 : 1,
    componentMatch: t.component === p.component,
  };
}

function labelF1(truth: readonly SkelNode[], pred: readonly SkelNode[]): number {
  const T = collectLabels(truth).map((l) => l.text);
  const P = collectLabels(pred).map((l) => l.text);
  if (!T.length && !P.length) return 1;
  if (!T.length || !P.length) return 0;
  const usedP = new Set<number>();
  let hit = 0;
  for (const t of T) {
    let best = -1;
    let bs = 0;
    P.forEach((p, j) => {
      if (usedP.has(j)) return;
      const s = labelSimilarity(t, p);
      if (s > bs) {
        bs = s;
        best = j;
      }
    });
    if (best >= 0 && bs >= 0.8) {
      usedP.add(best);
      hit++;
    }
  }
  const recall = hit / T.length;
  const precision = hit / P.length;
  return recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
}

function fieldTypeScore(truth: readonly SkelNode[], pred: readonly SkelNode[]): number {
  const count = (nodes: readonly SkelNode[]) => {
    const m = new Map<string, number>();
    for (const f of collectFields(nodes)) {
      const k = f.field.type === "image" ? "image" : f.field.type === "list" ? "list" : f.field.type === "choice" ? "choice" : "text";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const a = count(truth);
  const b = count(pred);
  const keys = new Set([...a.keys(), ...b.keys()]);
  if (!keys.size) return 1;
  let s = 0;
  for (const k of keys) {
    const x = a.get(k) ?? 0;
    const y = b.get(k) ?? 0;
    s += Math.min(x, y) / Math.max(x, y, 1);
  }
  return s / keys.size;
}

export function scoreSkeleton(truth: AssetV3, pred: unknown): SkeletonScore {
  const v = validateAssetV3(pred);
  const notes: string[] = [];
  const p = (pred && typeof pred === "object" && Array.isArray((pred as AssetV3).nodes) ? (pred as AssetV3) : null) as AssetV3 | null;
  if (!p) {
    return {
      overall: 0,
      valid: false,
      errors: v.errors.length,
      metrics: { blockSeq: 0, gridShape: 0, cellKind: 0, span: 0, role: 0, labels: 0, repeat: 0, fieldType: 0 },
      notes: ["분해 결과가 에셋 모양이 아닙니다."],
    };
  }
  const blockSeq = lcsRatio(seqTokens(truth.nodes), seqTokens(p.nodes));
  const tGrids = collectGrids(truth.nodes);
  const pGrids = collectGrids(p.nodes);
  const used = new Set<number>();
  const gs: ReturnType<typeof compareGrids>[] = [];
  for (const tg of tGrids) {
    let best: { j: number; c: ReturnType<typeof compareGrids>; s: number } | null = null;
    pGrids.forEach((pg, j) => {
      if (used.has(j)) return;
      const c = compareGrids(tg, pg);
      const s = c.shape + c.kind + (c.componentMatch ? 0.5 : 0);
      if (!best || s > best.s) best = { j, c, s };
    });
    if (best) {
      used.add((best as { j: number }).j);
      gs.push((best as { c: ReturnType<typeof compareGrids> }).c);
    } else {
      notes.push(`정답의 ${tg.component} 격자를 찾지 못했습니다.`);
      gs.push({ shape: 0, kind: 0, span: 0, role: 0, ftype: 0, fieldCount: 0, repeat: tg.rows.some((r) => r.repeat) ? 0 : 1, componentMatch: false });
    }
  }
  const extra = pGrids.length - used.size;
  if (extra > 0) notes.push(`정답에 없는 격자 ${extra}개`);
  const avg = (k: keyof ReturnType<typeof compareGrids>) => (gs.length ? gs.reduce((a, g) => a + Number(g[k]), 0) / gs.length : 1);
  const extraPenalty = pGrids.length ? used.size / Math.max(pGrids.length, tGrids.length) : tGrids.length ? 0 : 1;
  const metrics = {
    blockSeq: r2(blockSeq),
    gridShape: r2(avg("shape") * extraPenalty),
    cellKind: r2(avg("kind")),
    span: r2(avg("span")),
    role: r2(avg("role")),
    labels: r2(labelF1(truth.nodes, p.nodes)),
    repeat: r2(avg("repeat")),
    fieldType: r2((avg("ftype") + fieldTypeScore(truth.nodes, p.nodes)) / 2),
  };
  let overall =
    0.15 * metrics.blockSeq +
    0.15 * metrics.gridShape +
    0.15 * metrics.cellKind +
    0.1 * metrics.span +
    0.15 * metrics.role +
    0.15 * metrics.labels +
    0.1 * metrics.repeat +
    0.05 * metrics.fieldType;
  if (!v.ok) {
    overall *= 0.6;
    notes.push(`사양 위반 ${v.errors.length}건: ${v.errors.slice(0, 3).map((e) => e.message).join(" / ")}`);
  }
  return { overall: r2(overall), valid: v.ok, errors: v.errors.length, metrics, notes };
}
