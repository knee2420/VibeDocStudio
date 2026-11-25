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
  serializeVDocJson,
  type VaultStyleCatalogEntry,
} from "@vibe/vault-formats";
import type { LayoutBlock, StructuredTableBlockDef, TableCellSlotDef, VDocDocument } from "@vibe/vdoc-schema";

import { readVDoc, requireDoc, type V2AiEnv } from "./contexts";

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
} {
  const docPath = env.activeDocPath();
  const doc = readVDoc(env, docPath);
  const catalog = collectVaultStyleEntries(env.vault);
  const companionPath = docPath ? companionStylePathForVDoc(docPath) : null;
  let companionEntry: VaultStyleCatalogEntry | null = null;
  if (companionPath && env.vault.exists(companionPath)) {
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
  const entry = packId
    ? catalog.find((c) => c.id === packId || c.vaultPath === packId) ?? null
    : doc
      ? resolveActiveStyleEntry(doc, env.vault, catalog, docPath) ?? catalog[0] ?? null
      : catalog[0] ?? null;
  return { entry, companionPath, companionEntry, catalog, doc, docPath };
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

        const { entry, companionPath, companionEntry, doc, docPath } = resolveTargetStyleEntry(env, args.packId);
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

        writeVaultFile(env.vault, targetVaultPath, serializeStylePack(basePack));

        let documentBound = false;
        if (args.bindToDocument !== false && doc && docPath) {
          const nextEntry: VaultStyleCatalogEntry = {
            id: basePack.id,
            pack: basePack,
            vaultPath: targetVaultPath,
            source: "vault",
          };
          const nextRef = buildStyleRefForEntry(nextEntry, modeName);
          const nextDoc: VDocDocument = { ...doc, styleRef: nextRef };
          env.vault.write(docPath, serializeVDocJson(nextDoc));
          documentBound = true;
        }

        const resolved = resolveStylePack(basePack, modeName);
        return {
          saved: true,
          packId: basePack.id,
          vaultPath: targetVaultPath,
          category: args.category,
          variantKey,
          documentBound,
          resolvedVariant: resolved.styles[args.category][variantKey],
        };
      },
    },
    {
      ...clientTool("style.apply"),
      describe: (args?: { styleKey?: string; packId?: string; blockIds?: string[] }) =>
        args?.styleKey
          ? `스타일 변형 적용 (${args.styleKey})`
          : args?.packId
            ? `스타일 팩 적용 (${args.packId})`
            : "문서 · 블록 스타일 적용",
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

        let nextStyleRef = doc.styleRef;
        let activeEntry = resolveActiveStyleEntry(doc, env.vault, catalog, path);

        if (args?.packId) {
          const found = catalog.find((c) => c.id === args.packId || c.vaultPath === args.packId);
          if (!found) {
            throw new Error(
              `볼트에서 스타일 팩 "${args.packId}" 을 찾지 못했습니다. 사용 가능: ${catalog.map((c) => c.id).join(", ")}`
            );
          }
          activeEntry = found;
          nextStyleRef = buildStyleRefForEntry(found, args.mode ?? doc.styleRef?.mode);
        } else if (activeEntry && (args?.mode || !doc.styleRef)) {
          nextStyleRef = buildStyleRefForEntry(activeEntry, args?.mode ?? doc.styleRef?.mode);
        }

        const resolvedPack = activeEntry ? resolveStylePack(activeEntry.pack, nextStyleRef?.mode) : null;
        const targetIds = new Set(args?.blockIds ?? []);
        const clearInline = args?.clearInlineCellStyles ?? Boolean(args?.styleKey);
        const syncWidths = args?.syncColumnWidths !== false;
        const updatedBlockIds: string[] = [];

        const nextPages = doc.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block): LayoutBlock => {
            if (targetIds.size === 0 || !targetIds.has(block.blockId)) return block;
            updatedBlockIds.push(block.blockId);

            let nextBlock: LayoutBlock = args?.styleKey ? { ...block, styleKey: args.styleKey } : { ...block };

            if (nextBlock.kind === "heading" && args?.prefix !== undefined) {
              nextBlock = { ...nextBlock, prefix: args.prefix };
            }

            if (nextBlock.kind === "structured-table" || nextBlock.kind === "table") {
              const tbl = nextBlock as StructuredTableBlockDef;
              const resolvedTable =
                resolvedPack && (args?.styleKey || tbl.styleKey)
                  ? resolveTableGridStyle(resolvedPack, args?.styleKey ?? tbl.styleKey ?? "default")
                  : null;

              const nextRows = tbl.rows.map((row) => ({
                ...row,
                cells: row.cells.map((rawCell, colIdx) => {
                  let cell = clearInline ? stripInlineCellOverrides(rawCell) : { ...rawCell };
                  const roleMap = args?.cellRoleMap;
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
                ...(args?.styleKey ? { styleKey: args.styleKey } : {}),
                columnWidths: nextWidths,
                rows: nextRows,
              };
            }

            return nextBlock;
          }),
        }));

        const nextDoc: VDocDocument = {
          ...doc,
          ...(nextStyleRef ? { styleRef: nextStyleRef } : {}),
          pages: nextPages,
        };

        env.vault.write(path, serializeVDocJson(nextDoc));

        return {
          applied: true,
          path,
          styleRef: nextDoc.styleRef ?? null,
          styleKey: args?.styleKey ?? null,
          updatedBlockIds,
          clearedInlineOverrides: clearInline && updatedBlockIds.length > 0,
        };
      },
    },
  ];
}
