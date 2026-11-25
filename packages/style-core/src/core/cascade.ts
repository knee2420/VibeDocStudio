/**
 * @vibe/style-core — 4단 Cascade 해석 엔진.
 *
 * 우선순위 (낮음 -> 높음):
 *   1) Style Pack Primitives + Active Semantic Mode
 *   2) Element / Variant Composite Style (`bindings`)
 *   3) Section-level Override (`sectionOverride`)
 *   4) Block / Cell Instance Override (`instanceOverride`)
 */
import { flattenPrimitives, resolveAliasTree, resolveAliasValue } from "./alias-resolver";
import type {
  FrameStyleDef,
  MediaStyleDef,
  PageChromeStyleDef,
  ResolvedStylePack,
  StyleCompositeCatalog,
  StyleOverrideDelta,
  StylePack,
  StyleTokenValue,
  TableStyleDef,
  TextStyleDef,
} from "./token-contract";

export interface ResolvedElementStyle {
  text: TextStyleDef;
  frame: FrameStyleDef;
  table: TableStyleDef;
  media: MediaStyleDef;
  pageChrome: PageChromeStyleDef;
}

function mergeDefined<T extends object>(base: T, patch?: Partial<T>): T {
  if (!patch) return { ...base };
  const next = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v !== undefined) {
      next[k] = v;
    }
  }
  return next as T;
}

function mergeCellMap(
  base?: Record<string, import("./token-contract").CellStyleDef>,
  patch?: Record<string, import("./token-contract").CellStyleDef>
): Record<string, import("./token-contract").CellStyleDef> | undefined {
  if (!base && !patch) return undefined;
  const out: Record<string, import("./token-contract").CellStyleDef> = {};
  if (base) {
    for (const [role, def] of Object.entries(base)) out[role] = { ...def };
  }
  if (patch) {
    for (const [role, def] of Object.entries(patch)) {
      out[role] = out[role] ? mergeDefined(out[role], def) : { ...def };
    }
  }
  return out;
}

function mergeTableStyle(base: TableStyleDef, patch?: Partial<TableStyleDef>): TableStyleDef {
  if (!patch) {
    return {
      ...base,
      borders: base.borders ? { ...base.borders } : undefined,
      columnWidths: base.columnWidths ? [...base.columnWidths] : undefined,
      cells: mergeCellMap(base.cells),
    };
  }
  return {
    ...mergeDefined(base, patch),
    borders:
      base.borders || patch.borders
        ? mergeDefined(base.borders ?? {}, patch.borders)
        : undefined,
    columnWidths: patch.columnWidths
      ? [...patch.columnWidths]
      : base.columnWidths
        ? [...base.columnWidths]
        : undefined,
    cells: mergeCellMap(base.cells, patch.cells),
  };
}

function mergePageChrome(
  base: PageChromeStyleDef,
  patch?: Partial<PageChromeStyleDef>
): PageChromeStyleDef {
  if (!patch) return { ...base, margins: base.margins ? { ...base.margins } : undefined };
  return {
    ...mergeDefined(base, patch),
    margins:
      base.margins || patch.margins
        ? mergeDefined(base.margins ?? { top: 20, right: 32, bottom: 20, left: 32 }, patch.margins)
        : undefined,
  };
}

function mergeFrameStyle(base: FrameStyleDef, patch?: Partial<FrameStyleDef>): FrameStyleDef {
  if (!patch) {
    return {
      ...base,
      accentPalettes: base.accentPalettes ? { ...base.accentPalettes } : undefined,
    };
  }
  return {
    ...mergeDefined(base, patch),
    accentPalettes:
      base.accentPalettes || patch.accentPalettes
        ? { ...base.accentPalettes, ...patch.accentPalettes }
        : undefined,
  };
}

/**
 * `StylePack` 의 지정된 `mode` 를 기준으로 모든 `{alias}` 를 해석해
 * 런타임 소비용 `ResolvedStylePack` 을 생성한다.
 */
export function resolveStylePack(pack: StylePack, requestedMode?: string): ResolvedStylePack {
  const modeNames = Object.keys(pack.modes ?? {});
  const mode =
    requestedMode && pack.modes?.[requestedMode]
      ? requestedMode
      : pack.modes?.default
        ? "default"
        : (modeNames[0] ?? "default");

  const primitiveMap = flattenPrimitives(pack.primitives);
  const rawSemantic = pack.modes?.[mode] ?? {};

  const resolvedSemantic: Record<string, StyleTokenValue> = {};
  for (const [k, v] of Object.entries(rawSemantic)) {
    resolvedSemantic[k] = resolveAliasValue(v, rawSemantic, primitiveMap);
  }

  const allTokens: Record<string, StyleTokenValue> = {
    ...primitiveMap,
    ...resolvedSemantic,
  };

  const resolvedStyles: StyleCompositeCatalog = resolveAliasTree(
    pack.styles,
    resolvedSemantic,
    primitiveMap
  );

  const resolvedExtensions = pack.extensions
    ? resolveAliasTree(pack.extensions, resolvedSemantic, primitiveMap)
    : undefined;

  return {
    packId: pack.id,
    packName: pack.name,
    version: pack.version,
    mode,
    ...(pack.target ? { target: pack.target } : {}),
    tokens: allTokens,
    styles: resolvedStyles,
    bindings: { ...pack.bindings },
    ...(resolvedExtensions ? { extensions: resolvedExtensions } : {}),
  };
}

/**
 * 4단 Cascade 규칙에 따라 특정 Element/Variant 의 최종 합성 스타일을 계산한다.
 */
export function resolveCascadedStyle(
  resolvedPack: ResolvedStylePack,
  bindingKey: string,
  sectionOverride?: StyleOverrideDelta,
  instanceOverride?: StyleOverrideDelta
): ResolvedElementStyle {
  // Exact match (e.g. `callout-box[variant=info-frame]`) -> base kind match (e.g. `callout-box`)
  const bracketIdx = bindingKey.indexOf("[");
  const baseKey = bracketIdx >= 0 ? bindingKey.slice(0, bracketIdx) : bindingKey;
  const binding = resolvedPack.bindings[bindingKey] ?? resolvedPack.bindings[baseKey] ?? {};

  let text: TextStyleDef = binding.textStyle
    ? { ...(resolvedPack.styles.text[binding.textStyle] ?? {}) }
    : {};
  let frame: FrameStyleDef = binding.frameStyle
    ? mergeFrameStyle(resolvedPack.styles.frame[binding.frameStyle] ?? {})
    : {};
  let table: TableStyleDef = binding.tableStyle
    ? mergeTableStyle(resolvedPack.styles.table[binding.tableStyle] ?? {})
    : {};
  let media: MediaStyleDef = binding.mediaStyle
    ? { ...(resolvedPack.styles.media[binding.mediaStyle] ?? {}) }
    : {};
  let pageChrome: PageChromeStyleDef = binding.pageChromeStyle
    ? mergePageChrome(resolvedPack.styles.pageChrome[binding.pageChromeStyle] ?? {})
    : {};

  // Tier 3: Section-level override
  if (sectionOverride) {
    text = mergeDefined(text, sectionOverride.text);
    frame = mergeFrameStyle(frame, sectionOverride.frame);
    table = mergeTableStyle(table, sectionOverride.table);
    media = mergeDefined(media, sectionOverride.media);
    pageChrome = mergePageChrome(pageChrome, sectionOverride.pageChrome);
  }

  // Tier 4: Instance-level override
  if (instanceOverride) {
    text = mergeDefined(text, instanceOverride.text);
    frame = mergeFrameStyle(frame, instanceOverride.frame);
    table = mergeTableStyle(table, instanceOverride.table);
    media = mergeDefined(media, instanceOverride.media);
    pageChrome = mergePageChrome(pageChrome, instanceOverride.pageChrome);
  }

  return { text, frame, table, media, pageChrome };
}
