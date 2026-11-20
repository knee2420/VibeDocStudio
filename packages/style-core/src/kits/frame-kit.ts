/**
 * @vibe/style-core/kits — Frame Kit (1x1 · 1xN 프레임 그리드 셀: 인용구 · 정보 프레임 · 강조 바 · 고지 배지 · CTA).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridAlign } from "../core/grid-contract";
import type {
  FrameOrnamentKind,
  FrameStyleDef,
  ResolvedStylePack,
  StyleOverrideDelta,
} from "../core/token-contract";

export interface ResolvedFrameStyle {
  fill: string;
  color: string;
  titleColor: string;
  border?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  radius: string;
  padding: string;
  marginY: string;
  maxWidth?: string;
  align: GridAlign;
  ornament: FrameOrnamentKind;
  ornamentColor: string;
  kvMarker: string;
  kvTextColor: string;
  chevron: boolean;
  chevronColor: string;
  underlineColor: string;
  accentPalettes: Record<string, { fill: string; color: string; border?: string }>;
}

const DEFAULT_ACCENT_PALETTES: Record<string, { fill: string; color: string; border?: string }> = {
  pink: { fill: "#fde2e4", color: "#1e293b" },
  yellow: { fill: "#fef08a", color: "#1e293b" },
  emerald: { fill: "transparent", color: "#059669" },
  sky: { fill: "#e0f2fe", color: "#0c4a6e" },
  slate: { fill: "#f1f5f9", color: "#1e293b" },
};

export function resolveFrameStyle(
  resolvedPack: ResolvedStylePack,
  variant = "default",
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedFrameStyle {
  const bindingKey =
    variant === "cta" ? "link-card[variant=cta]" : `callout-box[variant=${variant}]`;
  const direct: FrameStyleDef = resolvedPack.styles.frame[variant] ?? {};
  const cascaded = resolveCascadedStyle(resolvedPack, bindingKey, sectionOverride, instanceOverride).frame;

  const merged: FrameStyleDef = {
    ...direct,
    ...cascaded,
    accentPalettes: {
      ...DEFAULT_ACCENT_PALETTES,
      ...(direct.accentPalettes ?? {}),
      ...(cascaded.accentPalettes ?? {}),
    },
  };

  return {
    fill: merged.fill ?? "transparent",
    color: merged.color ?? "#334155",
    titleColor: merged.titleColor ?? merged.color ?? "#047857",
    border: merged.border,
    borderTop: merged.borderTop,
    borderBottom: merged.borderBottom,
    borderLeft: merged.borderLeft,
    radius: merged.radius ?? "4px",
    padding: merged.padding ?? "12px 14px",
    marginY: merged.marginY ?? "12px",
    maxWidth: merged.maxWidth,
    align: merged.align ?? "left",
    ornament: merged.ornament ?? "none",
    ornamentColor: merged.ornamentColor ?? "#cbd5e1",
    kvMarker: merged.kvMarker ?? "▫️",
    kvTextColor: merged.kvTextColor ?? "#475569",
    chevron: merged.chevron ?? false,
    chevronColor: merged.chevronColor ?? "#f43f5e",
    underlineColor: merged.underlineColor ?? "rgba(5, 150, 105, 0.7)",
    accentPalettes: merged.accentPalettes ?? DEFAULT_ACCENT_PALETTES,
  };
}
