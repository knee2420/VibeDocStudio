/**
 * 라이브 `.vstyle` 스타일 조회 · 변형 등록 · 블록/문서 바인딩 도구 (`@vibe/ai-vault`).
 *
 * 설계 원칙 (과적합 금지):
 * - 특정 양식/매체 전용 enum 을 하드코딩하지 않고, 볼트의 활성 `.vstyle` 에 실제로 정의된
 *   primitives · modes · styles(variants/cells) · target · extensions 를 그대로 읽고 갱신한다.
 * - 문서 블록에는 인라인 hex 를 굽지 않고 `styleKey` + 셀 `cellRole` 포인터를 바인딩해
 *   `.vstyle` 변경 시 라이브로 반영되도록 한다.
 */
import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import {
  STANDARD_BASE_STYLE_PACK,
  VSTYLE_PROTOCOL,
  isValidStylePack,
  resolveStylePack,
  resolveTableGridStyle,
  type CellStyleDef,
  type ResolvedStylePack,
  type StyleCompositeCatalog,
  type StylePack,
  type StyleTokenValue,
  type TableStyleDef,
} from "@vibe/style-core";
import {
  buildStyleRefForEntry,
  collectVaultStyleEntries,
  companionStylePathForVDoc,
  parseStylePackJson,
  resolveActiveStyleEntry,
  serializeStylePack,
  type VaultStyleCatalogEntry,
} from "@vibe/vault-formats";
import type { LayoutBlock, StagedStyleChange, StructuredTableBlockDef, TableCellSlotDef, VDocDocument } from "@vibe/vdoc-schema";

import { readVDoc, requireDoc, type V2AiEnv } from "./contexts";
import type { V2StagedChange } from "./store";

export const VAULT_STYLES_DIR = ".vibedoc/styles";

export type StyleCategory = keyof StyleCompositeCatalog;

const STYLE_CATEGORIES: readonly StyleCategory[] = ["text", "frame", "table", "media", "pageChrome"];

/** 엔진이 지원하는 도메인 중립 직교 원시 스타일 속성 요약 (특정 양식/매체 enum 없음). */
export const ORTHOGONAL_STYLE_PRIMITIVES = {
  table: {
    borders: [
      "outer",
      "outerTop",
      "outerRight",
      "outerBottom",
      "outerLeft",
      "headerTop",
      "headerBottom",
      "rowBottom",
      "vertical",
      "radius",
    ],
    props: ["headerFill", "headerTextColor", "headerFontWeight", "headerFontSize", "zebraFill", "cellPadding", "radius", "autoFormHeader", "columnWidths"],
    cells: {
      keyType: "열린 문자열 역할 키 (예: column-header, label, group-label, sub-label, value, body, value.seq, value.code 등 자유 정의)",
      props: [
        "fill",
        "color",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "align",
        "vAlign",
        "padding",
        "whiteSpace",
        "fontVariantNumeric",
        "borderTop",
        "borderRight",
        "borderBottom",
        "borderLeft",
        "listIndent",
        "hangingIndent",
      ],
    },
  },
  text: [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "color",
    "align",
    "listMarker",
    "prefix",
    "prefixColor",
    "listIndent",
    "hangingIndent",
  ],
  frame: [
    "fill",
    "color",
    "titleColor",
    "border",
    "borderTop",
    "borderBottom",
    "borderLeft",
    "radius",
    "padding",
    "marginY",
    "maxWidth",
    "align",
    "ornament",
    "ornamentColor",
    "kvMarker",
    "kvTextColor",
    "chevron",
    "chevronColor",
    "underlineColor",
  ],
  media: [
    "stripGap",
    "stripRowHeight",
    "maxHeight",
    "aspectPolicy",
    "radius",
    "captionAlign",
    "captionColor",
    "captionFontSize",
    "imagePaddingY",
  ],
  pageChrome: [
    "width",
    "surfaceKind",
    "background",
    "margins",
    "blockGap",
    "showHeaderFooter",
    "listMarkers",
    "outerBoxBorder",
    "footerTemplate",
    "footerAlign",
  ],
} as const;

export interface StyleInheritedBaseline {
  readonly bodyFontSize: string | null;
  readonly bodyLineHeight: string | null;
  readonly bodyFontFamily: string | null;
  readonly defaultCellPadding: string | null;
  readonly defaultFramePadding: string | null;
  readonly defaultFrameMarginY: string | null;
  readonly pageMargins: { top?: number; right?: number; bottom?: number; left?: number } | null;
  readonly pageBlockGap: number | null;
  readonly mediaStripGap: number | null;
  readonly note: string;
}

export interface StyleDiagnostic {
  readonly code: string;
  readonly axis: "surface" | "typography" | "spacing" | "proportion";
  readonly severity: "warn" | "info";
  readonly message: string;
}

export interface StyleAxisCoverage {
  readonly surface: boolean;
  readonly typography: boolean;
  readonly spacing: boolean;
  readonly proportion: boolean;
}

function isDefinedValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(isDefinedValue);
  return true;
}

function hasAnyKey(obj: Record<string, unknown> | undefined, keys: readonly string[]): boolean {
  if (!obj) return false;
  return keys.some((k) => isDefinedValue(obj[k]));
}

export function buildInheritedBaseline(resolved: ResolvedStylePack | null): StyleInheritedBaseline {
  const body = resolved?.styles.text?.body ?? Object.values(resolved?.styles.text ?? {})[0];
  const defaultTable = resolved?.styles.table?.default ?? Object.values(resolved?.styles.table ?? {})[0];
  const defaultFrame = resolved?.styles.frame?.default ?? Object.values(resolved?.styles.frame ?? {})[0];
  const defaultPage = resolved?.styles.pageChrome?.a4 ?? Object.values(resolved?.styles.pageChrome ?? {})[0];
  const defaultMedia = resolved?.styles.media?.strip ?? Object.values(resolved?.styles.media ?? {})[0];

  return {
    bodyFontSize: body?.fontSize ?? null,
    bodyLineHeight: body?.lineHeight ?? null,
    bodyFontFamily: body?.fontFamily ?? null,
    defaultCellPadding: defaultTable?.cellPadding ?? null,
    defaultFramePadding: defaultFrame?.padding ?? null,
    defaultFrameMarginY: defaultFrame?.marginY ?? null,
    pageMargins: defaultPage?.margins ? { ...defaultPage.margins } : null,
    pageBlockGap: defaultPage?.blockGap ?? null,
    mediaStripGap: defaultMedia?.stripGap ?? null,
    note: "변형이나 역할에서 fontSize·lineHeight·padding·margin·gap 을 생략하면 위 문서 기본값이 그대로 상속됩니다. 견본의 밀도·비례가 문서 기본값과 다르면 생략하지 말고 4축(면·선 / 타이포·행간 / 공간·밀도 / 비례·위계)을 명시하세요.",
  };
}

export function diagnoseStyleVariant(
  category: StyleCategory,
  variant: Record<string, unknown> | undefined,
  baseline: StyleInheritedBaseline
): {
  readonly axisCoverage: StyleAxisCoverage;
  readonly items: StyleDiagnostic[];
  readonly hasWarnings: boolean;
} {
  const v = variant ?? {};
  const items: StyleDiagnostic[] = [];

  if (category === "text") {
    const surface = hasAnyKey(v, ["color", "prefix", "prefixColor", "listMarker"]);
    const typography = hasAnyKey(v, ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing"]);
    const spacing = hasAnyKey(v, ["lineHeight", "letterSpacing", "listIndent", "hangingIndent"]);
    const proportion = hasAnyKey(v, ["align"]);

    if (!isDefinedValue(v.lineHeight) && (isDefinedValue(v.fontSize) || surface || typography)) {
      items.push({
        code: "inherited-line-height",
        axis: "typography",
        severity: "warn",
        message: `lineHeight 미지정 — 본문 행간(${baseline.bodyLineHeight ?? "기본"})을 그대로 상속합니다. 견본의 줄 간격 밀도와 다르면 lineHeight 를 명시하세요.`,
      });
    }
    if (!isDefinedValue(v.fontSize) && (surface || isDefinedValue(v.fontWeight))) {
      items.push({
        code: "inherited-font-size",
        axis: "typography",
        severity: "info",
        message: `fontSize 미지정 — 본문 크기(${baseline.bodyFontSize ?? "기본"})를 상속합니다.`,
      });
    }
    return {
      axisCoverage: { surface, typography, spacing, proportion },
      items,
      hasWarnings: items.some((d) => d.severity === "warn"),
    };
  }

  if (category === "frame") {
    const surface = hasAnyKey(v, [
      "fill",
      "border",
      "borderTop",
      "borderBottom",
      "borderLeft",
      "radius",
      "ornament",
      "ornamentColor",
      "underlineColor",
      "chevron",
    ]);
    const typography = hasAnyKey(v, ["color", "titleColor", "kvTextColor", "kvMarker"]);
    const spacing = hasAnyKey(v, ["padding", "marginY"]);
    const proportion = hasAnyKey(v, ["maxWidth", "align"]);

    if (surface && !isDefinedValue(v.padding)) {
      items.push({
        code: "missing-frame-padding",
        axis: "spacing",
        severity: "warn",
        message: `안쪽 여백(padding) 미지정 — 기본 프레임 패딩(${baseline.defaultFramePadding ?? "엔진 기본"})이 적용되어 견본과 밀도가 어긋날 수 있습니다.`,
      });
    }
    if (isDefinedValue(v.border)) {
      const baseBorder = String(v.border).trim();
      for (const side of ["borderTop", "borderBottom", "borderLeft"] as const) {
        if (isDefinedValue(v[side]) && String(v[side]).trim() === baseBorder) {
          items.push({
            code: "duplicate-frame-border",
            axis: "surface",
            severity: "warn",
            message: `border 와 ${side} 에 동일한 선('${baseBorder}')이 중복 선언되었습니다.`,
          });
        }
      }
    }
    if ((surface || isDefinedValue(v.padding)) && !isDefinedValue(v.marginY)) {
      items.push({
        code: "inherited-frame-margin",
        axis: "spacing",
        severity: "info",
        message: `바깥 상하 여백(marginY) 미지정 — 페이지 기본 blockGap(${baseline.pageBlockGap ?? "기본"}px)만 적용됩니다.`,
      });
    }
    return {
      axisCoverage: { surface, typography, spacing, proportion },
      items,
      hasWarnings: items.some((d) => d.severity === "warn"),
    };
  }

  if (category === "table") {
    const borders = (v.borders && typeof v.borders === "object" ? v.borders : {}) as Record<string, unknown>;
    const cellsObj = (v.cells && typeof v.cells === "object" ? v.cells : {}) as Record<string, Record<string, unknown>>;
    const cellDefs = Object.values(cellsObj).filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"));

    const surface =
      hasAnyKey(borders, ["outer", "outerTop", "outerRight", "outerBottom", "outerLeft", "headerTop", "headerBottom", "rowBottom", "vertical", "radius"]) ||
      hasAnyKey(v, ["headerFill", "zebraFill", "radius"]) ||
      cellDefs.some((c) => hasAnyKey(c, ["fill", "borderTop", "borderRight", "borderBottom", "borderLeft"]));
    const anyCellFontSize = cellDefs.some((c) => isDefinedValue(c.fontSize));
    const anyCellLineHeight = cellDefs.some((c) => isDefinedValue(c.lineHeight));
    const typography =
      hasAnyKey(v, ["headerFontSize", "headerFontWeight", "headerLetterSpacing"]) ||
      cellDefs.some((c) =>
        hasAnyKey(c, ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "whiteSpace", "fontVariantNumeric"])
      );
    const anyCellPadding = cellDefs.some((c) => isDefinedValue(c.padding));
    const spacing =
      isDefinedValue(v.cellPadding) ||
      anyCellPadding ||
      anyCellLineHeight ||
      cellDefs.some((c) => hasAnyKey(c, ["listIndent", "hangingIndent"]));
    const proportion =
      isDefinedValue(v.columnWidths) || cellDefs.some((c) => hasAnyKey(c, ["align", "vAlign"]));

    const outerTop = typeof borders.outerTop === "string" ? borders.outerTop.trim().toLowerCase() : "";
    const headerTop = typeof borders.headerTop === "string" ? borders.headerTop.trim().toLowerCase() : "";
    if (outerTop && outerTop !== "none" && headerTop && headerTop !== "none") {
      items.push({
        code: "duplicate-top-border",
        axis: "surface",
        severity: "warn",
        message:
          "borders.outerTop 과 borders.headerTop 이 동시에 지정되어 표 최상단에 이중선/미세 틈이 생길 수 있습니다. 외곽 상단선만 쓰려면 headerTop 을 생략하세요.",
      });
    }
    if (!isDefinedValue(v.cellPadding) && !anyCellPadding) {
      items.push({
        code: "missing-cell-padding",
        axis: "spacing",
        severity: "warn",
        message: `cellPadding 및 셀 padding 미지정 — 기본 여백(${baseline.defaultCellPadding ?? "8px 10px"})이 적용됩니다. 견본의 상하·좌우 밀도에 맞게 명시하세요.`,
      });
    }
    if (cellDefs.length > 0 && !anyCellLineHeight) {
      items.push({
        code: "inherited-cell-line-height",
        axis: "typography",
        severity: "warn",
        message: `셀 역할(cells)에 lineHeight 가 지정되지 않아 문서 본문 행간(${baseline.bodyLineHeight ?? "기본"})을 그대로 상속합니다. 견본보다 행 세로폭이 넓어질 수 있으니 셀 lineHeight 를 명시하세요.`,
      });
    }
    if (cellDefs.length > 0 && !anyCellFontSize) {
      items.push({
        code: "inherited-cell-font-size",
        axis: "typography",
        severity: "warn",
        message: `셀 역할(cells)에 fontSize 가 지정되지 않아 문서 본문 크기(${baseline.bodyFontSize ?? "기본"})를 그대로 상속합니다. 견본의 표 글자 크기가 본문보다 작다면 셀 fontSize 를 명시하세요.`,
      });
    }
    if (Array.isArray(v.columnWidths) && v.columnWidths.length > 0) {
      const pctValues = v.columnWidths
        .map((w) => (typeof w === "string" && w.trim().endsWith("%") ? parseFloat(w) : NaN))
        .filter((n) => Number.isFinite(n));
      if (pctValues.length === v.columnWidths.length) {
        const sum = Math.round(pctValues.reduce((acc, n) => acc + n, 0) * 10) / 10;
        if (Math.abs(sum - 100) > 2) {
          items.push({
            code: "column-widths-sum",
            axis: "proportion",
            severity: "warn",
            message: `columnWidths 합계가 ${sum}% 입니다 (100% 기준 권장).`,
          });
        }
      }
    }
    return {
      axisCoverage: { surface, typography, spacing, proportion },
      items,
      hasWarnings: items.some((d) => d.severity === "warn"),
    };
  }

  if (category === "media") {
    const surface = hasAnyKey(v, ["radius", "aspectPolicy", "captionColor"]);
    const typography = hasAnyKey(v, ["captionFontSize", "captionColor"]);
    const spacing = hasAnyKey(v, ["stripGap", "imagePaddingY"]);
    const proportion = hasAnyKey(v, ["stripRowHeight", "maxHeight", "captionAlign"]);

    if ((surface || proportion) && !spacing) {
      items.push({
        code: "inherited-media-spacing",
        axis: "spacing",
        severity: "info",
        message: `미디어 여백(stripGap / imagePaddingY) 미지정 — 기본 간격(${baseline.mediaStripGap ?? "기본"}px)이 적용됩니다.`,
      });
    }
    return {
      axisCoverage: { surface, typography, spacing, proportion },
      items,
      hasWarnings: items.some((d) => d.severity === "warn"),
    };
  }

  // pageChrome
  const surface = hasAnyKey(v, ["background", "outerBoxBorder", "showHeaderFooter", "footerTemplate"]);
  const typography = hasAnyKey(v, ["listMarkers", "footerAlign"]);
  const spacing = hasAnyKey(v, ["margins", "blockGap"]);
  const proportion = hasAnyKey(v, ["width", "surfaceKind", "footerAlign"]);

  if ((surface || proportion) && !spacing) {
    items.push({
      code: "inherited-page-spacing",
      axis: "spacing",
      severity: "info",
      message: `지면 여백(margins) 및 블록 간격(blockGap) 미지정 — 기존 지면 밀도(blockGap=${baseline.pageBlockGap ?? "기본"}px)가 유지됩니다.`,
    });
  }
  return {
    axisCoverage: { surface, typography, spacing, proportion },
    items,
    hasWarnings: items.some((d) => d.severity === "warn"),
  };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function slugPackId(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `style-${Date.now().toString(36)}`
  );
}

function mergeRecordDefined<T extends Record<string, unknown>>(base: T | undefined, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function mergeTableVariantDef(base: TableStyleDef | undefined, patch: Record<string, unknown>): TableStyleDef {
  const next = mergeRecordDefined<Record<string, unknown>>(
    base as Record<string, unknown> | undefined,
    patch
  ) as TableStyleDef;
  if (patch.borders && typeof patch.borders === "object") {
    next.borders = mergeRecordDefined(
      base?.borders as Record<string, unknown> | undefined,
      patch.borders as Record<string, unknown>
    );
  }
  if (patch.cells && typeof patch.cells === "object") {
    const mergedCells: Record<string, CellStyleDef> = {};
    if (base?.cells) {
      for (const [role, def] of Object.entries(base.cells)) {
        if (def && typeof def === "object") mergedCells[role] = { ...def };
      }
    }
    for (const [role, def] of Object.entries(patch.cells as Record<string, unknown>)) {
      if (def && typeof def === "object") {
        mergedCells[role] = mergeRecordDefined(
          mergedCells[role] as Record<string, unknown> | undefined,
          def as Record<string, unknown>
        ) as CellStyleDef;
      }
    }
    next.cells = mergedCells;
  }
  return next;
}

function ensureFolder(vault: V2AiEnv["vault"], path: string): void {
  const parts = path.split("/").slice(0, -1);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!vault.exists(cur)) vault.createFolder(cur);
  }
}

function writeVaultFile(vault: V2AiEnv["vault"], path: string, content: string): void {
  ensureFolder(vault, path);
  if (vault.exists(path)) vault.write(path, content);
  else vault.createFile(path, content);
}

function companionStyleIdForVDoc(docPath: string): string {
  const base = companionStylePathForVDoc(docPath).replace(/\.vstyle$/i, "");
  const fileName = base.split("/").pop() ?? base;
  return `doc-${slugPackId(fileName)}`;
}

type V2StagedStyleChange = Extract<V2StagedChange, { targetKind: "style-change" }>;

const nextStyleDiffId = () => `style_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** 현재 세션에서 지정 문서에 대기 중인 `style-change` 변경안을 찾는다. */
export function findPendingStyleChange(
  env: Pick<V2AiEnv, "store" | "sessionKey">,
  docPath: string | null
): V2StagedStyleChange | null {
  if (!docPath) return null;
  const queue = env.store.getState().queue;
  for (let i = queue.length - 1; i >= 0; i--) {
    const c = queue[i];
    if (c.targetKind !== "style-change" || c.path !== docPath) continue;
    if (env.sessionKey ? c.sessionKey === env.sessionKey : !c.sessionKey) {
      return c;
    }
  }
  return null;
}

/** 승인 시 Staged 스타일 변경안을 볼트(`.vstyle` + `.vdoc`)에 원자적으로 반영한다. */
export function applyStagedStyleChange(
  vault: V2AiEnv["vault"],
  _docPath: string,
  doc: VDocDocument,
  payload: StagedStyleChange["payload"]
): VDocDocument {
  if (payload.writeStylePack && payload.stylePack && payload.stylePackPath) {
    writeVaultFile(vault, payload.stylePackPath, serializeStylePack(payload.stylePack));
  }
  const patchById = new Map<string, LayoutBlock>(
    (payload.blockPatches ?? []).map((p) => [p.blockId, p.block])
  );
  const nextPages =
    patchById.size > 0
      ? doc.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block) => patchById.get(block.blockId) ?? block),
        }))
      : doc.pages;
  return {
    ...doc,
    ...(payload.styleRef ? { styleRef: payload.styleRef } : {}),
    pages: nextPages,
  };
}

function resolveTargetStyleEntry(
  env: V2AiEnv,
  packId?: string
): {
  entry: VaultStyleCatalogEntry | null;
  companionPath: string | null;
  companionEntry: VaultStyleCatalogEntry | null;
  catalog: VaultStyleCatalogEntry[];
  doc: VDocDocument | null;
  docPath: string | null;
  pendingStyle: V2StagedStyleChange | null;
} {
  const docPath = env.activeDocPath();
  const doc = readVDoc(env, docPath);
  const catalog = collectVaultStyleEntries(env.vault);
  const companionPath = docPath ? companionStylePathForVDoc(docPath) : null;
  const pendingStyle = findPendingStyleChange(env, docPath);

  let companionEntry: VaultStyleCatalogEntry | null = null;
  if (pendingStyle?.payload.stylePack && pendingStyle.payload.stylePackPath === companionPath) {
    companionEntry = {
      id: pendingStyle.payload.stylePack.id,
      pack: pendingStyle.payload.stylePack,
      vaultPath: pendingStyle.payload.stylePackPath,
      source: "vault",
    };
  } else if (companionPath && env.vault.exists(companionPath)) {
    const inCat = catalog.find((c) => c.vaultPath === companionPath);
    if (inCat) {
      companionEntry = inCat;
    } else {
      const parsed = parseStylePackJson(env.vault.read(companionPath));
      if (parsed) {
        companionEntry = { id: parsed.id, pack: parsed, vaultPath: companionPath, source: "vault" };
      }
    }
  }
  const pendingEntry: VaultStyleCatalogEntry | null = pendingStyle?.payload.stylePack
    ? {
        id: pendingStyle.payload.stylePack.id,
        pack: pendingStyle.payload.stylePack,
        vaultPath: pendingStyle.payload.stylePackPath,
        source: "vault",
      }
    : null;
  const entry = packId
    ? (pendingEntry && (pendingEntry.id === packId || pendingEntry.vaultPath === packId)
        ? pendingEntry
        : catalog.find((c) => c.id === packId || c.vaultPath === packId) ?? null)
    : pendingEntry
      ? pendingEntry
      : doc
        ? resolveActiveStyleEntry(doc, env.vault, catalog, docPath) ?? catalog[0] ?? null
        : catalog[0] ?? null;
  return { entry, companionPath, companionEntry, catalog, doc, docPath, pendingStyle };
}

function stripInlineCellOverrides(cell: TableCellSlotDef): TableCellSlotDef {
  const {
    backgroundColor: _bg,
    color: _c,
    fontWeight: _fw,
    fontSize: _fs,
    hAlign: _ha,
    vAlign: _va,
    padding: _p,
    border: _b,
    borderTop: _bt,
    borderRight: _br,
    borderBottom: _bb,
    borderLeft: _bl,
    letterSpacing: _ls,
    lineHeight: _lh,
    fontFamily: _ff,
    whiteSpace: _ws,
    fontVariantNumeric: _fvn,
    listIndent: _li,
    hangingIndent: _hi,
    ...clean
  } = cell;
  void _bg; void _c; void _fw; void _fs; void _ha; void _va; void _p;
  void _b; void _bt; void _br; void _bb; void _bl; void _ls; void _lh;
  void _ff; void _ws; void _fvn; void _li; void _hi;
  return clean;
}

export interface BlockStyleApplyOptions {
  readonly styleKey?: string;
  readonly prefix?: string;
  readonly clearInlineCellStyles?: boolean;
  readonly cellRoleMap?: Record<string, string>;
  readonly syncColumnWidths?: boolean;
}

/**
 * 단일 블록에 `.vstyle` 변형(`styleKey`) · 셀 역할 매핑(`cellRoleMap`) · 인라인 오버라이드 정리 ·
 * 열 너비 동기화를 적용한다 (`style.apply` 와 `assets.propose/apply` 공통 정본).
 */
export function applyStyleOptionsToBlock(
  block: LayoutBlock,
  resolvedPack: ResolvedStylePack | null,
  opts: BlockStyleApplyOptions
): LayoutBlock {
  const clearInline = opts.clearInlineCellStyles ?? Boolean(opts.styleKey);
  const syncWidths = opts.syncColumnWidths !== false;
  let nextBlock: LayoutBlock = opts.styleKey ? { ...block, styleKey: opts.styleKey } : { ...block };

  if (nextBlock.kind === "heading" && opts.prefix !== undefined) {
    nextBlock = { ...nextBlock, prefix: opts.prefix };
  }

  if (nextBlock.kind === "structured-table" || nextBlock.kind === "table") {
    const tbl = nextBlock as StructuredTableBlockDef;
    const effectiveStyleKey = opts.styleKey ?? tbl.styleKey;
    const resolvedTable =
      resolvedPack && effectiveStyleKey
        ? resolveTableGridStyle(resolvedPack, effectiveStyleKey)
        : null;

    const nextRows = tbl.rows.map((row) => ({
      ...row,
      cells: row.cells.map((rawCell, colIdx) => {
        let cell = clearInline ? stripInlineCellOverrides(rawCell) : { ...rawCell };
        const roleMap = opts.cellRoleMap;
        if (roleMap) {
          const byRole = cell.cellRole ? roleMap[cell.cellRole] : undefined;
          const byCol = !cell.isHeader ? roleMap[String(colIdx)] : undefined;
          if (byRole) cell = { ...cell, cellRole: byRole };
          else if (byCol) cell = { ...cell, cellRole: byCol };
        }
        if (!cell.cellRole) {
          cell = { ...cell, cellRole: cell.isHeader ? "column-header" : "value" };
        }
        return cell;
      }),
    }));

    const { borderRules: _br, headerStyle: _hs, cellPadding: _cp, ...restTbl } = tbl;
    void _br; void _hs; void _cp;
    const baseTbl: StructuredTableBlockDef = clearInline ? (restTbl as StructuredTableBlockDef) : tbl;

    const nextWidths =
      syncWidths &&
      resolvedTable?.columnWidths &&
      resolvedTable.columnWidths.length === tbl.columnWidths.length
        ? [...resolvedTable.columnWidths]
        : tbl.columnWidths;

    nextBlock = {
      ...baseTbl,
      ...(opts.styleKey ? { styleKey: opts.styleKey } : {}),
      columnWidths: nextWidths,
      rows: nextRows,
    };
  }

  return nextBlock;
}

export function createStyleTools(
  env: V2AiEnv,
  deps: {
    readonly clientTool: (name: string) => Pick<WorkspaceTool<any>, "name" | "description" | "risk" | "inputSchema">;
  }
): WorkspaceTool<any>[] {
  const { clientTool } = deps;

  return [
    {
      ...clientTool("style.inspect"),
      describe: (args?: { packId?: string; category?: string }) =>
        args?.packId
          ? `스타일 팩 조회 (${args.packId})`
          : args?.category
            ? `활성 스타일 조회 (${args.category})`
            : "활성 .vstyle 스타일 팩 · 직교 속성 조회",
      run: (args?: { packId?: string; category?: StyleCategory }) => {
        const { entry, companionPath, companionEntry, catalog, doc } = resolveTargetStyleEntry(env, args?.packId);
        const category: StyleCategory | undefined =
          args?.category && STYLE_CATEGORIES.includes(args.category) ? args.category : undefined;
        const resolved = entry ? resolveStylePack(entry.pack, doc?.styleRef?.mode) : null;

        return {
          documentStyleRef: doc?.styleRef ?? null,
          companionStylePath: companionPath,
          hasCompanionStyle: Boolean(companionEntry),
          activePack: entry
            ? {
                id: entry.pack.id,
                name: entry.pack.name,
                source: entry.source,
                vaultPath: entry.vaultPath ?? null,
                target: entry.pack.target ?? null,
                genre: entry.pack.genre ?? null,
                mode: resolved?.mode ?? "default",
                availableModes: Object.keys(entry.pack.modes ?? {}),
                primitives: entry.pack.primitives,
                modeTokens: entry.pack.modes?.[resolved?.mode ?? "default"] ?? {},
                styles: category ? { [category]: entry.pack.styles[category] } : entry.pack.styles,
                bindings: entry.pack.bindings,
                extensions: entry.pack.extensions ?? null,
              }
            : null,
          availablePacks: catalog.map((c) => ({
            id: c.id,
            name: c.pack.name,
            source: c.source,
            vaultPath: c.vaultPath ?? null,
            target: c.pack.target ?? null,
            tableVariants: Object.keys(c.pack.styles.table ?? {}),
            textStyles: Object.keys(c.pack.styles.text ?? {}),
          })),
          orthogonalPrimitives: ORTHOGONAL_STYLE_PRIMITIVES,
          inheritedBaseline: buildInheritedBaseline(resolved),
        };
      },
    },
    {
      ...clientTool("style.upsertVariant"),
      describe: (args: { category?: string; variantKey?: string; packId?: string }) =>
        `스타일 변형 등록/갱신 (${args?.category ?? "?"}.${args?.variantKey ?? "?"})`,
      run: (args: {
        packId?: string;
        packName?: string;
        category: StyleCategory;
        variantKey: string;
        definition: Record<string, unknown>;
        modeTokens?: Record<string, StyleTokenValue>;
        target?: string;
        extensions?: Record<string, Record<string, unknown>>;
        bindToDocument?: boolean;
        /** true 일 때만 공유 볼트 팩을 직접 수정한다. 기본(false)은 현재 문서 바로 옆의 단일 동반 `.vstyle` 파일에 기록한다. */
        shared?: boolean;
      }) => {
        if (!args || !STYLE_CATEGORIES.includes(args.category)) {
          throw new Error(`category 는 ${STYLE_CATEGORIES.join(" | ")} 중 하나여야 합니다.`);
        }
        const variantKey = args.variantKey?.trim();
        if (!variantKey) throw new Error("variantKey 가 비었습니다.");
        if (!args.definition || typeof args.definition !== "object") {
          throw new Error("definition 객체가 필요합니다.");
        }

        const { entry, companionPath, companionEntry, doc, docPath, pendingStyle } = resolveTargetStyleEntry(env, args.packId);
        let basePack: StylePack;
        let targetVaultPath: string;

        const useCompanion = Boolean(doc && docPath && companionPath && !args.shared);
        if (useCompanion && companionPath) {
          // 1 문서 = 문서 바로 옆 단일 동반 `.vstyle` 원칙: 다른 폴더의 공유 샘플 `.vstyle` 을 오염시키지 않는다.
          targetVaultPath = companionPath;
          if (companionEntry) {
            basePack = deepClone(companionEntry.pack);
          } else {
            const seedPack = entry?.pack ?? STANDARD_BASE_STYLE_PACK;
            basePack = {
              ...deepClone(seedPack),
              protocol: VSTYLE_PROTOCOL,
              id: companionStyleIdForVDoc(docPath!),
              name: args.packName?.trim() || `${doc!.title} 스타일`,
              description: `${doc!.title} 전용 동반 스타일 팩 (기반: ${seedPack.name})`,
            };
          }
        } else if (entry) {
          basePack = deepClone(entry.pack);
          targetVaultPath = entry.vaultPath ?? `${VAULT_STYLES_DIR}/${slugPackId(basePack.id)}.vstyle`;
        } else {
          const newId = slugPackId(args.packId || args.packName || "custom-style");
          basePack = {
            ...deepClone(STANDARD_BASE_STYLE_PACK),
            protocol: VSTYLE_PROTOCOL,
            id: newId,
            name: args.packName?.trim() || newId,
            genre: "custom",
            description: `${args.packName?.trim() || newId} — 에이전트 생성 스타일 팩`,
          };
          targetVaultPath = `${VAULT_STYLES_DIR}/${newId}.vstyle`;
        }

        if (args.target) basePack.target = args.target;
        if (args.packName?.trim()) basePack.name = args.packName.trim();

        const modeName = doc?.styleRef?.mode && basePack.modes[doc.styleRef.mode]
          ? doc.styleRef.mode
          : Object.keys(basePack.modes)[0] ?? "default";
        if (args.modeTokens && typeof args.modeTokens === "object") {
          basePack.modes[modeName] = {
            ...basePack.modes[modeName],
            ...args.modeTokens,
          };
        }

        if (args.extensions && typeof args.extensions === "object") {
          basePack.extensions = {
            ...basePack.extensions,
            ...args.extensions,
          };
        }

        const catMap = basePack.styles[args.category] as Record<string, Record<string, unknown>>;
        if (args.category === "table") {
          catMap[variantKey] = mergeTableVariantDef(
            catMap[variantKey] as TableStyleDef | undefined,
            args.definition
          ) as unknown as Record<string, unknown>;
        } else {
          catMap[variantKey] = mergeRecordDefined(catMap[variantKey], args.definition);
        }

        basePack.updatedAt = new Date().toISOString();
        if (!isValidStylePack(basePack)) {
          throw new Error("생성된 스타일 팩이 vibe-style/1.0 규격에 맞지 않습니다.");
        }

        const resolved = resolveStylePack(basePack, modeName);
        const resolvedVariant = resolved.styles[args.category][variantKey] as Record<string, unknown> | undefined;
        const baseline = buildInheritedBaseline(resolved);
        const diag = diagnoseStyleVariant(args.category, resolvedVariant, baseline);
        const warnMessages = diag.items.filter((d) => d.severity === "warn").map((d) => d.message);

        // 활성 .vdoc 문맥의 동반 스타일 변형은 즉시 디스크를 덮지 않고 Staged(2D Unified Diff 승인/거절)로 적재한다.
        if (useCompanion && doc && docPath) {
          const nextEntry: VaultStyleCatalogEntry = {
            id: basePack.id,
            pack: basePack,
            vaultPath: targetVaultPath,
            source: "vault",
          };
          const nextRef = args.bindToDocument !== false ? buildStyleRefForEntry(nextEntry, modeName) : pendingStyle?.payload.styleRef;
          const variantTag = `${args.category}.${variantKey}`;
          const changedVariants = Array.from(
            new Set([...(pendingStyle?.payload.changedVariants ?? []), variantTag])
          );

          // 이미 이 변형을 참조 중인 블록이 있으면 style.apply 없이도 캔버스 2D Unified Diff 미리보기를 붙인다.
          const patchMap = new Map<string, LayoutBlock>(
            (pendingStyle?.payload.blockPatches ?? []).map((p) => [p.blockId, p.block])
          );
          for (const page of doc.pages) {
            for (const block of page.blocks) {
              if (patchMap.has(block.blockId)) continue;
              const matchesExplicit = block.styleKey === variantKey;
              const matchesDefaultTable =
                args.category === "table" &&
                variantKey === "default" &&
                (block.kind === "structured-table" || block.kind === "table") &&
                !block.styleKey;
              if (matchesExplicit || matchesDefaultTable) {
                if (block.kind === "structured-table" || block.kind === "table") {
                  const tbl = block as StructuredTableBlockDef;
                  const resolvedTable = resolveTableGridStyle(resolved, variantKey);
                  const nextWidths =
                    resolvedTable.columnWidths && resolvedTable.columnWidths.length === tbl.columnWidths.length
                      ? [...resolvedTable.columnWidths]
                      : tbl.columnWidths;
                  patchMap.set(block.blockId, { ...tbl, columnWidths: nextWidths });
                } else {
                  patchMap.set(block.blockId, { ...block });
                }
              }
            }
          }
          const blockPatches = [...patchMap.entries()].map(([blockId, block]) => ({ blockId, block }));
          const diffId = pendingStyle?.diffId ?? nextStyleDiffId();
          const stagedChange: V2StagedStyleChange = {
            diffId,
            path: docPath,
            ...(env.sessionKey ? { sessionKey: env.sessionKey } : {}),
            phase: "drafting",
            targetKind: "style-change",
            targetId: blockPatches[0]?.blockId ?? doc.docId,
            title: `[스타일] ${changedVariants.join(", ")}`,
            beforeSummary: doc.styleRef?.packId ? `현재 스타일 (${doc.styleRef.packId})` : "현재 문서 스타일",
            afterSummary:
              blockPatches.length > 0
                ? `${changedVariants.join(", ")} · 대상 블록 ${blockPatches.length}개`
                : `${changedVariants.join(", ")} · 문서 스타일 팩 갱신`,
            sourceReferenceIds: [],
            docId: doc.docId,
            warnings: warnMessages.length > 0 ? warnMessages : undefined,
            payload: {
              stylePack: basePack,
              stylePackPath: targetVaultPath,
              writeStylePack: true,
              styleRef: nextRef,
              blockPatches,
              changedVariants,
              styleKey: pendingStyle?.payload.styleKey ?? (args.category === "table" ? variantKey : undefined),
              intentNote: pendingStyle?.payload.intentNote,
            },
            createdAt: new Date().toISOString(),
          };
          if (pendingStyle) {
            env.store.getState().revise(pendingStyle.diffId, stagedChange);
          } else {
            env.store.getState().enqueue([stagedChange]);
          }
          return {
            staged: true,
            saved: false,
            diffId,
            packId: basePack.id,
            vaultPath: targetVaultPath,
            category: args.category,
            variantKey,
            documentBound: Boolean(nextRef),
            resolvedVariant,
            axisCoverage: diag.axisCoverage,
            diagnostics: diag.items,
            ...(diag.hasWarnings
              ? {
                  selfCheckHint:
                    "diagnostics 에 경고(warn)가 있습니다. 견본의 실제 밀도·행간·여백·선 중복과 대조해 의도한 값이 아니라면 사용자에게 보고하기 전에 style.upsertVariant 로 즉시 보정하세요.",
                }
              : {}),
          };
        }

        // shared=true 또는 열린 .vdoc 없음: 공유 스타일 팩에 직접 기록
        writeVaultFile(env.vault, targetVaultPath, serializeStylePack(basePack));

        return {
          staged: false,
          saved: true,
          packId: basePack.id,
          vaultPath: targetVaultPath,
          category: args.category,
          variantKey,
          documentBound: false,
          resolvedVariant,
          axisCoverage: diag.axisCoverage,
          diagnostics: diag.items,
          ...(diag.hasWarnings
            ? {
                selfCheckHint:
                  "diagnostics 에 경고(warn)가 있습니다. 견본의 실제 밀도·행간·여백·선 중복과 대조해 의도한 값이 아니라면 사용자에게 보고하기 전에 style.upsertVariant 로 즉시 보정하세요.",
              }
            : {}),
        };
      },
    },
    {
      ...clientTool("style.apply"),
      describe: (args?: { styleKey?: string; packId?: string; blockIds?: string[] }) =>
        args?.styleKey
          ? `스타일 변형 제안 (${args.styleKey})`
          : args?.packId
            ? `스타일 팩 적용 제안 (${args.packId})`
            : "문서 · 블록 스타일 적용 제안",
      run: (
        args: {
          packId?: string;
          mode?: string;
          blockIds?: string[];
          styleKey?: string;
          prefix?: string;
          clearInlineCellStyles?: boolean;
          cellRoleMap?: Record<string, string>;
          syncColumnWidths?: boolean;
          intentNote?: string;
        },
        _ctx?: ToolRunContext
      ) => {
        void _ctx;
        const { path, doc } = requireDoc(env);
        const catalog = collectVaultStyleEntries(env.vault);
        const pendingStyle = findPendingStyleChange(env, path);
        const pendingEntry: VaultStyleCatalogEntry | null = pendingStyle?.payload.stylePack
          ? {
              id: pendingStyle.payload.stylePack.id,
              pack: pendingStyle.payload.stylePack,
              vaultPath: pendingStyle.payload.stylePackPath,
              source: "vault",
            }
          : null;

        let nextStyleRef = pendingStyle?.payload.styleRef ?? doc.styleRef;
        let activeEntry: VaultStyleCatalogEntry | null =
          pendingEntry ?? resolveActiveStyleEntry(doc, env.vault, catalog, path);

        if (args?.packId) {
          const found =
            pendingEntry && (pendingEntry.id === args.packId || pendingEntry.vaultPath === args.packId)
              ? pendingEntry
              : catalog.find((c) => c.id === args.packId || c.vaultPath === args.packId);
          if (!found) {
            throw new Error(
              `볼트에서 스타일 팩 "${args.packId}" 을 찾지 못했습니다. 사용 가능: ${catalog.map((c) => c.id).join(", ")}`
            );
          }
          activeEntry = found;
          nextStyleRef = buildStyleRefForEntry(found, args.mode ?? nextStyleRef?.mode);
        } else if (activeEntry && (args?.mode || !nextStyleRef)) {
          nextStyleRef = buildStyleRefForEntry(activeEntry, args?.mode ?? nextStyleRef?.mode);
        }

        const resolvedPack = activeEntry ? resolveStylePack(activeEntry.pack, nextStyleRef?.mode) : null;
        const targetIds = new Set(args?.blockIds ?? []);
        const clearInline = args?.clearInlineCellStyles ?? Boolean(args?.styleKey);
        const applyOpts: BlockStyleApplyOptions = {
          styleKey: args?.styleKey,
          prefix: args?.prefix,
          clearInlineCellStyles: clearInline,
          cellRoleMap: args?.cellRoleMap,
          syncColumnWidths: args?.syncColumnWidths,
        };
        const updatedBlockIds: string[] = [];
        const updatedStagedBlockIds: string[] = [];
        const updatedAssetDiffIds: string[] = [];
        const replacedByPatchedAsset = new Set<string>();

        // 1) 같은 턴에 `assets.propose`/`assets.apply` 로 대기열에 올라간 Staged 블록까지 함께 스타일 바인딩한다.
        //    (새 Staged 블록 ID 또는 교체 대상 원본 블록 ID 어느 쪽을 넘겨도 끊기지 않도록 지원)
        if (targetIds.size > 0) {
          const queueSnapshot = env.store.getState().queue;
          for (const item of queueSnapshot) {
            if (item.targetKind !== "asset-blocks" || item.path !== path) continue;
            if (env.sessionKey ? item.sessionKey !== env.sessionKey : Boolean(item.sessionKey)) continue;
            const replaceIds = item.payload.replaceBlockIds ?? [];
            const matchesReplaced =
              item.payload.mode === "replace" && replaceIds.some((rid) => targetIds.has(rid));
            let changedAny = false;
            const nextBlocks = item.payload.blocks.map((blk) => {
              const directHit = targetIds.has(blk.blockId);
              if (!directHit && !matchesReplaced) return blk;
              changedAny = true;
              updatedStagedBlockIds.push(blk.blockId);
              return applyStyleOptionsToBlock(blk, resolvedPack, applyOpts);
            });
            if (changedAny) {
              if (matchesReplaced) {
                for (const rid of replaceIds) replacedByPatchedAsset.add(rid);
              }
              env.store.getState().revise(item.diffId, {
                ...item,
                payload: { ...item.payload, blocks: nextBlocks },
              });
              updatedAssetDiffIds.push(item.diffId);
            }
          }
        }

        const patchMap = new Map<string, LayoutBlock>(
          (pendingStyle?.payload.blockPatches ?? []).map((p) => [p.blockId, p.block])
        );

        // 2) 커밋된 문서 블록 스타일 패치 (이미 교체 Staged 에셋으로 패치된 원본 블록은 중복 패치 생략)
        for (const page of doc.pages) {
          for (const rawBlock of page.blocks) {
            if (targetIds.size === 0 || !targetIds.has(rawBlock.blockId)) continue;
            if (replacedByPatchedAsset.has(rawBlock.blockId)) {
              patchMap.delete(rawBlock.blockId);
              continue;
            }
            const block = patchMap.get(rawBlock.blockId) ?? rawBlock;
            updatedBlockIds.push(block.blockId);
            patchMap.set(block.blockId, applyStyleOptionsToBlock(block, resolvedPack, applyOpts));
          }
        }

        const allUpdatedIds = [...updatedBlockIds, ...updatedStagedBlockIds];
        const blockPatches = [...patchMap.entries()].map(([blockId, block]) => ({ blockId, block }));
        const diffId = pendingStyle?.diffId ?? nextStyleDiffId();
        const changedVariants = pendingStyle?.payload.changedVariants ?? [];
        const label =
          args?.styleKey ??
          (changedVariants.length > 0 ? changedVariants.join(", ") : activeEntry?.pack.name ?? "문서 스타일");
        const totalTargetCount = blockPatches.length + updatedStagedBlockIds.length;
        const stagedChange: V2StagedStyleChange = {
          diffId,
          path,
          ...(env.sessionKey ? { sessionKey: env.sessionKey } : {}),
          phase: "drafting",
          targetKind: "style-change",
          targetId: blockPatches[0]?.blockId ?? updatedStagedBlockIds[0] ?? doc.docId,
          title: `[스타일] ${label}`,
          beforeSummary: doc.styleRef?.packId ? `현재 스타일 (${doc.styleRef.packId})` : "현재 문서 스타일",
          afterSummary:
            totalTargetCount > 0
              ? `${label} · 대상 블록 ${totalTargetCount}개`
              : `${label} · 문서 스타일 적용`,
          sourceReferenceIds: [],
          docId: doc.docId,
          warnings: pendingStyle?.warnings,
          payload: {
            stylePack: activeEntry?.pack ?? pendingStyle?.payload.stylePack,
            stylePackPath: pendingStyle?.payload.stylePackPath ?? activeEntry?.vaultPath,
            writeStylePack: Boolean(pendingStyle?.payload.writeStylePack),
            styleRef: nextStyleRef,
            blockPatches,
            changedVariants,
            styleKey: args?.styleKey ?? pendingStyle?.payload.styleKey,
            intentNote: args?.intentNote ?? pendingStyle?.payload.intentNote,
          },
          createdAt: new Date().toISOString(),
        };

        if (pendingStyle) {
          env.store.getState().revise(pendingStyle.diffId, stagedChange);
        } else {
          env.store.getState().enqueue([stagedChange]);
        }

        return {
          staged: true,
          applied: false,
          diffId,
          path,
          styleRef: nextStyleRef ?? null,
          styleKey: args?.styleKey ?? null,
          updatedBlockIds: allUpdatedIds,
          ...(updatedStagedBlockIds.length > 0 ? { updatedStagedBlockIds, updatedAssetDiffIds } : {}),
          clearedInlineOverrides: clearInline && allUpdatedIds.length > 0,
        };
      },
    },
  ];
}
