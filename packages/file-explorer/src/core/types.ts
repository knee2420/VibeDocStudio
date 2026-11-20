import type { VaultNode, VaultPort, VaultSortOrder } from "@vibe/vault-core";

export const VIBE_VAULT_PATHS_MIME = "application/x-vibe-vault-paths";

export type ExplorerRecentBadge = "NEW" | "AI";

export interface ExplorerFlatRow {
  readonly path: string;
  readonly node: VaultNode;
  readonly depth: number;
  readonly isExpanded: boolean;
  readonly hasChildren: boolean;
  readonly isSelected: boolean;
  readonly isFocused: boolean;
  readonly isActiveFile: boolean;
  readonly isRenaming: boolean;
  readonly recentBadge: ExplorerRecentBadge | null;
}

export interface ExplorerInlineRenameState {
  readonly path: string;
  readonly draft: string;
  readonly error: string | null;
}

export interface ExplorerContextMenuTarget {
  readonly kind: "file" | "folder" | "root";
  readonly path: string;
  readonly x: number;
  readonly y: number;
}

export interface CreateFileOptions {
  readonly baseName?: string;
  readonly contentFactory?: (title: string) => string;
}

export interface CreateFolderOptions {
  readonly baseName?: string;
  /** Optional hook executed immediately after folder creation (e.g. scaffold subfolders/meta files). */
  readonly onCreated?: (folderPath: string, vault: VaultPort) => void;
}

export interface CreateFileExplorerStoreOptions {
  readonly initialSortOrder?: VaultSortOrder;
  readonly initialExpandedPaths?: readonly string[];
  readonly initialAutoReveal?: boolean;
  readonly defaultOutlineContent?: (title: string) => string;
  readonly defaultMarkdownContent?: (title: string) => string;
  readonly defaultVDocContent?: (title: string) => string;
}

export interface FileExplorerState {
  readonly vault: VaultPort;
  readonly sortOrder: VaultSortOrder;
  readonly autoReveal: boolean;
  readonly filterQuery: string;
  readonly expandedPaths: ReadonlySet<string>;
  readonly selectedPaths: ReadonlySet<string>;
  readonly selectionAnchorPath: string | null;
  readonly focusedPath: string | null;
  readonly activeFilePath: string | null;
  readonly renameState: ExplorerInlineRenameState | null;
  readonly recentBadges: ReadonlyMap<string, ExplorerRecentBadge>;
  readonly rows: readonly ExplorerFlatRow[];
  readonly hasAnyExpandedFolder: boolean;
  readonly revision: number;

  refresh(): void;
  setSortOrder(order: VaultSortOrder): void;
  setAutoReveal(enabled: boolean): void;
  setFilterQuery(query: string): void;
  setActiveFilePath(path: string | null): void;
  revealPath(path: string, options?: { focus?: boolean }): void;
  markExternalChange(path: string, badge?: ExplorerRecentBadge): void;
  clearRecentBadge(path: string): void;

  toggleExpand(folderPath: string): void;
  expandPath(folderPath: string): void;
  collapsePath(folderPath: string): void;
  expandAll(): void;
  collapseAll(): void;
  toggleExpandCollapseAll(): void;
  expandFolderSubtree(folderPath: string, expanded: boolean): void;

  selectSingle(path: string): void;
  selectToggle(path: string): void;
  selectRange(path: string): void;
  clearSelection(): void;
  setFocusedPath(path: string | null): void;

  moveFocus(direction: "up" | "down"): string | null;
  handleArrowRight(): string | null;
  handleArrowLeft(): string | null;

  startRename(path: string): void;
  updateRenameDraft(draft: string): void;
  commitRename(): { ok: boolean; newPath?: string; error?: string };
  cancelRename(): void;

  createNewFile(
    parentFolderPath?: string,
    extension?: string,
    options?: CreateFileOptions
  ): { path: string };
  createNewFolder(
    parentFolderPath?: string,
    options?: CreateFolderOptions
  ): { path: string };
  duplicatePaths(paths: readonly string[]): string[];
  deletePaths(paths: readonly string[]): string[];

  canDrop(dragPaths: readonly string[], targetFolderPath: string): boolean;
  dropPaths(dragPaths: readonly string[], targetFolderPath: string): string[];

  dispose(): void;
}
