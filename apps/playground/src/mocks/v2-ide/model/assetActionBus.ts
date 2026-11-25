/**
 * v2 에셋 허브 · AI Direct · AI Composer(AG-UI 깔때기) 간 경량 액션 & 사용자 개인화(핀/최근) 버스.
 * - 핀 고정 / 최근 사용 에셋을 localStorage 에 영속화한다.
 * - AI Composer 채팅 카드 · `assets.stagePreview` 도구 · `AI Direct` 칩이
 *   복잡한 prop drilling 없이 에셋 프리뷰 적용 또는 AG-UI 양식 추천 깔때기를 즉시 열 수 있게 한다.
 */
const PINNED_STORAGE_KEY = "vibe.asset.hub.pinned.v1";
const RECENT_STORAGE_KEY = "vibe.asset.hub.recent.v1";
const MAX_RECENT = 8;

function readIdList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

function writeIdList(key: string, ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(key, JSON.stringify(ids));
  } catch {
    // Ignore storage quota errors
  }
}

let pinnedIds: string[] = readIdList(PINNED_STORAGE_KEY);
let recentIds: string[] = readIdList(RECENT_STORAGE_KEY);
const prefListeners = new Set<() => void>();

function emitPrefs(): void {
  for (const fn of prefListeners) fn();
}

export function getPinnedAssetIds(): readonly string[] {
  return pinnedIds;
}

export function getRecentAssetIds(): readonly string[] {
  return recentIds;
}

export function togglePinnedAssetId(assetId: string): boolean {
  const exists = pinnedIds.includes(assetId);
  pinnedIds = exists ? pinnedIds.filter((id) => id !== assetId) : [assetId, ...pinnedIds];
  writeIdList(PINNED_STORAGE_KEY, pinnedIds);
  emitPrefs();
  return !exists;
}

export function recordRecentAssetUse(assetId: string): void {
  recentIds = [assetId, ...recentIds.filter((id) => id !== assetId)].slice(0, MAX_RECENT);
  writeIdList(RECENT_STORAGE_KEY, recentIds);
  emitPrefs();
}

export function subscribeAssetHubPrefs(listener: () => void): () => void {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

// --- Cross-panel Asset Preview / Funnel Action Bus ---

export type AssetHubCommand =
  | { readonly type: "stage-preview"; readonly assetId: string }
  | { readonly type: "insert-skeleton"; readonly assetId: string }
  | { readonly type: "open-gallery"; readonly query?: string };

type CommandListener = (cmd: AssetHubCommand) => void;
const commandListeners = new Set<CommandListener>();
let pendingCommand: { cmd: AssetHubCommand; expiresAt: number } | null = null;

export function dispatchAssetHubCommand(cmd: AssetHubCommand): boolean {
  if (commandListeners.size > 0) {
    for (const fn of commandListeners) fn(cmd);
    return true;
  }
  pendingCommand = { cmd, expiresAt: Date.now() + 4000 };
  return false;
}

export function subscribeAssetHubCommand(listener: CommandListener): () => void {
  commandListeners.add(listener);
  if (pendingCommand) {
    const p = pendingCommand;
    pendingCommand = null;
    if (p.expiresAt >= Date.now()) {
      queueMicrotask(() => listener(p.cmd));
    }
  }
  return () => {
    commandListeners.delete(listener);
  };
}

export interface AguiAssetFunnelRequest {
  readonly sourcePath?: string;
  readonly seedQuery?: string;
  readonly selectedNodeIds?: readonly string[];
}

type FunnelListener = (req: AguiAssetFunnelRequest) => void;
const funnelListeners = new Set<FunnelListener>();
let pendingFunnel: { req: AguiAssetFunnelRequest; expiresAt: number } | null = null;

export function requestOpenAguiAssetFunnel(req: AguiAssetFunnelRequest = {}): void {
  if (funnelListeners.size > 0) {
    for (const fn of funnelListeners) fn(req);
    return;
  }
  pendingFunnel = { req, expiresAt: Date.now() + 4000 };
}

export function subscribeAguiAssetFunnel(listener: FunnelListener): () => void {
  funnelListeners.add(listener);
  if (pendingFunnel) {
    const p = pendingFunnel;
    pendingFunnel = null;
    if (p.expiresAt >= Date.now()) {
      queueMicrotask(() => listener(p.req));
    }
  }
  return () => {
    funnelListeners.delete(listener);
  };
}
