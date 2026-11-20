import {
  basename,
  dirname,
  extname,
  getAncestorPaths,
  isDescendantPath,
  joinPath,
  normalizeVaultPath,
  stem,
  validateEntryName,
} from "./path";
import { compareVaultNodes } from "./sort";
import type {
  VaultDeleteResult,
  VaultEntryKind,
  VaultEvent,
  VaultFileNode,
  VaultFolderNode,
  VaultNode,
  VaultPathMapping,
  VaultPort,
  VaultRenameResult,
  VaultSnapshot,
  VaultSnapshotEntry,
  VaultSortOrder,
  VaultTreeNode,
} from "./types";

interface StoredEntry {
  path: string;
  kind: VaultEntryKind;
  content: string;
  ctime: number;
  mtime: number;
}

export interface MemoryVaultSeedEntry {
  readonly path: string;
  readonly kind?: VaultEntryKind;
  readonly content?: string;
  readonly ctime?: number;
  readonly mtime?: number;
}

export interface MemoryVaultOptions {
  readonly id?: string;
  readonly name?: string;
  readonly initialEntries?: readonly MemoryVaultSeedEntry[];
  readonly storageKey?: string;
  /** Debounce interval (ms) for localStorage persistence. Defaults to 250ms; pass 0 for synchronous writes. */
  readonly persistDebounceMs?: number;
  readonly now?: () => number;
}

function toVaultNode(entry: StoredEntry): VaultNode {
  const name = basename(entry.path);
  const parentPath = dirname(entry.path);
  if (entry.kind === "folder") {
    const folder: VaultFolderNode = {
      path: entry.path,
      name,
      parentPath,
      kind: "folder",
      ctime: entry.ctime,
      mtime: entry.mtime,
    };
    return folder;
  }
  const file: VaultFileNode = {
    path: entry.path,
    name,
    parentPath,
    kind: "file",
    extension: extname(entry.path),
    stem: stem(entry.path),
    size: entry.content.length,
    ctime: entry.ctime,
    mtime: entry.mtime,
  };
  return file;
}

function tryReadStorage(storageKey: string): VaultSnapshot | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    const raw = globalThis.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VaultSnapshot>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed as VaultSnapshot;
  } catch {
    return null;
  }
}

function tryWriteStorage(storageKey: string, snapshot: VaultSnapshot): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota or SSR environments cleanly.
  }
}

export class MemoryVaultAdapter implements VaultPort {
  readonly id: string;
  readonly name: string;

  private readonly entries = new Map<string, StoredEntry>();
  private readonly listeners = new Set<(event: VaultEvent) => void>();
  private readonly storageKey?: string;
  private readonly persistDebounceMs: number;
  private readonly now: () => number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistDirty = false;
  private readonly handleBeforeUnload?: () => void;

  constructor(options: MemoryVaultOptions = {}) {
    this.id = options.id ?? "default-vault";
    this.name = options.name ?? "Vibe Vault";
    this.storageKey = options.storageKey;
    this.persistDebounceMs = options.persistDebounceMs ?? 250;
    this.now = options.now ?? (() => Date.now());

    if (this.storageKey && typeof globalThis.window !== "undefined") {
      this.handleBeforeUnload = () => {
        this.flushPersistence();
      };
      globalThis.window.addEventListener("beforeunload", this.handleBeforeUnload);
      globalThis.window.addEventListener("pagehide", this.handleBeforeUnload);
    }

    const persisted = this.storageKey ? tryReadStorage(this.storageKey) : null;
    if (persisted) {
      this.hydrateEntries(persisted.entries);
    } else if (options.initialEntries) {
      this.hydrateSeed(options.initialEntries);
      this.persistIfEnabled(true);
    }
  }

  private hydrateSeed(seeds: readonly MemoryVaultSeedEntry[]): void {
    this.entries.clear();
    const baseTime = this.now();
    seeds.forEach((seed, index) => {
      const norm = normalizeVaultPath(seed.path);
      if (!norm) return;
      const kind: VaultEntryKind = seed.kind ?? (seed.content === undefined ? "folder" : "file");
      const ts = seed.ctime ?? baseTime + index;
      const mt = seed.mtime ?? ts;
      this.ensureAncestorsSilent(norm, ts);
      this.entries.set(norm, {
        path: norm,
        kind,
        content: kind === "file" ? (seed.content ?? "") : "",
        ctime: ts,
        mtime: mt,
      });
    });
  }

  private hydrateEntries(snapshotEntries: readonly VaultSnapshotEntry[]): void {
    this.entries.clear();
    for (const item of snapshotEntries) {
      const norm = normalizeVaultPath(item.path);
      if (!norm) continue;
      this.ensureAncestorsSilent(norm, item.ctime);
      this.entries.set(norm, {
        path: norm,
        kind: item.kind,
        content: item.kind === "file" ? (item.content ?? "") : "",
        ctime: item.ctime,
        mtime: item.mtime,
      });
    }
  }

  private ensureAncestorsSilent(path: string, ts: number): void {
    for (const anc of getAncestorPaths(path)) {
      if (!this.entries.has(anc)) {
        this.entries.set(anc, {
          path: anc,
          kind: "folder",
          content: "",
          ctime: ts,
          mtime: ts,
        });
      }
    }
  }

  private emit(event: VaultEvent): void {
    this.persistIfEnabled(false);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private persistIfEnabled(immediate: boolean): void {
    if (!this.storageKey) return;
    if (immediate || this.persistDebounceMs <= 0) {
      if (this.persistTimer !== null) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      this.persistDirty = false;
      tryWriteStorage(this.storageKey, this.exportSnapshot());
      return;
    }
    this.persistDirty = true;
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.persistDirty || !this.storageKey) return;
      this.persistDirty = false;
      tryWriteStorage(this.storageKey, this.exportSnapshot());
    }, this.persistDebounceMs);
  }

  flushPersistence(): void {
    if (!this.storageKey || !this.persistDirty) return;
    this.persistIfEnabled(true);
  }

  dispose(): void {
    this.flushPersistence();
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.handleBeforeUnload && typeof globalThis.window !== "undefined") {
      globalThis.window.removeEventListener("beforeunload", this.handleBeforeUnload);
      globalThis.window.removeEventListener("pagehide", this.handleBeforeUnload);
    }
  }

  getNode(path: string): VaultNode | null {
    const norm = normalizeVaultPath(path);
    const entry = this.entries.get(norm);
    return entry ? toVaultNode(entry) : null;
  }

  exists(path: string): boolean {
    const norm = normalizeVaultPath(path);
    if (!norm) return true;
    return this.entries.has(norm);
  }

  listAll(): VaultNode[] {
    const list: VaultNode[] = [];
    for (const entry of this.entries.values()) {
      list.push(toVaultNode(entry));
    }
    return list;
  }

  listChildren(folderPath: string, sort: VaultSortOrder = "name-asc"): VaultNode[] {
    const normFolder = normalizeVaultPath(folderPath);
    const result: VaultNode[] = [];
    for (const entry of this.entries.values()) {
      if (dirname(entry.path) === normFolder) {
        result.push(toVaultNode(entry));
      }
    }
    result.sort((a, b) => compareVaultNodes(a, b, sort));
    return result;
  }

  getTree(sort: VaultSortOrder = "name-asc"): VaultTreeNode[] {
    const byParent = new Map<string, VaultNode[]>();
    for (const entry of this.entries.values()) {
      const node = toVaultNode(entry);
      const list = byParent.get(node.parentPath);
      if (list) {
        list.push(node);
      } else {
        byParent.set(node.parentPath, [node]);
      }
    }

    const buildBranch = (parentPath: string): VaultTreeNode[] => {
      const children = byParent.get(parentPath) ?? [];
      children.sort((a, b) => compareVaultNodes(a, b, sort));
      return children.map((node) => ({
        node,
        children: node.kind === "folder" ? buildBranch(node.path) : [],
      }));
    };

    return buildBranch("");
  }

  read(path: string): string {
    const norm = normalizeVaultPath(path);
    const entry = this.entries.get(norm);
    if (!entry) throw new Error(`File not found: ${norm}`);
    if (entry.kind !== "file") throw new Error(`Path is a folder, not a file: ${norm}`);
    return entry.content;
  }

  write(path: string, content: string): VaultFileNode {
    const norm = normalizeVaultPath(path);
    const entry = this.entries.get(norm);
    if (!entry) {
      return this.createFile(norm, content);
    }
    if (entry.kind !== "file") {
      throw new Error(`Cannot write content to folder: ${norm}`);
    }
    const mtime = this.now();
    entry.content = content;
    entry.mtime = mtime;
    const node = toVaultNode(entry) as VaultFileNode;
    this.emit({ type: "modify", path: norm, content, mtime });
    return node;
  }

  createFile(path: string, content = ""): VaultFileNode {
    const norm = normalizeVaultPath(path);
    if (!norm) throw new Error("File path cannot be empty.");
    const nameError = validateEntryName(basename(norm));
    if (nameError) throw new Error(nameError);
    if (this.entries.has(norm)) {
      throw new Error(`Entry already exists: ${norm}`);
    }

    const ts = this.now();
    for (const anc of getAncestorPaths(norm)) {
      const existingAnc = this.entries.get(anc);
      if (existingAnc && existingAnc.kind === "file") {
        throw new Error(`Ancestor path is a file: ${anc}`);
      }
      if (!existingAnc) {
        const folderEntry: StoredEntry = {
          path: anc,
          kind: "folder",
          content: "",
          ctime: ts,
          mtime: ts,
        };
        this.entries.set(anc, folderEntry);
      }
    }

    const entry: StoredEntry = {
      path: norm,
      kind: "file",
      content,
      ctime: ts,
      mtime: ts,
    };
    this.entries.set(norm, entry);
    const node = toVaultNode(entry) as VaultFileNode;
    this.emit({ type: "create", node });
    return node;
  }

  createFolder(path: string): VaultFolderNode {
    const norm = normalizeVaultPath(path);
    if (!norm) throw new Error("Folder path cannot be empty.");
    const nameError = validateEntryName(basename(norm));
    if (nameError) throw new Error(nameError);
    if (this.entries.has(norm)) {
      throw new Error(`Entry already exists: ${norm}`);
    }

    const ts = this.now();
    for (const anc of getAncestorPaths(norm)) {
      const existingAnc = this.entries.get(anc);
      if (existingAnc && existingAnc.kind === "file") {
        throw new Error(`Ancestor path is a file: ${anc}`);
      }
      if (!existingAnc) {
        this.entries.set(anc, {
          path: anc,
          kind: "folder",
          content: "",
          ctime: ts,
          mtime: ts,
        });
      }
    }

    const entry: StoredEntry = {
      path: norm,
      kind: "folder",
      content: "",
      ctime: ts,
      mtime: ts,
    };
    this.entries.set(norm, entry);
    const node = toVaultNode(entry) as VaultFolderNode;
    this.emit({ type: "create", node });
    return node;
  }

  rename(oldPath: string, newNameOrPath: string): VaultRenameResult {
    const normOld = normalizeVaultPath(oldPath);
    const existing = this.entries.get(normOld);
    if (!existing) throw new Error(`Entry not found: ${normOld}`);

    const isBareName = !newNameOrPath.includes("/") && !newNameOrPath.includes("\\");
    if (isBareName) {
      const nameError = validateEntryName(newNameOrPath);
      if (nameError) throw new Error(nameError);
    }

    const normNew = isBareName
      ? joinPath(dirname(normOld), newNameOrPath.trim())
      : normalizeVaultPath(newNameOrPath);

    if (!normNew) throw new Error("Target path cannot be empty.");
    const leafError = validateEntryName(basename(normNew));
    if (leafError) throw new Error(leafError);

    if (normOld === normNew) {
      return { oldPath: normOld, newPath: normNew, affectedMap: [] };
    }

    if (existing.kind === "folder" && isDescendantPath(normNew, normOld)) {
      throw new Error("Cannot move a folder into itself or one of its descendants.");
    }

    if (this.entries.has(normNew)) {
      throw new Error(`Destination already exists: ${normNew}`);
    }

    // Ensure destination parent exists and is a folder (or root).
    const destParent = dirname(normNew);
    if (destParent) {
      const parentEntry = this.entries.get(destParent);
      if (parentEntry && parentEntry.kind === "file") {
        throw new Error(`Destination parent is a file: ${destParent}`);
      }
      if (!parentEntry) {
        this.ensureAncestorsSilent(normNew, this.now());
      }
    }

    const affectedMap: VaultPathMapping[] = [];
    const toRelocate: Array<{ oldKey: string; newKey: string; entry: StoredEntry }> = [];

    for (const [key, entry] of this.entries.entries()) {
      if (key === normOld) {
        toRelocate.push({ oldKey: key, newKey: normNew, entry });
      } else if (existing.kind === "folder" && key.startsWith(`${normOld}/`)) {
        const suffix = key.slice(normOld.length);
        const mapped = `${normNew}${suffix}`;
        if (this.entries.has(mapped)) {
          throw new Error(`Destination collision: ${mapped}`);
        }
        toRelocate.push({ oldKey: key, newKey: mapped, entry });
      }
    }

    for (const item of toRelocate) {
      this.entries.delete(item.oldKey);
    }
    const mtime = this.now();
    for (const item of toRelocate) {
      item.entry.path = item.newKey;
      if (item.oldKey === normOld) {
        item.entry.mtime = mtime;
      }
      this.entries.set(item.newKey, item.entry);
      affectedMap.push({ oldPath: item.oldKey, newPath: item.newKey });
    }

    this.emit({
      type: "rename",
      oldPath: normOld,
      newPath: normNew,
      kind: existing.kind,
      affectedMap,
    });

    return { oldPath: normOld, newPath: normNew, affectedMap };
  }

  move(sourcePath: string, targetFolderPath: string): VaultRenameResult {
    const normSource = normalizeVaultPath(sourcePath);
    const normTargetFolder = normalizeVaultPath(targetFolderPath);
    const existing = this.entries.get(normSource);
    if (!existing) throw new Error(`Entry not found: ${normSource}`);

    if (normTargetFolder) {
      const targetEntry = this.entries.get(normTargetFolder);
      if (!targetEntry || targetEntry.kind !== "folder") {
        throw new Error(`Target folder does not exist: ${normTargetFolder}`);
      }
    }

    if (existing.kind === "folder" && normTargetFolder && isDescendantPath(normTargetFolder, normSource)) {
      throw new Error("Cannot move a folder into itself or one of its descendants.");
    }

    const destPath = joinPath(normTargetFolder, basename(normSource));
    return this.rename(normSource, destPath);
  }

  duplicate(sourcePath: string): VaultNode {
    const norm = normalizeVaultPath(sourcePath);
    const existing = this.entries.get(norm);
    if (!existing) throw new Error(`Entry not found: ${norm}`);

    const parent = dirname(norm);
    if (existing.kind === "file") {
      const ext = extname(norm);
      const base = stem(norm);
      const destPath = this.getUniquePath(parent, base, ext || undefined);
      return this.createFile(destPath, existing.content);
    }

    const folderDest = this.getUniquePath(parent, basename(norm));
    const ts = this.now();
    const createdRoot = this.createFolder(folderDest);

    const descendants: StoredEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.path.startsWith(`${norm}/`)) {
        descendants.push(entry);
      }
    }
    descendants.sort((a, b) => a.path.length - b.path.length);

    for (const child of descendants) {
      const suffix = child.path.slice(norm.length);
      const childDest = `${folderDest}${suffix}`;
      this.entries.set(childDest, {
        path: childDest,
        kind: child.kind,
        content: child.content,
        ctime: ts,
        mtime: ts,
      });
    }
    this.emit({ type: "vault-reset" });
    return createdRoot;
  }

  delete(path: string): VaultDeleteResult {
    const norm = normalizeVaultPath(path);
    const existing = this.entries.get(norm);
    if (!existing) return { deletedPaths: [] };

    const deletedPaths: string[] = [];
    for (const key of Array.from(this.entries.keys())) {
      if (key === norm || (existing.kind === "folder" && key.startsWith(`${norm}/`))) {
        this.entries.delete(key);
        deletedPaths.push(key);
      }
    }

    this.emit({
      type: "delete",
      path: norm,
      kind: existing.kind,
      affectedPaths: deletedPaths,
    });
    return { deletedPaths };
  }

  getUniquePath(folderPath: string, baseName: string, extension?: string): string {
    const normFolder = normalizeVaultPath(folderPath);
    const extSuffix = extension ? `.${extension.replace(/^\./, "")}` : "";
    let candidate = joinPath(normFolder, `${baseName}${extSuffix}`);
    if (!this.entries.has(candidate)) return candidate;

    let counter = 1;
    while (true) {
      candidate = joinPath(normFolder, `${baseName} ${counter}${extSuffix}`);
      if (!this.entries.has(candidate)) return candidate;
      counter += 1;
    }
  }

  subscribe(listener: (event: VaultEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  exportSnapshot(): VaultSnapshot {
    const entries: VaultSnapshotEntry[] = [];
    for (const entry of this.entries.values()) {
      entries.push({
        path: entry.path,
        kind: entry.kind,
        ...(entry.kind === "file" ? { content: entry.content } : {}),
        ctime: entry.ctime,
        mtime: entry.mtime,
      });
    }
    return {
      version: 1,
      id: this.id,
      name: this.name,
      entries,
    };
  }

  importSnapshot(snapshot: VaultSnapshot): void {
    this.hydrateEntries(snapshot.entries);
    this.emit({ type: "vault-reset" });
  }

  reset(seeds: readonly MemoryVaultSeedEntry[]): void {
    this.hydrateSeed(seeds);
    this.emit({ type: "vault-reset" });
  }
}
