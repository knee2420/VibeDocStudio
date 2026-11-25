/**
 * 에셋 v3 — 구조 골격 (`vibe-asset/3`).
 *
 * 에셋 = 구조 골격(프리미티브 + 역할 + 반복 + 필드) + 스타일 짝(역할별 토큰) + 출처.
 * 내용(사용자 글)은 담지 않는다 — 고정 글(label)과 채울 자리(field)만 있다.
 * 사람과 에이전트가 같은 JSON 을 읽고 쓴다 (에이전트가 처음 보는 양식을 분해한 결과도 이 모양).
 */
import type { FieldType } from "./registry";

export const ASSET_SCHEMA_V3 = "vibe-asset/3" as const;

export interface FieldSpec {
  /** 에셋 안에서 유일 (반복 단위 안에서는 그 단위 안에서 유일) */
  readonly id: string;
  readonly type: FieldType;
  readonly required?: boolean;
  /** 사람이 읽는 항목 이름 (보통 옆 머리칸 글) — 다른 데이터를 이 자리에 맞출 때 쓴다 */
  readonly hint?: string;
  /** type=choice 의 선택지 */
  readonly options?: readonly string[];
  readonly multi?: boolean;
}

/** 격자 칸 하나 — `text`(고정 글) · `field`(채울 자리) · `nodes`(칸 안 블록) 중 정확히 하나. */
export interface GridCell {
  readonly role: string;
  /**
   * rowSpan (기본 1). `"repeat"` = 반복 단위 첫 행에 있는 묶음 머리칸 — 레코드 수만큼 펼친 행 전체를 세로로 덮는다
   * (예: "학력" 머리칸 아래로 학력 행이 몇 개든).
   */
  readonly rs?: number | "repeat";
  /** colSpan (기본 1) */
  readonly cs?: number;
  /**
   * 반복 행(`repeat`) 전개 시 연속된 행의 값이 같으면 자동으로 세로 병합(`rowSpan`)한다.
   * `.vsyntax` DSL 의 `{{field^}}` 또는 반복 행의 `[^]` 기호에 대응한다.
   */
  readonly mergeSame?: boolean;
  readonly text?: string;
  readonly field?: FieldSpec;
  readonly nodes?: readonly SkelNode[];
}

export interface GridRow {
  /** 같은 id 의 이어진 행들 = 레코드마다 반복되는 단위 */
  readonly repeat?: string;
  readonly cells: readonly GridCell[];
}

export type GridComponent = "table" | "columns" | "kv";
export type ContainerComponent = "frame" | "cover" | "card" | "section";

export type SkelNode =
  /** `variant` = 구조 변형 이름 (예: 제목 단계 "h2") — 색 · 크기 같은 값이 아니라 이름만 */
  | { readonly t: "label"; readonly role: string; readonly text: string; readonly variant?: string }
  | { readonly t: "field"; readonly role: string; readonly field: FieldSpec; readonly variant?: string }
  | {
      readonly t: "grid";
      readonly component: GridComponent;
      readonly variant?: string;
      readonly caption?: string;
      readonly rows: readonly GridRow[];
    }
  | {
      readonly t: "container";
      readonly component: ContainerComponent;
      readonly variant?: string;
      readonly role?: string;
      readonly children: readonly SkelNode[];
    }
  | { readonly t: "repeat"; readonly id: string; readonly min?: number; readonly children: readonly SkelNode[] }
  | { readonly t: "divider"; readonly variant?: string };

/** 스타일 짝 — 선택자(`컴포넌트[.변형][.역할]`) → 토큰. 구조에는 스타일을 두지 않는다. */
export interface AssetStyleCompanion {
  readonly selectors: readonly string[];
  readonly tokens?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface AssetV3Origin {
  readonly sourceType: "builtin" | "vdoc-capture" | "ref-extract" | "attachment" | "composed" | "manual";
  readonly sourceRef?: string;
  readonly createdAt?: string;
}

export interface AssetV3 {
  readonly schema: typeof ASSET_SCHEMA_V3;
  readonly assetId: string;
  readonly title: string;
  readonly scope: "element" | "section" | "page";
  readonly summary?: string;
  /** `.vsyntax` 정본 구조 문법 원문 줄 배열 (사람 · 아웃라인 · AI 공용 표면 표현) */
  readonly dsl?: readonly string[];
  readonly nodes: readonly SkelNode[];
  readonly style?: AssetStyleCompanion;
  /** 분해하면서 확신이 낮았던 곳 (사람이 확인할 것) */
  readonly uncertain?: readonly string[];
  readonly origin?: AssetV3Origin;
}

/** 채울 값 — 필드 id → HTML, 반복 id → 레코드 배열. */
export interface AssetRecords {
  readonly [key: string]: string | readonly AssetRecords[];
}

// --- 격자 기하 ------------------------------------------------------------------------------

export interface GridPlacedCell {
  readonly cell: GridCell;
  readonly row: number;
  readonly col: number;
  readonly rs: number;
  readonly cs: number;
}

export interface GridGeometry {
  readonly colCount: number;
  readonly rowCount: number;
  readonly placed: readonly GridPlacedCell[];
  readonly errors: readonly string[];
}

/** 행 · 열 병합을 펼쳐 칸마다 (행, 열) 원점을 정한다. 겹침 · 넘침 · 열 수 불일치를 오류로 보고한다. */
export function gridGeometry(rows: readonly GridRow[]): GridGeometry {
  const errors: string[] = [];
  const occ: boolean[][] = rows.map(() => []);
  const placed: GridPlacedCell[] = [];
  const widths: number[] = [];
  const units = repeatUnits(rows);
  const unitAt = (r: number) => units.find((u) => r >= u.start && r <= u.end);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (occ[r][c]) c++;
      let rs: number;
      if (cell.rs === "repeat") {
        const u = unitAt(r);
        if (!u || u.start !== r) {
          errors.push(`${r + 1}행 ${c + 1}열: rs "repeat" 는 반복 단위의 첫 행에만 둡니다.`);
          rs = 1;
        } else rs = u.end - u.start + 1;
      } else rs = Math.max(1, Math.floor(Number(cell.rs ?? 1)));
      const cs = Math.max(1, Math.floor(cell.cs ?? 1));
      if (r + rs > rows.length) errors.push(`${r + 1}행 ${c + 1}열 칸의 rowSpan ${rs} 가 표 밖으로 나갑니다.`);
      for (let dr = 0; dr < rs && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (occ[r + dr][c + dc]) errors.push(`${r + dr + 1}행 ${c + dc + 1}열이 두 칸에 겹칩니다.`);
          occ[r + dr][c + dc] = true;
        }
      }
      placed.push({ cell, row: r, col: c, rs, cs });
      c += cs;
    }
  });
  rows.forEach((_, r) => {
    let w = occ[r].length;
    while (w > 0 && !occ[r][w - 1]) w--;
    widths.push(w);
    for (let c = 0; c < w; c++) if (!occ[r][c]) errors.push(`${r + 1}행 ${c + 1}열이 비었습니다 (어느 칸도 덮지 않음).`);
  });
  const colCount = widths.length ? Math.max(...widths) : 0;
  widths.forEach((w, r) => {
    if (w !== colCount) errors.push(`${r + 1}행의 너비가 ${w}열로 다른 행(${colCount}열)과 다릅니다.`);
  });
  return { colCount, rowCount: rows.length, placed, errors };
}

/** 반복 단위: 같은 `repeat` id 의 이어진 행 구간. */
export function repeatUnits(rows: readonly GridRow[]): { id: string; start: number; end: number }[] {
  const out: { id: string; start: number; end: number }[] = [];
  rows.forEach((row, i) => {
    if (!row.repeat) return;
    const last = out[out.length - 1];
    if (last && last.id === row.repeat && last.end === i - 1) last.end = i;
    else out.push({ id: row.repeat, start: i, end: i });
  });
  return out;
}

// --- 걷기 -----------------------------------------------------------------------------------

export interface FieldRef {
  readonly field: FieldSpec;
  readonly role: string;
  /** 반복 단위 id (반복 안이면) */
  readonly repeat?: string;
  /** 이 자리의 이름표 — 같은 행 왼쪽 머리칸이나 열 머리칸 글 */
  readonly label?: string;
}

const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** 골격의 모든 채울 자리 (이름표 포함) — 데이터 맞추기 · 채점 · 설명에 쓴다. */
export function collectFields(nodes: readonly SkelNode[], repeat?: string): FieldRef[] {
  const out: FieldRef[] = [];
  for (const n of nodes) {
    if (n.t === "field") out.push({ field: n.field, role: n.role, repeat, label: n.field.hint });
    else if (n.t === "container") out.push(...collectFields(n.children, repeat));
    else if (n.t === "repeat") out.push(...collectFields(n.children, n.id));
    else if (n.t === "grid") {
      const geo = gridGeometry(n.rows);
      const rowOf = (pc: GridPlacedCell) => n.rows[pc.row];
      for (const pc of geo.placed) {
        const rep = rowOf(pc).repeat ?? repeat;
        if (pc.cell.field) {
          const left = geo.placed
            .filter((o) => o.cell.text && o.row <= pc.row && o.row + o.rs > pc.row && o.col < pc.col)
            .sort((a, b) => b.col - a.col)[0];
          const top = geo.placed
            .filter((o) => o.cell.text && o.col <= pc.col && o.col + o.cs > pc.col && o.row < pc.row)
            .sort((a, b) => b.row - a.row)[0];
          const label = pc.cell.field.hint ?? (left?.cell.text ? plain(left.cell.text) : top?.cell.text ? plain(top.cell.text) : undefined);
          out.push({ field: pc.cell.field, role: pc.cell.role, repeat: rep, label });
        }
        if (pc.cell.nodes) out.push(...collectFields(pc.cell.nodes, rep));
      }
    }
  }
  return out;
}

/** 모든 고정 글. */
export function collectLabels(nodes: readonly SkelNode[]): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [];
  for (const n of nodes) {
    if (n.t === "label") out.push({ role: n.role, text: n.text });
    else if (n.t === "container" || n.t === "repeat") out.push(...collectLabels(n.children));
    else if (n.t === "grid") {
      if (n.caption) out.push({ role: "caption", text: n.caption });
      for (const row of n.rows)
        for (const cell of row.cells) {
          if (cell.text !== undefined) out.push({ role: cell.role, text: cell.text });
          if (cell.nodes) out.push(...collectLabels(cell.nodes));
        }
    }
  }
  return out;
}

export function normalizeLabel(text: string): string {
  return plain(text)
    .toLowerCase()
    .replace(/[\s ·•:：()（）\[\]{}<>「」『』"'`.,/\\|*\-_~!?]+/g, "");
}
