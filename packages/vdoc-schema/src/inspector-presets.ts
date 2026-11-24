/**
 * 인스펙터 편집 프리셋 · 블록 변환 (순수 함수) — 표 · 그리드 · 안내 상자 · 목록 기호 · 쪽 순서 · 스타일 바인딩 해석.
 * 볼트를 모른다. 볼트 스타일 목록은 `@vibe/vault-formats` 의 styleCatalog.
 */
import {
  flattenPrimitives,
  resolveAliasValue,
  type StyleBindingDef,
  type StylePack,
} from "@vibe/style-core";
import type { LayoutBlock } from "./blocks";
import type { CalloutAccentColor, CalloutBoxBlockDef, CalloutBoxVariant } from "./blocks/callout-block";
import type { ColumnsGridBlockDef } from "./blocks/grid-block";
import type { StructuredTableBlockDef } from "./blocks/table-block";
import type { ListMarkerStyle, TextBlockDef } from "./blocks/text-block";
import type { VDocDocument } from "./types";
import type { BlockPropSpec } from "./block-kit/contract";
import { getBlockKind } from "./block-kit/registry";
import { findBlock, mapBlock, patchBlockProps, removeBlock } from "./document-ops";

export interface ResolvedAccentPaletteChip {
  readonly key: CalloutAccentColor;
  readonly label: string;
  readonly fill: string;
  readonly color: string;
}

export interface ResolvedBlockStyleBinding {
  readonly selector: string;
  readonly binding: StyleBindingDef;
}

export const SECTION_ROLE_PRESETS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "hero", label: "도입 (hero)" },
  { id: "tip", label: "팁 (tip)" },
  { id: "spot", label: "스팟 (spot)" },
  { id: "body", label: "본문 (body)" },
  { id: "cta", label: "행동유도 (cta)" },
  { id: "summary", label: "마무리 (summary)" },
];

export const CALLOUT_VARIANT_OPTIONS: readonly {
  readonly id: CalloutBoxVariant;
  readonly label: string;
  readonly dslHint: string;
}[] = [
  { id: "quote", label: "인용구", dslHint: ">" },
  { id: "info-frame", label: "정보 카드", dslHint: "> + ::" },
  { id: "accent-bar", label: "강조 바", dslHint: "!" },
  { id: "disclosure", label: "고지 배지", dslHint: "[embed]" },
  { id: "default", label: "기본 상자", dslHint: "box" },
];

const ACCENT_COLOR_LABELS: Record<CalloutAccentColor, string> = {
  pink: "핑크",
  yellow: "노랑",
  emerald: "에메랄드",
  sky: "스카이",
  slate: "슬레이트",
};

const DEFAULT_ACCENT_PALETTES: Record<CalloutAccentColor, { fill: string; color: string }> = {
  pink: { fill: "#fde2e4", color: "#1e293b" },
  yellow: { fill: "#fef08a", color: "#1e293b" },
  emerald: { fill: "#d1fae5", color: "#047857" },
  sky: { fill: "#e0f2fe", color: "#0c4a6e" },
  slate: { fill: "#f1f5f9", color: "#1e293b" },
};

export const GRID_RATIO_PRESETS_2COL: readonly {
  readonly label: string;
  readonly widths: readonly string[];
}[] = [
  { label: "1 : 1", widths: ["1fr", "1fr"] },
  { label: "2 : 1", widths: ["2fr", "1fr"] },
  { label: "1 : 2", widths: ["1fr", "2fr"] },
  { label: "3 : 2", widths: ["3fr", "2fr"] },
];

export const GRID_RATIO_PRESETS_3COL: readonly {
  readonly label: string;
  readonly widths: readonly string[];
}[] = [
  { label: "1 : 1 : 1", widths: ["1fr", "1fr", "1fr"] },
  { label: "2 : 1 : 1", widths: ["2fr", "1fr", "1fr"] },
  { label: "1 : 2 : 1", widths: ["1fr", "2fr", "1fr"] },
];

export const LIST_MARKER_OPTIONS: readonly {
  readonly id: ListMarkerStyle | undefined;
  readonly label: string;
  readonly glyph: string;
}[] = [
  { id: undefined, label: "스킨 기본", glyph: "Auto" },
  { id: "disc", label: "채운 원", glyph: "•" },
  { id: "circle", label: "빈 원", glyph: "◦" },
  { id: "square", label: "사각", glyph: "▪" },
  { id: "dash", label: "대시", glyph: "-" },
  { id: "decimal", label: "번호", glyph: "1." },
];

export type TableVisualPresetId = "official-form" | "official-clean" | "grid" | "minimal";

export const TABLE_VISUAL_PRESET_OPTIONS: readonly {
  readonly id: TableVisualPresetId;
  readonly label: string;
}[] = [
  { id: "official-form", label: "공식 서식" },
  { id: "official-clean", label: "무음영 서식" },
  { id: "grid", label: "표준 격자" },
  { id: "minimal", label: "세로선 없음" },
];

export const TABLE_COLUMN_RATIO_PRESETS_2COL: readonly {
  readonly label: string;
  readonly ratios: readonly [number, number];
}[] = [
  { label: "18 : 82", ratios: [18, 82] },
  { label: "25 : 75", ratios: [25, 75] },
  { label: "30 : 70", ratios: [30, 70] },
  { label: "50 : 50", ratios: [50, 50] },
];

/** Extracts semantic accent palette chips from the active `.vstyle` (no raw HEX authoring). */
export function resolveAccentPaletteChips(
  pack: StylePack | null,
  mode = "default"
): ResolvedAccentPaletteChip[] {
  const keys: readonly CalloutAccentColor[] = ["pink", "yellow", "emerald", "sky", "slate"];
  const palettes = pack?.styles?.frame?.["accent-bar"]?.accentPalettes;
  const semantic = pack?.modes?.[mode] ?? pack?.modes?.default ?? {};
  const primitives = pack ? flattenPrimitives(pack.primitives) : {};

  return keys.map((key) => {
    const raw = palettes?.[key];
    if (raw) {
      const fill = String(resolveAliasValue(raw.fill, semantic, primitives));
      const color = String(resolveAliasValue(raw.color, semantic, primitives));
      return {
        key,
        label: ACCENT_COLOR_LABELS[key],
        fill: fill === "transparent" ? color : fill,
        color,
      };
    }
    return {
      key,
      label: ACCENT_COLOR_LABELS[key],
      ...DEFAULT_ACCENT_PALETTES[key],
    };
  });
}

/** Matches which binding selector in `.vstyle` governs the currently selected block. */
export function resolveBlockStyleBinding(
  block: LayoutBlock,
  pack: StylePack | null
): ResolvedBlockStyleBinding | null {
  if (!pack?.bindings) return null;
  const candidates: string[] = [];

  if (block.kind === "callout-box" && block.variant) {
    candidates.push(`callout-box[variant=${block.variant}]`);
  } else if (block.kind === "link-card" && block.variant) {
    candidates.push(`link-card[variant=${block.variant}]`);
  } else if (block.kind === "columns-grid" && block.cardStyle) {
    candidates.push(`columns-grid[cardStyle=${block.cardStyle}]`);
  }
  candidates.push(block.kind);

  for (const selector of candidates) {
    const binding = pack.bindings[selector];
    if (binding) {
      return { selector, binding };
    }
  }
  return null;
}

/** Moves a page/section up (`-1`) or down (`1`) and renumbers `pageNumber` 1..N. */
export function reorderPageByOffset(
  doc: VDocDocument,
  pageId: string,
  delta: -1 | 1
): VDocDocument {
  const idx = doc.pages.findIndex((p) => p.pageId === pageId);
  if (idx < 0) return doc;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= doc.pages.length) return doc;

  const nextPages = [...doc.pages];
  const [moved] = nextPages.splice(idx, 1);
  nextPages.splice(targetIdx, 0, moved);
  const renumbered = nextPages.map((p, i) =>
    p.pageNumber === i + 1 ? p : { ...p, pageNumber: i + 1 }
  );
  return {
    ...doc,
    pages: renumbered,
    updatedAt: new Date().toISOString(),
  };
}

/** Promotes a `text` block to a semantic `callout-box` while preserving its `slotId` and content. */
export function convertTextToCallout(
  block: TextBlockDef,
  variant: CalloutBoxVariant
): CalloutBoxBlockDef {
  return {
    blockId: block.blockId,
    kind: "callout-box",
    title: block.title,
    slotId: block.slotId,
    variant,
    ...(variant === "accent-bar" ? { accentColor: "pink" as const } : {}),
    ...(variant === "info-frame"
      ? { align: "left" as const, kvItems: [{ key: "항목", value: "내용" }] }
      : { align: block.align }),
    ...(block.locked ? { locked: true } : {}),
  };
}

/** Converts a `callout-box` back into a plain `text` block while preserving its `slotId` and content. */
export function convertCalloutToText(block: CalloutBoxBlockDef): TextBlockDef {
  return {
    blockId: block.blockId,
    kind: "text",
    title: block.title,
    slotId: block.slotId,
    ...(block.align ? { align: block.align } : {}),
    ...(block.locked ? { locked: true } : {}),
  };
}

/** Applies a ratio preset (e.g. `["2fr", "1fr"]`) to a `columns-grid` block. */
export function applyGridRatioPreset(
  block: ColumnsGridBlockDef,
  widths: readonly string[]
): ColumnsGridBlockDef {
  return {
    ...block,
    widths: [...widths],
  };
}

/** Swaps two columns in a 2-column `columns-grid` block (both `columns` and `slotIds`). */
export function swapTwoGridColumns(block: ColumnsGridBlockDef): ColumnsGridBlockDef {
  const nextColumns =
    block.columns && block.columns.length === 2
      ? [block.columns[1], block.columns[0]]
      : block.columns;
  const nextSlotIds =
    block.slotIds && block.slotIds.length === 2
      ? [block.slotIds[1], block.slotIds[0]]
      : block.slotIds;
  const nextWidths =
    block.widths.length === 2 ? [block.widths[1], block.widths[0]] : block.widths;
  return {
    ...block,
    widths: nextWidths,
    ...(nextColumns ? { columns: nextColumns } : {}),
    ...(nextSlotIds ? { slotIds: nextSlotIds } : {}),
  };
}

/** Applies a visual preset (borders, header shading, top/bottom form rules) to a `structured-table`. */
export function applyTableVisualPreset(
  block: StructuredTableBlockDef,
  presetId: TableVisualPresetId
): StructuredTableBlockDef {
  const rowCount = block.rows.length;

  if (presetId === "official-form" || presetId === "official-clean") {
    const isClean = presetId === "official-clean";
    const headerBg = isClean ? "#ffffff" : "#d9dde3";
    const nextRows = block.rows.map((row, rIdx) => ({
      ...row,
      cells: row.cells.map((cell, cIdx) => {
        const nextIsHeader = isClean ? false : cell.isHeader;
        return {
          ...cell,
          isHeader: nextIsHeader,
          hAlign:
            nextIsHeader || (cIdx === 0 && !cell.blocks?.length) ? ("center" as const) : cell.hAlign,
          backgroundColor: nextIsHeader ? headerBg : undefined,
          color: nextIsHeader ? "#0f172a" : undefined,
          borderTop: rIdx === 0 ? "1.5px solid #0f172a" : undefined,
          borderBottom: rIdx === rowCount - 1 ? "1.5px solid #0f172a" : undefined,
        };
      }),
    }));
    return {
      ...block,
      borderRules: {
        outer: "none",
        headerTop: "1.5px solid #0f172a",
        headerBottom: "1px solid #475569",
        rowBottom: "1px solid #64748b",
        vertical: "1px solid #94a3b8",
        radius: "0px",
      },
      headerStyle: {
        ...block.headerStyle,
        bg: headerBg,
        textColor: "#0f172a",
        fontWeight: "600",
        padding: block.headerStyle?.padding ?? "8px 10px",
      },
      rows: nextRows,
    };
  }

  if (presetId === "minimal") {
    const nextRows = block.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        backgroundColor: cell.isHeader ? "#f8fafc" : undefined,
        color: cell.isHeader ? "#0f172a" : undefined,
        borderTop: undefined,
        borderBottom: undefined,
      })),
    }));
    return {
      ...block,
      borderRules: {
        outer: "none",
        headerTop: "2px solid #0f172a",
        headerBottom: "1px solid #94a3b8",
        rowBottom: "1px solid #e2e8f0",
        vertical: "none",
        radius: "0px",
      },
      headerStyle: {
        ...block.headerStyle,
        bg: "#f8fafc",
        textColor: "#0f172a",
        fontWeight: "600",
        padding: block.headerStyle?.padding ?? "8px 10px",
      },
      rows: nextRows,
    };
  }

  // Default: `grid`
  const nextRows = block.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      backgroundColor: cell.isHeader ? "#e6ecf5" : undefined,
      color: cell.isHeader ? "#0f172a" : undefined,
      borderTop: undefined,
      borderBottom: undefined,
    })),
  }));
  return {
    ...block,
    borderRules: {
      outer: "1px solid #94a3b8",
      headerTop: "1px solid #94a3b8",
      headerBottom: "1px solid #94a3b8",
      rowBottom: "1px solid #cbd5e1",
      vertical: "1px solid #cbd5e1",
      radius: "0px",
    },
    headerStyle: {
      ...block.headerStyle,
      bg: "#e6ecf5",
      textColor: "#0f172a",
      fontWeight: "600",
      padding: block.headerStyle?.padding ?? "8px 10px",
    },
    rows: nextRows,
  };
}

/** Applies normalized percentage column widths (e.g. `[18, 82]` -> `["18%", "82%"]`) to a table. */
export function applyTableColumnRatio(
  block: StructuredTableBlockDef,
  ratios: readonly number[]
): StructuredTableBlockDef {
  const valid = ratios.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return block;
  const sum = valid.reduce((a, b) => a + b, 0);
  const widths = valid.map((r) => `${Math.round((r / sum) * 1000) / 10}%`);
  return {
    ...block,
    columnWidths: widths,
  };
}

/** Toggles whether row 0 of a `structured-table` is marked as a semantic header row. */
export function toggleTableTopRowHeader(
  block: StructuredTableBlockDef
): StructuredTableBlockDef {
  if (block.rows.length === 0) return block;
  const firstRow = block.rows[0];
  const currentlyHeader = firstRow.cells.length > 0 && firstRow.cells.every((c) => Boolean(c.isHeader));
  const nextHeader = !currentlyHeader;
  const headerBg = block.headerStyle?.bg && block.headerStyle.bg !== "#ffffff"
    ? block.headerStyle.bg
    : "#d9dde3";
  const headerText = block.headerStyle?.textColor ?? "#0f172a";

  return {
    ...block,
    rows: block.rows.map((row, rIdx) =>
      rIdx !== 0
        ? row
        : {
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              isHeader: nextHeader,
              backgroundColor: nextHeader ? headerBg : undefined,
              color: nextHeader ? headerText : undefined,
            })),
          }
    ),
  };
}

function updateNestedListMarkers(
  blocks: readonly LayoutBlock[],
  marker: ListMarkerStyle | undefined
): LayoutBlock[] {
  return blocks.map((b) => {
    if (b.kind === "text") {
      if (marker === undefined) {
        const { listMarker: _drop, ...rest } = b;
        void _drop;
        return rest;
      }
      return { ...b, listMarker: marker };
    }
    if (b.kind === "structured-table") {
      return applyTableNestedListMarker(b, marker);
    }
    if (b.kind === "columns-grid" && b.columns) {
      return {
        ...b,
        columns: b.columns.map((col) =>
          col.blocks ? { ...col, blocks: updateNestedListMarkers(col.blocks, marker) } : col
        ),
      };
    }
    return b;
  });
}

/** Updates `listMarker` on all nested `text` blocks inside a table's container cells (`cell.blocks`). */
export function applyTableNestedListMarker(
  block: StructuredTableBlockDef,
  marker: ListMarkerStyle | undefined
): StructuredTableBlockDef {
  return {
    ...block,
    rows: block.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) =>
        cell.blocks && cell.blocks.length > 0
          ? { ...cell, blocks: updateNestedListMarkers(cell.blocks, marker) }
          : cell
      ),
    })),
  };
}

/** Detects whether a table contains nested `text` blocks inside `cell.blocks` and their common `listMarker`. */
export function detectTableNestedListMarker(block: StructuredTableBlockDef): {
  readonly hasNestedText: boolean;
  readonly marker: ListMarkerStyle | undefined;
} {
  const markers = new Set<ListMarkerStyle | undefined>();
  let count = 0;

  const visit = (blocks: readonly LayoutBlock[]) => {
    for (const b of blocks) {
      if (b.kind === "text") {
        count += 1;
        markers.add(b.listMarker);
      } else if (b.kind === "structured-table") {
        for (const r of b.rows) {
          for (const c of r.cells) {
            if (c.blocks) visit(c.blocks);
          }
        }
      } else if (b.kind === "columns-grid" && b.columns) {
        for (const col of b.columns) {
          if (col.blocks) visit(col.blocks);
        }
      }
    }
  };

  for (const row of block.rows) {
    for (const cell of row.cells) {
      if (cell.blocks) visit(cell.blocks);
    }
  }

  return {
    hasNestedText: count > 0,
    marker: markers.size === 1 ? Array.from(markers)[0] : undefined,
  };
}

// --- 다중 선택 편집 (블록 종류 레지스트리 `ai.editableProps` 기준) ---------------------------------------

/** 여러 블록이 다른 값을 가질 때. */
export const MIXED_VALUE: unique symbol = Symbol("mixed");

export interface CommonBlockProp {
  readonly key: string;
  readonly spec: BlockPropSpec;
  /** 모두 같으면 그 값, 다르면 `MIXED_VALUE`, 아무도 값이 없으면 undefined. */
  readonly value: string | number | boolean | typeof MIXED_VALUE | undefined;
}

/**
 * 고른 블록들이 함께 바꿀 수 있는 속성 — 모든 블록의 종류가 같은 이름 · 같은 타입으로 허용하는 것만.
 * 사람 인스펙터와 AI `blocks.proposeProps` 가 같은 레지스트리를 쓴다.
 */
export function commonEditableProps(blocks: readonly LayoutBlock[]): CommonBlockProp[] {
  if (!blocks.length) return [];
  const specsOf = (b: LayoutBlock) => getBlockKind(b.kind).ai?.editableProps ?? {};
  const first = specsOf(blocks[0]);
  const out: CommonBlockProp[] = [];
  for (const [key, spec] of Object.entries(first)) {
    const shared = blocks.every((b) => {
      const s = specsOf(b)[key];
      return s && s.type === spec.type && (!spec.enum || (s.enum && s.enum.join("|") === spec.enum.join("|")));
    });
    if (!shared) continue;
    const values = blocks.map((b) => (b as unknown as Record<string, unknown>)[key]);
    const defined = values.filter((v) => v !== undefined);
    const value = !defined.length
      ? undefined
      : defined.length === values.length && defined.every((v) => v === defined[0])
        ? (defined[0] as string | number | boolean)
        : MIXED_VALUE;
    out.push({ key, spec, value });
  }
  return out;
}

/** 블록 여러 개에 같은 속성을 적용 (각 블록 종류가 허용하는 것만, 잠긴 블록은 건너뛴다). */
export function patchBlocksProps(doc: VDocDocument, blockIds: readonly string[], props: Record<string, unknown>): VDocDocument {
  let next = doc;
  for (const id of blockIds) {
    const loc = findBlock(next, id);
    if (!loc || loc.block.locked) continue;
    next = patchBlockProps(next, id, props);
  }
  return next;
}

/** 블록 여러 개 지우기 (잠긴 블록은 남긴다). 지운 개수도 돌려준다. */
export function removeBlocks(doc: VDocDocument, blockIds: readonly string[]): { doc: VDocDocument; removed: number } {
  let next = doc;
  let removed = 0;
  for (const id of blockIds) {
    const loc = findBlock(next, id);
    if (!loc || loc.block.locked) continue;
    next = removeBlock(next, loc.pageId, id);
    removed += 1;
  }
  return { doc: next, removed };
}

/** 블록 여러 개 잠금을 한 값으로 맞춘다 (하나라도 풀려 있으면 모두 잠그고, 모두 잠겨 있으면 모두 푼다). */
export function toggleBlocksLock(doc: VDocDocument, blockIds: readonly string[]): VDocDocument {
  const locs = blockIds.map((id) => findBlock(doc, id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const lock = locs.some((l) => !l.block.locked);
  let next = doc;
  for (const l of locs) {
    if (Boolean(l.block.locked) === lock) continue;
    next = mapBlock(next, l.pageId, l.block.blockId, (b) => ({ ...b, locked: lock }) as LayoutBlock);
  }
  return next;
}
