/**
 * @vibe/style-core/kits — Media Grid Kit (1+2 사진 콜라주 · 다단 사진 스트립 · 캡션 정렬).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridAlign, GridAspectPolicy } from "../core/grid-contract";
import type { MediaStyleDef, ResolvedStylePack, StyleOverrideDelta } from "../core/token-contract";

export interface ResolvedMediaGrid {
  stripGap: number;
  stripRowHeight: string;
  maxHeight: string;
  aspectPolicy: GridAspectPolicy;
  radius: string;
  captionAlign: GridAlign;
  captionColor: string;
  captionFontSize: string;
  imagePaddingY: string;
}

export function resolveMediaGridStyle(
  resolvedPack: ResolvedStylePack,
  styleKey = "strip",
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedMediaGrid {
  const direct: MediaStyleDef =
    resolvedPack.styles.media[styleKey] ??
    resolvedPack.styles.media.strip ??
    resolvedPack.styles.media.default ??
    {};
  const cascaded = resolveCascadedStyle(
    resolvedPack,
    "columns-grid[cardStyle=plain]",
    sectionOverride,
    instanceOverride
  ).media;

  return {
    stripGap: cascaded.stripGap ?? direct.stripGap ?? 4,
    stripRowHeight: cascaded.stripRowHeight ?? direct.stripRowHeight ?? "300px",
    maxHeight: cascaded.maxHeight ?? direct.maxHeight ?? "360px",
    aspectPolicy: cascaded.aspectPolicy ?? direct.aspectPolicy ?? "weighted-fill",
    radius: cascaded.radius ?? direct.radius ?? "0px",
    captionAlign: cascaded.captionAlign ?? direct.captionAlign ?? "center",
    captionColor: cascaded.captionColor ?? direct.captionColor ?? "#94a3b8",
    captionFontSize: cascaded.captionFontSize ?? direct.captionFontSize ?? "12px",
    imagePaddingY: cascaded.imagePaddingY ?? direct.imagePaddingY ?? "2px",
  };
}
