import type { TableCellSlotDef, VDocSlot } from "./types";

/**
 * 아웃라이너 이름 짓기 규칙.
 *
 * 서식의 칸은 대부분 "항목명(라벨) | 입력 칸" 쌍이다. 라벨은 노드가 되지 않고
 * 옆 · 위 입력 칸의 이름이 된다. 내용(content)은 절대 이름으로 쓰지 않는다.
 *
 * 이름 우선순위: 작성자가 붙인 라벨 → 왼쪽 라벨 → 위쪽 열 머리 → 위치(확인 필요).
 */

/** label: 이름표 칸(노드 없음) · value: 입력 칸 · static: 고정 텍스트(회색 노드). */
export type OutlineCellRole = "label" | "value" | "static";

export interface OutlineName {
  title: string;
  /** 규칙으로 이름을 찾지 못해 위치로 지은 경우. 트리에 ⚠ 로 표시한다. */
  needsReview: boolean;
}

/** import 엔진이 좌표 · 일련번호로 지은 라벨 (`셀 (3,4)`, `1행 2열 (Puck)`, `Row 1 · 마일스톤`). */
const POSITIONAL_LABEL = /^(셀\s*\(\s*\d+\s*,\s*\d+\s*\)|\d+\s*행\s*\d+\s*열|row\s*\d+\b|table header\s*\d+|표\s*헤더\s*\d+)/i;
/** 이름 자체가 "이 칸은 라벨"이라고 말하는 경우 (`품목 헤더`, `헤더: 단가`, `협의 및 결의사항 라벨`). */
const LABEL_NAMED = /(라벨|헤더|header|label)(\s*\d+)?\s*$|^헤더\s*:/i;
/** import 엔진이 붙인 블록 이름 (`p1_tbl_1`). */
const MACHINE_TITLE = /^[a-z]+\d*_[a-z]+_\d+$/i;

export const plainText = (html: string | undefined): string =>
  (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const compact = (s: string): string => s.replace(/\s+/g, "");

/** `반 상 회`, `성     명` 처럼 글자 사이를 벌린 서식 텍스트를 붙이고 끝의 `:` · ` 슬롯` 을 뗀다. */
export function tidyName(raw: string | undefined): string {
  let text = (raw || "").replace(/\s+/g, " ").trim();
  const tokens = text.split(" ");
  if (tokens.length > 1 && tokens.every((t) => t.length === 1)) text = tokens.join("");
  return text
    .replace(/\s*[:：]\s*$/, "")
    .replace(/\s+(슬롯|slot)$/i, "")
    .trim();
}

/** 블록 제목에서 치수 메모(`(449.4pt)`)를 떼고, 기계식 이름이면 빈 문자열을 돌려준다. */
export function tidyBlockTitle(raw: string | undefined): string {
  const text = tidyName((raw || "").replace(/\s*\(\s*[\d.]+\s*(pt|px|mm)\s*\)\s*/gi, " "));
  return MACHINE_TITLE.test(text) ? "" : text;
}

/** 작성자가 직접 붙인 쓸 만한 라벨인가 (좌표 이름 · 내용을 베낀 이름이 아님). */
export function hasAuthoredLabel(slot: VDocSlot): boolean {
  const label = (slot.label || "").trim();
  if (!label || POSITIONAL_LABEL.test(label)) return false;
  return compact(label) !== compact(plainText(slot.content));
}

/** `1구역 · 개최 일시` 가 `1구역 · 일시 및 결재란` 아래에 있으면 `개최 일시` 만 남긴다. */
export function stripScopePrefix(label: string, scopeTitle: string): string {
  const [prefix, ...rest] = label.split(" · ");
  if (rest.length === 0) return label;
  return scopeTitle.startsWith(`${prefix} ·`) ? rest.join(" · ") : label;
}

/**
 * 표 칸의 역할. 헤더(`cell.isHeader`)이거나 라벨 패턴 / 내용과 같은 짧은 글자면 라벨로 분류한다.
 * 모든 칸은 역할과 무관하게 접근 · 편집 가능하다.
 */
export function classifyTableCell(cell: TableCellSlotDef, slot: VDocSlot): OutlineCellRole {
  if (cell.isHeader) return "label";
  if (LABEL_NAMED.test(slot.label || "")) return "label";
  const text = plainText(slot.content);
  const isCopiedLabel =
    text !== "" &&
    compact(text) === compact(slot.label || "") &&
    compact(text).length <= 12 &&
    !/\d/.test(text) &&
    /[가-힣A-Za-z].*[가-힣A-Za-z]/.test(text);
  return isCopiedLabel ? "label" : "value";
}

export interface PlacedCell {
  cell: TableCellSlotDef;
  slot: VDocSlot;
  role: OutlineCellRole;
  rowIndex: number;
  colStart: number;
  colEnd: number;
}

/** 병합(colSpan · rowSpan)을 반영해 각 칸이 차지하는 열 범위를 계산한다. */
export function placeTableCells(
  rows: { cells: TableCellSlotDef[] }[],
  slots: Record<string, VDocSlot>
): PlacedCell[][] {
  const occupied = new Set<string>();
  return rows.map((row, r) => {
    let col = 0;
    const placed: PlacedCell[] = [];
    for (const cell of row.cells) {
      while (occupied.has(`${r},${col}`)) col++;
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) occupied.add(`${r + dr},${col + dc}`);
      }
      const slot = slots[cell.slotId];
      if (slot) {
        placed.push({
          cell,
          slot,
          role: classifyTableCell(cell, slot),
          rowIndex: r,
          colStart: col,
          colEnd: col + colSpan - 1,
        });
      }
      col += colSpan;
    }
    return placed;
  });
}

const cellCovering = (row: PlacedCell[] | undefined, col: number): PlacedCell | undefined =>
  row?.find((c) => c.colStart <= col && c.colEnd >= col);

/** 같은 열 위쪽에서 가장 가까운 라벨(열 머리). 사이의 입력 칸(앞 행의 값)은 건너뛴다. */
function findColumnHeader(grid: PlacedCell[][], target: PlacedCell): PlacedCell | undefined {
  for (let r = target.rowIndex - 1; r >= 0; r--) {
    const above = cellCovering(grid[r], target.colStart);
    if (above?.role === "label") return above;
  }
  return undefined;
}

/** 표 안 입력 칸의 이름: 작성자 라벨 → 왼쪽 라벨 → 열 머리 → 위치. */
export function nameTableValueCell(
  grid: PlacedCell[][],
  target: PlacedCell,
  scopeTitle: string,
  options: { preferColumnHeader?: boolean } = {}
): OutlineName {
  if (hasAuthoredLabel(target.slot)) {
    return { title: tidyName(stripScopePrefix(target.slot.label, scopeTitle)), needsReview: false };
  }
  const row = grid[target.rowIndex];
  const left = row[row.indexOf(target) - 1];
  const leftLabel = left?.role === "label" ? tidyName(plainText(left.slot.content)) : "";
  const header = findColumnHeader(grid, target);
  const headerLabel = header ? tidyName(plainText(header.slot.content)) : "";
  // 왼쪽 라벨이 행 머리(첫 열)이고 바로 위 칸이 열 머리면, 열 머리가 더 구체적이다 (`업무 FLOW | 설계의뢰` 아래 날짜 칸).
  const leftIsRowHeader = left?.role === "label" && left.colStart === 0;
  const headerDirectlyAbove = cellCovering(grid[target.rowIndex - 1], target.colStart)?.role === "label";
  const preferHeader = options.preferColumnHeader || (leftIsRowHeader && headerDirectlyAbove);
  const picked = preferHeader ? headerLabel || leftLabel : leftLabel || headerLabel;
  if (picked) return { title: picked, needsReview: false };
  return {
    title: `${target.rowIndex + 1}행 ${target.colStart + 1}열`,
    needsReview: true,
  };
}

/** 표 밖 단독 슬롯의 이름: 블록 제목 → 작성자 라벨 → 내용 첫머리(확인 필요). */
export function nameStandaloneSlot(slot: VDocSlot, blockTitle: string, scopeTitle = ""): OutlineName {
  if (blockTitle) return { title: blockTitle, needsReview: false };
  if (hasAuthoredLabel(slot)) {
    return { title: tidyName(stripScopePrefix(slot.label, scopeTitle)), needsReview: false };
  }
  const text = tidyName(plainText(slot.content)).slice(0, 40);
  return { title: text || slot.slotId, needsReview: true };
}

/** 같은 부모 아래 이름이 겹치면 `(2)`, `(3)` 을 붙인다. */
export function dedupeNames<T extends { title: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = (seen.get(item.title) ?? 0) + 1;
    seen.set(item.title, count);
    return count === 1 ? item : { ...item, title: `${item.title} (${count})` };
  });
}
