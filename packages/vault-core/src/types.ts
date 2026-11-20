export type VaultEntryKind = "file" | "folder";

export type VaultSortOrder =
  | "name-asc"
  | "name-desc"
  | "mtime-desc"
  | "mtime-asc"
  | "ctime-desc"
  | "ctime-asc";

export interface VaultNodeBase {
  readonly path: string;
  readonly name: string;
  readonly parentPath: string;
  readonly kind: VaultEntryKind;
  readonly ctime: number;
  readonly mtime: number;
}

export interface VaultFileNode extends VaultNodeBase {
  readonly kind: "file";
  readonly extension: string;
  readonly stem: string;
  readonly size: number;
}

export interface VaultFolderNode extends VaultNodeBase {
  readonly kind: "folder";
  /** Optional typed-folder kind slot (reserved for future suffix-based folder specs, e.g. `.skill`, `.collection`). */
  readonly folderKind?: string;
}

export type VaultNode = VaultFileNode | VaultFolderNode;

export interface VaultTreeNode {
  readonly node: VaultNode;
  readonly children: readonly VaultTreeNode[];
}

export interface VaultPathMapping {
  readonly oldPath: string;
  readonly newPath: string;
}

export type VaultEventOrigin = "local" | "external";

export type VaultSyncStatus =
  | "idle"
  | "hydrating"
  | "syncing"
  | "ready"
  | "offline"
  | "error";

export type VaultEvent =
  | { readonly type: "create"; readonly node: VaultNode; readonly origin?: VaultEventOrigin }
  | {
      readonly type: "modify";
      readonly path: string;
      readonly content: string;
      readonly mtime: number;
      readonly origin?: VaultEventOrigin;
    }
  | {
      readonly type: "delete";
      readonly path: string;
      readonly kind: VaultEntryKind;
      readonly affectedPaths: readonly string[];
      readonly origin?: VaultEventOrigin;
    }
  | {
      readonly type: "rename";
      readonly oldPath: string;
      readonly newPath: string;
      readonly kind: VaultEntryKind;
      readonly affectedMap: readonly VaultPathMapping[];
      readonly origin?: VaultEventOrigin;
    }
  | { readonly type: "vault-reset"; readonly origin?: VaultEventOrigin };

export interface VaultSnapshotEntry {
  readonly path: string;
  readonly kind: VaultEntryKind;
  readonly content?: string;
  readonly ctime: number;
  readonly mtime: number;
}

export interface VaultSnapshot {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly entries: readonly VaultSnapshotEntry[];
}

export interface VaultRenameResult {
  readonly oldPath: string;
  readonly newPath: string;
  readonly affectedMap: readonly VaultPathMapping[];
}

export interface VaultDeleteResult {
  readonly deletedPaths: readonly string[];
}

export interface VaultPort {
  readonly id: string;
  readonly name: string;

  getNode(path: string): VaultNode | null;
  exists(path: string): boolean;
  listAll(): VaultNode[];
  listChildren(folderPath: string, sort?: VaultSortOrder): VaultNode[];
  getTree(sort?: VaultSortOrder): VaultTreeNode[];

  read(path: string): string;
  write(path: string, content: string): VaultFileNode;
  createFile(path: string, content?: string): VaultFileNode;
  createFolder(path: string): VaultFolderNode;
  rename(oldPath: string, newNameOrPath: string): VaultRenameResult;
  move(sourcePath: string, targetFolderPath: string): VaultRenameResult;
  duplicate(sourcePath: string): VaultNode;
  delete(path: string): VaultDeleteResult;

  getUniquePath(folderPath: string, baseName: string, extension?: string): string;
  subscribe(listener: (event: VaultEvent) => void): () => void;

  exportSnapshot(): VaultSnapshot;
  importSnapshot(snapshot: VaultSnapshot): void;

  /** Optional lazy-loading, read-only guard, binary URL, OS reveal, and lifecycle extensions. */
  isLoaded?(path: string): boolean;
  ensureLoaded?(path: string): Promise<string>;
  isReadOnly?(): boolean;
  setReadOnly?(readOnly: boolean): void;
  getBinaryUrl?(path: string): string;
  /**
   * Optional: stores binary files (images, PDFs, …) in `folderPath` and resolves to their vault paths,
   * in the same order. A name already taken gets a number (`shot 1.png`).
   */
  importBinaryFiles?(folderPath: string, files: readonly Blob[], names?: readonly string[]): Promise<string[]>;
  revealInOsExplorer?(path?: string): Promise<string>;
  dispose?(): void;
}

export interface LocalVaultSummary {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly isDefault: boolean;
  readonly exists: boolean;
}

export interface LocalVaultListResponse {
  readonly vaults: readonly LocalVaultSummary[];
  readonly activeVaultId: string;
}

export interface LocalVaultAppState {
  readonly activeVaultId: string;
  readonly theme: "dark" | "light";
}

export interface LocalVaultSessionPayload {
  readonly layout?: Record<string, unknown> | null;
  readonly explorer?: Record<string, unknown> | null;
  readonly updatedAt?: number | null;
}

export interface LocalVaultMetadataCachePayload {
  readonly version: number;
  readonly files: Readonly<Record<string, unknown>>;
  readonly updatedAt?: number | null;
}
