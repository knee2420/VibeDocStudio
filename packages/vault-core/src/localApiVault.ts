import { MemoryVaultAdapter, type MemoryVaultSeedEntry } from "./memoryVault";
import { normalizeVaultPath } from "./path";
import type {
  LocalVaultAppState,
  LocalVaultListResponse,
  LocalVaultMetadataCachePayload,
  LocalVaultSessionPayload,
  LocalVaultSummary,
  VaultDeleteResult,
  VaultEvent,
  VaultEventOrigin,
  VaultFileNode,
  VaultFolderNode,
  VaultNode,
  VaultPort,
  VaultRenameResult,
  VaultSnapshot,
  VaultSnapshotEntry,
  VaultSortOrder,
  VaultSyncStatus,
  VaultTreeNode,
} from "./types";

interface RemoteVaultTreeResponse {
  readonly vault: LocalVaultSummary;
  readonly entries: readonly {
    readonly path: string;
    readonly name: string;
    readonly parentPath: string;
    readonly kind: "file" | "folder";
    readonly ctime: number;
    readonly mtime: number;
    readonly extension?: string | null;
    readonly stem?: string | null;
    readonly size?: number | null;
  }[];
  readonly files: Readonly<Record<string, string>>;
  readonly revision: number;
}

interface RemoteWatchEvent {
  readonly type: "connected" | "create" | "modify" | "delete" | "error";
  readonly path?: string;
  readonly content?: string | null;
  readonly mtime?: number;
  readonly node?: {
    readonly path: string;
    readonly kind: "file" | "folder";
    readonly ctime: number;
    readonly mtime: number;
  };
  readonly message?: string;
}

export interface LocalApiVaultOptions {
  readonly vaultId: string;
  readonly name?: string;
  readonly rootPath?: string;
  /** API base URL (default `""` to use same-origin Vite `/api` proxy). */
  readonly apiBaseUrl?: string;
  /**
   * When false, `hydrate()` fetches ONLY file/folder metadata (no file bodies) and loads
   * text bodies lazily via `ensureLoaded(path)`. Recommended for large vaults (1,000+ files).
   * Default `true` for backward compatibility.
   */
  readonly includeContents?: boolean;
  /**
   * When true, all mutating VaultPort operations throw and never touch disk.
   * Can be toggled at runtime via `setReadOnly()`. Default `false`.
   */
  readonly readOnly?: boolean;
  /** Debounce interval (ms) for PUT /file writes. Default 250ms. */
  readonly writeDebounceMs?: number;
  /** Enable SSE real-time watch stream. Default true when EventSource is available. */
  readonly enableWatch?: boolean;
  readonly fetchImpl?: typeof fetch;
}

export interface LocalApiVaultStatusSnapshot {
  readonly status: VaultSyncStatus;
  readonly pendingWrites: number;
  readonly lastError: string | null;
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? "").replace(/\/+$/, "");
}

function makeClientId(): string {
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchJson<T>(
  fetchFn: typeof fetch,
  url: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetchFn(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errBody = (await res.json()) as { detail?: string; message?: string };
      if (errBody.detail) detail = errBody.detail;
      else if (errBody.message) detail = errBody.message;
    } catch {
      // Keep status text
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function listLocalVaults(
  apiBaseUrl = "",
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<LocalVaultListResponse> {
  return fetchJson<LocalVaultListResponse>(
    fetchImpl,
    `${normalizeBaseUrl(apiBaseUrl)}/api/vaults`
  );
}

export async function createOrMountLocalVault(
  apiBaseUrl: string,
  req: { readonly name: string; readonly rootPath?: string; readonly id?: string },
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<LocalVaultSummary> {
  return fetchJson<LocalVaultSummary>(
    fetchImpl,
    `${normalizeBaseUrl(apiBaseUrl)}/api/vaults`,
    { method: "POST", body: JSON.stringify(req) }
  );
}

export async function unregisterLocalVault(
  apiBaseUrl: string,
  vaultId: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<void> {
  await fetchJson<{ status: string }>(
    fetchImpl,
    `${normalizeBaseUrl(apiBaseUrl)}/api/vaults/${encodeURIComponent(vaultId)}`,
    { method: "DELETE" }
  );
}

export async function loadLocalVaultAppState(
  apiBaseUrl = "",
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<LocalVaultAppState> {
  return fetchJson<LocalVaultAppState>(
    fetchImpl,
    `${normalizeBaseUrl(apiBaseUrl)}/api/vaults/state`
  );
}

export async function saveLocalVaultAppState(
  apiBaseUrl: string,
  state: LocalVaultAppState,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<LocalVaultAppState> {
  return fetchJson<LocalVaultAppState>(
    fetchImpl,
    `${normalizeBaseUrl(apiBaseUrl)}/api/vaults/state`,
    { method: "PUT", body: JSON.stringify(state) }
  );
}

/**
 * 로컬 백엔드(`/api/vaults/{vaultId}`) 기반 Write-Through 캐시 Vault 어댑터.
 *
 * - 동기 읽기/트리 조회는 내부 메모리 미러에서 0ms 응답 (`VaultPort` 100% 호환)
 * - 쓰기/CRUD는 메모리에 낙관적 반영 후 직렬 큐로 로컬 디스크에 영속화
 * - SSE(`/events`)로 외부 변경(옵시디언 · AI 에이전트 · 스크립트)을 실시간 수신해 미러 갱신
 */
export class LocalApiVaultAdapter implements VaultPort {
  public readonly id: string;
  public name: string;
  public rootPath: string;

  private readonly apiBase: string;
  private readonly includeContents: boolean;
  private readonly writeDebounceMs: number;
  private readonly enableWatch: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly clientId: string;
  private readonly mirror: MemoryVaultAdapter;
  private readOnlyFlag: boolean;

  private readonly listeners = new Set<(event: VaultEvent) => void>();
  private readonly statusListeners = new Set<(snap: LocalApiVaultStatusSnapshot) => void>();
  private readonly loadedPaths = new Set<string>();
  private readonly inflightLoads = new Map<string, Promise<string>>();
  private readonly pendingWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingWriteContents = new Map<string, string>();

  private currentOrigin: VaultEventOrigin = "local";
  private suppressMirrorEvents = false;
  private unsubMirror: (() => void) | null = null;
  private eventSource: EventSource | null = null;
  private syncChain: Promise<void> = Promise.resolve();
  private pendingOps = 0;
  private status: VaultSyncStatus = "idle";
  private lastError: string | null = null;
  private disposed = false;

  constructor(options: LocalApiVaultOptions) {
    this.id = options.vaultId;
    this.name = options.name ?? options.vaultId;
    this.rootPath = options.rootPath ?? "";
    this.apiBase = normalizeBaseUrl(options.apiBaseUrl);
    this.includeContents = options.includeContents ?? true;
    this.readOnlyFlag = options.readOnly ?? false;
    this.writeDebounceMs = options.writeDebounceMs ?? 250;
    this.enableWatch = options.enableWatch ?? true;
    this.fetchFn = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.clientId = makeClientId();

    this.mirror = new MemoryVaultAdapter({
      id: this.id,
      name: this.name,
      initialEntries: [],
    });

    this.unsubMirror = this.mirror.subscribe((ev) => {
      if (this.suppressMirrorEvents) return;
      const tagged = { ...ev, origin: this.currentOrigin } as VaultEvent;
      for (const listener of this.listeners) {
        listener(tagged);
      }
    });
  }

  private vaultUrl(subPath: string): string {
    return `${this.apiBase}/api/vaults/${encodeURIComponent(this.id)}${subPath}`;
  }

  private updateStatus(status: VaultSyncStatus, lastError: string | null = this.lastError): void {
    this.status = status;
    this.lastError = lastError;
    const snap = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(snap);
    }
  }

  public getStatus(): LocalApiVaultStatusSnapshot {
    return {
      status: this.status,
      pendingWrites: this.pendingOps + this.pendingWriteContents.size,
      lastError: this.lastError,
    };
  }

  public subscribeStatus(
    listener: (snap: LocalApiVaultStatusSnapshot) => void
  ): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private assertWritable(action: string): void {
    if (this.readOnlyFlag) {
      throw new Error(`Vault "${this.name}" is in read-only mode (blocked: ${action}).`);
    }
  }

  private writeHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Vault-Writable": "true",
    };
  }

  public isReadOnly(): boolean {
    return this.readOnlyFlag;
  }

  public setReadOnly(readOnly: boolean): void {
    this.readOnlyFlag = readOnly;
  }

  public async hydrate(seedIfEmpty?: readonly MemoryVaultSeedEntry[]): Promise<LocalVaultSummary> {
    this.updateStatus("hydrating", null);
    try {
      const treeQuery = this.includeContents ? "/tree?includeContents=true" : "/tree?includeContents=false";
      let tree = await fetchJson<RemoteVaultTreeResponse>(
        this.fetchFn,
        this.vaultUrl(treeQuery)
      );

      if (!this.readOnlyFlag && tree.entries.length === 0 && seedIfEmpty && seedIfEmpty.length > 0) {
        await fetchJson<{ seeded: boolean; createdCount: number }>(
          this.fetchFn,
          this.vaultUrl("/seed"),
          {
            method: "POST",
            headers: this.writeHeaders(),
            body: JSON.stringify({
              entries: seedIfEmpty
                .filter((e) => (e.kind ?? "file") === "file")
                .map((e) => ({ path: e.path, content: e.content ?? "" })),
              onlyIfEmpty: true,
              clientId: this.clientId,
            }),
          }
        );
        tree = await fetchJson<RemoteVaultTreeResponse>(
          this.fetchFn,
          this.vaultUrl(treeQuery)
        );
      }

      this.name = tree.vault.name;
      this.rootPath = tree.vault.rootPath;

      this.loadedPaths.clear();
      const snapshotEntries: VaultSnapshotEntry[] = tree.entries.map((e) => {
        if (e.kind === "file") {
          const hasInline = Object.prototype.hasOwnProperty.call(tree.files, e.path);
          if (hasInline) this.loadedPaths.add(e.path);
          return {
            path: e.path,
            kind: "file",
            content: hasInline ? tree.files[e.path] : "",
            ctime: e.ctime,
            mtime: e.mtime,
          };
        }
        return {
          path: e.path,
          kind: "folder",
          ctime: e.ctime,
          mtime: e.mtime,
        };
      });

      this.currentOrigin = "external";
      try {
        this.mirror.importSnapshot({
          version: 1,
          id: this.id,
          name: this.name,
          entries: snapshotEntries,
        });
      } finally {
        this.currentOrigin = "local";
      }

      this.updateStatus("ready", null);
      if (this.enableWatch) {
        this.startWatching();
      }
      return tree.vault;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to hydrate local vault";
      this.updateStatus("offline", msg);
      throw error;
    }
  }

  public startWatching(): void {
    if (this.disposed || this.eventSource) return;
    if (typeof globalThis.EventSource === "undefined") return;

    const url = this.vaultUrl(`/events?clientId=${encodeURIComponent(this.clientId)}`);
    const es = new globalThis.EventSource(url);
    this.eventSource = es;

    es.onmessage = (msgEvent) => {
      if (this.disposed) return;
      try {
        const parsed = JSON.parse(msgEvent.data) as RemoteWatchEvent;
        this.applyExternalWatchEvent(parsed);
      } catch {
        // Ignore malformed SSE frame
      }
    };

    es.onerror = () => {
      if (!this.disposed && this.status === "ready") {
        this.updateStatus("offline", "Vault watch stream disconnected (retrying...)");
      }
    };
  }

  private applyExternalWatchEvent(ev: RemoteWatchEvent): void {
    if (ev.type === "connected") {
      if (this.status !== "syncing") {
        this.updateStatus("ready", null);
      }
      return;
    }
    if (!ev.path) return;
    const norm = normalizeVaultPath(ev.path);
    if (!norm) return;

    // 로컬 디바운스 쓰기가 대기 중인 경로는 외부 이벤트로 덮어쓰지 않음
    if (this.pendingWriteContents.has(norm)) return;

    this.currentOrigin = "external";
    try {
      if (ev.type === "delete") {
        if (this.mirror.exists(norm)) {
          this.loadedPaths.delete(norm);
          this.mirror.delete(norm);
        }
        return;
      }

      const kind = ev.node?.kind ?? "file";
      if (kind === "folder") {
        if (!this.mirror.exists(norm)) {
          this.mirror.createFolder(norm);
        }
        return;
      }

      if (ev.content !== undefined && ev.content !== null) {
        this.loadedPaths.add(norm);
        if (this.mirror.exists(norm)) {
          if (this.mirror.read(norm) !== ev.content) {
            this.mirror.write(norm, ev.content);
          }
        } else {
          this.mirror.createFile(norm, ev.content);
        }
      } else if (!this.mirror.exists(norm)) {
        this.mirror.createFile(norm, "");
      }
    } finally {
      this.currentOrigin = "local";
    }
  }

  private enqueueSync(op: () => Promise<void>): void {
    this.pendingOps += 1;
    this.updateStatus("syncing", this.lastError);
    this.syncChain = this.syncChain
      .then(async () => {
        if (this.disposed) return;
        await op();
      })
      .then(() => {
        this.pendingOps = Math.max(0, this.pendingOps - 1);
        if (this.pendingOps === 0 && this.pendingWriteContents.size === 0) {
          this.updateStatus("ready", null);
        } else {
          this.updateStatus("syncing", this.lastError);
        }
      })
      .catch((error: unknown) => {
        this.pendingOps = Math.max(0, this.pendingOps - 1);
        const msg = error instanceof Error ? error.message : "Local vault sync failed";
        this.updateStatus("error", msg);
      });
  }

  private scheduleDebouncedWrite(path: string, content: string): void {
    const norm = normalizeVaultPath(path);
    this.pendingWriteContents.set(norm, content);
    const prevTimer = this.pendingWriteTimers.get(norm);
    if (prevTimer !== undefined) {
      clearTimeout(prevTimer);
    }
    if (this.writeDebounceMs <= 0) {
      this.flushDebouncedWrite(norm);
      return;
    }
    const timer = setTimeout(() => {
      this.flushDebouncedWrite(norm);
    }, this.writeDebounceMs);
    this.pendingWriteTimers.set(norm, timer);
    this.updateStatus("syncing", this.lastError);
  }

  private flushDebouncedWrite(normPath: string): void {
    const timer = this.pendingWriteTimers.get(normPath);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingWriteTimers.delete(normPath);
    }
    if (!this.pendingWriteContents.has(normPath)) return;
    const content = this.pendingWriteContents.get(normPath)!;
    this.pendingWriteContents.delete(normPath);

    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/file"), {
        method: "PUT",
        headers: this.writeHeaders(),
        body: JSON.stringify({ path: normPath, content, clientId: this.clientId }),
      });
    });
  }

  public flushAllPendingWrites(): void {
    for (const path of Array.from(this.pendingWriteContents.keys())) {
      this.flushDebouncedWrite(path);
    }
  }

  public async waitForIdle(): Promise<void> {
    this.flushAllPendingWrites();
    await this.syncChain;
  }

  // --- VaultPort 구현 ---

  public getNode(path: string): VaultNode | null {
    return this.mirror.getNode(path);
  }

  public exists(path: string): boolean {
    return this.mirror.exists(path);
  }

  public listAll(): VaultNode[] {
    return this.mirror.listAll();
  }

  public listChildren(folderPath: string, sort?: VaultSortOrder): VaultNode[] {
    return this.mirror.listChildren(folderPath, sort);
  }

  public getTree(sort?: VaultSortOrder): VaultTreeNode[] {
    return this.mirror.getTree(sort);
  }

  public isLoaded(path: string): boolean {
    return this.loadedPaths.has(normalizeVaultPath(path));
  }

  public async ensureLoaded(path: string): Promise<string> {
    const norm = normalizeVaultPath(path);
    if (this.loadedPaths.has(norm) && this.mirror.exists(norm)) {
      return this.mirror.read(norm);
    }
    const existing = this.inflightLoads.get(norm);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const res = await fetchJson<{ content: string }>(
          this.fetchFn,
          this.vaultUrl(`/file?path=${encodeURIComponent(norm)}`)
        );
        this.loadedPaths.add(norm);
        this.currentOrigin = "external";
        try {
          if (this.mirror.exists(norm)) {
            this.mirror.write(norm, res.content);
          } else {
            this.mirror.createFile(norm, res.content);
          }
        } finally {
          this.currentOrigin = "local";
        }
        return res.content;
      } finally {
        this.inflightLoads.delete(norm);
      }
    })();

    this.inflightLoads.set(norm, promise);
    return promise;
  }

  public getBinaryUrl(path: string): string {
    const norm = normalizeVaultPath(path);
    return this.vaultUrl(`/raw?path=${encodeURIComponent(norm)}`);
  }

  public async revealInOsExplorer(path = ""): Promise<string> {
    const norm = normalizeVaultPath(path);
    const res = await fetchJson<{ ok: boolean; resolvedPath: string }>(
      this.fetchFn,
      this.vaultUrl("/reveal"),
      {
        method: "POST",
        body: JSON.stringify({ path: norm }),
      }
    );
    return res.resolvedPath;
  }

  public read(path: string): string {
    return this.mirror.read(path);
  }

  public write(path: string, content: string): VaultFileNode {
    this.assertWritable("write");
    const norm = normalizeVaultPath(path);
    this.loadedPaths.add(norm);
    const node = this.mirror.write(norm, content);
    this.scheduleDebouncedWrite(norm, content);
    return node;
  }

  public createFile(path: string, content = ""): VaultFileNode {
    this.assertWritable("createFile");
    const norm = normalizeVaultPath(path);
    this.loadedPaths.add(norm);
    const node = this.mirror.createFile(norm, content);
    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/file"), {
        method: "POST",
        headers: this.writeHeaders(),
        body: JSON.stringify({ path: norm, content, clientId: this.clientId }),
      });
    });
    return node;
  }

  public createFolder(path: string): VaultFolderNode {
    this.assertWritable("createFolder");
    const norm = normalizeVaultPath(path);
    const node = this.mirror.createFolder(norm);
    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/folder"), {
        method: "POST",
        headers: this.writeHeaders(),
        body: JSON.stringify({ path: norm, clientId: this.clientId }),
      });
    });
    return node;
  }

  public rename(oldPath: string, newNameOrPath: string): VaultRenameResult {
    this.assertWritable("rename");
    this.flushAllPendingWrites();
    const res = this.mirror.rename(oldPath, newNameOrPath);
    for (const m of res.affectedMap) {
      if (this.loadedPaths.delete(m.oldPath)) {
        this.loadedPaths.add(m.newPath);
      }
    }
    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/rename"), {
        method: "POST",
        headers: this.writeHeaders(),
        body: JSON.stringify({
          oldPath: res.oldPath,
          newNameOrPath: res.newPath,
          clientId: this.clientId,
        }),
      });
    });
    return res;
  }

  public move(sourcePath: string, targetFolderPath: string): VaultRenameResult {
    this.assertWritable("move");
    this.flushAllPendingWrites();
    const res = this.mirror.move(sourcePath, targetFolderPath);
    for (const m of res.affectedMap) {
      if (this.loadedPaths.delete(m.oldPath)) {
        this.loadedPaths.add(m.newPath);
      }
    }
    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/move"), {
        method: "POST",
        headers: this.writeHeaders(),
        body: JSON.stringify({
          sourcePath: res.oldPath,
          targetFolderPath,
          clientId: this.clientId,
        }),
      });
    });
    return res;
  }

  public duplicate(sourcePath: string): VaultNode {
    this.assertWritable("duplicate");
    this.flushAllPendingWrites();
    const norm = normalizeVaultPath(sourcePath);
    const created = this.mirror.duplicate(norm);
    if (created.kind === "file") {
      this.loadedPaths.add(created.path);
    }
    this.enqueueSync(async () => {
      await fetchJson(this.fetchFn, this.vaultUrl("/duplicate"), {
        method: "POST",
        headers: this.writeHeaders(),
        body: JSON.stringify({ sourcePath: norm, clientId: this.clientId }),
      });
    });
    return created;
  }

  public delete(path: string): VaultDeleteResult {
    this.assertWritable("delete");
    this.flushAllPendingWrites();
    const norm = normalizeVaultPath(path);
    const res = this.mirror.delete(norm);
    for (const removed of res.deletedPaths) {
      this.loadedPaths.delete(removed);
      const timer = this.pendingWriteTimers.get(removed);
      if (timer !== undefined) {
        clearTimeout(timer);
        this.pendingWriteTimers.delete(removed);
      }
      this.pendingWriteContents.delete(removed);
    }
    this.enqueueSync(async () => {
      await fetchJson(
        this.fetchFn,
        this.vaultUrl(
          `/entry?path=${encodeURIComponent(norm)}&clientId=${encodeURIComponent(this.clientId)}`
        ),
        { method: "DELETE", headers: this.writeHeaders() }
      );
    });
    return res;
  }

  public getUniquePath(folderPath: string, baseName: string, extension?: string): string {
    return this.mirror.getUniquePath(folderPath, baseName, extension);
  }

  public subscribe(listener: (event: VaultEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public exportSnapshot(): VaultSnapshot {
    return this.mirror.exportSnapshot();
  }

  public importSnapshot(snapshot: VaultSnapshot): void {
    this.mirror.importSnapshot(snapshot);
  }

  // --- `.vibe/` 볼트 귀속 세션 & 파생 캐시 ---

  public async loadWorkspaceSession(): Promise<LocalVaultSessionPayload> {
    return fetchJson<LocalVaultSessionPayload>(this.fetchFn, this.vaultUrl("/session"));
  }

  public async saveWorkspaceSession(
    payload: LocalVaultSessionPayload
  ): Promise<LocalVaultSessionPayload> {
    return fetchJson<LocalVaultSessionPayload>(this.fetchFn, this.vaultUrl("/session"), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  public async loadMetadataCache(): Promise<LocalVaultMetadataCachePayload> {
    return fetchJson<LocalVaultMetadataCachePayload>(this.fetchFn, this.vaultUrl("/cache"));
  }

  public async saveMetadataCache(
    payload: LocalVaultMetadataCachePayload
  ): Promise<LocalVaultMetadataCachePayload> {
    return fetchJson<LocalVaultMetadataCachePayload>(this.fetchFn, this.vaultUrl("/cache"), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  public dispose(): void {
    this.flushAllPendingWrites();
    this.disposed = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.unsubMirror) {
      this.unsubMirror();
      this.unsubMirror = null;
    }
    this.mirror.dispose();
    this.listeners.clear();
    this.statusListeners.clear();
  }
}
