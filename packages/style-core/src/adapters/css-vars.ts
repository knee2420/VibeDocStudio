/**
 * @vibe/style-core/adapters — DOM CSS Custom Properties (`--vstyle-*`) 변환 어댑터.
 */
import type { ResolvedStylePack } from "../core/token-contract";
import { resolveMediaGridStyle } from "../kits/media-grid-kit";
import { resolvePageGridStyle } from "../kits/page-grid-kit";
import { resolveTableGridStyle } from "../kits/table-grid-kit";
import { resolveTextRoleStyle } from "../kits/typography-kit";

export type CssVarMap = Record<string, string>;

/**
 * 해석 완료된 `ResolvedStylePack` 을 DOM 컨테이너에 바로 주입할 수 있는
 * `--vstyle-*` CSS 변수 맵으로 변환한다.
 */
export function buildStyleCssVars(resolvedPack: ResolvedStylePack): CssVarMap {
  const page = resolvePageGridStyle(resolvedPack);
  const body = resolveTextRoleStyle(resolvedPack, "body");
  const table = resolveTableGridStyle(resolvedPack);
  const media = resolveMediaGridStyle(resolvedPack);

  const vars: CssVarMap = {
    "--vstyle-pack-id": resolvedPack.packId,
    "--vstyle-page-width": `${page.width}px`,
    "--vstyle-page-bg": page.background,
    "--vstyle-block-gap": `${page.blockGap}px`,
    "--vstyle-body-size": body.fontSize,
    "--vstyle-body-lh": body.lineHeight,
    "--vstyle-body-color": body.color,
    "--vstyle-body-align": body.align,
    "--vstyle-list-marker": body.listMarker,
    "--vstyle-table-outer": table.borders.outer,
    "--vstyle-table-header-bg": table.headerFill,
    "--vstyle-table-header-color": table.headerTextColor,
    "--vstyle-media-gap": `${media.stripGap}px`,
    "--vstyle-media-radius": media.radius,
  };

  if (body.fontFamily) {
    vars["--vstyle-font-family"] = body.fontFamily;
  }

  for (const [k, v] of Object.entries(resolvedPack.tokens)) {
    const cssKey = `--vstyle-token-${k.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    vars[cssKey] = String(v);
  }

  return vars;
}
