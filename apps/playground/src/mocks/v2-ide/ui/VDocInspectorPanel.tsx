import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Blocks,
  BookOpen,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  FolderInput,
  Hash,
  Layers,
  Link2,
  ListTree,
  Lock,
  Palette,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Unlink,
  Unlock,
} from "lucide-react";
import {
  applyGridRatioPreset,
  applyTableColumnRatio,
  applyTableCommandToDocument,
  applyTableNestedListMarker,
  applyTableVisualPreset,
  CALLOUT_VARIANT_OPTIONS,
  type CalloutAccentColor,
  type CalloutBoxBlockDef,
  type CalloutBoxVariant,
  type ColumnsGridBlockDef,
  convertCalloutToText,
  convertTextToCallout,
  detectTableNestedListMarker,
  documentSurface,
  duplicateBlock,
  duplicatePage,
  extractAssetFromVDocBlock,
  findBlock,
  GRID_RATIO_PRESETS_2COL,
  GRID_RATIO_PRESETS_3COL,
  type ImageBlockDef,
  type LayoutBlock,
  type LinkCardBlockDef,
  LIST_MARKER_OPTIONS,
  mapBlock,
  moveBlockByOffset,
  removeBlock,
  removePage,
  reorderPageByOffset,
  resolveAccentPaletteChips,
  resolveBlockStyleBinding,
  resolveDocumentView,
  SECTION_ROLE_PRESETS,
  type StructuredTableBlockDef,
  swapTwoGridColumns,
  TABLE_COLUMN_RATIO_PRESETS_2COL,
  TABLE_VISUAL_PRESET_OPTIONS,
  type TextBlockDef,
  toggleBlockLock,
  toggleTableTopRowHeader,
  type VDocPage,
} from "@vibe/vdoc-schema";
import { basename } from "@vibe/vault-core";

import {
  buildStyleRefForEntry,
  collectVaultStyleEntries,
  fromVaultUri,
  resolveActiveStyleEntry,
  saveAssetToVault,
  STANDARD_SYNTAX_PATH,
  toVaultUri,
} from "@vibe/vault-formats";
import type { IdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import {
  bindVDocToExistingOutline,
  collectOutlineCandidatesForVDoc,
  formatProjectScopeLabel,
  importPartnerIntoProjectAndBind,
  inspectVDocOutlineLink,
  openOrCreateOutlineForVDoc,
  unlinkVDocFromOutline,
} from "@vibe/outline-sync";
import { MultiSelectionInspector } from "./MultiSelectionInspector";
import { useVDocDocument } from "./useVDocDocument";

export interface VDocInspectorPanelProps {
  readonly runtime: IdeWorkbenchRuntime;
  readonly path: string;
  readonly onSwitchToAi: () => void;
  readonly onSwitchToAssets?: () => void;
  /** 고른 것(여러 개)을 AI Composer 첨부로 보내고 AI 탭으로. */
  readonly onAttachSelectionToAi?: () => void;
}

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

type InspectorScopeOverride = "auto" | "document" | "section";

const SectionHeading: React.FC<{
  readonly title: string;
  readonly right?: React.ReactNode;
}> = ({ title, right }) => (
  <div className="mb-2 flex items-center justify-between">
    <span className="text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#777777)] uppercase">
      {title}
    </span>
    {right}
  </div>
);

const AlignButtons: React.FC<{
  readonly value: "left" | "center" | "right" | undefined;
  readonly onChange: (next: "left" | "center" | "right") => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-0.5">
    {(
      [
        { id: "left", label: "좌측", Icon: AlignLeft },
        { id: "center", label: "중앙", Icon: AlignCenter },
        { id: "right", label: "우측", Icon: AlignRight },
      ] as const
    ).map(({ id, label, Icon }) => {
      const active = value === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={label}
          className={`flex h-6 items-center justify-center rounded text-[11px] transition-colors ${
            active
              ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[var(--obs-text-normal,#ececec)]"
              : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.06))]"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      );
    })}
  </div>
);

export const VDocInspectorPanel: React.FC<VDocInspectorPanelProps> = React.memo(
  ({ runtime, path, onSwitchToAi, onSwitchToAssets, onAttachSelectionToAi }) => {
    const { vault, vdocUiBridge, docs } = runtime;

    const [doc, mutateDoc] = useVDocDocument(docs, path);
    const [styleRev, setStyleRev] = useState(0);
    const [scopeState, setScopeState] = useState<{
      readonly scope: InspectorScopeOverride;
      readonly anchorKey: string;
    }>({ scope: "auto", anchorKey: "" });
    const [newVarKey, setNewVarKey] = useState("");
    const [newVarVal, setNewVarVal] = useState("");
    const [dslOpen, setDslOpen] = useState(false);
    const [outlinePickerOpen, setOutlinePickerOpen] = useState(false);
    const [outlineQuery, setOutlineQuery] = useState("");

    // Fine-grained Zustand selectors: NEVER subscribe to hoveredBlockId (M5 perf SLA!)
    const storedActivePageId = useStore(vdocUiBridge, (s) => s.byPath[path]?.activePageId ?? null);
    const selectedBlockId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedBlockId ?? null);
    const selection = useStore(vdocUiBridge, (s) => s.byPath[path]?.selection ?? null);
    const isMultiSelection = Boolean(selection && selection.items.length > 1);
    const rawHiddenBlockIds = useStore(vdocUiBridge, (s) => s.byPath[path]?.hiddenBlockIds);

    const anchorKey = `${path}|${selectedBlockId ?? ""}`;
    const scopeOverride: InspectorScopeOverride =
      scopeState.anchorKey === anchorKey ? scopeState.scope : "auto";
    const setScopeOverride = (next: InspectorScopeOverride) => {
      setScopeState({ scope: next, anchorKey });
    };

    // `.vstyle` · `.outline` 변경 → 스타일 목록 · 연결 상태만 다시 본다
    useEffect(
      () =>
        vault.subscribe((ev) => {
          const changed =
            ev.type === "vault-reset" ? ".vstyle" : ev.type === "create" ? ev.node.path : ev.type === "rename" ? ev.newPath : ev.path;
          if (changed.endsWith(".vstyle") || changed.endsWith(".vstyle.json") || changed.endsWith(".outline")) {
            setStyleRev((r) => r + 1);
          }
        }),
      [vault]
    );

    const linkStatus = useMemo(() => {
      void styleRev;
      return inspectVDocOutlineLink(vault, path, doc);
    }, [vault, path, doc, styleRev]);

    const outlineCandidates = useMemo(() => {
      if (!outlinePickerOpen) return [];
      void styleRev;
      const all = collectOutlineCandidatesForVDoc(vault, path, doc, { includeExternal: false });
      const q = outlineQuery.trim().toLowerCase();
      if (!q) return all;
      return all.filter(
        (c) =>
          c.outlinePath.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.docDirectives.some((d) => d.label.toLowerCase().includes(q))
      );
    }, [outlinePickerOpen, styleRev, vault, path, doc, outlineQuery]);

    const activePageId = storedActivePageId ?? doc.pages[0]?.pageId ?? "";
    const activePage = useMemo(
      () => doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0] ?? null,
      [doc.pages, activePageId]
    );

    let selectedBlockLoc: { page: VDocPage; block: LayoutBlock; index: number } | null = null;
    if (selectedBlockId) {
      const hit = findBlock(doc, selectedBlockId);
      if (hit) {
        const page = doc.pages.find((p) => p.pageId === hit.pageId);
        if (page) {
          selectedBlockLoc = { page, block: hit.block, index: hit.index };
        }
      }
    }

    const effectiveScope: "document" | "section" | "block" =
      scopeOverride === "document"
        ? "document"
        : scopeOverride === "section"
          ? activePage
            ? "section"
            : "document"
          : selectedBlockLoc
            ? "block"
            : activePage
              ? "section"
              : "document";

    const styleCatalog = useMemo(() => {
      void styleRev;
      return collectVaultStyleEntries(vault);
    }, [vault, styleRev]);

    const activeStyleEntry = useMemo(
      () => resolveActiveStyleEntry(doc, vault, styleCatalog, path),
      [doc, vault, styleCatalog, path]
    );

    const accentChips = useMemo(
      () => resolveAccentPaletteChips(activeStyleEntry?.pack ?? null, doc.styleRef?.mode),
      [activeStyleEntry, doc.styleRef?.mode]
    );

    const activeView = useMemo(() => resolveDocumentView(doc), [doc]);
    const surface = useMemo(() => documentSurface(doc), [doc]);
    const isSectionDoc = activeView.unitKind === "section";

    const mutateSelectedBlock = useCallback(
      (updater: (prev: LayoutBlock) => LayoutBlock) => {
        if (!selectedBlockLoc) return;
        const { page, block } = selectedBlockLoc;
        mutateDoc((prev) => {
          const next = mapBlock(prev, page.pageId, block.blockId, updater);
          return next === prev ? prev : { ...next, updatedAt: new Date().toISOString() };
        });
      },
      [mutateDoc, selectedBlockLoc]
    );

    const mutateActivePage = useCallback(
      (updater: (prev: VDocPage) => VDocPage) => {
        if (!activePage) return;
        mutateDoc((prev) => ({
          ...prev,
          pages: prev.pages.map((p) => (p.pageId === activePage.pageId ? updater(p) : p)),
          updatedAt: new Date().toISOString(),
        }));
      },
      [mutateDoc, activePage]
    );

    const handleOpenVaultPointer = useCallback(
      (rawPointer: string | undefined) => {
        if (!rawPointer) return;
        const resolved = fromVaultUri(rawPointer) ?? rawPointer;
        if (vault.exists(resolved)) {
          runtime.openFileInPairTabGroup(resolved, { sourcePath: path });
        }
      },
      [runtime, vault, path]
    );

    const handleAddVariable = (ev: React.FormEvent) => {
      ev.preventDefault();
      const k = newVarKey.trim();
      if (!k) return;
      mutateDoc((prev) => ({
        ...prev,
        variables: { ...prev.variables, [k]: newVarVal.trim() },
        updatedAt: new Date().toISOString(),
      }));
      setNewVarKey("");
      setNewVarVal("");
    };

    const selectedBlockBinding = useMemo(
      () =>
        selectedBlockLoc
          ? resolveBlockStyleBinding(selectedBlockLoc.block, activeStyleEntry?.pack ?? null)
          : null,
      [selectedBlockLoc, activeStyleEntry]
    );

    const isSelectedBlockHidden = Boolean(
      selectedBlockLoc && rawHiddenBlockIds?.has(selectedBlockLoc.block.blockId)
    );

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden text-[12px] text-[var(--obs-text-normal,#dadada)]">
        {/* Figma-style 3-Tier Context Breadcrumb */}
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)]/60 px-2.5 py-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setScopeOverride("document");
              vdocUiBridge.getState().selectBlock(path, null);
            }}
            className={`shrink-0 rounded px-1.5 py-0.5 transition-colors ${
              effectiveScope === "document"
                ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff]"
                : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.06))] hover:text-[var(--obs-text-normal,#dadada)]"
            }`}
          >
            문서
          </button>

          {activePage && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-45" />
              <button
                type="button"
                onClick={() => {
                  setScopeOverride("section");
                  vdocUiBridge.getState().selectBlock(path, null, activePage.pageId);
                }}
                title={activePage.pageLabel}
                className={`min-w-0 truncate rounded px-1.5 py-0.5 transition-colors ${
                  effectiveScope === "section"
                    ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff]"
                    : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.06))] hover:text-[var(--obs-text-normal,#dadada)]"
                }`}
              >
                {activePage.pageLabel || (isSectionDoc ? "섹션" : "페이지")}
              </button>
            </>
          )}

          {selectedBlockLoc && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-45" />
              <button
                type="button"
                onClick={() => setScopeOverride("auto")}
                title={selectedBlockLoc.block.title}
                className={`min-w-0 truncate rounded px-1.5 py-0.5 transition-colors ${
                  effectiveScope === "block"
                    ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff]"
                    : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.06))]"
                }`}
              >
                {selectedBlockLoc.block.title || selectedBlockLoc.block.kind}
              </button>
            </>
          )}
        </div>

        {/* Scrollable Inspector Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {/* ===================== 1. DOCUMENT CONTEXT ===================== */}
          {effectiveScope === "document" && (
            <>
              {/* Style Pack Switcher (WYSIWYM Skin Binding) */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading
                  title="스타일 팩 (.vstyle)"
                  right={
                    activeStyleEntry?.vaultPath && (
                      <button
                        type="button"
                        onClick={() =>
                          runtime.openFileInPairTabGroup(activeStyleEntry.vaultPath!, { sourcePath: path })
                        }
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                      >
                        <Palette className="h-3 w-3" />
                        <span>스킨 열기</span>
                      </button>
                    )
                  }
                />

                <select
                  aria-label="Style pack selector"
                  value={activeStyleEntry?.id ?? ""}
                  onChange={(ev) => {
                    const chosen = styleCatalog.find((e) => e.id === ev.target.value);
                    if (!chosen) return;
                    mutateDoc((prev) => ({
                      ...prev,
                      styleRef: buildStyleRefForEntry(chosen),
                      updatedAt: new Date().toISOString(),
                    }));
                  }}
                  className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1.5 text-[11.5px] text-[var(--obs-text-normal,#ececec)] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                >
                  {styleCatalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.pack.name} {entry.source === "vault" ? "(Vault)" : "(기본)"}
                    </option>
                  ))}
                </select>

                {activeStyleEntry && (
                  <div className="mt-2 space-y-1.5">
                    {Object.keys(activeStyleEntry.pack.modes ?? {}).length > 1 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--obs-text-muted,#9a9a9a)]">모드</span>
                        <select
                          aria-label="Style mode"
                          value={doc.styleRef?.mode ?? "default"}
                          onChange={(ev) => {
                            mutateDoc((prev) => ({
                              ...prev,
                              styleRef: buildStyleRefForEntry(activeStyleEntry, ev.target.value),
                              updatedAt: new Date().toISOString(),
                            }));
                          }}
                          className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-0.5 text-[11px] outline-none"
                        >
                          {Object.keys(activeStyleEntry.pack.modes).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {activeStyleEntry.pack.description && (
                      <p className="text-[10.5px] leading-4 text-[var(--obs-text-faint,#888888)]">
                        {activeStyleEntry.pack.description}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Profile, Surface & Reference */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading title="문서 프로필 & 지면" />
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--obs-text-muted,#9a9a9a)]">프로필</span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-code text-[10.5px] text-emerald-300">
                      {activeView.label} ({doc.schemaRef?.profileId ?? activeView.id})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--obs-text-muted,#9a9a9a)]">지면 규격</span>
                    <span className="font-code text-[10.5px] text-[var(--obs-text-normal,#dadada)]">
                      {surface.kind} · {surface.width}px
                    </span>
                  </div>
                  {doc.schemaRef?.elementIds && doc.schemaRef.elementIds.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--obs-text-muted,#9a9a9a)]">요소 규격</span>
                      <span className="font-code text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)]">
                        {doc.schemaRef.elementIds.join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Obsidian-style Explicit Links Card (`.vproj` scoped) */}
                <div className="mt-2.5 space-y-2 border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#777777)] uppercase">
                      <Link2 className="h-3 w-3 text-emerald-400" />
                      <span>명시적 연결 (.outline)</span>
                    </span>
                    {linkStatus.kind === "linked" ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium ${
                          linkStatus.healed
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {linkStatus.healed ? "이동됨 · 복구 가능" : "연결됨"}
                      </span>
                    ) : linkStatus.kind === "out-of-scope" ? (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-300">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>프로젝트 외부</span>
                      </span>
                    ) : linkStatus.kind === "broken" ? (
                      <span className="flex items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-rose-300">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>경로 끊어짐</span>
                      </span>
                    ) : (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9.5px] text-[var(--obs-text-faint,#888)]">
                        미연결
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[var(--obs-text-faint,#808080)]">
                    <span>연동 경계</span>
                    <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0 text-violet-200">
                      {formatProjectScopeLabel(
                        linkStatus.kind === "linked"
                          ? linkStatus.projectPath
                          : linkStatus.currentProjectPath
                      )}
                    </span>
                  </div>

                  {linkStatus.kind === "linked" ? (
                    <div className="rounded border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-200">
                        <ListTree className="h-3 w-3 shrink-0 text-emerald-400" />
                        <span className="truncate">{basename(linkStatus.outlinePath)}</span>
                      </div>
                      <div className="mt-0.5 truncate pl-4 font-code text-[9.5px] text-[var(--obs-text-faint,#888)]">
                        {linkStatus.outlinePath}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            openOrCreateOutlineForVDoc(
                              vault,
                              path,
                              (target) => runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                              { allowCreate: false }
                            )
                          }
                          className="flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/25"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          <span>{linkStatus.healed ? "복구 후 열기" : "열기"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutlinePickerOpen((v) => !v)}
                          className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-0.5 text-[10px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                        >
                          변경
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            unlinkVDocFromOutline(vault, path);
                            setOutlinePickerOpen(false);
                          }}
                          title="명시적 연결 해제"
                          className="ml-auto flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--obs-text-faint,#888)] hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Unlink className="h-2.5 w-2.5" />
                          <span>해제</span>
                        </button>
                      </div>
                    </div>
                  ) : linkStatus.kind === "out-of-scope" ? (
                    <div className="space-y-1.5 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                      <div className="truncate font-code text-[9.5px] text-amber-200">
                        {linkStatus.externalOutlinePath}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            importPartnerIntoProjectAndBind(
                              vault,
                              path,
                              linkStatus.externalOutlinePath,
                              {
                                rootNodeId: linkStatus.rootNodeId,
                                openLink: (target) =>
                                  runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                              }
                            );
                            setOutlinePickerOpen(false);
                          }}
                          className="flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-500/30"
                        >
                          <FolderInput className="h-2.5 w-2.5" />
                          <span>이 프로젝트로 등록</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            unlinkVDocFromOutline(vault, path);
                            setOutlinePickerOpen(false);
                          }}
                          className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/15"
                        >
                          해제
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {linkStatus.kind === "broken" && (
                        <div className="truncate rounded border border-rose-500/25 bg-rose-500/10 px-2 py-1 font-code text-[9.5px] text-rose-200">
                          {fromVaultUri(linkStatus.rawOutlineUri) ?? linkStatus.rawOutlineUri}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setOutlinePickerOpen((v) => !v)}
                          className="flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10.5px] text-emerald-200 hover:bg-emerald-500/25"
                        >
                          <Link2 className="h-3 w-3" />
                          <span>기존 .outline 연결</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            openOrCreateOutlineForVDoc(
                              vault,
                              path,
                              (target) => runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                              { allowCreate: true }
                            );
                            setOutlinePickerOpen(false);
                          }}
                          className="flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[10.5px] text-sky-300 hover:bg-sky-500/20"
                        >
                          <FilePlus2 className="h-3 w-3" />
                          <span>새 .outline 추출</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {outlinePickerOpen && (
                    <div className="rounded border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-secondary,#242424)] p-2">
                      <div className="relative mb-1.5">
                        <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-[var(--obs-text-faint,#777)]" />
                        <input
                          type="text"
                          value={outlineQuery}
                          onChange={(ev) => setOutlineQuery(ev.target.value)}
                          placeholder=".outline 검색..."
                          className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1a1a1a)] py-1 pr-2 pl-6 text-[10.5px] outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div className="max-h-36 space-y-1 overflow-y-auto">
                        {outlineCandidates.length === 0 ? (
                          <div className="py-2 text-center text-[10px] text-[var(--obs-text-faint,#777)]">
                            연결 가능한 .outline 없음
                          </div>
                        ) : (
                          outlineCandidates.map((cand) => (
                            <button
                              key={cand.outlinePath}
                              type="button"
                              onClick={() => {
                                if (cand.inScope) {
                                  bindVDocToExistingOutline(vault, path, cand.outlinePath, {
                                    rootNodeId: cand.docDirectives[0]?.nodeId,
                                    openLink: (target) =>
                                      runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                                  });
                                } else {
                                  importPartnerIntoProjectAndBind(vault, path, cand.outlinePath, {
                                    rootNodeId: cand.docDirectives[0]?.nodeId,
                                    openLink: (target) =>
                                      runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                                  });
                                }
                                setOutlinePickerOpen(false);
                              }}
                              className="flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[10.5px] hover:bg-white/5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-[var(--obs-text-normal,#ececec)]">
                                  {basename(cand.outlinePath)}
                                </div>
                                <div className="truncate font-code text-[9px] text-[var(--obs-text-faint,#808080)]">
                                  {cand.folder || "/"}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] ${
                                  cand.inScope
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-amber-500/15 text-amber-200"
                                }`}
                              >
                                {cand.inScope ? "연결" : "등록"}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenVaultPointer(doc.schemaRef?.registryPath ?? STANDARD_SYNTAX_PATH)
                      }
                      className="flex items-center gap-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-[var(--obs-text-normal,#ececec)]"
                    >
                      <FileCode2 className="h-3 w-3 text-indigo-400" />
                      <span>.vsyntax 규격</span>
                    </button>
                    {doc.sourceRef && (
                      <button
                        type="button"
                        onClick={() => handleOpenVaultPointer(doc.sourceRef)}
                        className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-300 hover:bg-amber-500/20"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>원본 .ref 대조</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Document Variables (Obsidian Properties parity) */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading
                  title={`문서 메타 (${Object.keys(doc.variables ?? {}).length})`}
                />
                <div className="space-y-1.5">
                  {Object.entries(doc.variables ?? {}).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span
                        title={key}
                        className="w-16 shrink-0 truncate font-code text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]"
                      >
                        {key}
                      </span>
                      <input
                        type="text"
                        value={val}
                        onChange={(ev) => {
                          const nextVal = ev.target.value;
                          mutateDoc((prev) => ({
                            ...prev,
                            variables: { ...prev.variables, [key]: nextVal },
                            updatedAt: new Date().toISOString(),
                          }));
                        }}
                        className="min-w-0 flex-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          mutateDoc((prev) => {
                            const nextVars = { ...prev.variables };
                            delete nextVars[key];
                            return { ...prev, variables: nextVars, updatedAt: new Date().toISOString() };
                          });
                        }}
                        title="메타 삭제"
                        className="shrink-0 rounded p-0.5 text-[var(--obs-text-faint,#666666)] hover:text-[#fb464c]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddVariable} className="mt-2 flex items-center gap-1">
                  <input
                    type="text"
                    value={newVarKey}
                    onChange={(ev) => setNewVarKey(ev.target.value)}
                    placeholder="키"
                    className="w-16 shrink-0 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                  />
                  <input
                    type="text"
                    value={newVarVal}
                    onChange={(ev) => setNewVarVal(ev.target.value)}
                    placeholder="값 추가..."
                    className="min-w-0 flex-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                  />
                  <button
                    type="submit"
                    disabled={!newVarKey.trim()}
                    title="메타 추가"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--obs-accent,#8a5cf5)]/25 text-[#c4b5fd] hover:bg-[var(--obs-accent,#8a5cf5)]/40 disabled:opacity-35"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </form>
              </section>
            </>
          )}

          {/* ===================== 2. SECTION CONTEXT ===================== */}
          {effectiveScope === "section" && activePage && (
            <>
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading
                  title={isSectionDoc ? "섹션 속성" : "페이지 속성"}
                  right={
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => mutateDoc((prev) => reorderPageByOffset(prev, activePage.pageId, -1))}
                        disabled={doc.pages[0]?.pageId === activePage.pageId}
                        title="위로 이동"
                        className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mutateDoc((prev) => reorderPageByOffset(prev, activePage.pageId, 1))}
                        disabled={doc.pages[doc.pages.length - 1]?.pageId === activePage.pageId}
                        title="아래로 이동"
                        className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mutateDoc((prev) => duplicatePage(prev, activePage.pageId, uidFactory))}
                        title="복제"
                        className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      {doc.pages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => mutateDoc((prev) => removePage(prev, activePage.pageId))}
                          title="삭제"
                          className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:text-[#fb464c]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  }
                />

                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                      {isSectionDoc ? "섹션 이름" : "페이지 이름"}
                    </label>
                    <input
                      type="text"
                      value={activePage.pageLabel}
                      onChange={(ev) => {
                        const val = ev.target.value;
                        mutateActivePage((p) => ({ ...p, pageLabel: val }));
                      }}
                      className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11.5px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                    />
                  </div>

                  {isSectionDoc && (
                    <div>
                      <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                        의미 역할 (sectionRole)
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {SECTION_ROLE_PRESETS.map((role) => {
                          const active = (activePage.sectionRole ?? "body") === role.id;
                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => mutateActivePage((p) => ({ ...p, sectionRole: role.id }))}
                              className={`rounded px-2 py-0.5 text-[10.5px] transition-colors ${
                                active
                                  ? "bg-emerald-500/25 font-medium text-emerald-300 ring-1 ring-emerald-500/50"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-[var(--obs-text-normal,#ececec)]"
                              }`}
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Quick Style Pack Jump Banner */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading
                  title="적용 스킨"
                  right={
                    <button
                      type="button"
                      onClick={() => setScopeOverride("document")}
                      className="text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:underline"
                    >
                      문서 설정 →
                    </button>
                  }
                />
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium text-[var(--obs-text-normal,#ececec)]">
                    {activeStyleEntry?.pack.name ?? "기본 스타일"}
                  </span>
                  {activeStyleEntry?.vaultPath && (
                    <button
                      type="button"
                      onClick={() =>
                        runtime.openFileInPairTabGroup(activeStyleEntry.vaultPath!, { sourcePath: path })
                      }
                      className="shrink-0 rounded border border-[var(--obs-border,#363636)] px-1.5 py-0.5 text-[10px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                    >
                      .vstyle 편집
                    </button>
                  )}
                </div>
              </section>

              {/* Blocks in this Section */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading title={`구성 블록 (${activePage.blocks.length})`} />
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {activePage.blocks.map((b) => {
                    const tag =
                      b.kind === "callout-box" && b.variant
                        ? b.variant
                        : b.kind === "link-card" && b.variant
                          ? b.variant
                          : b.kind;
                    return (
                      <button
                        key={b.blockId}
                        type="button"
                        onClick={() => {
                          vdocUiBridge.getState().selectBlock(path, b.blockId, activePage.pageId);
                          vdocUiBridge.getState().requestScrollTo(path, b.blockId, activePage.pageId);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.06))] hover:text-[var(--obs-text-normal,#ececec)]"
                      >
                        <span className="min-w-0 flex-1 truncate">{b.title || b.kind}</span>
                        <span className="shrink-0 rounded bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 font-code text-[9.5px] text-[var(--obs-text-faint,#888888)]">
                          {tag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Outline DSL Snapshot Preview (Mean Layer) */}
              {activePage.outlineDsl && activePage.outlineDsl.length > 0 && (
                <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                  <button
                    type="button"
                    onClick={() => setDslOpen((v) => !v)}
                    className="flex w-full items-center justify-between text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#777777)] uppercase hover:text-[var(--obs-text-normal,#dadada)]"
                  >
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-emerald-400" />
                      <span>Outline DSL (Mean)</span>
                    </span>
                    <span className="font-code text-[10px] normal-case">
                      {dslOpen ? "접기" : `${activePage.outlineDsl.length} lines`}
                    </span>
                  </button>
                  {dslOpen && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-[#141414] p-2 font-code text-[10px] leading-4 whitespace-pre-wrap text-[#c9d1d9]">
                      {activePage.outlineDsl.join("\n")}
                    </pre>
                  )}
                </section>
              )}
            </>
          )}

          {/* ===================== 3. BLOCK CONTEXT ===================== */}
          {isMultiSelection && selection && effectiveScope === "block" && (
            <MultiSelectionInspector
              path={path}
              doc={doc}
              selection={selection}
              bridge={vdocUiBridge}
              mutateDoc={mutateDoc}
              onSendToAi={onAttachSelectionToAi}
            />
          )}
          {effectiveScope === "block" && selectedBlockLoc && !isMultiSelection && (
            <>
              {/* Block Common Header & Actions */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)]/20 px-1.5 py-0.5 font-code text-[10px] font-medium text-[#c4b5fd]">
                      <Layers className="h-3 w-3" />
                      <span>{selectedBlockLoc.block.kind}</span>
                    </span>
                    {doc.outlineRef && selectedBlockLoc.block.sourceNodeId && (
                      <button
                        type="button"
                        onClick={() =>
                          openOrCreateOutlineForVDoc(
                            vault,
                            path,
                            (target) =>
                              runtime.openFileInPairTabGroup(target, { sourcePath: path }),
                            { focusNodeId: selectedBlockLoc.block.sourceNodeId }
                          )
                        }
                        title="원천 .outline 불릿으로 이동"
                        className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <ListTree className="h-2.5 w-2.5" />
                        <span>불릿</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        mutateDoc((prev) =>
                          moveBlockByOffset(prev, selectedBlockLoc.page.pageId, selectedBlockLoc.index, -1)
                        )
                      }
                      disabled={selectedBlockLoc.index === 0}
                      title="위로 이동"
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateDoc((prev) =>
                          moveBlockByOffset(prev, selectedBlockLoc.page.pageId, selectedBlockLoc.index, 1)
                        )
                      }
                      disabled={selectedBlockLoc.index >= selectedBlockLoc.page.blocks.length - 1}
                      title="아래로 이동"
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateDoc((prev) =>
                          toggleBlockLock(prev, selectedBlockLoc.page.pageId, selectedBlockLoc.block.blockId)
                        )
                      }
                      title={selectedBlockLoc.block.locked ? "잠금 해제" : "잠금"}
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                    >
                      {selectedBlockLoc.block.locked ? (
                        <Lock className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        vdocUiBridge.getState().toggleHiddenBlock(path, selectedBlockLoc.block.blockId)
                      }
                      title={isSelectedBlockHidden ? "보이기" : "숨기기"}
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                    >
                      {isSelectedBlockHidden ? (
                        <EyeOff className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateDoc((prev) =>
                          duplicateBlock(
                            prev,
                            selectedBlockLoc.page.pageId,
                            selectedBlockLoc.block.blockId,
                            uidFactory
                          )
                        )
                      }
                      title="복제"
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        mutateDoc((prev) =>
                          removeBlock(prev, selectedBlockLoc.page.pageId, selectedBlockLoc.block.blockId)
                        );
                        vdocUiBridge.getState().selectBlock(path, null, selectedBlockLoc.page.pageId);
                      }}
                      title="삭제"
                      className="rounded p-1 text-[var(--obs-text-muted,#9a9a9a)] hover:text-[#fb464c]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  aria-label="Block title"
                  value={selectedBlockLoc.block.title}
                  onChange={(ev) => {
                    const nextTitle = ev.target.value;
                    mutateSelectedBlock((b) => ({ ...b, title: nextTitle }));
                  }}
                  placeholder="블록 이름"
                  className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11.5px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />

                {selectedBlockLoc.block.assetRef && (
                  <div className="mt-2 flex items-center justify-between gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <Blocks className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span className="truncate font-code">
                        {selectedBlockLoc.block.assetRef.assetId}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const ap = selectedBlockLoc.block.assetRef?.assetPath;
                        if (ap) {
                          handleOpenVaultPointer(ap);
                        } else {
                          onSwitchToAssets?.();
                        }
                      }}
                      className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9.5px] font-medium hover:bg-emerald-500/30"
                    >
                      열기
                    </button>
                  </div>
                )}

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onSwitchToAi}
                    className="flex items-center justify-center gap-1 rounded border border-[var(--obs-accent,#8a5cf5)]/40 bg-[var(--obs-accent,#8a5cf5)]/12 px-2 py-1 text-[10.5px] font-medium text-[#c4b5fd] transition-colors hover:bg-[var(--obs-accent,#8a5cf5)]/25"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>AI 다듬기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const draft = extractAssetFromVDocBlock(selectedBlockLoc.block, doc.slots, {
                        title: `${selectedBlockLoc.block.title || selectedBlockLoc.block.kind} 양식`,
                        sourceRef: `${toVaultUri(path)}#${selectedBlockLoc.block.blockId}`,
                      });
                      const savedPath = saveAssetToVault(vault, draft);
                      runtime.pushLog("vault", "ok", `captured block asset: ${savedPath}`);
                      onSwitchToAssets?.();
                    }}
                    title="이 블록의 순수 구조 골격을 .vasset 에셋으로 즉시 등록"
                    className="flex items-center justify-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/12 px-2 py-1 text-[10.5px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
                  >
                    <Blocks className="h-3 w-3 text-emerald-400" />
                    <span>에셋 등록</span>
                  </button>
                </div>
              </section>

              {/* ---- 3A. Callout-Box Inspector (quote / info-frame / accent-bar / disclosure) ---- */}
              {selectedBlockLoc.block.kind === "callout-box" && (() => {
                const block = selectedBlockLoc.block as CalloutBoxBlockDef;
                const activeVariant: CalloutBoxVariant = block.variant ?? "default";
                const kvItems = block.kvItems ?? [];

                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <div>
                      <SectionHeading title="의미 변형 (Variant)" />
                      <div className="grid grid-cols-2 gap-1">
                        {CALLOUT_VARIANT_OPTIONS.map((opt) => {
                          const active = activeVariant === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) => {
                                  const cb = b as CalloutBoxBlockDef;
                                  return {
                                    ...cb,
                                    variant: opt.id,
                                    ...(opt.id === "accent-bar" && !cb.accentColor
                                      ? { accentColor: "pink" as CalloutAccentColor }
                                      : {}),
                                  };
                                })
                              }
                              className={`flex items-center justify-between rounded px-2 py-1 text-[11px] transition-colors ${
                                active
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                              }`}
                            >
                              <span>{opt.label}</span>
                              <span className="font-code text-[9.5px] opacity-60">{opt.dslHint}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Semantic Accent Palette Chips (accent-bar) */}
                    {activeVariant === "accent-bar" && (
                      <div>
                        <SectionHeading title="시맨틱 강조 팔레트" />
                        <div className="flex flex-wrap gap-1.5">
                          {accentChips.map((chip) => {
                            const active = (block.accentColor ?? "pink") === chip.key;
                            return (
                              <button
                                key={chip.key}
                                type="button"
                                onClick={() =>
                                  mutateSelectedBlock((b) => ({
                                    ...(b as CalloutBoxBlockDef),
                                    accentColor: chip.key,
                                  }))
                                }
                                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors ${
                                  active
                                    ? "border-[var(--obs-accent,#8a5cf5)] bg-[var(--obs-accent,#8a5cf5)]/20 text-white"
                                    : "border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                                }`}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full border border-black/20"
                                  style={{ backgroundColor: chip.fill }}
                                />
                                <span>{chip.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Alignment */}
                    <div>
                      <SectionHeading title="정렬" />
                      <AlignButtons
                        value={block.align}
                        onChange={(nextAlign) =>
                          mutateSelectedBlock((b) => ({
                            ...(b as CalloutBoxBlockDef),
                            align: nextAlign,
                          }))
                        }
                      />
                    </div>

                    {/* Key-Value Metadata Editor (info-frame) */}
                    {(activeVariant === "info-frame" || kvItems.length > 0) && (
                      <div>
                        <SectionHeading
                          title={`메타 행 (::) · ${kvItems.length}`}
                          right={
                            <button
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) => {
                                  const cb = b as CalloutBoxBlockDef;
                                  return {
                                    ...cb,
                                    kvItems: [...(cb.kvItems ?? []), { key: "항목", value: "" }],
                                  };
                                })
                              }
                              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                            >
                              <Plus className="h-3 w-3" />
                              <span>행 추가</span>
                            </button>
                          }
                        />
                        <div className="space-y-1.5">
                          {kvItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <input
                                type="text"
                                value={item.key}
                                onChange={(ev) => {
                                  const nextKey = ev.target.value;
                                  mutateSelectedBlock((b) => {
                                    const cb = b as CalloutBoxBlockDef;
                                    const next = (cb.kvItems ?? []).map((row, i) =>
                                      i === idx ? { ...row, key: nextKey } : row
                                    );
                                    return { ...cb, kvItems: next };
                                  });
                                }}
                                placeholder="키"
                                className="w-16 shrink-0 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                              />
                              <input
                                type="text"
                                value={item.value}
                                onChange={(ev) => {
                                  const nextVal = ev.target.value;
                                  mutateSelectedBlock((b) => {
                                    const cb = b as CalloutBoxBlockDef;
                                    const next = (cb.kvItems ?? []).map((row, i) =>
                                      i === idx ? { ...row, value: nextVal } : row
                                    );
                                    return { ...cb, kvItems: next };
                                  });
                                }}
                                placeholder="값"
                                className="min-w-0 flex-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  mutateSelectedBlock((b) => {
                                    const cb = b as CalloutBoxBlockDef;
                                    return {
                                      ...cb,
                                      kvItems: (cb.kvItems ?? []).filter((_, i) => i !== idx),
                                    };
                                  })
                                }
                                title="행 삭제"
                                className="shrink-0 rounded p-0.5 text-[var(--obs-text-faint,#666666)] hover:text-[#fb464c]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Demote back to Text */}
                    <div className="border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2">
                      <button
                        type="button"
                        onClick={() => mutateSelectedBlock((b) => convertCalloutToText(b as CalloutBoxBlockDef))}
                        className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                      >
                        일반 본문(text)으로 되돌리기
                      </button>
                    </div>
                  </section>
                );
              })()}

              {/* ---- 3B. Image Inspector ---- */}
              {selectedBlockLoc.block.kind === "image" && (() => {
                const block = selectedBlockLoc.block as ImageBlockDef;
                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <SectionHeading title="이미지 슬롯 ([img])" />
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          이미지 주소 (URL / Vault)
                        </label>
                        <input
                          type="text"
                          value={block.src}
                          onChange={(ev) => {
                            const val = ev.target.value;
                            mutateSelectedBlock((b) => ({ ...(b as ImageBlockDef), src: val }));
                          }}
                          className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 font-code text-[10.5px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          대체 설명 (alt)
                        </label>
                        <input
                          type="text"
                          value={block.alt ?? ""}
                          onChange={(ev) => {
                            const val = ev.target.value;
                            mutateSelectedBlock((b) => ({ ...(b as ImageBlockDef), alt: val }));
                          }}
                          className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          하단 캡션
                        </label>
                        <input
                          type="text"
                          value={block.caption ?? ""}
                          onChange={(ev) => {
                            const val = ev.target.value;
                            mutateSelectedBlock((b) => ({
                              ...(b as ImageBlockDef),
                              caption: val || undefined,
                            }));
                          }}
                          placeholder="사진 설명 (비우면 숨김)"
                          className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          폭 비율
                        </label>
                        <div className="grid grid-cols-4 gap-1">
                          {["100%", "85%", "70%", "50%"].map((w) => (
                            <button
                              key={w}
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) => ({ ...(b as ImageBlockDef), width: w }))
                              }
                              className={`rounded py-0.5 font-code text-[10.5px] ${
                                (block.width ?? "100%") === w
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[#e9d5ff]"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                              }`}
                            >
                              {w}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                            채움 방식
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            {(["cover", "contain"] as const).map((fit) => (
                              <button
                                key={fit}
                                type="button"
                                onClick={() =>
                                  mutateSelectedBlock((b) => ({
                                    ...(b as ImageBlockDef),
                                    objectFit: fit,
                                    fit,
                                  }))
                                }
                                className={`rounded py-0.5 font-code text-[10.5px] ${
                                  (block.objectFit ?? block.fit ?? "cover") === fit
                                    ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[#e9d5ff]"
                                    : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                                }`}
                              >
                                {fit}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                            정렬
                          </label>
                          <AlignButtons
                            value={block.align}
                            onChange={(nextAlign) =>
                              mutateSelectedBlock((b) => ({
                                ...(b as ImageBlockDef),
                                align: nextAlign,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* ---- 3C. Columns-Grid Inspector (Photo Strip / Collage / Multi-Col) ---- */}
              {selectedBlockLoc.block.kind === "columns-grid" && (() => {
                const block = selectedBlockLoc.block as ColumnsGridBlockDef;
                const colCount = block.columns?.length ?? block.slotIds?.length ?? block.widths.length;
                const presets = colCount === 3 ? GRID_RATIO_PRESETS_3COL : GRID_RATIO_PRESETS_2COL;
                const currentRatioSig = block.widths.join(":");

                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <SectionHeading
                      title={`분할 그리드 (|) · ${colCount}단`}
                      right={
                        colCount === 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              mutateSelectedBlock((b) => swapTwoGridColumns(b as ColumnsGridBlockDef))
                            }
                            title="좌우 컬럼 스왑"
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.07))]"
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            <span>좌우 스왑</span>
                          </button>
                        )
                      }
                    />

                    <div>
                      <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                        비율 프리셋
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {presets.map((p) => {
                          const active = currentRatioSig === p.widths.join(":");
                          return (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) =>
                                  applyGridRatioPreset(b as ColumnsGridBlockDef, p.widths)
                                )
                              }
                              className={`rounded py-1 font-code text-[10.5px] ${
                                active
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                              }`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          표현 스타일
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          {(
                            [
                              { id: "plain", label: "스트립" },
                              { id: "card", label: "카드" },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) => ({
                                  ...(b as ColumnsGridBlockDef),
                                  cardStyle: opt.id,
                                }))
                              }
                              className={`rounded py-1 text-[10.5px] ${
                                (block.cardStyle ?? "card") === opt.id
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[#e9d5ff]"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                          간격 (px)
                        </label>
                        <div className="grid grid-cols-4 gap-0.5">
                          {[0, 4, 8, 16].map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                mutateSelectedBlock((b) => ({
                                  ...(b as ColumnsGridBlockDef),
                                  gap: g,
                                }))
                              }
                              className={`rounded py-1 font-code text-[10px] ${
                                (block.gap ?? 12) === g
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[#e9d5ff]"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {block.columns && block.columns.some((c) => Boolean(c.image)) && (
                      <div className="space-y-2 border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2">
                        <span className="block text-[10.5px] font-semibold text-[var(--obs-text-muted,#9a9a9a)]">
                          컬럼 이미지
                        </span>
                        {block.columns.map((col, idx) =>
                          col.image ? (
                            <div
                              key={idx}
                              className="space-y-1 rounded border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] p-1.5"
                            >
                              <div className="flex items-center justify-between text-[10px] text-[var(--obs-text-faint,#888888)]">
                                <span>컬럼 {idx + 1}</span>
                                <span className="font-code">{block.widths[idx] ?? "1fr"}</span>
                              </div>
                              <input
                                type="text"
                                value={col.image.alt ?? ""}
                                onChange={(ev) => {
                                  const nextAlt = ev.target.value;
                                  mutateSelectedBlock((b) => {
                                    const gb = b as ColumnsGridBlockDef;
                                    return {
                                      ...gb,
                                      columns: gb.columns?.map((c, i) =>
                                        i === idx && c.image
                                          ? { ...c, image: { ...c.image, alt: nextAlt } }
                                          : c
                                      ),
                                    };
                                  });
                                }}
                                placeholder="설명 (alt)"
                                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-1.5 py-0.5 text-[10.5px] outline-none"
                              />
                              <input
                                type="text"
                                value={col.image.src}
                                onChange={(ev) => {
                                  const nextSrc = ev.target.value;
                                  mutateSelectedBlock((b) => {
                                    const gb = b as ColumnsGridBlockDef;
                                    return {
                                      ...gb,
                                      columns: gb.columns?.map((c, i) =>
                                        i === idx && c.image
                                          ? { ...c, image: { ...c.image, src: nextSrc } }
                                          : c
                                      ),
                                    };
                                  });
                                }}
                                placeholder="이미지 URL"
                                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-1.5 py-0.5 font-code text-[10px] outline-none"
                              />
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* ---- 3D. Link-Card / CTA Inspector ---- */}
              {selectedBlockLoc.block.kind === "link-card" && (() => {
                const block = selectedBlockLoc.block as LinkCardBlockDef;
                const vaultTarget = fromVaultUri(block.url);
                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <SectionHeading title="링크 / CTA ([cta])" />
                    <div className="grid grid-cols-2 gap-1">
                      {(
                        [
                          { id: "cta", label: "CTA 배너" },
                          { id: "card", label: "링크 카드" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            mutateSelectedBlock((b) => ({
                              ...(b as LinkCardBlockDef),
                              variant: opt.id,
                            }))
                          }
                          className={`rounded py-1 text-[11px] ${
                            (block.variant ?? "card") === opt.id
                              ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                              : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {(block.variant ?? "card") === "cta" && (
                      <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                        <input
                          type="checkbox"
                          checked={block.ctaChevron !== false}
                          onChange={(ev) =>
                            mutateSelectedBlock((b) => ({
                              ...(b as LinkCardBlockDef),
                              ctaChevron: ev.target.checked,
                            }))
                          }
                          className="accent-[var(--obs-accent,#8a5cf5)]"
                        />
                        <span>상단 ▼ ▼ ▼ 유도 화살표 표시</span>
                      </label>
                    )}

                    <div>
                      <label className="mb-1 block text-[10.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                        대상 주소 (URL / vault://)
                      </label>
                      <input
                        type="text"
                        value={block.url}
                        onChange={(ev) => {
                          const val = ev.target.value;
                          mutateSelectedBlock((b) => ({ ...(b as LinkCardBlockDef), url: val }));
                        }}
                        className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 font-code text-[10.5px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                      />
                    </div>

                    {vaultTarget && vault.exists(vaultTarget) && (
                      <button
                        type="button"
                        onClick={() => runtime.openFileInPairTabGroup(vaultTarget, { sourcePath: path })}
                        className="flex w-full items-center justify-center gap-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] text-[var(--obs-accent-hover,#a68af9)] hover:text-white"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>연결 문서 페어로 열기</span>
                      </button>
                    )}
                  </section>
                );
              })()}

              {/* ---- 3E. Text Block Inspector (Alignment + List Marker + Semantic Promotion) ---- */}
              {selectedBlockLoc.block.kind === "text" && (() => {
                const block = selectedBlockLoc.block as TextBlockDef;
                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <div>
                      <SectionHeading title="본문 정렬" />
                      <AlignButtons
                        value={block.align}
                        onChange={(nextAlign) =>
                          mutateSelectedBlock((b) => ({ ...(b as TextBlockDef), align: nextAlign }))
                        }
                      />
                    </div>

                    <div>
                      <SectionHeading title="목록 글머리 기호" />
                      <div className="grid grid-cols-3 gap-1">
                        {LIST_MARKER_OPTIONS.map((opt) => {
                          const active = block.listMarker === opt.id;
                          return (
                            <button
                              key={opt.id ?? "auto"}
                              type="button"
                              title={opt.label}
                              onClick={() =>
                                mutateSelectedBlock((b) => {
                                  const tb = b as TextBlockDef;
                                  if (opt.id === undefined) {
                                    const { listMarker: _drop, ...rest } = tb;
                                    void _drop;
                                    return rest;
                                  }
                                  return { ...tb, listMarker: opt.id };
                                })
                              }
                              className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10.5px] ${
                                active
                                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                                  : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                              }`}
                            >
                              <span className="font-code text-[11px]">{opt.glyph}</span>
                              <span>{opt.id === undefined ? "기본" : opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <SectionHeading title="의미 블록으로 승격" />
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: "quote", label: "인용구" },
                            { id: "accent-bar", label: "강조 바" },
                            { id: "info-frame", label: "정보 카드" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              mutateSelectedBlock((b) =>
                                convertTextToCallout(b as TextBlockDef, opt.id)
                              )
                            }
                            className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-1 text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:border-[var(--obs-accent,#8a5cf5)] hover:text-white"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* ---- 3F. Structured Table Design & Structure Inspector ---- */}
              {selectedBlockLoc.block.kind === "structured-table" && (() => {
                const table = selectedBlockLoc.block as StructuredTableBlockDef;
                const colCount = table.columnWidths.length;
                const firstRow = table.rows[0];
                const isTopHeader = Boolean(
                  firstRow &&
                    firstRow.cells.length > 0 &&
                    firstRow.cells.every((c) => Boolean(c.isHeader))
                );
                const nestedListInfo = detectTableNestedListMarker(table);
                const currentWidthSig = table.columnWidths.join(":");

                return (
                  <section className="space-y-3 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                    <div>
                      <SectionHeading title="표 시각 프리셋" />
                      <div className="grid grid-cols-2 gap-1">
                        {TABLE_VISUAL_PRESET_OPTIONS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              mutateSelectedBlock((b) =>
                                applyTableVisualPreset(b as StructuredTableBlockDef, preset.id)
                              )
                            }
                            className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:border-[var(--obs-accent,#8a5cf5)] hover:text-white"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionHeading
                        title={`열 너비 비율 (${colCount}열)`}
                        right={
                          <span className="font-code text-[9.5px] text-[var(--obs-text-faint,#777)]">
                            {table.columnWidths.join(" / ")}
                          </span>
                        }
                      />
                      {colCount === 2 ? (
                        <div className="grid grid-cols-2 gap-1">
                          {TABLE_COLUMN_RATIO_PRESETS_2COL.map((p) => {
                            const targetSig = `${p.ratios[0]}%:${p.ratios[1]}%`;
                            const active = currentWidthSig === targetSig;
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() =>
                                  mutateSelectedBlock((b) =>
                                    applyTableColumnRatio(b as StructuredTableBlockDef, p.ratios)
                                  )
                                }
                                className={`rounded py-1 font-code text-[10.5px] ${
                                  active
                                    ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                                    : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            mutateSelectedBlock((b) =>
                              applyTableColumnRatio(
                                b as StructuredTableBlockDef,
                                Array.from({ length: colCount }, () => 1)
                              )
                            )
                          }
                          className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                        >
                          모든 열 균등 분배
                        </button>
                      )}
                    </div>

                    <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                      <input
                        type="checkbox"
                        checked={isTopHeader}
                        onChange={() =>
                          mutateSelectedBlock((b) =>
                            toggleTableTopRowHeader(b as StructuredTableBlockDef)
                          )
                        }
                        className="accent-[var(--obs-accent,#8a5cf5)]"
                      />
                      <span>1행 상단 헤더 행으로 강조</span>
                    </label>

                    {nestedListInfo.hasNestedText && (
                      <div>
                        <SectionHeading title="셀 내부 목록 글머리 기호" />
                        <div className="grid grid-cols-3 gap-1">
                          {LIST_MARKER_OPTIONS.map((opt) => {
                            const active = nestedListInfo.marker === opt.id;
                            return (
                              <button
                                key={opt.id ?? "auto"}
                                type="button"
                                title={opt.label}
                                onClick={() =>
                                  mutateSelectedBlock((b) =>
                                    applyTableNestedListMarker(b as StructuredTableBlockDef, opt.id)
                                  )
                                }
                                className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10.5px] ${
                                  active
                                    ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[#e9d5ff] ring-1 ring-[var(--obs-accent,#8a5cf5)]/60"
                                    : "border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                                }`}
                              >
                                <span className="font-code text-[11px]">{opt.glyph}</span>
                                <span>{opt.id === undefined ? "기본" : opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2">
                      <SectionHeading title="표 구조 조작" />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            mutateDoc((prev) =>
                              applyTableCommandToDocument(
                                prev,
                                selectedBlockLoc.page.pageId,
                                selectedBlockLoc.block.blockId,
                                null,
                                { type: "addRowEnd" },
                                uidFactory
                              )
                            )
                          }
                          className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] hover:text-white"
                        >
                          + 행 추가
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            mutateDoc((prev) =>
                              applyTableCommandToDocument(
                                prev,
                                selectedBlockLoc.page.pageId,
                                selectedBlockLoc.block.blockId,
                                null,
                                { type: "addColumnEnd" },
                                uidFactory
                              )
                            )
                          }
                          className="rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] hover:text-white"
                        >
                          + 열 추가
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* ---- 3G. Active Style Binding Tracker (Read-Only + Jump to .vstyle) ---- */}
              <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
                <SectionHeading
                  title="스타일 바인딩"
                  right={
                    activeStyleEntry?.vaultPath && (
                      <button
                        type="button"
                        onClick={() =>
                          runtime.openFileInPairTabGroup(activeStyleEntry.vaultPath!, { sourcePath: path })
                        }
                        className="text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:underline"
                      >
                        .vstyle 수정 →
                      </button>
                    )
                  }
                />
                {selectedBlockBinding ? (
                  <div className="space-y-1 font-code text-[10.5px]">
                    <div className="truncate text-[var(--obs-text-normal,#ececec)]">
                      {selectedBlockBinding.selector}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(selectedBlockBinding.binding).map(([k, v]) =>
                        v ? (
                          <span
                            key={k}
                            className="rounded bg-[var(--obs-bg-secondary,#262626)] px-1.5 py-0.5 text-[10px] text-cyan-300"
                          >
                            {k}: {v}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10.5px] text-[var(--obs-text-faint,#777777)]">
                    별도 바인딩 없음 (표준 기본 스타일 적용)
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    );
  }
);
