import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Blocks,
  Check,
  Edit3,
  FilePlus2,
  Layers,
  ListTree,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  deriveOutlineDslFromBlocks,
  findBlock,
  hashOutlineSourceInput,
  htmlToPlainText,
  insertBlock,
  instantiateAssetForInsert,
  resolveDocumentView,
  type LayoutBlock,
  type VDocAsset,
  type VDocAssetKind,
  type VDocDocument,
  type VDocPage,
} from "@vibe/vdoc-schema";
import type { OutlineNode } from "@vibe/outliner";
import { basename, stem } from "@vibe/vault-core";

import { applyAssetPreviewViaAi, parseAssetFromBlockViaAi } from "@vibe/ai-vault";
import {
  collectVaultAssets,
  ensureAssetFileInVault,
  isAssetPath,
  isOutlinePath,
  isVDocPath,
  parseIndentedOutlineDsl,
  parseOutlineJson,
  parseVDocJson,
  saveAssetToVault,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
  type VaultAssetEntry,
} from "@vibe/vault-formats";
import { resolveOutlineForVDoc, resolveVDocForOutlineBinding } from "@vibe/outline-sync";
import { resolveTabTitle } from "../model/sampleVault";
import type { IdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { VDocAssetThumbnail } from "./VDocAssetThumbnail";

export interface VDocAssetPanelProps {
  readonly runtime: IdeWorkbenchRuntime;
  readonly activeResourceId: string | null;
}

type AssetFilterKind = "all" | "a4-page" | "blog-section" | "table";

const FILTER_TABS: readonly { readonly id: AssetFilterKind; readonly label: string }[] = [
  { id: "all", label: "전체" },
  { id: "a4-page", label: "A4 페이지" },
  { id: "blog-section", label: "블로그 섹션" },
  { id: "table", label: "표" },
];

const KIND_BADGE_META: Record<string, { readonly label: string; readonly cls: string }> = {
  "a4-page": { label: "A4 페이지", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  "blog-section": {
    label: "블로그 섹션",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  table: { label: "표", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  list: { label: "목록", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  callout: { label: "콜아웃", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  columns: { label: "다단", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
};

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function extractPlainTextFromBlocks(
  blocks: readonly LayoutBlock[],
  doc: VDocDocument
): string {
  const chunks: string[] = [];
  const visit = (blk: LayoutBlock) => {
    if ("slotId" in blk && typeof blk.slotId === "string" && doc.slots[blk.slotId]) {
      const txt = htmlToPlainText(doc.slots[blk.slotId].content).trim();
      if (txt) chunks.push(txt);
    }
    if (blk.kind === "structured-table") {
      for (const r of blk.rows) {
        const rowParts: string[] = [];
        for (const c of r.cells) {
          const txt = htmlToPlainText(doc.slots[c.slotId]?.content ?? "").trim();
          if (txt) rowParts.push(txt);
          for (const nb of c.blocks ?? []) visit(nb);
        }
        if (rowParts.length > 0) chunks.push(rowParts.join(" | "));
      }
    } else if (blk.kind === "columns-grid" && blk.columns) {
      for (const col of blk.columns) {
        if (col.slotId && doc.slots[col.slotId]) {
          const txt = htmlToPlainText(doc.slots[col.slotId].content).trim();
          if (txt) chunks.push(txt);
        }
        for (const nb of col.blocks ?? []) visit(nb);
      }
    }
  };
  for (const b of blocks) visit(b);
  return chunks.join("\n");
}

function syntaxNodesToOutlineNodes(
  nodes: ReturnType<typeof parseIndentedOutlineDsl>,
  suffix: string
): OutlineNode[] {
  let seq = 0;
  const convert = (n: ReturnType<typeof parseIndentedOutlineDsl>[number]): OutlineNode => ({
    id: `ast_${suffix}_${++seq}`,
    text: n.text,
    isFolded: false,
    children: (n.children ?? []).map(convert),
  });
  return nodes.map(convert);
}

/**
 * Right Dock `[에셋]` Panel — Shown automatically in `.vdoc` `[구조]` mode & `.outline` tabs.
 * Provides live 2D thumbnail gallery, AI Staged Preview (`느낌 보기`), direct skeleton insert,
 * and AI-abstracted Asset Capture (`에셋으로 등록`).
 */
export const VDocAssetPanel: React.FC<VDocAssetPanelProps> = React.memo(
  ({ runtime, activeResourceId }) => {
    const { vault, vdocUiBridge } = runtime;
    const isVDocActive = Boolean(activeResourceId && isVDocPath(activeResourceId));
    const isOutlineActive = Boolean(activeResourceId && isOutlinePath(activeResourceId));

    const [vaultTick, setVaultTick] = useState(0);
    const [filterKind, setFilterKind] = useState<AssetFilterKind>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [flashMessage, setFlashMessage] = useState<string | null>(null);

    // Inline Asset Capture drawer state
    const [captureOpen, setCaptureOpen] = useState(false);
    const [captureLoading, setCaptureLoading] = useState(false);
    const [captureDraft, setCaptureDraft] = useState<VDocAsset | null>(null);
    const [captureEngine, setCaptureEngine] = useState<"llm" | "fallback">("fallback");
    const [captureDslText, setCaptureDslText] = useState("");

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
      return vault.subscribe((ev) => {
        const changed =
          ev.type === "create"
            ? ev.node.path
            : ev.type === "modify" || ev.type === "delete"
              ? ev.path
              : ev.type === "rename"
                ? ev.newPath
                : "";
        if (
          ev.type === "vault-reset" ||
          isAssetPath(changed) ||
          (activeResourceId && changed === activeResourceId)
        ) {
          setVaultTick((t) => t + 1);
        }
      });
    }, [vault, activeResourceId]);

    useEffect(() => {
      return () => {
        abortRef.current?.abort();
      };
    }, []);

    // If active tab is `.outline`, also resolve its bound `.vdoc` so `[느낌 보기 (AI)]` works from EITHER pane!
    const outlineBoundTarget = useMemo(() => {
      void vaultTick;
      if (!isOutlineActive || !activeResourceId || !vault.exists(activeResourceId)) return null;
      if (vault.isLoaded && !vault.isLoaded(activeResourceId)) return null;
      try {
        const payload = parseOutlineJson(vault.read(activeResourceId), stem(activeResourceId));
        const bindings = Object.entries(payload.docBindings ?? {});
        // Prefer the last/most-recently bound valid vdoc in the outline (or matching active open vdoc if any)
        for (const [nodeId, binding] of [...bindings].reverse()) {
          const resolved = resolveVDocForOutlineBinding(vault, activeResourceId, nodeId, binding, payload, {
            heal: false,
          });
          if (resolved) {
            return {
              vdocPath: resolved.vdocPath,
              vdoc: resolved.doc,
              outlinePath: activeResourceId,
              outlineRootNodeId: nodeId,
            };
          }
        }
      } catch {
        // Ignore transient read error
      }
      return null;
    }, [isOutlineActive, activeResourceId, vault, vaultTick]);

    const effectiveVDocPath = isVDocActive
      ? activeResourceId
      : (outlineBoundTarget?.vdocPath ?? null);

    // Fine-grained selection subscription (NEVER subscribe to hoveredBlockId!)
    const storedActivePageId = useStore(vdocUiBridge, (s) =>
      effectiveVDocPath ? (s.byPath[effectiveVDocPath]?.activePageId ?? null) : null
    );
    const selectedBlockId = useStore(vdocUiBridge, (s) =>
      effectiveVDocPath ? (s.byPath[effectiveVDocPath]?.selectedBlockId ?? null) : null
    );
    const stagedAssetId = useStore(vdocUiBridge, (s) =>
      effectiveVDocPath ? (s.byPath[effectiveVDocPath]?.stagedAssetPreview?.assetId ?? null) : null
    );
    const stagedStatus = useStore(vdocUiBridge, (s) =>
      effectiveVDocPath ? (s.byPath[effectiveVDocPath]?.stagedAssetPreview?.status ?? null) : null
    );

    const activeVDoc: VDocDocument | null = useMemo(() => {
      void vaultTick;
      if (!effectiveVDocPath || !vault.exists(effectiveVDocPath)) return null;
      if (vault.isLoaded && !vault.isLoaded(effectiveVDocPath)) return null;
      try {
        return parseVDocJson(vault.read(effectiveVDocPath), stem(effectiveVDocPath));
      } catch {
        return null;
      }
    }, [effectiveVDocPath, vault, vaultTick]);

    const activePage: VDocPage | null = useMemo(() => {
      if (!activeVDoc) return null;
      return (
        activeVDoc.pages.find((p) => p.pageId === storedActivePageId) ?? activeVDoc.pages[0] ?? null
      );
    }, [activeVDoc, storedActivePageId]);

    const selectedBlockLoc = useMemo(() => {
      if (!activeVDoc || !selectedBlockId) return null;
      return findBlock(activeVDoc, selectedBlockId);
    }, [activeVDoc, selectedBlockId]);

    const allAssets: VaultAssetEntry[] = useMemo(() => {
      void vaultTick;
      return collectVaultAssets(vault);
    }, [vault, vaultTick]);

    const filteredAssets = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      return allAssets.filter(({ asset }) => {
        if (filterKind !== "all" && asset.assetKind !== filterKind) return false;
        if (!q) return true;
        return (
          asset.title.toLowerCase().includes(q) ||
          asset.nuance.summary.toLowerCase().includes(q) ||
          asset.category.toLowerCase().includes(q) ||
          asset.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    }, [allAssets, filterKind, searchQuery]);

    const showFlash = useCallback((msg: string) => {
      setFlashMessage(msg);
      setTimeout(() => {
        setFlashMessage((cur) => (cur === msg ? null : cur));
      }, 2400);
    }, []);

    const handleOpenAssetEditor = useCallback(
      (entry: VaultAssetEntry) => {
        const filePath = ensureAssetFileInVault(vault, entry.asset, entry.vaultPath);
        runtime.layout.getState().openResource({
          resourceId: filePath,
          title: resolveTabTitle(filePath),
          viewType: "vibe-asset",
          mode: "split-right",
        });
      },
      [vault, runtime.layout]
    );

    /**
     * AI Staged Preview (`느낌 보기`) — Non-destructive live preview overlay on BOTH `.vdoc` & `.outline`!
     */
    const handlePreviewAsset = useCallback(
      async (entry: VaultAssetEntry) => {
        if (!effectiveVDocPath || !activeVDoc || !activePage) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const isPageAsset =
          entry.asset.assetKind === "a4-page" || entry.asset.assetKind === "blog-section";
        const targetScope: "block" | "page" =
          !isPageAsset && selectedBlockLoc ? "block" : "page";
        const targetBlocks =
          targetScope === "block" && selectedBlockLoc ? [selectedBlockLoc.block] : activePage.blocks;
        const userOutlineDsl = deriveOutlineDslFromBlocks(targetBlocks, activeVDoc.slots);
        const userPlainText = extractPlainTextFromBlocks(targetBlocks, activeVDoc);
        const mode: "transform" | "insert" =
          userOutlineDsl.length > 0 || userPlainText.trim().length > 0 ? "transform" : "insert";
        const sourceInputHash = hashOutlineSourceInput(
          `${userOutlineDsl.join("\n")}\n${userPlainText}`
        );

        const targetPageId = selectedBlockLoc?.pageId ?? activePage.pageId;
        const targetBlockId = targetScope === "block" ? (selectedBlockLoc?.block.blockId ?? null) : null;
        const targetSourceNodeId =
          targetScope === "block"
            ? (selectedBlockLoc?.block.sourceNodeId ?? null)
            : (activePage.sourceNodeId ?? null);
        const assetPathUri = entry.vaultPath ? toVaultUri(entry.vaultPath) : null;

        const resolvedOutline =
          outlineBoundTarget
            ? {
                outlinePath: outlineBoundTarget.outlinePath,
                rootNodeId: outlineBoundTarget.outlineRootNodeId,
              }
            : resolveOutlineForVDoc(vault, effectiveVDocPath, activeVDoc, { heal: false });
        const linkedOutlinePath = resolvedOutline?.outlinePath ?? null;
        const linkedOutlineRootNodeId = resolvedOutline?.rootNodeId ?? null;

        vdocUiBridge.getState().setStagedAssetPreview(effectiveVDocPath, {
          assetId: entry.asset.assetId,
          assetPath: assetPathUri,
          assetTitle: entry.asset.title,
          assetKind: entry.asset.assetKind,
          targetScope,
          mode,
          targetPageId,
          targetBlockId,
          linkedOutlinePath,
          linkedOutlineRootNodeId,
          targetSourceNodeId,
          status: "loading",
          rationale: "AI가 현재 문서 데이터를 선택한 에셋 구조 뉘앙스로 재구성하고 있습니다...",
          suggestedOutlineDsl: [],
          previewBlocks: [],
          previewSlots: {},
          userOutlineDsl,
          userPlainText,
          feedbackHistory: [],
          sourceInputHash,
        });

        runtime.pushLog(
          "composer",
          "info",
          `asset preview started: "${entry.asset.title}" -> ${basename(effectiveVDocPath)} (${targetScope}/${mode})`
        );

        try {
          const viewId = resolveDocumentView(activeVDoc).id === "blog" ? "blog" : "a4";
          const res = await applyAssetPreviewViaAi(
            {
              asset: entry.asset,
              userOutlineDsl,
              userPlainText,
              documentTitle: activeVDoc.title,
              targetScope,
              mode,
              viewId,
            },
            controller.signal
          );
          if (controller.signal.aborted) return;

          vdocUiBridge.getState().setStagedAssetPreview(effectiveVDocPath, {
            assetId: entry.asset.assetId,
            assetPath: assetPathUri,
            assetTitle: entry.asset.title,
            assetKind: entry.asset.assetKind,
            targetScope,
            mode,
            targetPageId,
            targetBlockId,
            linkedOutlinePath,
            linkedOutlineRootNodeId,
            targetSourceNodeId,
            status: "ready",
            engine: res.engine,
            rationale: res.rationale,
            suggestedOutlineDsl: res.outlineDsl,
            previewBlocks: res.blocks,
            previewSlots: res.slots,
            userOutlineDsl,
            userPlainText,
            feedbackHistory: [],
            sourceInputHash,
          });
          runtime.pushLog(
            "composer",
            "ok",
            `asset preview ready (${res.engine}): ${res.blocks.length} blocks staged`
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          const msg = err instanceof Error ? err.message : "프리뷰 생성 실패";
          vdocUiBridge.getState().setStagedAssetPreview(effectiveVDocPath, {
            assetId: entry.asset.assetId,
            assetPath: assetPathUri,
            assetTitle: entry.asset.title,
            assetKind: entry.asset.assetKind,
            targetScope,
            mode,
            targetPageId,
            targetBlockId,
            linkedOutlinePath,
            linkedOutlineRootNodeId,
            targetSourceNodeId,
            status: "error",
            rationale: "",
            errorMessage: msg,
            suggestedOutlineDsl: [],
            previewBlocks: [],
            previewSlots: {},
            userOutlineDsl,
            userPlainText,
            feedbackHistory: [],
            sourceInputHash,
          });
        }
      },
      [
        effectiveVDocPath,
        activeVDoc,
        activePage,
        selectedBlockLoc,
        outlineBoundTarget,
        vault,
        vdocUiBridge,
        runtime,
      ]
    );

    /**
     * Direct structural skeleton insertion (`뼈대 꽂기`) into `.vdoc` or `.outline` without AI delay.
     */
    const handleInsertSkeleton = useCallback(
      (entry: VaultAssetEntry) => {
        if (isVDocActive && activeResourceId && activeVDoc && activePage) {
          const suffix = uidFactory();
          const inst = instantiateAssetForInsert(entry.asset, suffix);
          const assetUri = entry.vaultPath ? toVaultUri(entry.vaultPath) : undefined;
          const blocksWithPath = inst.blocks.map((b) => ({
            ...b,
            assetRef: {
              assetId: entry.asset.assetId,
              ...(assetUri ? { assetPath: assetUri } : {}),
              appliedAt: new Date().toISOString(),
            },
          }));

          const isPageAsset =
            entry.asset.assetKind === "a4-page" || entry.asset.assetKind === "blog-section";

          let nextDoc = activeVDoc;
          if (isPageAsset && activePage.blocks.length > 0) {
            // Append as a dedicated new page/section so existing content is untouched
            const newPageId = `page_ast_${suffix}`;
            const hdrSlot = `slot_${newPageId}_hdr`;
            const ftrSlot = `slot_${newPageId}_ftr`;
            const isSection = entry.asset.assetKind === "blog-section";
            const newPage: VDocPage = {
              pageId: newPageId,
              pageNumber: activeVDoc.pages.length + 1,
              pageLabel: entry.asset.structure.pageMeta?.pageLabel ?? entry.asset.title,
              unitKind: isSection ? "section" : "page",
              sectionRole: entry.asset.structure.pageMeta?.sectionRole,
              headerSlotId: hdrSlot,
              footerSlotId: ftrSlot,
              hideHeaderFooter: true,
              blocks: blocksWithPath,
            };
            nextDoc = {
              ...activeVDoc,
              pages: [...activeVDoc.pages, newPage],
              slots: {
                ...activeVDoc.slots,
                [hdrSlot]: {
                  slotId: hdrSlot,
                  label: "Header",
                  role: "editable-slot",
                  content: "",
                  backDataRefs: [],
                },
                [ftrSlot]: {
                  slotId: ftrSlot,
                  label: "Footer",
                  role: "editable-slot",
                  content: "",
                  backDataRefs: [],
                },
                ...inst.slots,
              },
            };
            vault.write(activeResourceId, serializeVDocJson(nextDoc));
            vdocUiBridge.getState().setActivePage(activeResourceId, newPageId);
            if (blocksWithPath[0]) {
              vdocUiBridge.getState().selectBlock(activeResourceId, blocksWithPath[0].blockId, newPageId);
            }
            showFlash(`새 ${isSection ? "섹션" : "페이지"}로 '${entry.asset.title}' 뼈대를 추가했습니다.`);
            return;
          }

          let insertIdx = activePage.blocks.length;
          if (selectedBlockLoc && selectedBlockLoc.pageId === activePage.pageId) {
            const idx = activePage.blocks.findIndex(
              (b) => b.blockId === selectedBlockLoc.block.blockId
            );
            if (idx >= 0) insertIdx = idx + 1;
          }
          for (let i = 0; i < blocksWithPath.length; i += 1) {
            nextDoc = insertBlock(
              nextDoc,
              activePage.pageId,
              blocksWithPath[i],
              i === 0 ? inst.slots : {},
              insertIdx + i
            );
          }
          vault.write(activeResourceId, serializeVDocJson(nextDoc));
          if (blocksWithPath[0]) {
            vdocUiBridge
              .getState()
              .selectBlock(activeResourceId, blocksWithPath[0].blockId, activePage.pageId);
          }
          showFlash(`'${entry.asset.title}' 구조 뼈대를 삽입했습니다.`);
          return;
        }

        if (isOutlineActive && activeResourceId && vault.exists(activeResourceId)) {
          const payload = parseOutlineJson(vault.read(activeResourceId), stem(activeResourceId));
          const parsedSyntax = parseIndentedOutlineDsl(entry.asset.structure.outlineDsl, "ins");
          const newNodes = syntaxNodesToOutlineNodes(parsedSyntax, uidFactory());
          // If the outline has a <<doc:...>> root node, append inside the last <<doc:...>> node
          const docRootIdx = [...payload.rootNodes]
            .reverse()
            .findIndex((n) => /^\s*<<doc(?::[^>]*)?>>/.test(n.text));
          let nextRoots: OutlineNode[];
          if (docRootIdx >= 0) {
            const actualIdx = payload.rootNodes.length - 1 - docRootIdx;
            nextRoots = payload.rootNodes.map((n, idx) =>
              idx === actualIdx ? { ...n, children: [...n.children, ...newNodes] } : n
            );
          } else {
            nextRoots = [...payload.rootNodes, ...newNodes];
          }
          vault.write(
            activeResourceId,
            serializeOutlineJson({
              ...payload,
              updatedAt: new Date().toISOString(),
              rootNodes: nextRoots,
            })
          );
          showFlash(`'${entry.asset.title}' 골격을 .outline 에 삽입했습니다.`);
        }
      },
      [
        isVDocActive,
        isOutlineActive,
        activeResourceId,
        activeVDoc,
        activePage,
        selectedBlockLoc,
        vault,
        vdocUiBridge,
        showFlash,
      ]
    );

    /**
     * Capture currently selected `.vdoc` block or active page into a reusable `.vasset` via AI!
     */
    const handleStartCapture = useCallback(async () => {
      if (!isVDocActive || !activeResourceId || !activeVDoc || !activePage) return;
      setCaptureOpen(true);
      setCaptureLoading(true);
      setCaptureDraft(null);

      const capturingBlock = selectedBlockLoc?.block ?? null;
      const sourceBlocks = capturingBlock ? [capturingBlock] : activePage.blocks;
      const sourceOutlineDsl = deriveOutlineDslFromBlocks(sourceBlocks, activeVDoc.slots);
      const plainSummary = extractPlainTextFromBlocks(sourceBlocks, activeVDoc).slice(0, 600);

      let assetKind: VDocAssetKind = "a4-page";
      if (capturingBlock) {
        assetKind =
          capturingBlock.kind === "structured-table"
            ? "table"
            : capturingBlock.kind === "columns-grid"
              ? "columns"
              : capturingBlock.kind === "callout-box"
                ? "callout"
                : "list";
      } else {
        const viewId = resolveDocumentView(activeVDoc).id;
        assetKind = viewId === "blog" || activePage.unitKind === "section" ? "blog-section" : "a4-page";
      }

      const sourceRef = capturingBlock
        ? `${toVaultUri(activeResourceId)}#${capturingBlock.blockId}`
        : `${toVaultUri(activeResourceId)}#${activePage.pageId}`;
      const titleHint = capturingBlock
        ? `${capturingBlock.title || "블록"} 양식`
        : `${activePage.pageLabel || activeVDoc.title} 양식`;

      try {
        const res = await parseAssetFromBlockViaAi({
          titleHint,
          assetKind,
          blockKind: capturingBlock ? capturingBlock.kind : activePage.unitKind ?? "page",
          sourceOutlineDsl,
          plainTextSummary: plainSummary,
          sourceRef,
        });
        setCaptureDraft(res.asset);
        setCaptureEngine(res.engine);
        setCaptureDslText(res.asset.structure.outlineDsl.join("\n"));
      } finally {
        setCaptureLoading(false);
      }
    }, [isVDocActive, activeResourceId, activeVDoc, activePage, selectedBlockLoc]);

    const handleConfirmSaveCapture = () => {
      if (!captureDraft) return;
      const nextOutlineDsl = captureDslText
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
      const toSave: VDocAsset = {
        ...captureDraft,
        structure: {
          ...captureDraft.structure,
          outlineDsl: nextOutlineDsl.length > 0 ? nextOutlineDsl : captureDraft.structure.outlineDsl,
        },
      };
      const savedPath = saveAssetToVault(vault, toSave);
      setCaptureOpen(false);
      setCaptureDraft(null);
      setVaultTick((t) => t + 1);
      runtime.pushLog("vault", "ok", `saved asset: ${savedPath}`);
      showFlash(`'${toSave.title}' 에셋이 등록되었습니다.`);
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-[11.5px] text-[var(--obs-text-normal,#dadada)]">
        {/* Context Header + Capture Button */}
        <div className="shrink-0 space-y-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)]/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <Blocks className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {isVDocActive
                    ? selectedBlockLoc
                      ? `대상 블록: ${selectedBlockLoc.block.title || selectedBlockLoc.block.kind}`
                      : `대상 페이지: ${activePage?.pageLabel ?? "Page 1"}`
                    : isOutlineActive && activeResourceId
                      ? `대상 아웃라인: ${basename(activeResourceId)}`
                      : "구조 에셋 라이브러리"}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--obs-text-faint,#8a8a8a)]">
                {isVDocActive
                  ? "에셋을 클릭해 현재 데이터를 그 양식 느낌으로 AI 미리보기 하거나 뼈대를 꽂으세요."
                  : isOutlineActive
                    ? "표준 .outline 구조 골격을 현재 아웃라인에 바로 삽입합니다."
                    : ".vdoc 구조 모드 또는 .outline 을 열면 바로 적용할 수 있습니다."}
              </p>
            </div>

            {isVDocActive && activeVDoc && (
              <button
                type="button"
                onClick={() => void handleStartCapture()}
                title={
                  selectedBlockLoc
                    ? "선택한 블록 구조를 AI 추상화해 에셋으로 등록"
                    : "현재 페이지 전체 구조를 AI 추상화해 에셋으로 등록"
                }
                className="flex shrink-0 items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10.5px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
              >
                <Plus className="h-3 w-3" />
                <span>에셋 등록</span>
              </button>
            )}
          </div>

          {/* Search & Kind Filters */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-[var(--obs-text-faint,#777)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(ev) => setSearchQuery(ev.target.value)}
              placeholder="에셋 검색 (공문, 표, 블로그, 실적...)"
              className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1a1a1a)] py-1 pr-2 pl-6 text-[11px] outline-none focus:border-emerald-400"
            />
          </div>

          <div className="flex items-center gap-1">
            {FILTER_TABS.map((tab) => {
              const active = filterKind === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterKind(tab.id)}
                  className={`flex-1 rounded px-1.5 py-1 text-[10.5px] font-medium transition-colors ${
                    active
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/35"
                      : "bg-black/20 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Flash Notification */}
        {flashMessage && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1.5 text-[10.5px] text-emerald-200">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{flashMessage}</span>
          </div>
        )}

        {/* Inline AI Asset Capture Drawer */}
        {captureOpen && (
          <div className="shrink-0 space-y-2 border-b border-emerald-500/35 bg-[#1b2421] p-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-200">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>선택 구조 → 에셋 등록 (AI 추상화)</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setCaptureOpen(false);
                  setCaptureDraft(null);
                }}
                className="rounded p-0.5 text-white/60 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {captureLoading ? (
              <div className="flex items-center gap-2 py-3 text-[11px] text-emerald-200/80">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>선택 블록에서 고유 내용을 추상화해 구조 레시피를 생성 중...</span>
              </div>
            ) : captureDraft ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={captureDraft.title}
                    onChange={(ev) =>
                      setCaptureDraft({ ...captureDraft, title: ev.target.value })
                    }
                    className="min-w-0 flex-1 rounded border border-emerald-500/30 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-400"
                  />
                  <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 font-code text-[9.5px] text-emerald-300">
                    {captureEngine === "llm" ? "AI" : "규칙"}
                  </span>
                </div>
                <textarea
                  value={captureDraft.nuance.summary}
                  onChange={(ev) =>
                    setCaptureDraft({
                      ...captureDraft,
                      nuance: { ...captureDraft.nuance, summary: ev.target.value },
                    })
                  }
                  rows={2}
                  className="w-full resize-none rounded border border-white/10 bg-black/30 p-1.5 text-[10.5px] leading-4 text-white/90 outline-none focus:border-emerald-400"
                />
                <textarea
                  value={captureDslText}
                  onChange={(ev) => setCaptureDslText(ev.target.value)}
                  rows={5}
                  spellCheck={false}
                  className="w-full rounded border border-white/10 bg-[#121614] p-1.5 font-code text-[10px] leading-4 text-emerald-100 outline-none focus:border-emerald-400"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureOpen(false);
                      setCaptureDraft(null);
                    }}
                    className="rounded px-2 py-1 text-[10.5px] text-white/70 hover:bg-white/10"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSaveCapture}
                    className="flex items-center gap-1 rounded bg-emerald-500/30 px-2.5 py-1 text-[10.5px] font-medium text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-500/40"
                  >
                    <Check className="h-3 w-3" />
                    <span>Vault에 저장</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Scrollable Asset Cards Gallery */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-[11px] text-[var(--obs-text-faint,#808080)]">
              <Layers className="h-6 w-6 opacity-40" />
              <span>조건에 맞는 에셋이 없습니다.</span>
            </div>
          ) : (
            filteredAssets.map((entry) => {
              const { asset } = entry;
              const badge = KIND_BADGE_META[asset.assetKind] ?? {
                label: asset.assetKind,
                cls: "bg-white/10 text-white/80 border-white/15",
              };
              const isStagedThis = stagedAssetId === asset.assetId;
              const isLoadingThis = isStagedThis && stagedStatus === "loading";

              return (
                <article
                  key={asset.assetId}
                  className={`group rounded-lg border bg-[var(--obs-bg-primary,#1e1e1e)] p-2 transition-colors ${
                    isStagedThis
                      ? "border-[var(--obs-accent,#8a5cf5)] ring-1 ring-[var(--obs-accent,#8a5cf5)]/40"
                      : "border-[var(--obs-border-subtle,#303030)] hover:border-emerald-500/45"
                  }`}
                >
                  {/* Live 2D Rendered Thumbnail */}
                  <VDocAssetThumbnail asset={asset} height={116} className="mb-2" />

                  {/* Title & Kind Badge */}
                  <div className="flex items-start justify-between gap-1.5">
                    <h4 className="min-w-0 flex-1 text-[11.5px] leading-4 font-semibold text-[var(--obs-text-normal,#ececec)]">
                      {asset.title}
                    </h4>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0 text-[9.5px] font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Nuance Summary */}
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-[var(--obs-text-muted,#9e9e9e)]">
                    {asset.nuance.summary}
                  </p>

                  {/* Tags */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {asset.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-white/5 px-1.5 py-0 text-[9.5px] text-[var(--obs-text-faint,#8a8a8a)]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Action Row */}
                  <div className="mt-2 flex items-center gap-1 border-t border-white/5 pt-2">
                    {isVDocActive ? (
                      <>
                        <button
                          type="button"
                          disabled={isLoadingThis}
                          onClick={() => void handlePreviewAsset(entry)}
                          className="flex flex-1 items-center justify-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)]/25 px-2 py-1 text-[10.5px] font-medium text-[#ddd6fe] ring-1 ring-[var(--obs-accent,#8a5cf5)]/40 transition-colors hover:bg-[var(--obs-accent,#8a5cf5)]/35 disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          <span>느낌 보기 (AI)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertSkeleton(entry)}
                          title="AI 변환 없이 표준 구조 뼈대만 즉시 삽입"
                          className="flex items-center gap-1 rounded border border-[var(--obs-border,#3a3a3a)] bg-black/25 px-2 py-1 text-[10.5px] text-[var(--obs-text-muted,#c2c2c2)] transition-colors hover:border-emerald-500/40 hover:text-white"
                        >
                          <FilePlus2 className="h-3 w-3 text-emerald-400" />
                          <span>뼈대 꽂기</span>
                        </button>
                      </>
                    ) : isOutlineActive ? (
                      <>
                        {outlineBoundTarget && (
                          <button
                            type="button"
                            disabled={isLoadingThis}
                            onClick={() => void handlePreviewAsset(entry)}
                            title={`연결된 ${basename(outlineBoundTarget.vdocPath)} + .outline 동시 AI 느낌 보기`}
                            className="flex flex-1 items-center justify-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)]/25 px-2 py-1 text-[10.5px] font-medium text-[#ddd6fe] ring-1 ring-[var(--obs-accent,#8a5cf5)]/40 transition-colors hover:bg-[var(--obs-accent,#8a5cf5)]/35 disabled:opacity-50"
                          >
                            {isLoadingThis ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            <span>느낌 보기 (AI)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleInsertSkeleton(entry)}
                          className={`flex items-center justify-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10.5px] font-medium text-emerald-200 ring-1 ring-emerald-500/35 hover:bg-emerald-500/30 ${
                            outlineBoundTarget ? "" : "flex-1"
                          }`}
                        >
                          <ListTree className="h-3 w-3" />
                          <span>{outlineBoundTarget ? "뼈대" : "아웃라인에 꽂기"}</span>
                        </button>
                      </>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleOpenAssetEditor(entry)}
                      title=".vasset 에셋 원본(DSL · 뉘앙스 규칙) 편집 탭으로 열기"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--obs-border,#363636)] bg-black/20 text-[var(--obs-text-muted,#9a9a9a)] hover:border-white/25 hover:text-white"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    );
  }
);
