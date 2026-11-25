/**
 * @vibe/style-core/kits — Typography Kit (역할별 텍스트 조판 프리셋).
 */
import { resolveCascadedStyle } from "../core/cascade";
import type { GridAlign } from "../core/grid-contract";
import type {
  ResolvedStylePack,
  StyleListMarker,
  StyleOverrideDelta,
  TextStyleDef,
} from "../core/token-contract";

export interface ResolvedTextRole {
  fontFamily?: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  lineHeight: string;
  letterSpacing?: string;
  color: string;
  align: GridAlign;
  listMarker: StyleListMarker;
  prefix?: string;
  prefixColor?: string;
  listIndent?: string;
  hangingIndent?: string;
}

export function resolveTextRoleStyle(
  resolvedPack: ResolvedStylePack,
  role = "body",
  bindingKey?: string,
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedTextRole {
  const baseBody: TextStyleDef = resolvedPack.styles.text.body ?? {};
  const roleDef: TextStyleDef = resolvedPack.styles.text[role] ?? {};
  const cascaded = bindingKey
    ? resolveCascadedStyle(resolvedPack, bindingKey, sectionOverride, instanceOverride).text
    : { ...(sectionOverride?.text ?? {}), ...(instanceOverride?.text ?? {}) };

  return {
    fontFamily: cascaded.fontFamily ?? roleDef.fontFamily ?? baseBody.fontFamily,
    fontSize: cascaded.fontSize ?? roleDef.fontSize ?? baseBody.fontSize ?? "14px",
    fontWeight: cascaded.fontWeight ?? roleDef.fontWeight ?? baseBody.fontWeight ?? "400",
    fontStyle: cascaded.fontStyle ?? roleDef.fontStyle ?? baseBody.fontStyle ?? "normal",
    lineHeight: cascaded.lineHeight ?? roleDef.lineHeight ?? baseBody.lineHeight ?? "1.75",
    letterSpacing: cascaded.letterSpacing ?? roleDef.letterSpacing ?? baseBody.letterSpacing,
    color: cascaded.color ?? roleDef.color ?? baseBody.color ?? "#334155",
    align: cascaded.align ?? roleDef.align ?? baseBody.align ?? "left",
    listMarker: cascaded.listMarker ?? roleDef.listMarker ?? baseBody.listMarker ?? "disc",
    prefix: cascaded.prefix ?? roleDef.prefix,
    prefixColor: cascaded.prefixColor ?? roleDef.prefixColor,
    listIndent: cascaded.listIndent ?? roleDef.listIndent ?? baseBody.listIndent,
    hangingIndent: cascaded.hangingIndent ?? roleDef.hangingIndent ?? baseBody.hangingIndent,
  };
}
