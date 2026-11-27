/**
 * 에셋 v3 라이브러리 + Composer 도구 (docs/specs/v2-asset-centric-schema.md §2).
 *
 * 양식 · 형식 · 구조에 관한 일은 모두 에셋을 거친다:
 *   해체 `assets.register`(에이전트가 분해한 골격) / `assets.capture`(문서 블록에서) → 라이브러리
 *   적용 `assets.instantiate`(새 데이터로 놓기) / `assets.apply`(이미 있는 블록을 그 모양으로) → Staged
 * 라이브러리 파일: `.vibedoc/assets/v3/<assetId>.json` — 같은 구조 지문은 한 에셋으로 합친다.
 */
import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { resolveStylePack, resolveTableGridStyle } from "@vibe/style-core";
import {
  ASSET_COMPONENTS,
  ASSET_PRIMITIVES,
  ASSET_ROLES,
  FIELD_TYPES,
  applyAssetToBlocks,
  collectFields,
  compileVsyntaxDslToAssetV3,
  decomposeBlocks,
  formatAssetIssues,
  instantiateAssetV3,
  mapItemsToAsset,
  recordsToItems,
  renderAssetV3ToVsyntaxDsl,
  skeletonFingerprint,
  vDocAssetToV3,
  validateAssetV3,
  type AssetRecords,
  type AssetStyleCompanion,
  type AssetV3,
  type ElementRegistrySnapshot,
  type LayoutBlock,
  type SourceItem,
  type StructuredTableBlockDef,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import {
  STANDARD_SYNTAX_PATH,
  collectVaultAssets,
  collectVaultStyleEntries,
  parseSyntaxSnapshot,
  resolveActiveStyleEntry,
} from "@vibe/vault-formats";

import { readVDoc, requireDoc, type V2AiEnv } from "./contexts";
import { applyStyleOptionsToBlock, findPendingStyleChange, type BlockStyleApplyOptions } from "./styleTools";
import type { V2StagedChange } from "./store";

export const ASSET_V3_DIR = ".vibedoc/assets/v3";

export interface AssetV3Entry {
  readonly asset: AssetV3;
  readonly fingerprint: string;
  /** session = 이 작업에서 만든 것 · saved = 사람이 저장한 것 */
  readonly lifecycle: "session" | "saved";
  readonly createdAt: string;
  readonly sessionKey?: string;
  readonly path: string;
}

type VaultLike = V2AiEnv["vault"];

const entryPath = (assetId: string) => `${ASSET_V3_DIR}/${assetId}.json`;

export function listAssetsV3(vault: VaultLike): AssetV3Entry[] {
  const out: AssetV3Entry[] = [];
  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !node.path.startsWith(`${ASSET_V3_DIR}/`) || !node.path.endsWith(".json")) continue;
    if (vault.isLoaded && !vault.isLoaded(node.path)) continue;
    try {
      const raw = JSON.parse(vault.read(node.path)) as Omit<AssetV3Entry, "path">;
      if (raw?.asset?.schema === "vibe-asset/3") out.push({ ...raw, path: node.path });
    } catch {
      /* 깨진 파일은 건너뛴다 */
    }
  }
  return out;
}

export function readAssetV3(vault: VaultLike, assetId: string): AssetV3Entry | null {
  const direct = listAssetsV3(vault).find((e) => e.asset.assetId === assetId);
  if (direct) return direct;
  // 통합 정본 폴백: 볼트 `.vasset` 또는 내장 시드도 동일 assetId 로 즉시 해석한다.
  const unified = collectVaultAssets(vault).find((e) => e.asset.assetId === assetId);
  if (!unified) return null;
  const v3 = vDocAssetToV3(unified.asset);
  return {
    asset: v3,
    fingerprint: skeletonFingerprint(v3.nodes),
    lifecycle: "saved",
    createdAt: unified.asset.origin.createdAt,
    path: unified.vaultPath ?? entryPath(v3.assetId),
  };
}

export function loadLiveVsyntaxSnapshot(vault: VaultLike): ElementRegistrySnapshot {
  const raw = vault.exists(STANDARD_SYNTAX_PATH) ? vault.read(STANDARD_SYNTAX_PATH) : "";
  return parseSyntaxSnapshot(raw);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "asset"
  );
}

/** 검증 → 같은 지문이 있으면 그것을 돌려주고, 없으면 새로 저장. */
export function registerAssetV3(
  vault: VaultLike,
  input: AssetV3,
  meta: { readonly sessionKey?: string; readonly replaceAssetId?: string } = {}
): { entry: AssetV3Entry; reused: boolean; warnings: string } {
  const v = validateAssetV3(input);
  if (!v.ok) throw new Error(`에셋이 사양에 맞지 않습니다. 고쳐서 다시 등록하세요.\n${formatAssetIssues(v)}`);
  const fingerprint = skeletonFingerprint(input.nodes);
  const existing = listAssetsV3(vault);
  if (!meta.replaceAssetId) {
    const same = existing.find((e) => e.fingerprint === fingerprint);
    if (same) return { entry: same, reused: true, warnings: formatAssetIssues(v) };
  }
  const assetId = meta.replaceAssetId ?? (input.assetId && !existing.some((e) => e.asset.assetId === input.assetId) ? input.assetId : `${slug(input.title)}-${fingerprint.slice(0, 6)}`);
  const asset: AssetV3 = {
    ...input,
    assetId,
    dsl: renderAssetV3ToVsyntaxDsl(input),
    origin: {
      sourceType: input.origin?.sourceType ?? "attachment",
      ...input.origin,
      createdAt: input.origin?.createdAt ?? new Date().toISOString(),
    },
  };
  const entry: Omit<AssetV3Entry, "path"> = { asset, fingerprint, lifecycle: "session", createdAt: new Date().toISOString(), ...(meta.sessionKey ? { sessionKey: meta.sessionKey } : {}) };
  vault.write(entryPath(assetId), JSON.stringify(entry, null, 1));
  return { entry: { ...entry, path: entryPath(assetId) }, reused: false, warnings: formatAssetIssues(v) };
}

/** 에이전트에게 돌려줄 짧은 설명 — 자리 목록과 반복 단위. */
export function describeAssetV3(asset: AssetV3) {
  const fields = collectFields(asset.nodes);
  const repeats = [...new Set(fields.filter((f) => f.repeat).map((f) => f.repeat!))];
  return {
    assetId: asset.assetId,
    title: asset.title,
    fields: fields.map((f) => ({ id: f.field.id, type: f.field.type, label: f.label ?? f.field.hint ?? null, ...(f.repeat ? { repeat: f.repeat } : {}) })),
    repeats,
  };
}

function findBlock(doc: VDocDocument, blockId: string): LayoutBlock | null {
  for (const p of doc.pages) {
    const b = p.blocks.find((x) => x.blockId === blockId);
    if (b) return b;
  }
  return null;
}

const newDiffId = () => `stg-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function assetChange(
  path: string,
  doc: VDocDocument,
  asset: AssetV3,
  payload: Extract<V2StagedChange, { targetKind: "asset-blocks" }>["payload"],
  title: string,
  runId?: string
): V2StagedChange {
  return {
    path,
    diffId: newDiffId(),
    phase: "drafting",
    targetKind: "asset-blocks",
    targetId: payload.replaceBlockIds?.[0] ?? payload.anchorBlockId ?? asset.assetId,
    title,
    beforeSummary: payload.mode === "replace" ? `블록 ${payload.replaceBlockIds?.length ?? 0}개` : "(새로 놓기)",
    afterSummary: `${asset.title} · 블록 ${payload.blocks.length}개`,
    payload,
    sourceReferenceIds: [],
    docId: doc.docId,
    runId,
    harnessId: "composer",
    createdAt: new Date().toISOString(),
  } as V2StagedChange;
}

export interface AssetToolDeps {
  readonly clientTool: (name: string) => Pick<WorkspaceTool, "name" | "description" | "risk" | "inputSchema">;
  readonly stage: (env: Pick<V2AiEnv, "store" | "sessionKey">, changes: readonly V2StagedChange[]) => void;
}

export function createAssetV3Tools(env: V2AiEnv, deps: AssetToolDeps): WorkspaceTool<any>[] {
  const { clientTool, stage } = deps;
  const need = (assetId: unknown): AssetV3 => {
    const id = String(assetId ?? "").trim();
    const hit = id ? readAssetV3(env.vault, id) : null;
    if (!hit) throw new Error(`에셋을 찾지 못했습니다: ${id || "(빈 id)"} — assets.list 로 확인하거나 먼저 assets.register / assets.capture 로 만드세요.`);
    return hit.asset;
  };

  const syncBlocksWithActiveStyle = (
    blocks: LayoutBlock[],
    doc: VDocDocument,
    docPath: string,
    styleOpts?: BlockStyleApplyOptions
  ): LayoutBlock[] => {
    const pendingStyle = findPendingStyleChange(env, docPath);
    const catalog = collectVaultStyleEntries(env.vault);
    const activePack = pendingStyle?.payload.stylePack ?? resolveActiveStyleEntry(doc, env.vault, catalog, docPath)?.pack ?? null;
    const resolvedPack = activePack ? resolveStylePack(activePack, pendingStyle?.payload.styleRef?.mode ?? doc.styleRef?.mode) : null;
    const hasExplicitOpts = Boolean(
      styleOpts?.styleKey || styleOpts?.cellRoleMap || styleOpts?.clearInlineCellStyles !== undefined || styleOpts?.prefix !== undefined
    );
    return blocks.map((block): LayoutBlock => {
      if (hasExplicitOpts) {
        return applyStyleOptionsToBlock(block, resolvedPack, styleOpts ?? {});
      }
      if (resolvedPack && (block.kind === "structured-table" || block.kind === "table") && block.styleKey) {
        const tbl = block as StructuredTableBlockDef;
        const tableGrid = resolveTableGridStyle(resolvedPack, tbl.styleKey);
        if (tableGrid.columnWidths && tableGrid.columnWidths.length === tbl.columnWidths.length) {
          return { ...tbl, columnWidths: [...tableGrid.columnWidths] };
        }
      }
      return block;
    });
  };

  const commitProposal = (change: V2StagedChange, revisionOf?: string): { diffId: string; revised: boolean } => {
    const revId = revisionOf?.trim();
    if (revId) {
      const tagged = env.sessionKey ? { ...change, sessionKey: env.sessionKey } : change;
      const revised = env.store.getState().revise(revId, tagged);
      return { diffId: revised ? revId : change.diffId, revised };
    }
    stage(env, [change]);
    return { diffId: change.diffId, revised: false };
  };

  interface ProposeArgs {
    readonly assetId?: string;
    readonly dsl?: string | string[];
    readonly scope?: "element" | "section" | "page";
    readonly style?: AssetStyleCompanion;
    readonly saveAsset?: boolean;
    readonly mode?: "replace" | "insert";
    readonly replaceBlockIds?: string[];
    readonly afterBlockId?: string;
    readonly sourceBlockIds?: string[];
    readonly items?: SourceItem[];
    readonly records?: AssetRecords;
    readonly styleKey?: string;
    readonly cellRoleMap?: Record<string, string>;
    readonly clearInlineCellStyles?: boolean;
    readonly syncColumnWidths?: boolean;
    readonly revisionOf?: string;
    readonly intentNote?: string;
    readonly title?: string;
  }

  const runUnifiedProposal = (args: ProposeArgs, ctx?: ToolRunContext) => {
    let asset: AssetV3;
    let inlineDsl = false;
    let assetSaved = false;

    const explicitAssetId = args?.assetId?.trim();
    const rawDsl = args?.dsl;
    const hasInlineDsl =
      (typeof rawDsl === "string" && rawDsl.trim().length > 0) ||
      (Array.isArray(rawDsl) && rawDsl.some((l) => typeof l === "string" && l.trim().length > 0));

    if (explicitAssetId) {
      asset = need(explicitAssetId);
    } else if (rawDsl !== undefined) {
      if (!hasInlineDsl) {
        throw new Error("인라인 DSL 이 비어 있습니다. 유효한 .vsyntax 구조 문법을 전달하세요.");
      }
      const liveSnapshot = loadLiveVsyntaxSnapshot(env.vault);
      const compiled = compileVsyntaxDslToAssetV3(rawDsl, {
        title: args?.title?.trim() || "인라인 구조 재편",
        scope: args?.scope ?? "element",
        style: args?.style,
        origin: { sourceType: "attachment" },
        registry: liveSnapshot,
      });
      if (!compiled.validation.ok) {
        throw new Error(
          `인라인 에셋 DSL 이 사양에 맞지 않습니다. 고쳐서 다시 제안하세요.\n${formatAssetIssues(compiled.validation)}`
        );
      }
      inlineDsl = true;
      if (args?.saveAsset === true) {
        const reg = registerAssetV3(env.vault, compiled.asset, { sessionKey: env.sessionKey });
        asset = reg.entry.asset;
        assetSaved = true;
      } else {
        const fp = skeletonFingerprint(compiled.asset.nodes);
        asset = {
          ...compiled.asset,
          assetId: `inline-dsl-${fp.slice(0, 8)}`,
          dsl: renderAssetV3ToVsyntaxDsl(compiled.asset),
        };
      }
    } else {
      throw new Error("assetId(등록된 에셋) 또는 dsl(.vsyntax 인라인 구조 문법) 중 하나가 필요합니다.");
    }

    const { path, doc } = requireDoc(env);
    const replaceIds = Array.isArray(args?.replaceBlockIds) ? args.replaceBlockIds.filter(Boolean) : [];
    const mode: "replace" | "insert" = args?.mode ?? (replaceIds.length > 0 ? "replace" : "insert");
    if (mode === "replace" && replaceIds.length === 0) {
      throw new Error("mode='replace' 에는 replaceBlockIds 가 필요합니다.");
    }
    const anchorBlockId = args?.afterBlockId?.trim() || replaceIds[0];

    // 1) 기존 블록 자동 추출 (sourceBlockIds 명시 시, 또는 replace 에서 새 데이터 없이 구조 이관할 때)
    const explicitItems = Array.isArray(args?.items) && args.items.length > 0 ? args.items : null;
    const explicitRecords =
      args?.records && typeof args.records === "object" && Object.keys(args.records).length > 0 ? args.records : null;
    const sourceIds = Array.isArray(args?.sourceBlockIds)
      ? args.sourceBlockIds.filter(Boolean)
      : mode === "replace" && !explicitItems && !explicitRecords
        ? replaceIds
        : [];
    const sourceBlocks = sourceIds
      .map((id) => findBlock(doc, id))
      .filter((b): b is LayoutBlock => Boolean(b));

    let baseRecords: Record<string, string | AssetRecords[]> = {};
    const keepSlotIds: Record<string, string> = {};
    let preserved: { kept: number; total: number } | undefined;
    let baseUnmapped: string[] = [];

    if (sourceBlocks.length > 0) {
      const src = decomposeBlocks({ blocks: sourceBlocks, slots: doc.slots });
      const srcItems = recordsToItems(src.nodes, src.records);
      const srcMap = mapItemsToAsset(srcItems, asset);
      baseRecords = { ...(srcMap.records as Record<string, string | AssetRecords[]>) };
      baseUnmapped = [...srcMap.unmapped];
      const srcFields = collectFields(src.nodes);
      for (const m of srcMap.matches) {
        if (m.from.includes(".")) continue;
        const f = srcFields.find((x) => !x.repeat && (x.label ?? x.field.hint ?? x.field.id) === m.from);
        const sid = f ? src.slotOf[f.field.id] : undefined;
        if (sid) keepSlotIds[m.to] = sid;
      }
      const plain = (s: string) => s.replace(/<[^>]*>/g, "").trim();
      const totalSrc = srcItems
        .flatMap((i) => (i.rows ? i.rows.flatMap((r) => Object.values(r)) : [i.value ?? ""]))
        .filter((v) => plain(v)).length;
      if (totalSrc > 0 && !explicitItems && !explicitRecords) {
        const appliedRes = applyAssetToBlocks({ blocks: sourceBlocks, slots: doc.slots }, asset);
        preserved = appliedRes.preserved;
      }
    }

    // 2) 에이전트가 넘긴 items / records 병합 (오버라이드)
    const mapped = explicitItems ? mapItemsToAsset(explicitItems, asset) : null;
    const mergedRecords: AssetRecords = {
      ...baseRecords,
      ...(mapped ? (mapped.records as Record<string, string | AssetRecords[]>) : undefined),
      ...explicitRecords,
    };

    const inst = instantiateAssetV3(asset, mergedRecords, {
      idPrefix: `as${Date.now().toString(36).slice(-4)}`,
      ...(Object.keys(keepSlotIds).length > 0 ? { keepSlotIds } : {}),
    });
    const styledBlocks = syncBlocksWithActiveStyle(inst.blocks, doc, path, {
      styleKey: args?.styleKey,
      cellRoleMap: args?.cellRoleMap,
      clearInlineCellStyles: args?.clearInlineCellStyles,
      syncColumnWidths: args?.syncColumnWidths,
    });

    const leftoverList = [
      ...(mapped ? mapped.unmapped : inst.report.leftover.map((l) => l.key)),
      ...(!explicitItems && !explicitRecords ? baseUnmapped : []),
    ];

    // 완전 불일치 가드: 에이전트가 명시적으로 데이터를 넘겼는데 필드 키가 하나도 맞지 않은 경우
    // 빈 쓰레기 카드를 Staged 대기열에 올리지 않고 유효한 필드 목록과 함께 반환해 즉시 재시도하게 한다.
    const hadExplicitData = Boolean(explicitItems || explicitRecords);
    if (hadExplicitData && inst.report.filled === 0 && leftoverList.length > 0) {
      return {
        staged: false,
        error: "전달한 데이터 키가 에셋 필드와 하나도 일치하지 않아 대기열에 올리지 않았습니다. validFields 의 id 또는 label 로 맞춰 다시 호출하세요.",
        validFields: describeAssetV3(asset),
        filled: 0,
        empty: inst.report.empty,
        leftover: leftoverList,
      };
    }

    const firstReplaceBlock = replaceIds[0] ? findBlock(doc, replaceIds[0]) : null;
    const badge = inlineDsl && !assetSaved ? "[DSL]" : "[에셋]";
    const defaultTitle =
      args?.title?.trim() ||
      (mode === "replace"
        ? `${badge} ${firstReplaceBlock?.title || replaceIds[0]} → ${asset.title}`
        : `${badge} ${asset.title} 놓기`);
    const intentNote = args?.intentNote?.trim() || undefined;

    const change = assetChange(
      path,
      doc,
      asset,
      {
        assetId: asset.assetId,
        mode,
        ...(anchorBlockId ? { anchorBlockId } : {}),
        ...(replaceIds.length > 0 ? { replaceBlockIds: replaceIds } : {}),
        blocks: styledBlocks,
        slots: inst.slots,
        report: {
          filled: inst.report.filled,
          empty: inst.report.empty.length,
          leftover: leftoverList,
          ...(preserved ? { preserved } : {}),
        },
        ...(intentNote ? { intentNote } : {}),
      },
      defaultTitle,
      ctx?.callId
    );
    const committed = commitProposal(change, args?.revisionOf);
    const outline = readVDoc(env, path)?.outlineRef
      ? "이 문서는 .outline 과 연결돼 있습니다 — 승인 시 연결된 .outline 의 해당 섹션에도 DSL 구조가 자동 동기화됩니다."
      : undefined;

    return {
      staged: true,
      revised: committed.revised,
      diffId: committed.diffId,
      mode,
      inlineDsl,
      assetSaved,
      stagedBlockIds: styledBlocks.map((b) => b.blockId),
      appliedStyleKeys: styledBlocks.map((b) => b.styleKey ?? null),
      filled: inst.report.filled,
      empty: inst.report.empty,
      repeats: inst.report.repeats,
      ...(preserved ? { preserved } : {}),
      ...(mapped
        ? { matches: mapped.matches, unmapped: mapped.unmapped, missing: mapped.missing }
        : { leftover: leftoverList }),
      ...(outline ? { note: outline } : {}),
    };
  };

  return [
    {
      ...clientTool("schema.inspect"),
      describe: (args: { elementId?: string }) =>
        args?.elementId ? `구조·스타일 스키마 조회 (${args.elementId})` : "라이브 구조(.vsyntax)·스타일(.vstyle) 스키마 조회",
      run: (args?: { elementId?: string }) => {
        const snapshot = loadLiveVsyntaxSnapshot(env.vault);
        const filterId = args?.elementId?.trim().toLowerCase();
        const elements = filterId
          ? snapshot.elements.filter((e) => e.id.toLowerCase() === filterId || e.viewTag.toLowerCase() === filterId)
          : snapshot.elements;

        const docPath = env.activeDocPath();
        const doc = readVDoc(env, docPath);
        const styleCatalog = collectVaultStyleEntries(env.vault);
        const activeStyle = doc ? resolveActiveStyleEntry(doc, env.vault, styleCatalog, docPath) : styleCatalog[0] ?? null;

        return {
          syntaxRegistryPath: STANDARD_SYNTAX_PATH,
          version: snapshot.version,
          updatedAt: snapshot.updatedAt,
          profiles: snapshot.profiles.map((p) => ({
            id: p.id,
            label: p.label,
            unitKind: p.unitKind,
            width: p.surface.width,
            allowedElementIds: p.allowedElementIds,
          })),
          elements: elements.map((el) => ({
            id: el.id,
            viewTag: el.viewTag,
            label: el.label,
            description: el.description,
            rules: el.rules.map((r) => ({
              id: r.id,
              symbol: r.symbol,
              primitive: r.primitive,
              position: r.position,
              description: r.description,
            })),
          })),
          assetSpec: {
            schema: "vibe-asset/3",
            primitives: ASSET_PRIMITIVES,
            components: ASSET_COMPONENTS.map((c) => ({ id: c.id, label: c.label, roles: c.roles })),
            roles: {
              fixed: ASSET_ROLES.filter((r) => r.kind === "fixed").map((r) => ({ id: r.id, label: r.label })),
              fill: ASSET_ROLES.filter((r) => r.kind === "fill").map((r) => ({ id: r.id, label: r.label })),
            },
            fieldTypes: FIELD_TYPES,
            dslSyntax: {
              repeatRow: "* {{col1}} | {{col2}} (또는 *[repeatId] ...)",
              dynamicVerticalMerge: "{{category:text^|구분}} — 연속 행의 같은 값을 자동 rowSpan 병합(mergeSame)",
              staticMerges: "[<] 왼쪽 가로 병합(colSpan), [^] 위쪽 세로 병합(rowSpan), 트리 들여쓰기(group-label rowspan)",
              rolePrefix: "{group-label}제목, {sub-label}하위항목, {total}{{합계:currency}}",
              multiColumnMedia: "[img:{{left_img|좌측 사진}}] | [img:{{right_img|우측 사진}}] — 가로 나란히 다단 사진 스트립(columns-grid, cardStyle='plain')",
              columnsContainer: "<<view:columns:strip>> 아래에 [img:...] 또는 텍스트 항목을 들여쓰기해 스타일 변형이 결합된 다단 구성",
              inlineDslPropose: "assets.propose({ dsl, records, mode, replaceBlockIds, styleKey }) — 일회성 구조 재편은 영구 에셋 파일을 만들지 않고 DSL 규칙 검증을 거쳐 바로 Staged 제안 (재사용 템플릿일 때만 saveAsset: true 또는 assets.register 사용)",
              exampleTable: [
                "<<view:table>> 요구사항 목록표",
                "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
                "  * {{seq:number|순번}} | {{category:text^|구분}} | {{req_id:text|요구사항 고유번호}} | {{req_name:text|요구사항 명}}",
              ],
            },
          },
          activeStylePack: activeStyle
            ? {
              id: activeStyle.pack.id,
              name: activeStyle.pack.name,
              target: activeStyle.pack.target ?? null,
              vaultPath: activeStyle.vaultPath ?? null,
              styleCategories: Object.keys(activeStyle.pack.styles ?? {}),
              tableVariants: Object.keys(activeStyle.pack.styles.table ?? {}),
              textStyles: Object.keys(activeStyle.pack.styles.text ?? {}),
              bindings: Object.keys(activeStyle.pack.bindings ?? {}),
              extensions: activeStyle.pack.extensions ? Object.keys(activeStyle.pack.extensions) : [],
            }
            : null,
        };
      },
    },
    {
      ...clientTool("assets.register"),
      describe: (args: { title?: string; asset?: { title?: string } }) =>
        `에셋 등록 (${args?.title ?? args?.asset?.title ?? "제목 없음"})`,
      run: (args: {
        title?: string;
        scope?: "element" | "section" | "page";
        dsl?: string | string[];
        style?: AssetStyleCompanion;
        summary?: string;
        uncertain?: string[];
        asset?: Partial<AssetV3> & { dsl?: string | string[] };
        replaceAssetId?: string;
      }) => {
        const rawDsl = args?.dsl ?? args?.asset?.dsl;
        let resolvedAsset: AssetV3;

        if (rawDsl && (!args?.asset?.nodes || args.asset.nodes.length === 0)) {
          const title = (args?.title ?? args?.asset?.title ?? "").trim();
          if (!title) throw new Error("dsl 로 에셋을 등록할 때는 title 이 필요합니다.");
          const liveSnapshot = loadLiveVsyntaxSnapshot(env.vault);
          const compiled = compileVsyntaxDslToAssetV3(rawDsl, {
            title,
            scope: args?.scope ?? args?.asset?.scope ?? "element",
            assetId: args?.asset?.assetId,
            summary: args?.summary ?? args?.asset?.summary,
            style: args?.style ?? args?.asset?.style,
            uncertain: args?.uncertain ?? args?.asset?.uncertain,
            origin: args?.asset?.origin ?? { sourceType: "attachment" },
            registry: liveSnapshot,
          });
          if (!compiled.validation.ok) {
            throw new Error(
              `에셋 DSL 이 사양에 맞지 않습니다. 고쳐서 다시 등록하세요.\n${formatAssetIssues(compiled.validation)}`
            );
          }
          resolvedAsset = compiled.asset;
        } else if (args?.asset && typeof args.asset === "object") {
          resolvedAsset = args.asset as AssetV3;
        } else {
          throw new Error("dsl(권장: .vsyntax 구조 문법 + title) 또는 asset(vibe-asset/3 JSON) 이 필요합니다.");
        }

        const { entry, reused, warnings } = registerAssetV3(env.vault, resolvedAsset, {
          sessionKey: env.sessionKey,
          replaceAssetId: args.replaceAssetId,
        });
        return {
          ok: true,
          reused,
          ...describeAssetV3(entry.asset),
          dsl: entry.asset.dsl ?? renderAssetV3ToVsyntaxDsl(entry.asset),
          fingerprint: entry.fingerprint,
          note: reused ? "같은 구조의 에셋이 이미 있어 그것을 씁니다." : "에셋을 등록했습니다.",
          ...(warnings ? { warnings } : {}),
        };
      },
    },
    {
      ...clientTool("assets.capture"),
      describe: (args: { blockIds?: string[] }) => `문서 블록 ${args?.blockIds?.length ?? 0}개를 에셋으로`,
      run: (args: { blockIds: string[]; title?: string }) => {
        const { path, doc } = requireDoc(env);
        const ids = Array.isArray(args?.blockIds) ? args.blockIds : [];
        const blocks = ids.map((id) => findBlock(doc, id)).filter((b): b is LayoutBlock => Boolean(b));
        if (!blocks.length) throw new Error("에셋으로 만들 블록을 찾지 못했습니다 (blockIds).");
        const solo = decomposeBlocks({ blocks, slots: doc.slots });
        const fp = skeletonFingerprint(solo.nodes);
        // 같은 모양의 다른 블록 = 같은 에셋의 다른 인스턴스 → 모두에서 같은 글은 구조(고정 글)
        const peers =
          blocks.length === 1
            ? doc.pages
              .flatMap((p) => p.blocks)
              .filter((b) => b.blockId !== blocks[0].blockId && b.kind === blocks[0].kind)
              .filter((b) => skeletonFingerprint(decomposeBlocks({ blocks: [b], slots: doc.slots }).nodes) === fp)
            : [];
        const d = peers.length ? decomposeBlocks({ blocks, slots: doc.slots }, { peers: peers.map((b) => ({ blocks: [b], slots: doc.slots })) }) : solo;
        const asset: AssetV3 = {
          schema: "vibe-asset/3",
          assetId: "",
          title: args?.title?.trim() || blocks[0].title || "문서에서 뽑은 에셋",
          scope: blocks.length > 1 ? "section" : "element",
          nodes: d.nodes,
          style: d.style,
          origin: { sourceType: "vdoc-capture", sourceRef: `vault://${path}#${ids.join(",")}` },
        };
        const { entry, reused } = registerAssetV3(env.vault, asset, { sessionKey: env.sessionKey });
        return {
          ok: true,
          reused,
          ...describeAssetV3(entry.asset),
          sameShapeBlocks: [blocks[0].blockId, ...peers.map((b) => b.blockId)],
          notes: d.notes,
        };
      },
    },
    {
      ...clientTool("assets.list"),
      describe: () => "통합 에셋 라이브러리 목록",
      run: () => {
        const v3Entries = listAssetsV3(env.vault);
        const seen = new Set(v3Entries.map((e) => e.asset.assetId));
        const unifiedVault = collectVaultAssets(env.vault)
          .filter((e) => !seen.has(e.asset.assetId))
          .map((e) => {
            const v3 = vDocAssetToV3(e.asset);
            return {
              ...describeAssetV3(v3),
              lifecycle: "saved" as const,
              origin: e.asset.origin.sourceType,
              fields: undefined,
              fieldCount: collectFields(v3.nodes).length,
            };
          });
        return {
          assets: [
            ...v3Entries.map((e) => {
              const fields = collectFields(e.asset.nodes);
              return {
                ...describeAssetV3(e.asset),
                lifecycle: e.lifecycle,
                origin: e.asset.origin?.sourceType ?? null,
                fields: undefined,
                fieldIds: fields.map((f) => f.field.id),
                fieldCount: fields.length,
                styleKeys: [
                  ...new Set(
                    e.asset.nodes
                      .map((n) => (n as { variant?: string; styleKey?: string }).variant ?? (n as { styleKey?: string }).styleKey)
                      .filter((v): v is string => Boolean(v))
                  ),
                ],
              };
            }),
            ...unifiedVault,
          ],
        };
      },
    },
    {
      ...clientTool("assets.propose"),
      describe: (args: { assetId?: string; title?: string; dsl?: unknown; mode?: string; revisionOf?: string }) =>
        args?.revisionOf
          ? `에셋 제안 수정 (${args.revisionOf})`
          : args?.assetId
            ? `에셋 ${args.assetId} ${args?.mode === "replace" ? "교체" : "제안"}`
            : `DSL 구조 ${args?.mode === "replace" ? "교체" : "제안"} (${args?.title ?? "인라인"})`,
      run: (args: ProposeArgs, ctx?: ToolRunContext) => runUnifiedProposal(args, ctx),
    },
    {
      ...clientTool("assets.instantiate"),
      describe: (args: { assetId?: string; revisionOf?: string }) =>
        args?.revisionOf ? `에셋 제안 수정 (${args.revisionOf})` : `에셋 ${args?.assetId ?? ""} 놓기`,
      run: (
        args: {
          assetId: string;
          items?: SourceItem[];
          records?: AssetRecords;
          afterBlockId?: string;
          replaceBlockIds?: string[];
          sourceBlockIds?: string[];
          styleKey?: string;
          cellRoleMap?: Record<string, string>;
          clearInlineCellStyles?: boolean;
          syncColumnWidths?: boolean;
          revisionOf?: string;
          intentNote?: string;
        },
        ctx?: ToolRunContext
      ) =>
        runUnifiedProposal(
          {
            ...args,
            mode: Array.isArray(args?.replaceBlockIds) && args.replaceBlockIds.length > 0 ? "replace" : "insert",
          },
          ctx
        ),
    },
    {
      ...clientTool("assets.apply"),
      describe: (args: { assetId?: string; blockIds?: string[] }) => `블록 ${args?.blockIds?.length ?? 0}개를 에셋 ${args?.assetId ?? ""} 모양으로`,
      run: (
        args: {
          assetId: string;
          blockIds: string[];
          mode?: "replace" | "insert";
          items?: SourceItem[];
          records?: AssetRecords;
          styleKey?: string;
          cellRoleMap?: Record<string, string>;
          clearInlineCellStyles?: boolean;
          syncColumnWidths?: boolean;
          revisionOf?: string;
          intentNote?: string;
        },
        ctx?: ToolRunContext
      ) => {
        const asset = need(args?.assetId);
        const { path, doc } = requireDoc(env);
        const ids = Array.isArray(args?.blockIds) ? args.blockIds : [];
        if (!ids.length) throw new Error("blockIds 가 비었습니다.");

        // 새 데이터(items/records) 또는 revisionOf 를 함께 넘긴 경우 통합 파이프라인으로 처리
        const hasOverrides =
          (Array.isArray(args?.items) && args.items.length > 0) ||
          (args?.records && typeof args.records === "object" && Object.keys(args.records).length > 0) ||
          Boolean(args?.revisionOf) ||
          args?.mode === "insert";
        if (hasOverrides) {
          return runUnifiedProposal(
            {
              assetId: args.assetId,
              mode: args.mode ?? "replace",
              replaceBlockIds: ids,
              afterBlockId: ids[0],
              sourceBlockIds: ids,
              items: args.items,
              records: args.records,
              styleKey: args.styleKey,
              cellRoleMap: args.cellRoleMap,
              clearInlineCellStyles: args.clearInlineCellStyles,
              syncColumnWidths: args.syncColumnWidths,
              revisionOf: args.revisionOf,
              intentNote: args.intentNote,
            },
            ctx
          );
        }

        const styleOpts: BlockStyleApplyOptions | undefined =
          args?.styleKey || args?.cellRoleMap || args?.clearInlineCellStyles !== undefined
            ? {
                styleKey: args.styleKey,
                cellRoleMap: args.cellRoleMap,
                clearInlineCellStyles: args.clearInlineCellStyles,
                syncColumnWidths: args.syncColumnWidths,
              }
            : undefined;
        const results: unknown[] = [];
        const changes: V2StagedChange[] = [];
        const stagedBlockIds: string[] = [];
        const intentNote = args?.intentNote?.trim() || undefined;
        for (const id of ids) {
          const block = findBlock(doc, id);
          if (!block) {
            results.push({ blockId: id, error: "없는 블록" });
            continue;
          }
          if (block.locked) {
            results.push({ blockId: id, error: "잠긴 블록" });
            continue;
          }
          const res = applyAssetToBlocks({ blocks: [block], slots: doc.slots }, asset, { idPrefix: `ap${Date.now().toString(36).slice(-4)}${changes.length}` });
          // 원본 보호 가드: 기존 블록에 채워진 값이 있었는데 컬럼/항목명이 달라 1건도 자동 이관되지 않은 경우,
          // 빈 껍데기 표로 덮어쓰지 않고 차단해 AI 가 의미를 맞춰 assets.propose(items/records) 로 재호출하게 한다.
          if (res.preserved.total > 0 && res.preserved.kept === 0) {
            results.push({
              blockId: id,
              staged: false,
              error:
                "기존 블록의 항목/열 구조가 대상 에셋과 달라 자동 이관된 값이 0건입니다. 빈 표로 덮어쓰지 않고 차단했습니다. 원본 블록 내용을 읽어 의미에 맞게 items 또는 records 로 매핑한 뒤 assets.propose(replaceBlockIds, items/records) 를 호출하세요.",
              preserved: res.preserved,
              unmapped: res.map.unmapped,
              missing: res.map.missing,
              validFields: describeAssetV3(asset),
            });
            continue;
          }
          const styledBlocks = syncBlocksWithActiveStyle(res.blocks, doc, path, styleOpts);
          stagedBlockIds.push(...styledBlocks.map((b) => b.blockId));
          changes.push(
            assetChange(
              path,
              doc,
              asset,
              {
                assetId: asset.assetId,
                mode: "replace",
                anchorBlockId: id,
                replaceBlockIds: [id],
                blocks: styledBlocks,
                slots: res.slots,
                report: { filled: res.report.filled, empty: res.report.empty.length, leftover: res.map.unmapped, preserved: res.preserved },
                ...(intentNote ? { intentNote } : {}),
              },
              `[에셋] ${block.title || id} → ${asset.title}`,
              ctx?.callId
            )
          );
          results.push({ blockId: id, preserved: res.preserved, unmapped: res.map.unmapped, missing: res.map.missing });
        }
        if (changes.length) stage(env, changes);
        const outline = readVDoc(env, path)?.outlineRef ? "이 문서는 .outline 과 연결돼 있습니다 — 다음 구조 컴파일 전에 outline 쪽에도 같은 모양을 반영해야 합니다." : undefined;
        return { staged: changes.length, diffIds: changes.map((c) => c.diffId), stagedBlockIds, results, ...(outline ? { note: outline } : {}) };
      },
    },
  ];
}
