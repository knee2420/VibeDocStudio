import React, { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { intentFromModifiers } from "@vibe/selection-core";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Copy,
  FilePlus2,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  LayoutTemplate,
  ListTree,
  LocateFixed,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  VAULT_SORT_LABELS,
  dirname,
  getObsidianDisplayName,
  isProjectFolderPath,
  stem,
  type VaultFileNode,
  type VaultPort,
  type VaultSortOrder,
} from "@vibe/vault-core";

import type { FileExplorerStore } from "../core/explorerStore";
import {
  VIBE_VAULT_PATHS_MIME,
  type ExplorerContextMenuTarget,
  type ExplorerFlatRow,
} from "../core/types";

export interface FileCreateSchema {
  readonly id: string;
  readonly label: string;
  readonly extension: string;
  readonly description?: string;
  readonly baseName?: string;
  readonly icon?: React.ReactNode;
  readonly contentFactory?: (title: string) => string;
}

export interface FolderCreateSchema {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly baseName?: string;
  /** Optional folder extension without leading dot (e.g. `"vproj"`). */
  readonly extension?: string;
  readonly icon?: React.ReactNode;
  readonly onCreated?: (folderPath: string, vault: VaultPort) => void;
}

export interface FileExplorerPresentationOverride {
  readonly icon?: React.ReactNode;
  readonly badge?: string | null;
  readonly badgeToneClass?: string;
}

export interface ExplorerCustomContextAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly targetKinds: readonly ("file" | "folder" | "root")[];
  readonly when?: (path: string, kind: "file" | "folder" | "root") => boolean;
  readonly onSelect: (path: string, kind: "file" | "folder" | "root") => void;
}

export interface FileExplorerProps {
  readonly store: FileExplorerStore;
  readonly vaultName?: string;
  readonly fileCreateSchemas?: readonly FileCreateSchema[];
  readonly folderCreateSchemas?: readonly FolderCreateSchema[];
  readonly customContextActions?: readonly ExplorerCustomContextAction[];
  /** Optional resolver to customize file icon & badge (e.g. A4 vs Blog `.vdoc`). */
  readonly resolveFilePresentation?: (
    node: VaultFileNode,
    vault: VaultPort
  ) => FileExplorerPresentationOverride | null;
  readonly onToggleProjectFolder?: (result: {
    readonly oldPath: string;
    readonly newPath: string;
    readonly isProject: boolean;
  }) => void;
  readonly onOpenFile?: (path: string, mode: "current" | "new-tab" | "split-right") => void;
  readonly collapsed?: boolean;
  readonly onToggleCollapsed?: () => void;
  readonly onCopyPath?: (path: string) => void;
  readonly onRevealInOsExplorer?: (path: string) => void;
  readonly className?: string;
}

const DEFAULT_FILE_CREATE_SCHEMAS: readonly FileCreateSchema[] = [
  {
    id: "md",
    label: "New note (.md)",
    extension: "md",
    icon: <FilePlus2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />,
  },
  {
    id: "outline",
    label: "New outline (.outline)",
    extension: "outline",
    icon: <ListTree className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />,
  },
  {
    id: "vdoc",
    label: "New 2D Document (.vdoc)",
    extension: "vdoc",
    icon: <LayoutTemplate className="h-3.5 w-3.5 text-sky-400" />,
  },
];

const DEFAULT_FOLDER_CREATE_SCHEMAS: readonly FolderCreateSchema[] = [
  {
    id: "folder",
    label: "New folder",
    description: "일반 분류 폴더",
    icon: <FolderPlus className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />,
  },
  {
    id: "project",
    label: "New Project Folder",
    description: "문서 · 레퍼런스 · 리소스 작업 공간 (.vproj)",
    baseName: "New Project",
    extension: "vproj",
    icon: <FolderKanban className="h-3.5 w-3.5 text-[#a68af9]" />,
  },
];

const SORT_ORDERS: readonly VaultSortOrder[] = [
  "name-asc",
  "name-desc",
  "mtime-desc",
  "mtime-asc",
  "ctime-desc",
  "ctime-asc",
];

const INDENT_STEP_PX = 16;
const SPRING_EXPAND_MS = 550;

interface InlineRenameInputProps {
  readonly path: string;
  readonly kind: "file" | "folder";
  readonly draft: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  kind,
  draft,
  error,
  onChange,
  onCommit,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (kind === "file") {
      const s = stem(el.value);
      el.setSelectionRange(0, s.length);
    } else {
      el.select();
    }
  }, [kind]);

  return (
    <div className="relative min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!error) {
            onCommit();
          } else {
            onCancel();
          }
        }}
        aria-label="Rename entry"
        className="w-full rounded-[3px] border bg-[var(--obs-bg-primary,#1e1e1e)] px-1.5 py-0 text-[13px] leading-[20px] text-[var(--obs-text-normal,#dadada)] outline-none"
        style={{
          borderColor: error ? "var(--obs-danger,#fb464c)" : "var(--obs-accent,#8a5cf5)",
        }}
      />
      {error && (
        <div
          role="alert"
          className="absolute top-full left-0 z-50 mt-0.5 max-w-[240px] rounded border border-[var(--obs-danger,#fb464c)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-1 text-[11px] text-[var(--obs-danger,#fb464c)] shadow-lg"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  store,
  vaultName,
  fileCreateSchemas,
  folderCreateSchemas,
  customContextActions,
  resolveFilePresentation,
  onToggleProjectFolder,
  onOpenFile,
  onCopyPath,
  onRevealInOsExplorer,
  collapsed = false,
  onToggleCollapsed,
  className = "",
}) => {
  const effectiveFileSchemas =
    fileCreateSchemas && fileCreateSchemas.length > 0
      ? fileCreateSchemas
      : DEFAULT_FILE_CREATE_SCHEMAS;
  const effectiveFolderSchemas =
    folderCreateSchemas && folderCreateSchemas.length > 0
      ? folderCreateSchemas
      : DEFAULT_FOLDER_CREATE_SCHEMAS;

  const rows = useStore(store, (s) => s.rows);
  const sortOrder = useStore(store, (s) => s.sortOrder);
  const autoReveal = useStore(store, (s) => s.autoReveal);
  const filterQuery = useStore(store, (s) => s.filterQuery);
  const hasAnyExpandedFolder = useStore(store, (s) => s.hasAnyExpandedFolder);
  const renameState = useStore(store, (s) => s.renameState);
  const selectedPaths = useStore(store, (s) => s.selectedPaths);
  const focusedPath = useStore(store, (s) => s.focusedPath);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuTarget | null>(null);
  const [dragPaths, setDragPaths] = useState<string[]>([]);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const springTimerRef = useRef<number | null>(null);
  const springFolderRef = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const sortBtnRef = useRef<HTMLDivElement>(null);

  const clearSpringTimer = () => {
    if (springTimerRef.current !== null) {
      window.clearTimeout(springTimerRef.current);
      springTimerRef.current = null;
    }
    springFolderRef.current = null;
  };

  useEffect(() => {
    const onGlobalPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (contextMenu) setContextMenu(null);
      if (fileMenuOpen && fileMenuRef.current && !fileMenuRef.current.contains(target)) {
        setFileMenuOpen(false);
      }
      if (folderMenuOpen && folderMenuRef.current && !folderMenuRef.current.contains(target)) {
        setFolderMenuOpen(false);
      }
      if (sortMenuOpen && sortBtnRef.current && !sortBtnRef.current.contains(target)) {
        setSortMenuOpen(false);
      }
    };
    const onGlobalKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setContextMenu(null);
        setFileMenuOpen(false);
        setFolderMenuOpen(false);
        setSortMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onGlobalPointerDown);
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => {
      window.removeEventListener("mousedown", onGlobalPointerDown);
      window.removeEventListener("keydown", onGlobalKeyDown);
      clearSpringTimer();
    };
  }, [contextMenu, fileMenuOpen, folderMenuOpen, sortMenuOpen]);

  const resolveCreationTargetFolder = (): string => {
    const state = store.getState();
    const target = state.focusedPath ?? state.activeFilePath;
    if (!target) return "";
    const node = state.vault.getNode(target);
    if (!node) return "";
    return node.kind === "folder" ? node.path : dirname(node.path);
  };

  const handleCreateFileBySchema = (schema: FileCreateSchema, explicitFolder?: string) => {
    const folder = explicitFolder !== undefined ? explicitFolder : resolveCreationTargetFolder();
    const { path } = store.getState().createNewFile(folder, schema.extension, {
      baseName: schema.baseName,
      contentFactory: schema.contentFactory,
    });
    onOpenFile?.(path, "current");
  };

  const handleCreateFolderBySchema = (schema: FolderCreateSchema, explicitFolder?: string) => {
    const folder = explicitFolder !== undefined ? explicitFolder : resolveCreationTargetFolder();
    store.getState().createNewFolder(folder, {
      baseName: schema.baseName,
      extension: schema.extension,
      onCreated: schema.onCreated,
    });
  };

  const handleRowClick = (ev: React.MouseEvent, row: ExplorerFlatRow) => {
    ev.stopPropagation();
    const state = store.getState();
    if (state.renameState?.path === row.path) return;

    // 화면 공통 선택 규칙 (@vibe/selection-core): Shift = 범위 · Ctrl/⌘ = 토글. 새 탭 열기는 Alt+클릭 · 가운데 클릭.
    const intent = intentFromModifiers(ev);
    if (intent === "range" || intent === "range-add") {
      state.selectRange(row.path);
      return;
    }
    if (intent === "toggle") {
      state.selectToggle(row.path);
      return;
    }

    state.selectSingle(row.path);
    if (row.recentBadge) {
      state.clearRecentBadge(row.path);
    }
    if (row.node.kind === "folder") {
      state.toggleExpand(row.path);
    } else {
      onOpenFile?.(row.path, ev.altKey ? "new-tab" : "current");
    }
  };

  /** 가운데 클릭 = 새 탭에서 열기 (브라우저 · VS Code 와 같다). */
  const handleRowAuxClick = (ev: React.MouseEvent, row: ExplorerFlatRow) => {
    if (ev.button !== 1 || row.node.kind !== "file") return;
    ev.preventDefault();
    ev.stopPropagation();
    onOpenFile?.(row.path, "new-tab");
  };

  const handleRowContextMenu = (ev: React.MouseEvent, row: ExplorerFlatRow) => {
    ev.preventDefault();
    ev.stopPropagation();
    const state = store.getState();
    if (!state.selectedPaths.has(row.path)) {
      state.selectSingle(row.path);
    }
    setContextMenu({
      kind: row.node.kind,
      path: row.path,
      x: ev.clientX,
      y: ev.clientY,
    });
  };

  const handleRootContextMenu = (ev: React.MouseEvent) => {
    ev.preventDefault();
    setContextMenu({
      kind: "root",
      path: "",
      x: ev.clientX,
      y: ev.clientY,
    });
  };

  const handleTreeKeyDown = (ev: React.KeyboardEvent) => {
    const state = store.getState();
    if (state.renameState) return;

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      state.moveFocus("down");
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      state.moveFocus("up");
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      state.handleArrowRight();
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      state.handleArrowLeft();
    } else if (ev.key === "Enter" && focusedPath) {
      ev.preventDefault();
      const node = state.vault.getNode(focusedPath);
      if (!node) return;
      if (node.kind === "folder") {
        state.toggleExpand(node.path);
      } else {
        onOpenFile?.(node.path, ev.ctrlKey || ev.metaKey || ev.altKey ? "new-tab" : "current");
      }
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "a") {
      ev.preventDefault();
      state.selectAllVisible();
    } else if (ev.key === "F2" && focusedPath) {
      ev.preventDefault();
      state.startRename(focusedPath);
    } else if (ev.key === "Delete" && selectedPaths.size > 0) {
      ev.preventDefault();
      state.deletePaths(Array.from(selectedPaths));
    } else if (ev.key === "Escape") {
      state.clearSelection();
    }
  };

  const handleDragStart = (ev: React.DragEvent, row: ExplorerFlatRow) => {
    const state = store.getState();
    const pathsToDrag = state.selectedPaths.has(row.path)
      ? Array.from(state.selectedPaths)
      : [row.path];
    setDragPaths(pathsToDrag);
    ev.dataTransfer.effectAllowed = "copyMove";
    ev.dataTransfer.setData(VIBE_VAULT_PATHS_MIME, JSON.stringify(pathsToDrag));
    ev.dataTransfer.setData("text/plain", pathsToDrag.join("\n"));
  };

  const readDragPaths = (ev: React.DragEvent): string[] => {
    if (dragPaths.length > 0) return dragPaths;
    try {
      const raw = ev.dataTransfer.getData(VIBE_VAULT_PATHS_MIME);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // Ignore unparsable external drags
    }
    return [];
  };

  const handleDragOverFolder = (
    ev: React.DragEvent,
    targetFolderPath: string,
    isClosedFolder: boolean
  ) => {
    const paths = readDragPaths(ev);
    if (paths.length === 0) return;
    if (!store.getState().canDrop(paths, targetFolderPath)) {
      if (dropTargetFolder === targetFolderPath) setDropTargetFolder(null);
      clearSpringTimer();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    if (dropTargetFolder !== targetFolderPath) {
      setDropTargetFolder(targetFolderPath);
    }

    if (isClosedFolder && targetFolderPath) {
      if (springFolderRef.current !== targetFolderPath) {
        clearSpringTimer();
        springFolderRef.current = targetFolderPath;
        springTimerRef.current = window.setTimeout(() => {
          store.getState().expandPath(targetFolderPath);
          clearSpringTimer();
        }, SPRING_EXPAND_MS);
      }
    } else {
      clearSpringTimer();
    }
  };

  const handleDropOnFolder = (ev: React.DragEvent, targetFolderPath: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearSpringTimer();
    const paths = readDragPaths(ev);
    if (paths.length > 0) {
      store.getState().dropPaths(paths, targetFolderPath);
    }
    setDragPaths([]);
    setDropTargetFolder(null);
  };

  const handleDragEnd = () => {
    clearSpringTimer();
    setDragPaths([]);
    setDropTargetFolder(null);
  };

  const activeContextPaths = (): string[] => {
    if (!contextMenu || contextMenu.kind === "root") return [];
    if (selectedPaths.has(contextMenu.path) && selectedPaths.size > 1) {
      return Array.from(selectedPaths);
    }
    return [contextMenu.path];
  };

  return (
    <div
      className={`flex ${collapsed ? "h-auto" : "h-full"} w-full select-none flex-col bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-normal,#dadada)] ${className}`}
    >
      {/* Obsidian Nav Header Toolbar (36px): [New File ▾] [New Folder ▾] | [Sort] [Auto-reveal] [Collapse] [Filter] */}
      <div className="flex h-9 shrink-0 items-center justify-center gap-0.5 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-2">
        {/* 1. New File Split Button (Schema-driven) */}
        <div ref={fileMenuRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => {
              handleCreateFileBySchema(effectiveFileSchemas[0]);
              setFileMenuOpen(false);
            }}
            title={effectiveFileSchemas[0].label}
            aria-label="New file"
            className="flex h-7 w-6 items-center justify-center rounded-l-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFolderMenuOpen(false);
              setSortMenuOpen(false);
              setFileMenuOpen((v) => !v);
            }}
            title="새 파일 스키마 선택"
            aria-label="Choose new file schema"
            aria-expanded={fileMenuOpen}
            className="flex h-7 w-3.5 items-center justify-center rounded-r-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          {fileMenuOpen && (
            <div
              role="menu"
              aria-label="New file schemas"
              className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 shadow-xl"
            >
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
                New File Schema
              </div>
              {effectiveFileSchemas.map((schema) => (
                <button
                  key={schema.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleCreateFileBySchema(schema);
                    setFileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {schema.icon ?? (
                      <FilePlus2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{schema.label}</span>
                    {schema.description && (
                      <span className="block truncate text-[10.5px] text-[var(--obs-text-faint,#666666)]">
                        {schema.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. New Folder Split Button (Schema-driven) */}
        <div ref={folderMenuRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => {
              handleCreateFolderBySchema(effectiveFolderSchemas[0]);
              setFolderMenuOpen(false);
            }}
            title={effectiveFolderSchemas[0].label}
            aria-label="New folder"
            className="flex h-7 w-6 items-center justify-center rounded-l-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFileMenuOpen(false);
              setSortMenuOpen(false);
              setFolderMenuOpen((v) => !v);
            }}
            title="새 폴더 스키마 선택"
            aria-label="Choose new folder schema"
            aria-expanded={folderMenuOpen}
            className="flex h-7 w-3.5 items-center justify-center rounded-r-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          {folderMenuOpen && (
            <div
              role="menu"
              aria-label="New folder schemas"
              className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 shadow-xl"
            >
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
                New Folder Schema
              </div>
              {effectiveFolderSchemas.map((schema) => (
                <button
                  key={schema.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleCreateFolderBySchema(schema);
                    setFolderMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {schema.icon ?? (
                      <FolderPlus className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{schema.label}</span>
                    {schema.description && (
                      <span className="block truncate text-[10.5px] text-[var(--obs-text-faint,#666666)]">
                        {schema.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group Divider: Creation | Tree Controls & Filter */}
        <div className="mx-1 h-4 w-px shrink-0 bg-[var(--obs-border-subtle,#2d2d2d)]" />

        <div ref={sortBtnRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setFileMenuOpen(false);
              setFolderMenuOpen(false);
              setSortMenuOpen((v) => !v);
            }}
            title="Change sort order"
            aria-label="Change sort order"
            aria-expanded={sortMenuOpen}
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>

          {sortMenuOpen && (
            <div
              role="menu"
              className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 shadow-xl"
            >
              {SORT_ORDERS.map((order) => (
                <button
                  key={order}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortOrder === order}
                  onClick={() => {
                    store.getState().setSortOrder(order);
                    setSortMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span>{VAULT_SORT_LABELS[order]}</span>
                  {sortOrder === order && (
                    <Check className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => store.getState().setAutoReveal(!autoReveal)}
          title={autoReveal ? "Auto-reveal current file: ON" : "Auto-reveal current file: OFF"}
          aria-label="Auto-reveal current file"
          aria-pressed={autoReveal}
          className="flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          style={{
            color: autoReveal
              ? "var(--obs-accent,#8a5cf5)"
              : "var(--obs-text-muted,#b3b3b3)",
          }}
        >
          <LocateFixed className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => store.getState().toggleExpandCollapseAll()}
          title={hasAnyExpandedFolder ? "Collapse all" : "Expand all"}
          aria-label={hasAnyExpandedFolder ? "Collapse all" : "Expand all"}
          className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
        >
          {hasAnyExpandedFolder ? (
            <ChevronsDownUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterOpen((prev) => {
              if (prev) store.getState().setFilterQuery("");
              return !prev;
            });
          }}
          title="Filter files"
          aria-label="Filter files"
          aria-pressed={filterOpen}
          className="flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          style={{
            color: filterOpen
              ? "var(--obs-accent,#8a5cf5)"
              : "var(--obs-text-muted,#b3b3b3)",
          }}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Vault Title / Accordion Header */}
      {vaultName &&
        (onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            className="flex h-7 w-full shrink-0 items-center justify-between px-2.5 text-[11px] font-semibold tracking-wide text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{vaultName}</span>
            </span>
            {selectedPaths.size > 1 && (
              <span className="rounded bg-[var(--obs-bg-selected,rgba(138,92,245,0.22))] px-1.5 py-0 text-[10px] text-[var(--obs-accent-hover,#a68af9)]">
                {selectedPaths.size} selected
              </span>
            )}
          </button>
        ) : (
          <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[11px] font-semibold tracking-wide text-[var(--obs-text-muted,#b3b3b3)]">
            <span className="truncate">{vaultName}</span>
            {selectedPaths.size > 1 && (
              <span className="rounded bg-[var(--obs-bg-selected,rgba(138,92,245,0.22))] px-1.5 py-0 text-[10px] text-[var(--obs-accent-hover,#a68af9)]">
                {selectedPaths.size} selected
              </span>
            )}
          </div>
        ))}

      {!collapsed && filterOpen && (
        <div className="shrink-0 px-2 pb-1.5">
          <div className="flex items-center gap-1.5 rounded-[4px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--obs-text-faint,#666666)]" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => store.getState().setFilterQuery(e.target.value)}
              placeholder="Filter files..."
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--obs-text-normal,#dadada)] placeholder:text-[var(--obs-text-faint,#666666)] outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => store.getState().setFilterQuery("")}
                className="text-[var(--obs-text-faint,#666666)] hover:text-[var(--obs-text-normal,#dadada)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Flat Tree Viewport */}
      {!collapsed && (
      <div
        ref={treeRef}
        role="tree"
        tabIndex={0}
        onKeyDown={handleTreeKeyDown}
        onContextMenu={handleRootContextMenu}
        onClick={() => store.getState().clearSelection()}
        onDragOver={(ev) => handleDragOverFolder(ev, "", false)}
        onDrop={(ev) => handleDropOnFolder(ev, "")}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1 outline-none"
        style={{
          boxShadow:
            dropTargetFolder === ""
              ? "inset 0 0 0 1px var(--obs-accent,#8a5cf5)"
              : undefined,
        }}
      >
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--obs-text-faint,#666666)]">
            {filterQuery ? "No matching files." : "Vault is empty."}
          </div>
        ) : (
          rows.map((row) => {
            const isFolder = row.node.kind === "folder";
            const display = getObsidianDisplayName(row.node.name, row.node.kind);
            const filePres =
              !isFolder && resolveFilePresentation
                ? resolveFilePresentation(row.node, store.getState().vault)
                : null;
            const effectiveBadge =
              filePres && filePres.badge !== undefined ? filePres.badge : display.extensionBadge;
            const targetFolder = isFolder ? row.path : dirname(row.path);
            const isDropHighlight =
              isFolder && dropTargetFolder !== null && dropTargetFolder === row.path;
            const isHovered = hoveredPath === row.path;

            return (
              <div
                key={row.path}
                role="treeitem"
                aria-expanded={isFolder ? row.isExpanded : undefined}
                aria-selected={row.isSelected || row.isActiveFile}
                data-vault-path={row.path}
                draggable={!row.isRenaming}
                onDragStart={(ev) => handleDragStart(ev, row)}
                onDragOver={(ev) =>
                  handleDragOverFolder(ev, targetFolder, isFolder && !row.isExpanded)
                }
                onDrop={(ev) => handleDropOnFolder(ev, targetFolder)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => setHoveredPath(row.path)}
                onMouseLeave={() => setHoveredPath((cur) => (cur === row.path ? null : cur))}
                onClick={(ev) => handleRowClick(ev, row)}
                onAuxClick={(ev) => handleRowAuxClick(ev, row)}
                onContextMenu={(ev) => handleRowContextMenu(ev, row)}
                className="group relative flex h-[27px] cursor-pointer items-center rounded-[4px] pr-2 text-[13px] leading-[18px] transition-colors"
                style={{
                  // 큰 볼트(수천 행): 화면 밖 행은 그리기 · 레이아웃을 건너뛴다 (높이는 고정 27px 로 예약)
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 27px",
                  paddingLeft: `${8 + row.depth * INDENT_STEP_PX}px`,
                  backgroundColor: isDropHighlight
                    ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
                    : row.isSelected
                      ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
                      : row.isActiveFile
                        ? "var(--obs-bg-active,rgba(255,255,255,0.11))"
                        : isHovered
                          ? "var(--obs-bg-hover,rgba(255,255,255,0.067))"
                          : "transparent",
                  color:
                    row.isActiveFile || row.isSelected
                      ? "var(--obs-text-normal,#dadada)"
                      : "var(--obs-text-muted,#b3b3b3)",
                  fontWeight: row.isActiveFile ? 500 : 400,
                  boxShadow: isDropHighlight
                    ? "inset 0 0 0 1px var(--obs-accent,#8a5cf5)"
                    : row.isFocused
                      ? "inset 0 0 0 1px rgba(138,92,245,0.45)"
                      : undefined,
                }}
              >
                {/* Obsidian Vertical Indentation Guide Lines */}
                {Array.from({ length: row.depth }).map((_, levelIdx) => (
                  <span
                    key={levelIdx}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 bottom-0 w-px transition-colors"
                    style={{
                      left: `${14 + levelIdx * INDENT_STEP_PX}px`,
                      backgroundColor: isHovered
                        ? "var(--obs-indent-guide-active,rgba(255,255,255,0.26))"
                        : "var(--obs-indent-guide,rgba(255,255,255,0.10))",
                    }}
                  />
                ))}

                {/* Folder Chevron (+ Project Folder icon) or File Icon */}
                {isFolder ? (
                  <>
                    <span className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--obs-text-faint,#666666)] group-hover:text-[var(--obs-text-muted,#b3b3b3)]">
                      <ChevronRight
                        className="h-3.5 w-3.5 transition-transform duration-100"
                        style={{
                          transform: row.isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        }}
                      />
                    </span>
                    {row.isProjectFolder && (
                      <FolderKanban className="mr-1.5 h-3.5 w-3.5 shrink-0 text-[#a68af9]" />
                    )}
                  </>
                ) : (
                  <span className="mr-1.5 flex h-4 w-3.5 shrink-0 items-center justify-center text-[var(--obs-text-faint,#666666)]">
                    {filePres?.icon ? (
                      filePres.icon
                    ) : row.node.extension === "outline" ? (
                      <ListTree className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                    ) : row.node.extension === "vdoc" ||
                      row.node.name.toLowerCase().endsWith(".vdoc.json") ? (
                      <LayoutTemplate className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 opacity-70" />
                    )}
                  </span>
                )}

                {/* Label or Inline Rename Input */}
                {row.isRenaming && renameState ? (
                  <InlineRenameInput
                    path={row.path}
                    kind={row.node.kind}
                    draft={renameState.draft}
                    error={renameState.error}
                    onChange={(v) => store.getState().updateRenameDraft(v)}
                    onCommit={() => {
                      store.getState().commitRename();
                    }}
                    onCancel={() => store.getState().cancelRename()}
                  />
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        row.isProjectFolder ? "font-medium text-[var(--obs-text-normal,#dadada)]" : ""
                      }`}
                    >
                      {display.label}
                    </span>
                    {row.recentBadge && (
                      <span
                        className="ml-1 shrink-0 rounded-[3px] px-1 py-0 text-[9px] font-bold tracking-wider"
                        style={{
                          backgroundColor:
                            row.recentBadge === "AI"
                              ? "rgba(138, 92, 245, 0.28)"
                              : "rgba(63, 185, 80, 0.24)",
                          color: row.recentBadge === "AI" ? "#c4b5fd" : "#56d364",
                        }}
                      >
                        {row.recentBadge}
                      </span>
                    )}
                    {effectiveBadge && (
                      <span
                        className={
                          row.isProjectFolder
                            ? "ml-1.5 shrink-0 rounded-[3px] bg-[rgba(138,92,245,0.20)] px-1 py-0 text-[9px] font-semibold tracking-wider text-[#c4b5fd]"
                            : filePres?.badgeToneClass
                              ? `ml-1.5 shrink-0 rounded-[3px] px-1 py-0 text-[9px] font-semibold tracking-wider ${filePres.badgeToneClass}`
                              : "ml-1.5 shrink-0 rounded-[3px] bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] px-1 py-0 text-[9px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)]"
                        }
                      >
                        {effectiveBadge}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Obsidian Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[196px] rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 260),
          }}
        >
          {contextMenu.kind === "file" && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenFile?.(contextMenu.path, "new-tab");
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <FilePlus2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                <span>Open in new tab</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenFile?.(contextMenu.path, "split-right");
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <Columns2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                <span>Open to the right</span>
              </button>
              <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
            </>
          )}

          {customContextActions &&
            (() => {
              const matching = customContextActions.filter(
                (act) =>
                  act.targetKinds.includes(contextMenu.kind) &&
                  (!act.when || act.when(contextMenu.path, contextMenu.kind))
              );
              if (matching.length === 0) return null;
              return (
                <>
                  {matching.map((act) => (
                    <button
                      key={`ctx-custom-${act.id}`}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        act.onSelect(contextMenu.path, contextMenu.kind);
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                    >
                      {act.icon && (
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {act.icon}
                        </span>
                      )}
                      <span>{act.label}</span>
                    </button>
                  ))}
                  <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                </>
              );
            })()}

          {(contextMenu.kind === "folder" || contextMenu.kind === "root") && (
            <>
              {effectiveFileSchemas.map((schema) => (
                <button
                  key={`ctx-file-${schema.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleCreateFileBySchema(schema, contextMenu.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {schema.icon ?? (
                      <FilePlus2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    )}
                  </span>
                  <span>{schema.label}</span>
                </button>
              ))}
              {effectiveFolderSchemas.map((schema) => (
                <button
                  key={`ctx-folder-${schema.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleCreateFolderBySchema(schema, contextMenu.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {schema.icon ?? (
                      <FolderPlus className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    )}
                  </span>
                  <span>{schema.label}</span>
                </button>
              ))}
              {contextMenu.kind === "folder" && (
                <>
                  <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const res = store.getState().toggleProjectFolder(contextMenu.path);
                      if (res.ok && res.oldPath && res.newPath && res.isProject !== undefined) {
                        onToggleProjectFolder?.({
                          oldPath: res.oldPath,
                          newPath: res.newPath,
                          isProject: res.isProject,
                        });
                      }
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-[#a68af9]" />
                    <span>
                      {isProjectFolderPath(contextMenu.path)
                        ? "일반 폴더로 전환"
                        : "프로젝트 폴더로 전환 (.vproj)"}
                    </span>
                  </button>
                  <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      store.getState().expandFolderSubtree(contextMenu.path, true);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    <span>Expand subtree</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      store.getState().expandFolderSubtree(contextMenu.path, false);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <ChevronsDownUp className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    <span>Collapse subtree</span>
                  </button>
                </>
              )}
              {contextMenu.kind === "root" && (
                <>
                  <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      store.getState().toggleExpandCollapseAll();
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <ChevronsDownUp className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    <span>{hasAnyExpandedFolder ? "Collapse all" : "Expand all"}</span>
                  </button>
                  {onRevealInOsExplorer && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onRevealInOsExplorer("");
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                      <span>Reveal in File Explorer</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {contextMenu.kind !== "root" && (
            <>
              <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
              {onRevealInOsExplorer && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRevealInOsExplorer(contextMenu.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  <span>Reveal in File Explorer</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  store.getState().duplicatePaths(activeContextPaths());
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <Copy className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                <span>Make a copy</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  store.getState().startRename(contextMenu.path);
                  setContextMenu(null);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <span className="flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  <span>Rename</span>
                </span>
                <span className="text-[10px] text-[var(--obs-text-faint,#666666)]">F2</span>
              </button>
              {onCopyPath && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCopyPath(contextMenu.path);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <Copy className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  <span>Copy vault path</span>
                </button>
              )}
              <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  store.getState().deletePaths(activeContextPaths());
                  setContextMenu(null);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-[var(--obs-danger,#fb464c)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    Delete
                    {activeContextPaths().length > 1
                      ? ` (${activeContextPaths().length})`
                      : ""}
                  </span>
                </span>
                <span className="text-[10px] opacity-70">Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
