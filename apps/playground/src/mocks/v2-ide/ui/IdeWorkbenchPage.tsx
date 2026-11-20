import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Layers,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type { LocalApiVaultStatusSnapshot, LocalVaultSummary } from "@vibe/vault-core";
import { FileExplorer } from "@vibe/file-explorer/ui";
import { VIBE_VAULT_PATHS_MIME } from "@vibe/file-explorer/core";
import { WorkspaceLayoutView, type ExternalDropResource } from "@vibe/workspace-layout/ui";
import {
  getAllGroups,
  type EditorHostContext,
  type EditorOutlineHostContext,
  type EditorSelectionSnapshot,
  type TabGroupNode,
  type WorkspaceTab,
} from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { resolveTabTitle } from "../model/sampleVault";
import {
  bootstrapIdeWorkbench,
  createOrMountWorkbenchVault,
  getVaultFileStats,
  mountDirectLocalFolderWorkbench,
  type IdeLogEntry,
  type IdeWorkbenchRuntime,
} from "../model/useIdeWorkbench";

/**
 * Isolated Terminal Drawer — subscribes to logs independently so incoming Vault/Layout logs
 * NEVER re-render the central 2D Canvas or Markdown editors.
 */
const IdeTerminalDrawer = React.memo<{
  readonly runtime: IdeWorkbenchRuntime;
  readonly height: number;
  readonly onClose: () => void;
}>(({ runtime, height, onClose }) => {
  const [logs, setLogs] = useState<readonly IdeLogEntry[]>(() => runtime.getLogs());
  useEffect(() => runtime.subscribeLogs(setLogs), [runtime]);

  return (
    <section
      style={{ height: `${height}px` }}
      className="flex shrink-0 flex-col bg-[var(--obs-bg-secondary-alt,#1a1a1a)]"
    >
      <div className="flex h-7 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 text-[11px]">
        <div className="flex items-center gap-2 font-code font-semibold text-[var(--obs-text-muted,#b3b3b3)]">
          <TerminalIcon className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
          <span>TERMINAL · AI &amp; VAULT STREAM</span>
          <span className="rounded bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] px-1.5 text-[10px]">
            {logs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Hide Terminal"
          className="rounded p-0.5 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-code text-[11.5px] leading-5">
        {logs.map((entry) => (
          <div key={entry.id} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[var(--obs-text-faint,#666666)]">{entry.timestamp}</span>
            <span
              className="w-16 shrink-0 font-semibold uppercase"
              style={{
                color:
                  entry.source === "vault"
                    ? "#58a6ff"
                    : entry.source === "layout"
                      ? "#a68af9"
                      : entry.source === "composer"
                        ? "#3fb950"
                        : "#d29922",
              }}
            >
              [{entry.source}]
            </span>
            <span className="min-w-0 flex-1 break-all text-[var(--obs-text-normal,#dadada)]">
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
});

/**
 * Isolated Right AI-Composer Sidebar — owns composerDraft, @mentions, and activeSelection
 * subscription so typing or changing 2D/Markdown selection NEVER re-renders the workspace.
 */
const IdeComposerSidebar = React.memo<{
  readonly runtime: IdeWorkbenchRuntime;
  readonly width: number;
  readonly activeResourceId: string | null;
}>(({ runtime, width, activeResourceId }) => {
  const [attachedContextPaths, setAttachedContextPaths] = useState<string[]>([
    "01. Architecture/00. System-Proposal.vdoc",
  ]);
  const [activeSelection, setActiveSelection] = useState<EditorSelectionSnapshot | null>(() =>
    runtime.getActiveSelection()
  );
  const [composerDraft, setComposerDraft] = useState("");
  const [composerDragOver, setComposerDragOver] = useState(false);

  useEffect(() => runtime.subscribeSelection(setActiveSelection), [runtime]);

  const handleComposerDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    setComposerDragOver(false);
    const raw = ev.dataTransfer.getData(VIBE_VAULT_PATHS_MIME);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (p): p is string => typeof p === "string" && runtime.vault.exists(p)
        );
        if (valid.length > 0) {
          setAttachedContextPaths((prev) => Array.from(new Set([...prev, ...valid])));
          runtime.pushLog("composer", "ok", `attached @mention context: ${valid.join(", ")}`);
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleComposerSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = composerDraft.trim();
    if (!trimmed) return;
    const targetResource = activeSelection?.resourceId ?? activeResourceId ?? "";
    if (targetResource) {
      runtime.executeAiDirective({
        resourceId: targetResource,
        prompt: trimmed,
        action:
          trimmed.includes("아웃라인") || trimmed.includes("outline")
            ? "extract-outline"
            : "extract-md",
        selection: activeSelection,
      });
    } else {
      runtime.pushLog(
        "composer",
        "info",
        `prompt("${trimmed}") with [${attachedContextPaths.length} files]`
      );
    }
    setComposerDraft("");
  };

  const adapters = useMemo(() => runtime.editorRegistry.listAll(), [runtime.editorRegistry]);

  return (
    <aside
      style={{
        width: `${width}px`,
        boxShadow: composerDragOver ? "inset 0 0 0 2px var(--obs-accent,#8a5cf5)" : undefined,
      }}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes(VIBE_VAULT_PATHS_MIME)) {
          ev.preventDefault();
          setComposerDragOver(true);
        }
      }}
      onDragLeave={() => setComposerDragOver(false)}
      onDrop={handleComposerDrop}
      className="flex h-full shrink-0 flex-col bg-[var(--obs-bg-secondary,#262626)]"
    >
      <div className="flex h-9 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 text-[12px] font-semibold">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
          <span>AI-Composer</span>
        </span>
        <span className="font-code text-[10px] font-normal text-[var(--obs-text-faint,#666666)]">
          2D Directing
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[12px] text-[var(--obs-text-muted,#b3b3b3)]">
        {activeSelection && (
          <div className="mb-3 rounded-md border border-[var(--obs-accent,#8a5cf5)] bg-[rgba(138,92,245,0.10)] p-2.5">
            <div className="mb-1 flex items-center justify-between font-code text-[10.5px] font-semibold text-[var(--obs-accent-hover,#a68af9)]">
              <span className="truncate">
                {activeSelection.kind === "canvas-nodes" ? "2D Selection" : "Selection"} ·{" "}
                {activeSelection.summary}
              </span>
              <button
                type="button"
                onClick={() => runtime.setActiveSelection(null)}
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {activeSelection.text && (
              <div className="line-clamp-3 font-code text-[11px] text-[var(--obs-text-normal,#dadada)]">
                {activeSelection.text}
              </div>
            )}
          </div>
        )}

        <div className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-3 leading-5">
          <div className="mb-1 font-semibold text-[var(--obs-text-normal,#dadada)]">
            Registered Editor Adapters ({adapters.length})
          </div>
          <ul className="space-y-1 font-code text-[11px]">
            {adapters.map((adapter) => (
              <li key={adapter.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[var(--obs-text-normal,#dadada)]">
                  {adapter.id}
                </span>
                <span className="shrink-0 text-[var(--obs-text-faint,#666666)]">
                  {adapter.extensions.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[var(--obs-text-faint,#666666)] uppercase">
            <span>Attached @mentions ({attachedContextPaths.length})</span>
            {attachedContextPaths.length > 0 && (
              <button
                type="button"
                onClick={() => setAttachedContextPaths([])}
                className="flex items-center gap-0.5 text-[10px] normal-case hover:text-[var(--obs-text-normal,#dadada)]"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attachedContextPaths.map((p) => (
              <span
                key={p}
                className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-0.5 font-code text-[11px] text-[var(--obs-text-normal,#dadada)]"
              >
                <span className="truncate">@{p}</span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachedContextPaths((prev) => prev.filter((item) => item !== p))
                  }
                  className="shrink-0 text-[var(--obs-text-faint,#666666)] hover:text-[var(--obs-text-normal,#dadada)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleComposerSubmit}
        className="shrink-0 border-t border-[var(--obs-border-subtle,#2d2d2d)] p-2.5"
      >
        <div className="rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2">
          <input
            type="text"
            value={composerDraft}
            onChange={(e) => setComposerDraft(e.target.value)}
            placeholder="2D 디렉팅 입력 (새 .md/.outline 생성 + 링크카드)..."
            className="w-full bg-transparent text-[12px] text-[var(--obs-text-normal,#dadada)] placeholder:text-[var(--obs-text-faint,#666666)] outline-none"
          />
          <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--obs-text-faint,#666666)]">
            <span className="font-code">/skill · @mention</span>
            <button
              type="submit"
              className="rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-0.5 font-medium text-white hover:opacity-90"
            >
              Direct
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
});

interface IdeWorkbenchViewProps {
  readonly runtime: IdeWorkbenchRuntime;
  readonly vaults: readonly LocalVaultSummary[];
  readonly isDirectLocalMount: boolean;
  readonly onSwitchVault: (vaultId: string) => void;
  readonly onCreateOrMountVault: (name: string, rootPath?: string) => Promise<void>;
  readonly onMountDirectLocalFolder: (
    rootPath: string,
    name: string,
    readOnly: boolean
  ) => Promise<void>;
  readonly onReturnToDefaultVault: () => void;
  readonly onRetryLocal: () => void;
}

const IdeWorkbenchView: React.FC<IdeWorkbenchViewProps> = ({
  runtime,
  vaults,
  isDirectLocalMount,
  onSwitchVault,
  onCreateOrMountVault,
  onMountDirectLocalFolder,
  onReturnToDefaultVault,
  onRetryLocal,
}) => {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showExplorer, setShowExplorer] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(270);
  const [structureOpen, setStructureOpen] = useState(true);
  const [structureHeight, setStructureHeight] = useState(260);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(145);
  const [showComposer, setShowComposer] = useState(true);
  const [composerWidth, setComposerWidth] = useState(296);

  const [syncStatus, setSyncStatus] = useState<LocalApiVaultStatusSnapshot>(() =>
    runtime.getSyncStatus()
  );
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultPath, setNewVaultPath] = useState("");
  const [mountReadOnly, setMountReadOnly] = useState(true);
  const [readOnly, setReadOnly] = useState<boolean>(() => runtime.vault.isReadOnly?.() ?? false);
  const [vaultActionError, setVaultActionError] = useState<string | null>(null);
  const [vaultActionBusy, setVaultActionBusy] = useState(false);

  const supportsReadOnlyToggle = Boolean(runtime.vault.isReadOnly && runtime.vault.setReadOnly);
  const handleToggleReadOnly = useCallback(() => {
    if (!runtime.vault.setReadOnly) return;
    const next = !readOnly;
    runtime.vault.setReadOnly(next);
    setReadOnly(next);
    runtime.pushLog(
      "vault",
      next ? "info" : "warn",
      next ? "Vault locked (Read-Only protection ON)" : "Vault unlocked (Read-Write enabled)"
    );
  }, [readOnly, runtime]);

  useEffect(() => runtime.subscribeSyncStatus(setSyncStatus), [runtime]);

  const handleCloseTerminal = useCallback(() => setShowTerminal(false), []);

  const layoutRoot = useStore(runtime.layout, (s) => s.root);
  const activeGroupId = useStore(runtime.layout, (s) => s.activeGroupId);
  const isGroupExpanded = useStore(runtime.layout, (s) => Boolean(s.expandedTabGroup));
  const explorerRevision = useStore(runtime.explorer, (s) => s.revision);

  const paneCount = useMemo(() => getAllGroups(layoutRoot).length, [layoutRoot]);
  const activeTab = useMemo(() => {
    const groups = getAllGroups(layoutRoot);
    const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
    if (!activeGroup) return null;
    return activeGroup.tabs.find((t) => t.id === activeGroup.activeTabId) ?? null;
  }, [layoutRoot, activeGroupId]);

  const vaultStats = useMemo(() => {
    void explorerRevision;
    return getVaultFileStats(runtime.vault);
  }, [runtime.vault, explorerRevision]);

  const editorEnv = useMemo<IdeEditorEnv>(
    () => ({
      vault: runtime.vault,
      metadataCache: runtime.metadataCache,
      vdocUiBridge: runtime.vdocUiBridge,
    }),
    [runtime.vault, runtime.metadataCache, runtime.vdocUiBridge]
  );

  // Resolve active adapter for Left-Bottom Document Structure panel
  const activeAdapter = useMemo(() => {
    if (!activeTab?.resourceId) return null;
    return runtime.editorRegistry.resolveForTab(activeTab.resourceId, activeTab.viewType);
  }, [activeTab, runtime.editorRegistry]);

  // Global IDE keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "b") {
        ev.preventDefault();
        setShowExplorer((v) => !v);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "j") {
        ev.preventDefault();
        setShowTerminal((v) => !v);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "\\") {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().splitTab(cur.id, "right", "duplicate");
        return;
      }
      if ((ev.altKey || ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "t") {
        ev.preventDefault();
        const reopened = runtime.layout.getState().reopenClosedTab();
        if (reopened) runtime.pushLog("layout", "info", "reopenClosedTab()");
        return;
      }
      if (ev.altKey && ev.key === "ArrowLeft" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().navigateBack(cur.id);
        return;
      }
      if (ev.altKey && ev.key === "ArrowRight" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().navigateForward(cur.id);
        return;
      }
      if (ev.altKey && ev.key.toLowerCase() === "w" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().closeTab(cur.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runtime]);

  const startHorizontalPanelResize = (
    ev: React.MouseEvent,
    currentWidth: number,
    direction: 1 | -1,
    min: number,
    max: number,
    setter: (next: number) => void
  ) => {
    ev.preventDefault();
    const startX = ev.clientX;
    const onMove = (m: MouseEvent) => {
      const next = Math.max(min, Math.min(max, currentWidth + (m.clientX - startX) * direction));
      setter(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startVerticalResize = (
    ev: React.MouseEvent,
    currentHeight: number,
    min: number,
    max: number,
    setter: (next: number) => void
  ) => {
    ev.preventDefault();
    const startY = ev.clientY;
    const onMove = (m: MouseEvent) => {
      const next = Math.max(min, Math.min(max, currentHeight - (m.clientY - startY)));
      setter(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const parseExplorerDrop = useCallback(
    (dt: DataTransfer): ExternalDropResource | null => {
      const raw = dt.getData(VIBE_VAULT_PATHS_MIME);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        for (const candidate of parsed) {
          if (typeof candidate !== "string") continue;
          const node = runtime.vault.getNode(candidate);
          if (node?.kind === "file") {
            const defaultAdapter = runtime.editorRegistry.resolveDefault(node.path);
            return {
              resourceId: node.path,
              title: resolveTabTitle(node.path),
              viewType: defaultAdapter?.id ?? "raw-code",
            };
          }
        }
      } catch {
        return null;
      }
      return null;
    },
    [runtime.vault, runtime.editorRegistry]
  );

  const renderTabIcon = useCallback(
    (tab: WorkspaceTab) => {
      const adapter = tab.resourceId
        ? runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType)
        : runtime.editorRegistry.getById(tab.viewType);
      const Icon = adapter?.icon ?? FileText;
      const colorClass =
        adapter?.id === "vibe-vdoc"
          ? "text-sky-400"
          : adapter?.id === "vibe-outliner"
            ? "text-[var(--obs-accent,#8a5cf5)]"
            : adapter?.id === "raw-code"
              ? "text-amber-400"
              : "opacity-75";
      return <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />;
    },
    [runtime.editorRegistry]
  );

  const getAvailableViewTypes = useCallback(
    (tab: WorkspaceTab) => {
      if (!tab.resourceId) return [];
      return runtime.editorRegistry.listForPath(tab.resourceId).map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
      }));
    },
    [runtime.editorRegistry]
  );

  const acceptsCanvasDropForTab = useCallback(
    (tab: WorkspaceTab) => {
      if (!tab.resourceId) return false;
      const adapter = runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType);
      return Boolean(adapter?.capabilities?.acceptsCanvasDrop);
    },
    [runtime.editorRegistry]
  );

  const renderEmptyTab = useCallback(
    (group: TabGroupNode, tab: WorkspaceTab) => (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-center">
        <div className="text-[14px] font-medium text-[var(--obs-text-muted,#b3b3b3)]">
          No file is open
        </div>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "vdoc");
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "vibe-vdoc",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-sky-400 hover:underline"
          >
            Create new 2D document (.vdoc)
          </button>
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "outline");
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "vibe-outliner",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-[var(--obs-accent-hover,#a68af9)] hover:underline"
          >
            Create new outline (.outline)
          </button>
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "md");
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "obsidian-markdown",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-[var(--obs-accent-hover,#a68af9)] hover:underline"
          >
            Create new note (.md)
          </button>
          <button
            type="button"
            onClick={() => runtime.layout.getState().closeTab(tab.id)}
            className="text-[var(--obs-text-faint,#666666)] hover:text-[var(--obs-text-muted,#b3b3b3)]"
          >
            Close
          </button>
        </div>
      </div>
    ),
    [runtime]
  );

  // Pure adapter-driven tab rendering
  const renderTabContent = useCallback(
    (tab: WorkspaceTab, group: TabGroupNode) => {
      if (!tab.resourceId) return null;
      const adapter = runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType);
      if (!adapter) {
        return (
          <div className="flex h-full items-center justify-center text-xs text-[var(--obs-text-faint,#666666)]">
            No editor adapter registered for {tab.resourceId}
          </div>
        );
      }

      const host: EditorHostContext<IdeEditorEnv> = {
        env: editorEnv,
        path: tab.resourceId,
        tabId: tab.id,
        groupId: group.id,
        viewType: adapter.id,
        openLink: (target, mode) => {
          runtime.openWikilink(target, tab.resourceId!, mode ?? "current");
        },
        renameSelf: (newName) => {
          try {
            const res = runtime.vault.rename(tab.resourceId!, newName);
            return { ok: true, newPath: res.newPath };
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : "Rename failed",
            };
          }
        },
        notifyDirty: (dirty) => {
          runtime.layout.getState().setTabDirty(tab.resourceId!, dirty);
        },
        switchViewType: (nextViewType) => {
          runtime.layout.getState().setTabViewType(tab.id, nextViewType);
        },
        reportSelection: (sel) => {
          runtime.setActiveSelection(sel);
        },
        dispatchAiDirective: (directive) => {
          runtime.executeAiDirective(directive);
        },
      };

      const AdapterComponent = adapter.Component;
      return <AdapterComponent key={`${adapter.id}:${tab.resourceId}`} host={host} />;
    },
    [editorEnv, runtime]
  );

  const outlineHost = useMemo<EditorOutlineHostContext<IdeEditorEnv> | null>(() => {
    if (!activeTab?.resourceId || !activeAdapter) return null;
    return {
      env: editorEnv,
      path: activeTab.resourceId,
      viewType: activeAdapter.id,
      openLink: (target, mode) => {
        runtime.openWikilink(target, activeTab.resourceId!, mode ?? "current");
      },
    };
  }, [activeAdapter, activeTab, editorEnv, runtime]);

  const ActiveOutlineComponent = activeAdapter?.OutlineComponent;

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] ${
        theme === "dark" ? "obs-theme-dark" : "obs-theme-light"
      }`}
    >
      {/* Main 4-Zone IDE Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 1. Obsidian Left Ribbon (44px) */}
        <aside className="flex w-11 shrink-0 select-none flex-col items-center justify-between border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] py-2">
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => setShowExplorer((v) => !v)}
              title="Toggle File Explorer & Structure (Ctrl+B)"
              aria-label="Toggle File Explorer"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showExplorer
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <FolderTree className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              title="Toggle AI Terminal Logs (Ctrl+J)"
              aria-label="Toggle AI Terminal Logs"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showTerminal
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <TerminalIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowComposer((v) => !v)}
              title="Toggle AI-Composer Panel"
              aria-label="Toggle AI-Composer Panel"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showComposer
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} theme`}
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => runtime.resetWorkspace()}
              title={
                runtime.mode === "local"
                  ? "Re-sync Local Vault from disk"
                  : "Reset Sample Vault & Layout"
              }
              aria-label={runtime.mode === "local" ? "Re-sync Local Vault" : "Reset Sample Vault"}
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </aside>

        {/* 2. Left Sidebar: Vertical 2-Pane Split (Top: Obsidian File Explorer <-> Bottom: Adapter Document Structure) */}
        {showExplorer && (
          <>
            <aside
              style={{ width: `${explorerWidth}px` }}
              className="flex h-full shrink-0 flex-col overflow-hidden bg-[var(--obs-bg-secondary,#262626)]"
            >
              {/* Top: Obsidian 90% File Explorer */}
              <div className="min-h-0 flex-1 overflow-hidden">
                <FileExplorer
                  store={runtime.explorer}
                  vaultName={runtime.vault.name}
                  onOpenFile={(path, mode) => runtime.openVaultFile(path, mode)}
                  onCopyPath={(path) => {
                    void navigator.clipboard?.writeText(path);
                    runtime.pushLog("explorer", "info", `copied path: ${path}`);
                  }}
                  onRevealInOsExplorer={(path) => {
                    void runtime.revealInOsExplorer(path);
                  }}
                />
              </div>

              {/* Horizontal Resizer Splitter (File Explorer <-> Document Structure) */}
              {structureOpen && (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  onMouseDown={(ev) =>
                    startVerticalResize(ev, structureHeight, 120, 480, setStructureHeight)
                  }
                  className="group relative z-20 h-px shrink-0 cursor-row-resize bg-[var(--obs-border,#363636)]"
                >
                  <div className="absolute right-0 left-0 -top-[3px] h-[7px] transition-colors group-hover:top-[-1px] group-hover:h-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
                </div>
              )}

              {/* Bottom: Adapter-Driven Document Structure (Figma Pages & Elements / MD Outline / Outline Branches) */}
              <div
                style={{ height: structureOpen ? `${structureHeight}px` : "28px" }}
                className="flex shrink-0 flex-col overflow-hidden border-t border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)]"
              >
                <button
                  type="button"
                  onClick={() => setStructureOpen((v) => !v)}
                  className="flex h-7 shrink-0 select-none items-center justify-between px-2.5 text-[11px] font-semibold tracking-wide text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {structureOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <Layers className="h-3 w-3 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                    <span className="truncate">
                      {activeAdapter?.id === "vibe-vdoc"
                        ? "PAGES & ELEMENTS"
                        : activeAdapter?.id === "obsidian-markdown"
                          ? "OUTLINE & BACKLINKS"
                          : "DOCUMENT STRUCTURE"}
                    </span>
                  </span>
                  {activeAdapter && (
                    <span className="font-code text-[9.5px] font-normal text-[var(--obs-text-faint,#666666)]">
                      {activeAdapter.id}
                    </span>
                  )}
                </button>

                {structureOpen && (
                  <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--obs-border-subtle,#2d2d2d)]">
                    {ActiveOutlineComponent && outlineHost ? (
                      <ActiveOutlineComponent
                        key={`${outlineHost.viewType}:${outlineHost.path}`}
                        host={outlineHost}
                      />
                    ) : (
                      <div className="px-3 py-4 text-[11.5px] text-[var(--obs-text-faint,#666666)]">
                        No structure view for this tab.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>

            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(ev) =>
                startHorizontalPanelResize(ev, explorerWidth, 1, 200, 480, setExplorerWidth)
              }
              className="group relative z-20 w-px shrink-0 cursor-col-resize bg-[var(--obs-border,#363636)]"
            >
              <div className="absolute top-0 bottom-0 -left-[3px] w-[7px] transition-colors group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
            </div>
          </>
        )}

        {/* 3. Center Column: @vibe/workspace-layout + Bottom AI Terminal */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <WorkspaceLayoutView
              store={runtime.layout}
              renderTabContent={renderTabContent}
              renderEmptyTab={renderEmptyTab}
              parseExternalDrop={parseExplorerDrop}
              renderTabIcon={renderTabIcon}
              getAvailableViewTypes={getAvailableViewTypes}
              acceptsCanvasDropForTab={acceptsCanvasDropForTab}
            />
          </div>

          {showTerminal && !isGroupExpanded && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={(ev) =>
                  startVerticalResize(ev, terminalHeight, 96, 420, setTerminalHeight)
                }
                className="group relative z-20 h-px shrink-0 cursor-row-resize bg-[var(--obs-border,#363636)]"
              >
                <div className="absolute right-0 left-0 -top-[3px] h-[7px] transition-colors group-hover:top-[-1px] group-hover:h-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
              </div>

              <IdeTerminalDrawer
                runtime={runtime}
                height={terminalHeight}
                onClose={handleCloseTerminal}
              />
            </>
          )}
        </div>

        {/* 4. Right Sidebar — AGY-IDE AI-Composer (Isolated Selection & Draft State) */}
        {showComposer && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(ev) =>
                startHorizontalPanelResize(ev, composerWidth, -1, 240, 520, setComposerWidth)
              }
              className="group relative z-20 w-px shrink-0 cursor-col-resize bg-[var(--obs-border,#363636)]"
            >
              <div className="absolute top-0 bottom-0 -left-[3px] w-[7px] transition-colors group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
            </div>

            <IdeComposerSidebar
              runtime={runtime}
              width={composerWidth}
              activeResourceId={activeTab?.resourceId ?? null}
            />
          </>
        )}
      </div>

      {/* Obsidian Bottom Status Bar (24px) + Local Vault Switcher */}
      <footer className="relative flex h-6 shrink-0 select-none items-center justify-between border-t border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] px-3 font-code text-[11px] text-[var(--obs-text-faint,#666666)]">
        <div className="flex items-center gap-3 truncate">
          <button
            type="button"
            onClick={() => {
              setVaultActionError(null);
              setVaultMenuOpen((v) => !v);
            }}
            title={
              runtime.vaultRootPath
                ? `Local Vault: ${runtime.vaultRootPath} (클릭해 볼트 전환/마운트)`
                : "Memory Fallback (클릭해 로컬 볼트 재연결)"
            }
            className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  runtime.mode === "local"
                    ? syncStatus.status === "error"
                      ? "#fb464c"
                      : syncStatus.status === "syncing"
                        ? "#facc15"
                        : "#4ade80"
                    : "#fb923c",
              }}
            />
            <Database className="h-3 w-3" />
            <span>
              {runtime.mode === "local" ? `Local · ${runtime.vault.name}` : `Memory · ${runtime.vault.name}`}
            </span>
          </button>

          {supportsReadOnlyToggle && (
            <button
              type="button"
              onClick={handleToggleReadOnly}
              title={
                readOnly
                  ? "읽기 전용 보호 켜짐 — 원본 파일 수정 차단 중 (클릭하여 잠금 해제)"
                  : "쓰기 허용됨 — 수정 사항이 디스크에 반영됨 (클릭하여 읽기 전용 잠금)"
              }
              className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors ${
                readOnly
                  ? "bg-[rgba(250,204,21,0.14)] text-[#facc15] hover:bg-[rgba(250,204,21,0.22)]"
                  : "bg-[rgba(74,222,128,0.12)] text-[#4ade80] hover:bg-[rgba(74,222,128,0.20)]"
              }`}
            >
              {readOnly ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
              <span>{readOnly ? "RO" : "RW"}</span>
            </button>
          )}

          {runtime.mode === "local" && syncStatus.status === "syncing" && (
            <span className="text-[#facc15]">saving...</span>
          )}
          {syncStatus.lastError && (
            <span className="truncate text-[#fb464c]" title={syncStatus.lastError}>
              {syncStatus.lastError}
            </span>
          )}

          <span>
            {vaultStats.files} files · {vaultStats.folders} folders
          </span>
          {activeTab?.resourceId && (
            <span className="truncate text-[var(--obs-text-muted,#b3b3b3)]">
              {activeTab.resourceId} ({activeTab.viewType})
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span>
            {paneCount} {paneCount === 1 ? "pane" : "panes"}
          </span>
          <span>{theme === "dark" ? "Obsidian Dark" : "Obsidian Light"}</span>
        </div>

        {/* Local Vault Switcher Popover */}
        {vaultMenuOpen && (
          <div
            role="dialog"
            aria-label="Local Vault Switcher"
            className="absolute bottom-7 left-2 z-50 w-[340px] rounded-lg border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-3 font-sans text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold">
                <FolderOpen className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                <span>Local Vaults</span>
              </span>
              <div className="flex items-center gap-1">
                {isDirectLocalMount && (
                  <button
                    type="button"
                    onClick={() => {
                      onReturnToDefaultVault();
                      setVaultMenuOpen(false);
                    }}
                    title="기본/샘플 볼트로 복귀"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>기본 볼트</span>
                  </button>
                )}
                {runtime.mode === "local" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void runtime.resyncLocalVault();
                      setVaultMenuOpen(false);
                    }}
                    title="디스크에서 다시 동기화"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Re-sync</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onRetryLocal();
                      setVaultMenuOpen(false);
                    }}
                    className="flex items-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>로컬 연결 재시도</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVaultMenuOpen(false)}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {runtime.vaultRootPath && (
              <div className="mb-2.5 flex items-center justify-between gap-2 rounded border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 font-code text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)]">
                <span className="min-w-0 flex-1 truncate" title={runtime.vaultRootPath}>
                  {runtime.vaultRootPath}
                </span>
                {!isDirectLocalMount && (
                  <button
                    type="button"
                    onClick={() => {
                      void runtime.revealInOsExplorer("");
                    }}
                    title="OS 파일 탐색기에서 열기"
                    className="shrink-0 rounded px-1.5 py-0.5 font-sans text-[10.5px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    열기
                  </button>
                )}
              </div>
            )}

            {vaults.length > 0 ? (
              <div className="mb-2.5 max-h-36 space-y-1 overflow-y-auto">
                {vaults.map((v) => {
                  const isCurrent = runtime.mode === "local" && runtime.vault.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onSwitchVault(v.id);
                        setVaultMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{v.name}</span>
                        <span className="block truncate font-code text-[10px] text-[var(--obs-text-faint,#666666)]">
                          {v.rootPath}
                        </span>
                      </span>
                      {isCurrent && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mb-2.5 text-[11px] leading-4 text-[var(--obs-text-muted,#b3b3b3)]">
                임시 Memory 모드로 동작 중입니다. 아래에 로컬 폴더 경로(전체 볼트 또는 부분 이관
                폴더)를 입력하면 원본을 건드리지 않고 읽기 전용·지연 로딩으로 바로 열 수 있습니다.
              </p>
            )}

            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                const trimmedPath = newVaultPath.trim();
                const trimmedName = newVaultName.trim();
                if (vaultActionBusy) return;
                if (!trimmedPath && (runtime.mode !== "local" || isDirectLocalMount || !trimmedName)) {
                  return;
                }
                setVaultActionBusy(true);
                setVaultActionError(null);
                try {
                  if (trimmedPath) {
                    await onMountDirectLocalFolder(trimmedPath, trimmedName, mountReadOnly);
                  } else {
                    await onCreateOrMountVault(trimmedName);
                  }
                  setNewVaultName("");
                  setNewVaultPath("");
                  setVaultMenuOpen(false);
                } catch (err) {
                  setVaultActionError(
                    err instanceof Error ? err.message : "볼트 생성/마운트 실패"
                  );
                } finally {
                  setVaultActionBusy(false);
                }
              }}
              className="space-y-1.5 border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2.5"
            >
              <div className="text-[10.5px] font-semibold text-[var(--obs-text-muted,#b3b3b3)]">
                로컬 폴더 직접 마운트 (원본 무변경 · 지연 로딩)
              </div>
              <input
                type="text"
                value={newVaultPath}
                onChange={(e) => setNewVaultPath(e.target.value)}
                placeholder="로컬 절대 경로 (예: C:\path\to\folder)"
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 font-code text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
              />
              <input
                type="text"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                placeholder="표시 이름 (선택 · 비우면 폴더명 사용)"
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11.5px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
              />
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                <input
                  type="checkbox"
                  checked={mountReadOnly}
                  onChange={(e) => setMountReadOnly(e.target.checked)}
                  className="accent-[var(--obs-accent,#8a5cf5)]"
                />
                <span>읽기 전용 안전 잠금 (원본 볼트 보호 · 권장)</span>
              </label>
              {vaultActionError && (
                <div className="text-[11px] text-[#fb464c]">{vaultActionError}</div>
              )}
              <button
                type="submit"
                disabled={
                  vaultActionBusy ||
                  (!newVaultPath.trim() &&
                    (runtime.mode !== "local" || isDirectLocalMount || !newVaultName.trim()))
                }
                className="flex w-full items-center justify-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-1 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {vaultActionBusy
                    ? "마운트 중..."
                    : newVaultPath.trim()
                      ? mountReadOnly
                        ? "로컬 폴더 마운트 (읽기 전용)"
                        : "로컬 폴더 마운트 (쓰기 허용)"
                      : "새 볼트 생성"}
                </span>
              </button>
            </form>
          </div>
        )}
      </footer>
    </div>
  );
};

export const IdeWorkbenchPage: React.FC = () => {
  const [bootState, setBootState] = useState<{
    readonly runtime: IdeWorkbenchRuntime | null;
    readonly vaults: readonly LocalVaultSummary[];
    readonly isDirectLocalMount: boolean;
  }>({ runtime: null, vaults: [], isDirectLocalMount: false });
  const [bootSeq, setBootSeq] = useState(0);
  const [directMountSeq, setDirectMountSeq] = useState(0);
  const [requestedVaultId, setRequestedVaultId] = useState<string | undefined>(undefined);
  const runtimeRef = useRef<IdeWorkbenchRuntime | null>(null);

  const swapRuntime = useCallback(
    (next: {
      readonly runtime: IdeWorkbenchRuntime;
      readonly vaults: readonly LocalVaultSummary[];
      readonly isDirectLocalMount: boolean;
    }) => {
      const prev = runtimeRef.current;
      if (prev && prev !== next.runtime) {
        prev.dispose();
      }
      runtimeRef.current = next.runtime;
      setBootState(next);
    },
    []
  );

  useEffect(() => {
    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void bootstrapIdeWorkbench({ vaultId: requestedVaultId }).then((res) => {
      if (cancelled) {
        res.runtime.dispose();
        return;
      }
      swapRuntime({
        runtime: res.runtime,
        vaults: res.vaults,
        isDirectLocalMount: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [requestedVaultId, bootSeq, swapRuntime]);

  const handleSwitchVault = useCallback((vaultId: string) => {
    setRequestedVaultId(vaultId);
    setBootSeq((n) => n + 1);
  }, []);

  const handleCreateOrMountVault = useCallback(async (name: string, rootPath?: string) => {
    const created = await createOrMountWorkbenchVault(name, rootPath);
    setRequestedVaultId(created.id);
    setBootSeq((n) => n + 1);
  }, []);

  const handleMountDirectLocalFolder = useCallback(
    async (rootPath: string, name: string, readOnly: boolean) => {
      const res = await mountDirectLocalFolderWorkbench({
        rootPath,
        name: name || undefined,
        readOnly,
      });
      setDirectMountSeq((n) => n + 1);
      swapRuntime({
        runtime: res.runtime,
        vaults: bootState.isDirectLocalMount ? res.vaults : bootState.vaults,
        isDirectLocalMount: true,
      });
    },
    [bootState.isDirectLocalMount, bootState.vaults, swapRuntime]
  );

  const handleReturnToDefaultVault = useCallback(() => {
    setRequestedVaultId(undefined);
    setBootSeq((n) => n + 1);
  }, []);

  const handleRetryLocal = useCallback(() => {
    setBootSeq((n) => n + 1);
  }, []);

  if (!bootState.runtime) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1e1e1e] font-code text-xs text-[#b3b3b3]">
        Mounting local vault...
      </div>
    );
  }

  return (
    <IdeWorkbenchView
      key={`${bootState.runtime.mode}:${bootState.runtime.vault.id}:${bootSeq}:${directMountSeq}`}
      runtime={bootState.runtime}
      vaults={bootState.vaults}
      isDirectLocalMount={bootState.isDirectLocalMount}
      onSwitchVault={handleSwitchVault}
      onCreateOrMountVault={handleCreateOrMountVault}
      onMountDirectLocalFolder={handleMountDirectLocalFolder}
      onReturnToDefaultVault={handleReturnToDefaultVault}
      onRetryLocal={handleRetryLocal}
    />
  );
};
