import {
  BUILTIN_STYLE_PACKS,
  flattenPrimitives,
  getBuiltinStylePack,
  isValidStylePack,
  resolveAliasValue,
  resolveDefaultStylePack,
  type StyleBindingDef,
  type StylePack,
  type VDocStyleRef,
} from "@vibe/style-core";
import {
  resolveDocumentView,
  type CalloutAccentColor,
  type CalloutBoxBlockDef,
  type CalloutBoxVariant,
  type ColumnsGridBlockDef,
  type LayoutBlock,
  type ListMarkerStyle,
  type StructuredTableBlockDef,
  type TextBlockDef,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import type { VaultPort } from "@vibe/vault-core";

import { fromVaultUri, toVaultUri } from "./vdocCodec";

export interface VaultStyleCatalogEntry {
  readonly id: string;
  readonly pack: StylePack;
  readonly vaultPath?: string;
  readonly source: "vault" | "builtin";
}

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

/**
 * Discovers all `.vstyle` / `.vstyle.json` packs in the vault plus built-in style packs.
 * Vault packs override built-in packs with the same `id` so live edits take precedence.
 */
export function collectVaultStyleEntries(vault: VaultPort): VaultStyleCatalogEntry[] {
  const byId = new Map<string, VaultStyleCatalogEntry>();
  for (const builtin of BUILTIN_STYLE_PACKS) {
    byId.set(builtin.id, {
      id: builtin.id,
      pack: builtin,
      source: "builtin",
    });
  }
  for (const node of vault.listAll()) {
    if (
      node.kind !== "file" ||
      (!node.path.endsWith(".vstyle") && !node.path.endsWith(".vstyle.json"))
    ) {
      continue;
    }
    try {
      const parsed = JSON.parse(vault.read(node.path)) as unknown;
      if (isValidStylePack(parsed)) {
        byId.set(parsed.id, {
          id: parsed.id,
          pack: parsed,
          vaultPath: node.path,
          source: "vault",
        });
      }
    } catch {
      // Ignore malformed style files safely
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.source !== b.source) return a.source === "vault" ? -1 : 1;
    return a.pack.name.localeCompare(b.pack.name, "ko");
  });
}

/** Resolves the active StylePack entry bound to a `.vdoc` document. */
export function resolveActiveStyleEntry(
  doc: VDocDocument,
  vault: VaultPort,
  catalog: readonly VaultStyleCatalogEntry[]
): VaultStyleCatalogEntry | null {
  if (doc.styleRef?.packPath) {
    const targetPath = fromVaultUri(doc.styleRef.packPath);
    if (targetPath && vault.exists(targetPath)) {
      const inCatalog = catalog.find((c) => c.vaultPath === targetPath);
      if (inCatalog) return inCatalog;
      try {
        const parsed = JSON.parse(vault.read(targetPath)) as unknown;
        if (isValidStylePack(parsed)) {
          return { id: parsed.id, pack: parsed, vaultPath: targetPath, source: "vault" };
        }
      } catch {
        // Fall through
      }
    }
  }

  if (doc.styleRef?.packId) {
    const byId = catalog.find((c) => c.id === doc.styleRef?.packId);
    if (byId) return byId;
    const builtin = getBuiltinStylePack(doc.styleRef.packId);
    if (builtin) return { id: builtin.id, pack: builtin, source: "builtin" };
  }

  const view = resolveDocumentView(doc);
  if (view.id === "blog" || view.id === "web") {
    const defPack = resolveDefaultStylePack(view.id);
    return (
      catalog.find((c) => c.id === defPack.id) ?? {
        id: defPack.id,
        pack: defPack,
        source: "builtin",
      }
    );
  }
  return null;
}

/** Builds a clean `VDocStyleRef` pointer when switching packs in the Inspector. */
export function buildStyleRefForEntry(
  entry: VaultStyleCatalogEntry,
  mode?: string
): VDocStyleRef {
  const modeKeys = Object.keys(entry.pack.modes ?? {});
  const resolvedMode =
    mode && modeKeys.includes(mode) ? mode : modeKeys[0] ?? "default";
  return {
    packId: entry.pack.id,
    ...(entry.vaultPath ? { packPath: toVaultUri(entry.vaultPath) } : {}),
    mode: resolvedMode,
    version: entry.pack.version,
  };
}

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
