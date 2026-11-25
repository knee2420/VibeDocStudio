/**
 * @vibe/style-core/kits — Page Grid Kit (지면 그리드 · 여백 · 블록 간격 · 번호 계층).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridAlign, MarginBox } from "../core/grid-contract";
import type { ResolvedStylePack, StyleOverrideDelta } from "../core/token-contract";

export interface ResolvedPageGrid {
  width: number;
  surfaceKind: "paged" | "scroll";
  background: string;
  margins: MarginBox;
  blockGap: number;
  showHeaderFooter: boolean;
  outerBoxBorder?: string;
  listMarkers: string[];
  footerTemplate?: string;
  footerAlign?: GridAlign;
}

export function formatPageFooterTemplate(
  template: string | undefined,
  pageNumber: number,
  totalPages?: number
): string {
  if (!template) return "";
  return template
    .replace(/\{page\}/g, String(pageNumber))
    .replace(/\{total\}/g, totalPages !== undefined ? String(totalPages) : String(pageNumber));
}

export function resolvePageGridStyle(
  resolvedPack: ResolvedStylePack,
  viewKey = "default",
  sectionOverride?: StyleOverrideDelta
): ResolvedPageGrid {
  const direct =
    resolvedPack.styles.pageChrome[viewKey] ??
    resolvedPack.styles.pageChrome.default ??
    Object.values(resolvedPack.styles.pageChrome)[0] ??
    {};
  const cascaded = resolveCascadedStyle(resolvedPack, `page[${viewKey}]`, sectionOverride);
  const merged = { ...direct, ...cascaded.pageChrome };

  return {
    width: merged.width ?? 720,
    surfaceKind: merged.surfaceKind ?? "scroll",
    background: merged.background ?? "#ffffff",
    margins: merged.margins ?? { top: 20, right: 32, bottom: 20, left: 32 },
    blockGap: merged.blockGap ?? 10,
    showHeaderFooter: merged.showHeaderFooter ?? false,
    outerBoxBorder: merged.outerBoxBorder,
    listMarkers: merged.listMarkers ?? ["1.", "-", "•"],
    footerTemplate: merged.footerTemplate,
    footerAlign: merged.footerAlign,
  };
}
