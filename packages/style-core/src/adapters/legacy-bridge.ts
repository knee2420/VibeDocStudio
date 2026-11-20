/**
 * @vibe/style-core/adapters — 레거시 인라인 스타일 -> Instance Override 자동 승격 브릿지.
 * `styleRef` 나 `styleOverrides` 가 없는 예전 `.vdoc` 블록도 손실 없이 4단 Cascade 에 편입한다.
 */
import type { GridAlign } from "../core/grid-contract";
import type { StyleOverrideDelta } from "../core/token-contract";

interface LegacyStylableBlock {
  kind?: string;
  align?: GridAlign;
  gap?: number;
  cellPadding?: string;
  borderRules?: {
    outer?: string;
    headerTop?: string;
    headerBottom?: string;
    rowBottom?: string;
    vertical?: string;
    radius?: string;
  };
  headerStyle?: {
    bg?: string;
    textColor?: string;
    fontWeight?: string;
    fontSize?: string;
  };
  styleOverrides?: StyleOverrideDelta;
}

export function adaptLegacyBlockOverrides(block: LegacyStylableBlock): StyleOverrideDelta | undefined {
  const existing = block.styleOverrides;
  const legacy: StyleOverrideDelta = {};
  let hasLegacy = false;

  if (block.align) {
    if (block.kind === "text") {
      legacy.text = { align: block.align };
      hasLegacy = true;
    } else if (block.kind === "callout-box") {
      legacy.frame = { align: block.align };
      hasLegacy = true;
    }
  }

  if (block.kind === "columns-grid" && typeof block.gap === "number") {
    legacy.media = { stripGap: block.gap };
    hasLegacy = true;
  }

  if (block.kind === "structured-table" || block.kind === "table") {
    if (block.borderRules || block.headerStyle || block.cellPadding) {
      legacy.table = {
        borders: block.borderRules ? { ...block.borderRules } : undefined,
        headerFill: block.headerStyle?.bg,
        headerTextColor: block.headerStyle?.textColor,
        headerFontWeight: block.headerStyle?.fontWeight,
        headerFontSize: block.headerStyle?.fontSize,
        cellPadding: block.cellPadding,
      };
      hasLegacy = true;
    }
  }

  if (!hasLegacy) return existing;
  if (!existing) return legacy;

  return {
    text: existing.text || legacy.text ? { ...legacy.text, ...existing.text } : undefined,
    frame: existing.frame || legacy.frame ? { ...legacy.frame, ...existing.frame } : undefined,
    table:
      existing.table || legacy.table
        ? {
            ...legacy.table,
            ...existing.table,
            borders:
              legacy.table?.borders || existing.table?.borders
                ? { ...(legacy.table?.borders ?? {}), ...(existing.table?.borders ?? {}) }
                : undefined,
          }
        : undefined,
    media: existing.media || legacy.media ? { ...legacy.media, ...existing.media } : undefined,
    pageChrome:
      existing.pageChrome || legacy.pageChrome
        ? { ...legacy.pageChrome, ...existing.pageChrome }
        : undefined,
  };
}
