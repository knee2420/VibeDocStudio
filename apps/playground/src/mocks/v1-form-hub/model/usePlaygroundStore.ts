import { create } from "zustand";
import type { OutlineNode } from "@vibe/outliner";
import { getBlockSlotIds, type TableCommand, type WebFormVariant } from "@vibe/vdoc-schema";
import {
  extractPhase2Links,
  parseContainerDirective,
  type Phase2LinkExtraction,
  resolveAssetIdFromHint,
  resolveNodesForLinkedDoc,
  stripLinkTags,
} from "./documentLinkParser";
import {
  compileTableViewWithAgent,
  computeSourceHash,
} from "./aiTableCompiler";
import { BLOCK_ASSET_CATALOG, compileSourceNodesToViewRows } from "./formAssets";
import {
  applyPlaygroundTableCommand,
  applySlotEditToNodes,
  compilePlaygroundToVDoc,
  type CompiledPlaygroundResult,
  syncOutlinerToPlaygroundNodes,
  tableBlockToPlaygroundNodes,
  toOutlinerNodes,
  updatePlaygroundNode,
} from "./playgroundCompiler";
import { clonePlaygroundPreset } from "./presets";
import type {
  AiCompileStatus,
  BlockVariantId,
  DensityPreset,
  DocumentTheme,
  FormAssetId,
  LayoutChoice,
  PlaygroundDocSpec,
  PlaygroundMode,
  PlaygroundNode,
  PlaygroundPresetId,
  SurfaceKind,
  TableBlockOverride,
  TableViewCacheEntry,
} from "./types";

function collectNodeIds(node: PlaygroundNode, acc = new Set<string>()): Set<string> {
  acc.add(node.id);
  for (const child of node.children) collectNodeIds(child, acc);
  return acc;
}

export function findPlaygroundNode(
  nodes: readonly PlaygroundNode[],
  nodeId: string
): PlaygroundNode | undefined {
  for (const n of nodes) {
    if (n.id === nodeId) return n;
    const found = findPlaygroundNode(n.children, nodeId);
    if (found) return found;
  }
  return undefined;
}

function defaultAssetForDoc(
  presetId: PlaygroundPresetId,
  linkExtraction: Phase2LinkExtraction,
  activeDocId: string | null
): FormAssetId {
  if (presetId === "workshop-request" || presetId === "blank") {
    const doc = linkExtraction.documents.find((d) => d.id === activeDocId);
    if (!doc) return "asset-general-doc";
    const fmt = doc.docFormat?.toLowerCase();
    if (fmt === "blog" || fmt === "text" || fmt === "raw" || fmt === "plain" || fmt?.includes("web")) {
      return "asset-general-doc";
    }
    if (/설문|조사/.test(doc.title)) return "asset-survey-sheet";
    return "asset-approval-plan";
  }
  return "asset-general-doc";
}

function computeDerivedLinkState(
  presetId: PlaygroundPresetId,
  spec: PlaygroundDocSpec,
  slotOverrides: Record<string, string>,
  preferredDocId: string | null,
  preferredPageId: string | null,
  docAssetOverrides: Record<string, FormAssetId>,
  pageAssetOverrides: Record<string, FormAssetId>,
  blockVariants: Record<string, BlockVariantId>,
  webFormTheme: WebFormVariant = "webform-card-google",
  tableOverrides: Record<string, TableBlockOverride> = {}
) {
  const linkExtraction = extractPhase2Links(spec);
  const activeDoc =
    linkExtraction.documents.find((d) => d.id === preferredDocId) ??
    linkExtraction.documents[0];
  const activeLinkedDocId = activeDoc?.id ?? null;

  const activePage =
    activeDoc?.pages.find((p) => p.id === preferredPageId) ?? activeDoc?.pages[0];
  const activeLinkedPageId = activePage?.id ?? null;

  const docBaseAsset = activeLinkedDocId
    ? docAssetOverrides[activeLinkedDocId] ??
      defaultAssetForDoc(presetId, linkExtraction, activeLinkedDocId)
    : "asset-general-doc";

  const activeAssetId: FormAssetId = activePage
    ? pageAssetOverrides[activePage.id] ??
      (activePage.assetHint
        ? resolveAssetIdFromHint(activePage.assetHint, activeDoc?.docFormat, docBaseTitleFallback(activeDoc, spec))
        : docBaseAsset)
    : docBaseAsset;

  const scopedNodes = resolveNodesForLinkedDoc(spec, activeDoc);
  const titleOverride =
    activeDoc && !activeDoc.isFallbackFullTree ? activeDoc.title : spec.title;

  const compiled = compilePlaygroundToVDoc(spec, slotOverrides, {
    nodesOverride: scopedNodes,
    titleOverride,
    assetId: docBaseAsset,
    pageAssetOverrides,
    linkedDoc: activeDoc,
    blockVariants,
    tableOverrides,
    webFormTheme,
  });

  return {
    linkExtraction,
    activeLinkedDocId,
    activeLinkedPageId,
    activeAssetId,
    compiled,
  };
}

function docBaseTitleFallback(
  activeDoc: Phase2LinkExtraction["documents"][number] | undefined,
  spec: PlaygroundDocSpec
): string {
  return activeDoc?.title ?? spec.title;
}

const EMPTY_AI_COMPILE_STATUS: AiCompileStatus = {
  runningBlockId: null,
  runningVariantId: null,
  streamPreview: "",
  error: null,
  activeEngineLabel: null,
};

let activeAiCompileAbort: AbortController | null = null;

function tableCacheKey(blockId: string, variantId: BlockVariantId): string {
  return `${blockId}::${variantId}`;
}

function splitTableNodeChildren(tableNode: PlaygroundNode | undefined): {
  sourceRows: PlaygroundNode[];
  viewNode: PlaygroundNode | undefined;
} {
  if (!tableNode) return { sourceRows: [], viewNode: undefined };
  const viewNode = tableNode.children.find(
    (c) => parseContainerDirective(c.text).kind === "view"
  );
  const sourceRows = tableNode.children.filter(
    (c) =>
      parseContainerDirective(c.text).kind !== "view" &&
      (stripLinkTags(c.text).length > 0 || c.children.length > 0)
  );
  return { sourceRows, viewNode };
}

function writeViewRowsToTableNode(
  spec: PlaygroundDocSpec,
  tableId: string,
  nextViewRows: PlaygroundNode[]
): PlaygroundDocSpec {
  return {
    ...spec,
    nodes: updatePlaygroundNode(spec.nodes, tableId, (n) => {
      const viewIdx = n.children.findIndex(
        (c) => parseContainerDirective(c.text).kind === "view"
      );
      if (viewIdx >= 0) {
        const nextChildren = [...n.children];
        nextChildren[viewIdx] = {
          ...n.children[viewIdx],
          children: nextViewRows,
        };
        return { ...n, children: nextChildren };
      }
      const createdView: PlaygroundNode = {
        id: `${tableId}-view`,
        role: "body",
        layoutChoice: "text",
        text: "<<view:table>>",
        note: "",
        children: nextViewRows,
      };
      return { ...n, children: [...n.children, createdView] };
    }),
  };
}

export interface PlaygroundState {
  presetId: PlaygroundPresetId;
  spec: PlaygroundDocSpec;
  mode: PlaygroundMode;
  slotOverrides: Record<string, string>;
  outlinerRoots: OutlineNode[];
  linkExtraction: Phase2LinkExtraction;
  activeLinkedDocId: string | null;
  activeLinkedPageId: string | null;
  activeAssetId: FormAssetId;
  docAssetOverrides: Record<string, FormAssetId>;
  pageAssetOverrides: Record<string, FormAssetId>;
  blockVariants: Record<string, BlockVariantId>;
  tableOverrides: Record<string, TableBlockOverride>;
  viewCache: Record<string, TableViewCacheEntry>;
  dirtyViewBlocks: Record<string, boolean>;
  aiCompileStatus: AiCompileStatus;
  webFormTheme: WebFormVariant;
  selectedBlockId: string | null;
  compiled: CompiledPlaygroundResult;
  selectedSlotId: string | null;
  focusRequest: { nodeId: string; seq: number } | null;

  selectPreset: (presetId: PlaygroundPresetId) => void;
  reset: () => void;
  setMode: (mode: PlaygroundMode, options?: { selectedSlotId?: string | null }) => void;
  setSelectedSlotId: (slotId: string | null) => void;
  selectBlock: (blockId: string | null) => void;
  setBlockVariant: (blockId: string, variantId: BlockVariantId) => void;
  applyTableViewToCache: (blockId: string) => void;
  revertTableViewToCache: (blockId: string) => void;
  runTableAiCompile: (
    blockId: string,
    variantId: BlockVariantId,
    userFeedback?: string
  ) => Promise<void>;
  cancelAiCompile: () => void;
  setWebFormTheme: (theme: WebFormVariant) => void;
  focusNodeInSheet: (nodeId: string) => void;
  focusLinkedTagNode: (nodeId: string, kind: "document" | "page") => void;
  selectLinkedDocument: (docId: string) => void;
  selectLinkedPage: (pageId: string | null) => void;
  selectAsset: (assetId: FormAssetId) => void;
  setTitle: (title: string) => void;
  changeNodeLayout: (nodeId: string, choice: LayoutChoice) => void;
  changeSurface: (surfaceKind: SurfaceKind) => void;
  changeDensity: (density: DensityPreset) => void;
  changeTheme: (theme: DocumentTheme) => void;
  commitOutlinerRoots: (nextRoots: OutlineNode[]) => void;
  updateSlotContent: (slotId: string, html: string) => void;
  runTableCommand: (
    pageId: string,
    blockId: string,
    sectionId: string | null,
    cmd: TableCommand
  ) => void;
}

function preserveCleanCacheBeforeExperiment(
  viewCache: Record<string, TableViewCacheEntry>,
  dirtyViewBlocks: Record<string, boolean>,
  preEditSpec: PlaygroundDocSpec,
  blockId: string,
  variantId: BlockVariantId
): {
  viewCache: Record<string, TableViewCacheEntry>;
  dirtyViewBlocks: Record<string, boolean>;
} {
  let nextCache = viewCache;
  if (!dirtyViewBlocks[blockId]) {
    const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
    if (rawMatch) {
      const tableNode = findPlaygroundNode(preEditSpec.nodes, rawMatch[1]);
      const { sourceRows, viewNode } = splitTableNodeChildren(tableNode);
      const key = tableCacheKey(blockId, variantId);
      if (sourceRows.length > 0 && viewNode && !nextCache[key]) {
        nextCache = {
          ...nextCache,
          [key]: {
            sourceHash: computeSourceHash(sourceRows),
            viewNodes: structuredClone(viewNode.children),
            generatedBy: "preset",
            updatedAt: Date.now(),
          },
        };
      }
    }
  }
  return {
    viewCache: nextCache,
    dirtyViewBlocks: { ...dirtyViewBlocks, [blockId]: true },
  };
}

function clearBlockSlotOverrides(
  slotOverrides: Record<string, string>,
  blockId: string
): Record<string, string> {
  const prefix = `pg_slot_${blockId}`;
  let changed = false;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(slotOverrides)) {
    if (k.startsWith(prefix)) {
      changed = true;
    } else {
      next[k] = v;
    }
  }
  return changed ? next : slotOverrides;
}

function buildInitial(presetId: PlaygroundPresetId) {
  const spec = clonePlaygroundPreset(presetId);
  const linkExtraction = extractPhase2Links(spec);
  const firstDocId = linkExtraction.documents[0]?.id ?? null;
  const docAssetOverrides: Record<string, FormAssetId> = {};
  const pageAssetOverrides: Record<string, FormAssetId> = {};
  const derived = computeDerivedLinkState(
    presetId,
    spec,
    {},
    firstDocId,
    null,
    docAssetOverrides,
    pageAssetOverrides,
    {}
  );
  return {
    presetId,
    spec,
    slotOverrides: {} as Record<string, string>,
    outlinerRoots: toOutlinerNodes(spec.nodes),
    ...derived,
    docAssetOverrides,
    pageAssetOverrides,
    blockVariants: {} as Record<string, BlockVariantId>,
    tableOverrides: {} as Record<string, TableBlockOverride>,
    viewCache: {} as Record<string, TableViewCacheEntry>,
    dirtyViewBlocks: {} as Record<string, boolean>,
    aiCompileStatus: EMPTY_AI_COMPILE_STATUS,
    webFormTheme: "webform-card-google" as WebFormVariant,
    selectedBlockId: null as string | null,
    selectedSlotId: null as string | null,
    focusRequest: null as { nodeId: string; seq: number } | null,
  };
}

function recompile(
  state: PlaygroundState,
  spec: PlaygroundDocSpec,
  slotOverrides = state.slotOverrides,
  tableOverrides = state.tableOverrides
) {
  return computeDerivedLinkState(
    state.presetId,
    spec,
    slotOverrides,
    state.activeLinkedDocId,
    state.activeLinkedPageId,
    state.docAssetOverrides,
    state.pageAssetOverrides,
    state.blockVariants,
    state.webFormTheme,
    tableOverrides
  );
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  ...buildInitial("workshop-request"),
  mode: "wysiwym",

  selectPreset: (presetId) => {
    activeAiCompileAbort?.abort();
    activeAiCompileAbort = null;
    set({ ...buildInitial(presetId), mode: "wysiwym" });
  },

  reset: () => {
    activeAiCompileAbort?.abort();
    activeAiCompileAbort = null;
    set({ ...buildInitial(get().presetId), mode: "wysiwym" });
  },

  setMode: (mode, options) =>
    set((state) => ({
      mode,
      selectedSlotId:
        mode === "wysiwym"
          ? null
          : options?.selectedSlotId !== undefined
            ? options.selectedSlotId
            : state.selectedSlotId,
    })),

  setSelectedSlotId: (selectedSlotId) => set({ selectedSlotId }),

  selectBlock: (selectedBlockId) =>
    set((state) => {
      const meta = selectedBlockId ? state.compiled.blockMetaMap[selectedBlockId] : undefined;
      if (!selectedBlockId || !meta) return { selectedBlockId: null };
      const blockPageId = meta.pageId ?? null;
      if (!blockPageId || blockPageId === state.activeLinkedPageId) {
        return { selectedBlockId };
      }
      const doc = state.linkExtraction.documents.find((d) => d.id === state.activeLinkedDocId);
      const page = doc?.pages.find((p) => p.id === blockPageId);
      const docBaseAsset = state.activeLinkedDocId
        ? state.docAssetOverrides[state.activeLinkedDocId] ??
          defaultAssetForDoc(state.presetId, state.linkExtraction, state.activeLinkedDocId)
        : "asset-general-doc";
      const nextAssetId = page
        ? state.pageAssetOverrides[page.id] ??
          (page.assetHint
            ? resolveAssetIdFromHint(page.assetHint, doc?.docFormat, doc?.title ?? state.spec.title)
            : docBaseAsset)
        : docBaseAsset;
      return {
        selectedBlockId,
        activeLinkedPageId: page ? page.id : state.activeLinkedPageId,
        activeAssetId: nextAssetId,
      };
    }),

  setBlockVariant: (blockId, variantId) => {
    let shouldTriggerAiCompile = false;

    set((state) => {
      const nextVariants = { ...state.blockVariants, [blockId]: variantId };
      const blockMeta = state.compiled.blockMetaMap[blockId];
      const blockPageId = blockMeta?.pageId ?? state.activeLinkedPageId;
      // 블록 에셋을 교체할 때는 이전 에셋 HTML이 남아 있던 해당 블록 슬롯의 slotOverrides 를 비워 새 에셋이 즉시 반영되게 한다.
      let nextOverrides = state.slotOverrides;
      if (Object.keys(state.slotOverrides).length > 0) {
        for (const page of state.compiled.doc.pages) {
          const matchedBlock = page.blocks.find((b) => b.blockId === blockId);
          if (!matchedBlock) continue;
          const blockSlotIds = getBlockSlotIds(matchedBlock);
          if (blockSlotIds.some((sid) => sid in nextOverrides)) {
            nextOverrides = { ...state.slotOverrides };
            for (const sid of blockSlotIds) {
              delete nextOverrides[sid];
            }
          }
          break;
        }
      }
      let nextTableOverrides = state.tableOverrides;
      if (blockId in state.tableOverrides) {
        nextTableOverrides = { ...state.tableOverrides };
        delete nextTableOverrides[blockId];
      }

      let nextSpec = state.spec;
      let nextViewCache = state.viewCache;
      const nextDirtyViewBlocks = { ...state.dirtyViewBlocks };
      delete nextDirtyViewBlocks[blockId];
      let nodesUpdated = false;
      const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
      if (rawMatch) {
        const tableId = rawMatch[1];
        const tableNode = findPlaygroundNode(state.spec.nodes, tableId);
        if (
          tableNode &&
          parseContainerDirective(tableNode.text).kind === "table" &&
          !stripLinkTags(tableNode.text)
        ) {
          const { sourceRows, viewNode } = splitTableNodeChildren(tableNode);
          if (sourceRows.length > 0) {
            const sourceHash = computeSourceHash(sourceRows);
            const prevVariant =
              state.blockVariants[blockId] ?? blockMeta?.defaultVariant;
            if (
              prevVariant &&
              prevVariant !== variantId &&
              viewNode &&
              !state.dirtyViewBlocks[blockId]
            ) {
              const prevKey = tableCacheKey(blockId, prevVariant);
              if (!nextViewCache[prevKey]) {
                nextViewCache = {
                  ...nextViewCache,
                  [prevKey]: {
                    sourceHash,
                    viewNodes: structuredClone(viewNode.children),
                    generatedBy: "preset",
                    updatedAt: Date.now(),
                  },
                };
              }
            }

            const targetKey = tableCacheKey(blockId, variantId);
            const cached = nextViewCache[targetKey];
            if (cached && cached.sourceHash === sourceHash && cached.viewNodes.length > 0) {
              nextSpec = writeViewRowsToTableNode(
                state.spec,
                tableId,
                structuredClone(cached.viewNodes)
              );
              nodesUpdated = true;
            } else {
              const fallbackRows = compileSourceNodesToViewRows(
                sourceRows,
                variantId,
                `pg_view_${tableId}_${Date.now()}`
              );
              nextSpec = writeViewRowsToTableNode(state.spec, tableId, fallbackRows);
              nodesUpdated = true;
              if (typeof window !== "undefined" && state.presetId !== "agui-protocol-demo") {
                shouldTriggerAiCompile = true;
              }
            }
          }
        }
      }

      return {
        spec: nextSpec,
        ...(nodesUpdated ? { outlinerRoots: toOutlinerNodes(nextSpec.nodes) } : {}),
        blockVariants: nextVariants,
        slotOverrides: nextOverrides,
        tableOverrides: nextTableOverrides,
        viewCache: nextViewCache,
        dirtyViewBlocks: nextDirtyViewBlocks,
        selectedBlockId: blockId,
        ...computeDerivedLinkState(
          state.presetId,
          nextSpec,
          nextOverrides,
          state.activeLinkedDocId,
          blockPageId,
          state.docAssetOverrides,
          state.pageAssetOverrides,
          nextVariants,
          state.webFormTheme,
          nextTableOverrides
        ),
      };
    });

    if (shouldTriggerAiCompile) {
      void get().runTableAiCompile(blockId, variantId);
    }
  },

  applyTableViewToCache: (blockId) =>
    set((state) => {
      const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
      if (!rawMatch) return state;
      const tableId = rawMatch[1];
      const tableNode = findPlaygroundNode(state.spec.nodes, tableId);
      const { sourceRows, viewNode } = splitTableNodeChildren(tableNode);
      const meta = state.compiled.blockMetaMap[blockId];
      const activeVar = state.blockVariants[blockId] ?? meta?.defaultVariant;
      if (sourceRows.length === 0 || !activeVar) return state;

      let nextSpec = state.spec;
      let nextViewRows = viewNode?.children ?? [];
      const tableOverride = state.tableOverrides[blockId];
      if (tableOverride) {
        const mergedSlots = { ...tableOverride.slots };
        for (const [sid, html] of Object.entries(state.slotOverrides)) {
          if (mergedSlots[sid]) {
            mergedSlots[sid] = { ...mergedSlots[sid], content: html, isEdited: true };
          }
        }
        nextViewRows = tableBlockToPlaygroundNodes(
          tableOverride.block,
          mergedSlots,
          nextViewRows
        );
        nextSpec = writeViewRowsToTableNode(nextSpec, tableId, nextViewRows);
      }

      if (nextViewRows.length === 0) return state;

      const nextTableOverrides = { ...state.tableOverrides };
      delete nextTableOverrides[blockId];
      const nextDirtyViewBlocks = { ...state.dirtyViewBlocks };
      delete nextDirtyViewBlocks[blockId];
      const key = tableCacheKey(blockId, activeVar);
      const nextViewCache: Record<string, TableViewCacheEntry> = {
        ...state.viewCache,
        [key]: {
          sourceHash: computeSourceHash(sourceRows),
          viewNodes: structuredClone(nextViewRows),
          generatedBy: "manual",
          updatedAt: Date.now(),
        },
      };

      return {
        spec: nextSpec,
        outlinerRoots: toOutlinerNodes(nextSpec.nodes),
        tableOverrides: nextTableOverrides,
        viewCache: nextViewCache,
        dirtyViewBlocks: nextDirtyViewBlocks,
        ...recompile(state, nextSpec, state.slotOverrides, nextTableOverrides),
      };
    }),

  revertTableViewToCache: (blockId) =>
    set((state) => {
      const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
      if (!rawMatch) return state;
      const tableId = rawMatch[1];
      const tableNode = findPlaygroundNode(state.spec.nodes, tableId);
      const { sourceRows } = splitTableNodeChildren(tableNode);
      const meta = state.compiled.blockMetaMap[blockId];
      const activeVar = state.blockVariants[blockId] ?? meta?.defaultVariant;
      if (sourceRows.length === 0 || !activeVar) return state;

      const sourceHash = computeSourceHash(sourceRows);
      const key = tableCacheKey(blockId, activeVar);
      const cached = state.viewCache[key];
      const restoredRows =
        cached && cached.sourceHash === sourceHash && cached.viewNodes.length > 0
          ? structuredClone(cached.viewNodes)
          : compileSourceNodesToViewRows(
              sourceRows,
              activeVar,
              `pg_view_${tableId}_${Date.now()}`
            );

      const nextSpec = writeViewRowsToTableNode(state.spec, tableId, restoredRows);
      const nextTableOverrides = { ...state.tableOverrides };
      delete nextTableOverrides[blockId];
      const nextDirtyViewBlocks = { ...state.dirtyViewBlocks };
      delete nextDirtyViewBlocks[blockId];
      const nextSlotOverrides = clearBlockSlotOverrides(state.slotOverrides, blockId);

      return {
        spec: nextSpec,
        outlinerRoots: toOutlinerNodes(nextSpec.nodes),
        slotOverrides: nextSlotOverrides,
        tableOverrides: nextTableOverrides,
        dirtyViewBlocks: nextDirtyViewBlocks,
        ...recompile(state, nextSpec, nextSlotOverrides, nextTableOverrides),
      };
    }),

  runTableAiCompile: async (blockId, variantId, userFeedback) => {
    const state = get();
    const rawMatch = /^pg_blk_(.+)_raw$/.exec(blockId);
    if (!rawMatch) return;
    const tableId = rawMatch[1];
    const tableNode = findPlaygroundNode(state.spec.nodes, tableId);
    const { sourceRows, viewNode } = splitTableNodeChildren(tableNode);
    const asset = BLOCK_ASSET_CATALOG.table.find((a) => a.id === variantId);
    if (!tableNode || sourceRows.length === 0 || !asset) return;

    if (activeAiCompileAbort) {
      activeAiCompileAbort.abort();
    }
    const abortCtrl = new AbortController();
    activeAiCompileAbort = abortCtrl;
    const sourceHashAtStart = computeSourceHash(sourceRows);

    set({
      blockVariants: { ...state.blockVariants, [blockId]: variantId },
      selectedBlockId: blockId,
      aiCompileStatus: {
        runningBlockId: blockId,
        runningVariantId: variantId,
        streamPreview: "",
        error: null,
        activeEngineLabel: null,
      },
    });

    try {
      const result = await compileTableViewWithAgent({
        sourceRows,
        asset,
        sectionTitle: state.compiled.blockMetaMap[blockId]?.label,
        currentViewRows: viewNode?.children,
        userFeedback,
        idPrefix: `pg_ai_${tableId}_${Date.now()}`,
        signal: abortCtrl.signal,
        onStatus: ({ engineLabel, streamPreview }) => {
          if (abortCtrl.signal.aborted) return;
          set((cur) => ({
            aiCompileStatus: {
              ...cur.aiCompileStatus,
              ...(engineLabel ? { activeEngineLabel: engineLabel } : null),
              ...(streamPreview !== undefined ? { streamPreview } : null),
            },
          }));
        },
      });

      if (abortCtrl.signal.aborted) return;

      set((cur) => {
        const latestTableNode = findPlaygroundNode(cur.spec.nodes, tableId);
        const { sourceRows: latestSource } = splitTableNodeChildren(latestTableNode);
        if (latestSource.length === 0) {
          return { aiCompileStatus: EMPTY_AI_COMPILE_STATUS };
        }
        const latestHash = computeSourceHash(latestSource);
        const targetHash = latestHash === sourceHashAtStart ? sourceHashAtStart : latestHash;

        const nextSpec = writeViewRowsToTableNode(
          cur.spec,
          tableId,
          result.viewNodes
        );
        const nextTableOverrides = { ...cur.tableOverrides };
        delete nextTableOverrides[blockId];
        const nextVariants = { ...cur.blockVariants, [blockId]: variantId };
        const cacheKey = tableCacheKey(blockId, variantId);
        const nextViewCache: Record<string, TableViewCacheEntry> = {
          ...cur.viewCache,
          [cacheKey]: {
            sourceHash: targetHash,
            viewNodes: structuredClone(result.viewNodes),
            generatedBy: "ai",
            promptNote: userFeedback?.trim() || undefined,
            modelLabel: result.modelLabel,
            updatedAt: Date.now(),
          },
        };
        const nextDirtyViewBlocks = { ...cur.dirtyViewBlocks };
        delete nextDirtyViewBlocks[blockId];
        const blockPageId = cur.compiled.blockMetaMap[blockId]?.pageId ?? cur.activeLinkedPageId;

        return {
          spec: nextSpec,
          outlinerRoots: toOutlinerNodes(nextSpec.nodes),
          blockVariants: nextVariants,
          tableOverrides: nextTableOverrides,
          viewCache: nextViewCache,
          dirtyViewBlocks: nextDirtyViewBlocks,
          aiCompileStatus: EMPTY_AI_COMPILE_STATUS,
          ...computeDerivedLinkState(
            cur.presetId,
            nextSpec,
            cur.slotOverrides,
            cur.activeLinkedDocId,
            blockPageId,
            cur.docAssetOverrides,
            cur.pageAssetOverrides,
            nextVariants,
            cur.webFormTheme,
            nextTableOverrides
          ),
        };
      });
    } catch (err) {
      if (abortCtrl.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      set((cur) => ({
        aiCompileStatus: {
          ...cur.aiCompileStatus,
          runningBlockId: null,
          runningVariantId: null,
          error: message,
        },
      }));
    } finally {
      if (activeAiCompileAbort === abortCtrl) {
        activeAiCompileAbort = null;
      }
    }
  },

  cancelAiCompile: () => {
    if (activeAiCompileAbort) {
      activeAiCompileAbort.abort();
      activeAiCompileAbort = null;
    }
    set({ aiCompileStatus: EMPTY_AI_COMPILE_STATUS });
  },

  setWebFormTheme: (webFormTheme) =>
    set((state) => {
      const nextVariants = { ...state.blockVariants };
      for (const [bid, meta] of Object.entries(state.compiled.blockMetaMap)) {
        if (meta.role === "web-form") {
          delete nextVariants[bid];
        }
      }
      return {
        webFormTheme,
        blockVariants: nextVariants,
        selectedBlockId: null,
        selectedSlotId: null,
        ...computeDerivedLinkState(
          state.presetId,
          state.spec,
          state.slotOverrides,
          state.activeLinkedDocId,
          state.activeLinkedPageId,
          state.docAssetOverrides,
          state.pageAssetOverrides,
          nextVariants,
          webFormTheme,
          state.tableOverrides
        ),
      };
    }),

  focusNodeInSheet: (nodeId) =>
    set((state) => {
      const ownerDoc = state.linkExtraction.documents.find((d) =>
        Boolean(findPlaygroundNode([d.node], nodeId))
      );
      const needsDocSwitch = ownerDoc && ownerDoc.id !== state.activeLinkedDocId;
      const baseDerived = needsDocSwitch
        ? computeDerivedLinkState(
            state.presetId,
            state.spec,
            state.slotOverrides,
            ownerDoc.id,
            null,
            state.docAssetOverrides,
            state.pageAssetOverrides,
            state.blockVariants,
            state.webFormTheme,
            state.tableOverrides
          )
        : null;
      const compiled = baseDerived?.compiled ?? state.compiled;
      const matchedMeta = Object.values(compiled.blockMetaMap).find(
        (m) =>
          m.blockId === `pg_blk_${nodeId}_raw` ||
          m.blockId === `pg_blk_${nodeId}` ||
          m.blockId.startsWith(`pg_blk_${nodeId}_`)
      );
      const firstSlotId = compiled.nodeSlotIds[nodeId]?.[0] ?? null;
      const fallbackSlotBlockMeta =
        !matchedMeta && firstSlotId
          ? Object.values(compiled.blockMetaMap).find((m) =>
              firstSlotId.startsWith(`pg_slot_${m.blockId}`)
            )
          : undefined;
      const finalMeta = matchedMeta ?? fallbackSlotBlockMeta;
      return {
        ...(baseDerived ?? null),
        mode: state.mode === "wysiwyg" ? "wysiwyg" : "wysiwym",
        selectedSlotId: firstSlotId,
        selectedBlockId: finalMeta?.blockId ?? state.selectedBlockId,
        activeLinkedPageId: finalMeta?.pageId ?? (baseDerived?.activeLinkedPageId ?? state.activeLinkedPageId),
        focusRequest: { nodeId, seq: (state.focusRequest?.seq ?? 0) + 1 },
      };
    }),

  focusLinkedTagNode: (nodeId, kind) =>
    set((state) => {
      if (kind === "document") {
        const matchDoc = state.linkExtraction.documents.find((d) => d.nodeId === nodeId);
        if (!matchDoc) return state;
        const derived = computeDerivedLinkState(
          state.presetId,
          state.spec,
          state.slotOverrides,
          matchDoc.id,
          null,
          state.docAssetOverrides,
          state.pageAssetOverrides,
          state.blockVariants,
          state.webFormTheme,
          state.tableOverrides
        );
        return {
          ...derived,
          mode: "wysiwym",
          selectedBlockId: null,
          selectedSlotId: null,
        };
      }
      for (const doc of state.linkExtraction.documents) {
        const matchPage = doc.pages.find((p) => p.nodeId === nodeId);
        if (matchPage) {
          const derived = computeDerivedLinkState(
            state.presetId,
            state.spec,
            state.slotOverrides,
            doc.id,
            matchPage.id,
            state.docAssetOverrides,
            state.pageAssetOverrides,
            state.blockVariants,
            state.webFormTheme,
            state.tableOverrides
          );
          return {
            ...derived,
            mode: "wysiwym",
            selectedBlockId: null,
            focusRequest: { nodeId, seq: (state.focusRequest?.seq ?? 0) + 1 },
          };
        }
      }
      return state;
    }),

  selectLinkedDocument: (docId) =>
    set((state) => {
      const derived = computeDerivedLinkState(
        state.presetId,
        state.spec,
        state.slotOverrides,
        docId,
        null,
        state.docAssetOverrides,
        state.pageAssetOverrides,
        state.blockVariants,
        state.webFormTheme
      );
      return {
        ...derived,
        selectedBlockId: null,
        selectedSlotId: null,
      };
    }),

  selectLinkedPage: (pageId) =>
    set((state) => {
      const doc = state.linkExtraction.documents.find((d) => d.id === state.activeLinkedDocId);
      const page = doc?.pages.find((p) => p.id === pageId);
      const docBaseAsset = state.activeLinkedDocId
        ? state.docAssetOverrides[state.activeLinkedDocId] ??
          defaultAssetForDoc(state.presetId, state.linkExtraction, state.activeLinkedDocId)
        : "asset-general-doc";
      const nextAssetId = page
        ? state.pageAssetOverrides[page.id] ??
          (page.assetHint
            ? resolveAssetIdFromHint(page.assetHint, doc?.docFormat, doc?.title ?? state.spec.title)
            : docBaseAsset)
        : docBaseAsset;
      return {
        activeLinkedPageId: pageId,
        activeAssetId: nextAssetId,
        selectedBlockId: null,
        ...(page
          ? { focusRequest: { nodeId: page.nodeId, seq: (state.focusRequest?.seq ?? 0) + 1 } }
          : null),
      };
    }),

  selectAsset: (assetId) =>
    set((state) => {
      const nextDocOverrides =
        !state.activeLinkedPageId && state.activeLinkedDocId
          ? { ...state.docAssetOverrides, [state.activeLinkedDocId]: assetId }
          : state.docAssetOverrides;
      const nextPageOverrides = state.activeLinkedPageId
        ? { ...state.pageAssetOverrides, [state.activeLinkedPageId]: assetId }
        : state.pageAssetOverrides;
      return {
        docAssetOverrides: nextDocOverrides,
        pageAssetOverrides: nextPageOverrides,
        selectedBlockId: null,
        selectedSlotId: null,
        ...computeDerivedLinkState(
          state.presetId,
          state.spec,
          state.slotOverrides,
          state.activeLinkedDocId,
          state.activeLinkedPageId,
          nextDocOverrides,
          nextPageOverrides,
          state.blockVariants,
          state.webFormTheme,
          state.tableOverrides
        ),
      };
    }),

  setTitle: (title) =>
    set((state) => {
      const nextSpec = { ...state.spec, title };
      return { spec: nextSpec, ...recompile(state, nextSpec) };
    }),

  changeNodeLayout: (nodeId, choice) =>
    set((state) => {
      const nextNodes = updatePlaygroundNode(state.spec.nodes, nodeId, (node) => ({
        ...node,
        layoutChoice: choice,
      }));
      const nextSpec = { ...state.spec, nodes: nextNodes };
      return { spec: nextSpec, ...recompile(state, nextSpec) };
    }),

  changeSurface: (surfaceKind) =>
    set((state) => {
      const nextSpec = { ...state.spec, surfaceKind };
      return { spec: nextSpec, ...recompile(state, nextSpec) };
    }),

  changeDensity: (density) =>
    set((state) => {
      const nextSpec = { ...state.spec, density };
      return { spec: nextSpec, ...recompile(state, nextSpec) };
    }),

  changeTheme: (theme) =>
    set((state) => {
      const nextSpec = { ...state.spec, theme };
      return { spec: nextSpec, ...recompile(state, nextSpec) };
    }),

  commitOutlinerRoots: (nextRoots) =>
    set((state) => {
      const nextNodes = syncOutlinerToPlaygroundNodes(nextRoots, state.spec.nodes);
      const changedNodeIds = new Set<string>();
      const areSubtreesEqual = (
        a: PlaygroundNode | undefined,
        b: PlaygroundNode | undefined
      ): boolean => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        if (a.text !== b.text || a.note !== b.note || a.children.length !== b.children.length) {
          return false;
        }
        return b.children.every((child, idx) => areSubtreesEqual(a.children[idx], child));
      };
      const collectChanged = (list: readonly PlaygroundNode[]) => {
        for (const n of list) {
          const old = findPlaygroundNode(state.spec.nodes, n.id);
          if (!areSubtreesEqual(old, n)) {
            changedNodeIds.add(n.id);
          }
          if (!old || old.text !== n.text || old.note !== n.note) {
            collectNodeIds(n, changedNodeIds);
          }
          if (n.children.length > 0) collectChanged(n.children);
        }
      };
      collectChanged(nextNodes);

      let nextOverrides = state.slotOverrides;
      if (changedNodeIds.size > 0 && Object.keys(state.slotOverrides).length > 0) {
        nextOverrides = { ...state.slotOverrides };
        for (const [sid, target] of Object.entries(state.compiled.reverseMap)) {
          if (changedNodeIds.has(target.nodeId)) {
            delete nextOverrides[sid];
          }
        }
      }

      let nextTableOverrides = state.tableOverrides;
      let nextViewCache = state.viewCache;
      let nextDirtyViewBlocks = state.dirtyViewBlocks;
      const nextSpec = { ...state.spec, nodes: nextNodes };
      if (changedNodeIds.size > 0) {
        if (Object.keys(state.tableOverrides).length > 0) {
          nextTableOverrides = { ...state.tableOverrides };
          for (const bid of Object.keys(nextTableOverrides)) {
            const match = /^pg_blk_(.+)_raw$/.exec(bid);
            if (match && changedNodeIds.has(match[1])) {
              delete nextTableOverrides[bid];
            }
          }
        }
        for (const [bid, meta] of Object.entries(state.compiled.blockMetaMap)) {
          if (meta.role !== "table") continue;
          const match = /^pg_blk_(.+)_raw$/.exec(bid);
          if (match && changedNodeIds.has(match[1])) {
            const oldTable = findPlaygroundNode(state.spec.nodes, match[1]);
            const newTable = findPlaygroundNode(nextNodes, match[1]);
            const { viewNode: oldView } = splitTableNodeChildren(oldTable);
            const { viewNode: newView } = splitTableNodeChildren(newTable);
            if (!areSubtreesEqual(oldView, newView)) {
              const activeVar = state.blockVariants[bid] ?? meta.defaultVariant;
              const preserved = preserveCleanCacheBeforeExperiment(
                nextViewCache,
                nextDirtyViewBlocks,
                state.spec,
                bid,
                activeVar
              );
              nextViewCache = preserved.viewCache;
              nextDirtyViewBlocks = preserved.dirtyViewBlocks;
            }
          }
        }
      }

      return {
        spec: nextSpec,
        slotOverrides: nextOverrides,
        tableOverrides: nextTableOverrides,
        viewCache: nextViewCache,
        dirtyViewBlocks: nextDirtyViewBlocks,
        outlinerRoots: nextRoots,
        ...computeDerivedLinkState(
          state.presetId,
          nextSpec,
          nextOverrides,
          state.activeLinkedDocId,
          state.activeLinkedPageId,
          state.docAssetOverrides,
          state.pageAssetOverrides,
          state.blockVariants,
          state.webFormTheme,
          nextTableOverrides
        ),
      };
    }),

  updateSlotContent: (slotId, html) =>
    set((state) => {
      const customOwner = state.compiled.customSlotOwnerMap[slotId];
      if (customOwner && state.spec.customForms[customOwner]) {
        const form = state.spec.customForms[customOwner];
        const prevSlot = form.slots[slotId];
        if (!prevSlot) return state;
        const nextSpec: PlaygroundDocSpec = {
          ...state.spec,
          customForms: {
            ...state.spec.customForms,
            [customOwner]: {
              ...form,
              slots: {
                ...form.slots,
                [slotId]: {
                  ...prevSlot,
                  content: html,
                  isEdited: true,
                },
              },
            },
          },
        };
        return { spec: nextSpec, ...recompile(state, nextSpec) };
      }

      const nextOverrides = { ...state.slotOverrides, [slotId]: html };
      let nextTableOverrides = state.tableOverrides;
      for (const [bid, override] of Object.entries(state.tableOverrides)) {
        if (override.slots[slotId]) {
          nextTableOverrides = {
            ...nextTableOverrides,
            [bid]: {
              ...override,
              slots: {
                ...override.slots,
                [slotId]: {
                  ...override.slots[slotId],
                  content: html,
                  isEdited: true,
                },
              },
            },
          };
        }
      }

      const reverseTarget = state.compiled.reverseMap[slotId];
      const ownerTableMeta = Object.values(state.compiled.blockMetaMap).find(
        (m) =>
          m.role === "table" &&
          (slotId.startsWith(`pg_slot_${m.blockId}`) ||
            Boolean(state.tableOverrides[m.blockId]?.slots[slotId]))
      );
      if (reverseTarget && ownerTableMeta) {
        const nextNodes = applySlotEditToNodes(state.spec.nodes, reverseTarget, html);
        const nextSpec: PlaygroundDocSpec = { ...state.spec, nodes: nextNodes };
        const activeVar = state.blockVariants[ownerTableMeta.blockId] ?? ownerTableMeta.defaultVariant;
        const preserved = preserveCleanCacheBeforeExperiment(
          state.viewCache,
          state.dirtyViewBlocks,
          state.spec,
          ownerTableMeta.blockId,
          activeVar
        );
        return {
          spec: nextSpec,
          slotOverrides: nextOverrides,
          tableOverrides: nextTableOverrides,
          viewCache: preserved.viewCache,
          dirtyViewBlocks: preserved.dirtyViewBlocks,
          outlinerRoots: toOutlinerNodes(nextNodes),
          ...recompile(state, nextSpec, nextOverrides, nextTableOverrides),
        };
      }

      // 비표(정적 에셋) 직접 편집은 독립 레이어(slotOverrides)에만 반영한다.
      return {
        slotOverrides: nextOverrides,
        tableOverrides: nextTableOverrides,
        ...recompile(state, state.spec, nextOverrides, nextTableOverrides),
      };
    }),

  runTableCommand: (pageId, blockId, sectionId, cmd) =>
    set((state) => {
      const result = applyPlaygroundTableCommand(
        state.spec,
        state.compiled.doc,
        pageId,
        blockId,
        sectionId,
        cmd,
        state.blockVariants[blockId]
      );
      if (!result) return state;

      let nextTableOverrides = state.tableOverrides;
      if (result.tableOverride) {
        nextTableOverrides = {
          ...state.tableOverrides,
          [result.tableOverride.blockId]: result.tableOverride.override,
        };
      }

      const nextSpec = result.spec;
      const meta = state.compiled.blockMetaMap[blockId];
      const activeVar = state.blockVariants[blockId] ?? meta?.defaultVariant;
      const preserved = activeVar
        ? preserveCleanCacheBeforeExperiment(
            state.viewCache,
            state.dirtyViewBlocks,
            state.spec,
            blockId,
            activeVar
          )
        : { viewCache: state.viewCache, dirtyViewBlocks: state.dirtyViewBlocks };
      return {
        spec: nextSpec,
        tableOverrides: nextTableOverrides,
        viewCache: preserved.viewCache,
        dirtyViewBlocks: preserved.dirtyViewBlocks,
        ...(result.nodesChanged ? { outlinerRoots: toOutlinerNodes(nextSpec.nodes) } : null),
        ...recompile(state, nextSpec, state.slotOverrides, nextTableOverrides),
      };
    }),
}));
