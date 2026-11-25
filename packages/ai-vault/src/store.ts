import type { VaultFsBatchSummary } from "@vibe/ai-kernel";
import type { StagedAiChange } from "@vibe/vdoc-schema";
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  DEFAULT_OUTLINE_SCOPE,
  DEFAULT_SCOPE,
  type DocScopeSetting,
  type OutlineScopeMode,
  type OutlineScopeSetting,
  type ResolvedScope,
  type ScopeMode,
  type ScopeTarget,
} from "@vibe/ai-scope";

/**
 * v2 Composer 설정 · 대기열 (볼트 하나당 하나).
 *
 * studio 의 `useAiScopeStore` · `useAiStagingStore` · RM/Reference Manager 체크를 v2 볼트 모델로 옮긴 것:
 *   - 범위 설정은 **볼트 문서 경로**별 (studio: docId)
 *   - 레퍼런스 = 켠 `.ref` 파일 경로, 리소스 = 고른 볼트 폴더 + 외부 폴더(절대 경로)
 *   - 변경안(Staged)은 대상 문서의 볼트 경로를 함께 든다 — 승인하면 그 파일에 쓴다
 */
export type V2StagedChange = StagedAiChange & {
  readonly path: string;
  /** 이 변경안을 만든 Composer 세션 (메인이면 없음) — 세션별 검토 · 완료 시 버리기 */
  readonly sessionKey?: string;
};

/** 볼트 FS 묶음 + 만든 세션 (되돌리기는 그 서버 세션으로) */
export type V2FsBatch = VaultFsBatchSummary & {
  readonly sessionKey?: string;
  readonly serverSessionId?: string;
};

export type V2Turn = ResolvedScope & { readonly path: string };

export interface V2AiSettings {
  readonly scopeOn: boolean;
  readonly sourcesOn: boolean;
  readonly referencePaths: readonly string[];
  /** 볼트 상대 폴더. "" = 볼트 전체 */
  readonly resourceFolders: readonly string[];
  readonly externalFolders: readonly string[];
  readonly scopeByPath: Readonly<Record<string, DocScopeSetting>>;
  readonly outlineScopeByPath: Readonly<Record<string, OutlineScopeSetting>>;
}

export interface V2AiState extends V2AiSettings {
  /** 지금 보내는(처리 중인) 메시지의 범위 — 문서 도구 가드가 읽는다 */
  readonly turn: V2Turn | null;
  /** 기준점 세션별 범위 (메인은 `turn`) */
  readonly turnBySession: Readonly<Record<string, V2Turn>>;
  readonly queue: readonly V2StagedChange[];
  /** 이번 세션에서 vf_* 가 실행한 볼트 디렉토리/파일 변경 배치 이력 (UI 에서 1클릭 되돌리기). */
  readonly fsBatches: readonly V2FsBatch[];
  /** 최근 승인된 `.outline` 패치 경로 목록 (1클릭 되돌리기 버튼 노출용) */
  readonly approvedOutlinePaths: readonly string[];
  /** 지연 로딩된 볼트 파일(.ref 등)이 도착하면 오른다 — 설정바 · 첨부를 다시 계산하게 한다 */
  readonly loadedRevision: number;
  bumpLoaded(): void;
  setFsBatches(batches: readonly VaultFsBatchSummary[], tag?: { sessionKey?: string; serverSessionId?: string }): void;
  markFsBatchUndone(batchId: string): void;
  recordApprovedOutline(path: string): void;
  clearApprovedOutline(path: string): void;

  setScopeOn(on: boolean): void;
  setSourcesOn(on: boolean): void;
  settingFor(path: string): DocScopeSetting;
  outlineSettingFor(path: string): OutlineScopeSetting;
  setOutlineScopeMode(path: string, mode: OutlineScopeMode): void;
  pinOutlineNodes(path: string, rootNodeIds: readonly string[]): void;
  clearOutlinePin(path: string): void;
  setScopeMode(path: string, mode: ScopeMode): void;
  pinTarget(path: string, target: ScopeTarget): void;
  clearPin(path: string): void;
  setExcludedPages(path: string, pageIds: string[]): void;
  toggleReference(refPath: string, on?: boolean): void;
  toggleResourceFolder(folder: string, on?: boolean): void;
  addExternalFolder(absPath: string): void;
  removeExternalFolder(absPath: string): void;
  /** 이번 메시지 범위. `sessionKey` 가 있으면 그 기준점 세션 몫 */
  setTurn(turn: V2Turn | null, sessionKey?: string): void;
  enqueue(changes: V2StagedChange[]): void;
  /** 기존 변경안(`diffId`)을 새 변경안으로 제자리 갱신한다 (`revisionOf` 대화형 수정). 없으면 끝에 추가. */
  revise(diffId: string, next: V2StagedChange): boolean;
  /** `asset-blocks` 변경안의 배치 방식(`replace` ↔ `insert`)을 승인 직전 전환한다. */
  setAssetPlacementMode(diffId: string, mode: "replace" | "insert"): boolean;
  remove(diffIds: readonly string[]): void;
  /** 세션이 만든 변경안을 모두 뺀다 (세션 완료 시). 돌려준 값 = 뺀 수 */
  removeBySession(sessionKey: string): number;
  remapPath(oldPath: string, newPath: string): void;
}

export type V2AiStore = StoreApi<V2AiState>;

const SETTINGS_KEY = (vaultId: string) => `vibe.playground.v2ide.ai.${vaultId}.v1`;
/** 변경안 대기열 — 새로고침 · 개발 서버 리로드에도 남는다 (studio 는 서버 staging 에 둔다) */
const QUEUE_KEY = (vaultId: string) => `vibe.playground.v2ide.ai.${vaultId}.queue.v1`;

function dedupeQueue(items: readonly V2StagedChange[]): V2StagedChange[] {
  // 같은 대상(슬롯 · 아웃라인 파일 · 블록 속성)의 새 변경안이 오면 예전 것을 교체 (마지막 것 유지)
  const out: V2StagedChange[] = [];
  const seenKeys = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) {
    const c = items[i];
    const k = stagedDedupeKey(c);
    if (k && seenKeys.has(k)) continue;
    if (k) seenKeys.add(k);
    out.push(c);
  }
  return out.reverse();
}

function loadQueue(vaultId: string, storage: Storage | null): V2StagedChange[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(QUEUE_KEY(vaultId)) ?? "[]") as unknown;
    const valid = Array.isArray(raw)
      ? (raw as V2StagedChange[]).filter((c) => c && typeof c.diffId === "string" && typeof c.path === "string")
      : [];
    return dedupeQueue(valid);
  } catch {
    return [];
  }
}

const DEFAULT_SETTINGS: V2AiSettings = {
  scopeOn: true,
  sourcesOn: true,
  referencePaths: [],
  resourceFolders: [],
  externalFolders: [],
  scopeByPath: {},
  outlineScopeByPath: {},
};

function loadSettings(vaultId: string, storage: Storage | null): V2AiSettings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(SETTINGS_KEY(vaultId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<V2AiSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      referencePaths: Array.isArray(parsed.referencePaths) ? parsed.referencePaths : [],
      resourceFolders: Array.isArray(parsed.resourceFolders) ? parsed.resourceFolders : [],
      externalFolders: Array.isArray(parsed.externalFolders) ? parsed.externalFolders : [],
      scopeByPath: parsed.scopeByPath && typeof parsed.scopeByPath === "object" ? parsed.scopeByPath : {},
      outlineScopeByPath: parsed.outlineScopeByPath && typeof parsed.outlineScopeByPath === "object" ? parsed.outlineScopeByPath : {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function toggleIn(list: readonly string[], item: string, on?: boolean): string[] {
  const has = list.includes(item);
  const next = on ?? !has;
  if (next && !has) return [...list, item];
  if (!next && has) return list.filter((x) => x !== item);
  return [...list];
}

const stagedDedupeKey = (c: V2StagedChange): string | null => {
  if (c.targetKind === "slot-html") return `slot:${c.path}#${c.payload.slotId}`;
  if (c.targetKind === "outline-patch") return `outline:${c.path}`;
  if (c.targetKind === "block-props") return `block:${c.path}#${c.payload.blockId}`;
  if (c.targetKind === "asset-blocks" && c.payload.mode === "replace" && c.payload.replaceBlockIds?.length) {
    return `asset-replace:${c.path}#${[...c.payload.replaceBlockIds].sort().join(",")}`;
  }
  return null;
};

export function createV2AiStore(vaultId: string, storage: Storage | null = safeLocalStorage()): V2AiStore {
  const store = createStore<V2AiState>((set, get) => {
    const patchSetting = (path: string, patch: Partial<DocScopeSetting>) =>
      set((s) => ({ scopeByPath: { ...s.scopeByPath, [path]: { ...(s.scopeByPath[path] ?? DEFAULT_SCOPE), ...patch } } }));
    const patchOutlineSetting = (path: string, patch: Partial<OutlineScopeSetting>) =>
      set((s) => ({
        outlineScopeByPath: { ...s.outlineScopeByPath, [path]: { ...(s.outlineScopeByPath[path] ?? DEFAULT_OUTLINE_SCOPE), ...patch } },
      }));
    return {
      ...loadSettings(vaultId, storage),
      turn: null,
      turnBySession: {},
      queue: loadQueue(vaultId, storage),
      fsBatches: [],
      approvedOutlinePaths: [],
      loadedRevision: 0,
      bumpLoaded: () => set((s) => ({ loadedRevision: s.loadedRevision + 1 })),
      setFsBatches: (batches, tag) =>
        set((s) => {
          const map = new Map<string, V2FsBatch>(s.fsBatches.map((b) => [b.batchId, b]));
          for (const b of batches) {
            const prev = map.get(b.batchId);
            map.set(b.batchId, {
              ...b,
              sessionKey: tag?.sessionKey ?? prev?.sessionKey,
              serverSessionId: tag?.serverSessionId ?? prev?.serverSessionId,
            });
          }
          return { fsBatches: [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40) };
        }),
      markFsBatchUndone: (batchId) =>
        set((s) => ({ fsBatches: s.fsBatches.map((b) => (b.batchId === batchId ? { ...b, undone: true } : b)) })),
      recordApprovedOutline: (path) =>
        set((s) => ({ approvedOutlinePaths: [path, ...s.approvedOutlinePaths.filter((p) => p !== path)].slice(0, 10) })),
      clearApprovedOutline: (path) =>
        set((s) => ({ approvedOutlinePaths: s.approvedOutlinePaths.filter((p) => p !== path) })),
      setScopeOn: (on) => set({ scopeOn: on }),
      setSourcesOn: (on) => set({ sourcesOn: on }),
      settingFor: (path) => get().scopeByPath[path] ?? DEFAULT_SCOPE,
      outlineSettingFor: (path) => get().outlineScopeByPath[path] ?? DEFAULT_OUTLINE_SCOPE,
      setOutlineScopeMode: (path, mode) =>
        patchOutlineSetting(path, { mode, ...(mode === "document" ? { fixed: false, rootNodeIds: [] } : {}) }),
      pinOutlineNodes: (path, rootNodeIds) =>
        patchOutlineSetting(path, { mode: "selection", fixed: true, rootNodeIds: [...rootNodeIds] }),
      clearOutlinePin: (path) => patchOutlineSetting(path, { fixed: false, rootNodeIds: [] }),
      setScopeMode: (path, mode) => patchSetting(path, { mode, ...(mode === "selection" ? {} : { fixed: false, target: null }) }),
      pinTarget: (path, target) => patchSetting(path, { mode: "selection", fixed: true, target }),
      clearPin: (path) => patchSetting(path, { fixed: false, target: null }),
      setExcludedPages: (path, pageIds) => patchSetting(path, { excludedPageIds: [...pageIds] }),
      toggleReference: (refPath, on) => set((s) => ({ referencePaths: toggleIn(s.referencePaths, refPath, on) })),
      toggleResourceFolder: (folder, on) => set((s) => ({ resourceFolders: toggleIn(s.resourceFolders, folder, on) })),
      addExternalFolder: (absPath) => {
        const clean = absPath.trim().replace(/[\\/]+$/, "");
        if (clean) set((s) => ({ externalFolders: toggleIn(s.externalFolders, clean, true) }));
      },
      removeExternalFolder: (absPath) => set((s) => ({ externalFolders: s.externalFolders.filter((p) => p !== absPath) })),
      setTurn: (turn, sessionKey) => {
        if (!sessionKey) {
          set({ turn });
          return;
        }
        set((s) => {
          const next = { ...s.turnBySession };
          if (turn) next[sessionKey] = turn;
          else delete next[sessionKey];
          return { turnBySession: next };
        });
      },
      enqueue: (changes) =>
        set((s) => ({
          queue: dedupeQueue([...s.queue, ...changes]),
        })),
      revise: (diffId, next) => {
        let replaced = false;
        set((s) => {
          const idx = s.queue.findIndex((c) => c.diffId === diffId);
          if (idx < 0) return { queue: dedupeQueue([...s.queue, next]) };
          replaced = true;
          const prev = s.queue[idx];
          const updated: V2StagedChange = {
            ...next,
            diffId: prev.diffId,
            ...(prev.sessionKey && !next.sessionKey ? { sessionKey: prev.sessionKey } : {}),
          };
          const copy = [...s.queue];
          copy[idx] = updated;
          return { queue: dedupeQueue(copy) };
        });
        return replaced;
      },
      setAssetPlacementMode: (diffId, mode) => {
        let changed = false;
        set((s) => {
          const idx = s.queue.findIndex((c) => c.diffId === diffId && c.targetKind === "asset-blocks");
          if (idx < 0) return s;
          const cur = s.queue[idx];
          if (cur.targetKind !== "asset-blocks" || cur.payload.mode === mode) return s;
          const p = cur.payload;
          if (mode === "replace") {
            const targetIds = p.replaceBlockIds?.length
              ? p.replaceBlockIds
              : p.anchorBlockId
                ? [p.anchorBlockId]
                : [];
            if (targetIds.length === 0) return s;
            changed = true;
            const copy = [...s.queue];
            copy[idx] = {
              ...cur,
              targetId: targetIds[0],
              beforeSummary: `블록 ${targetIds.length}개`,
              createdAt: new Date().toISOString(),
              payload: {
                ...p,
                mode: "replace",
                replaceBlockIds: targetIds,
                anchorBlockId: p.anchorBlockId ?? targetIds[0],
              },
            };
            return { queue: dedupeQueue(copy) };
          }
          // replace → insert: 기존 replaceBlockIds 를 보존해 다시 교체로 되돌릴 수 있게 한다
          const anchorId = p.anchorBlockId ?? p.replaceBlockIds?.[0];
          changed = true;
          const copy = [...s.queue];
          copy[idx] = {
            ...cur,
            targetId: anchorId ?? cur.targetId,
            beforeSummary: "(새로 놓기)",
            createdAt: new Date().toISOString(),
            payload: {
              ...p,
              mode: "insert",
              ...(anchorId ? { anchorBlockId: anchorId } : {}),
            },
          };
          return { queue: copy };
        });
        return changed;
      },
      remove: (diffIds) => set((s) => ({ queue: s.queue.filter((c) => !diffIds.includes(c.diffId)) })),
      removeBySession: (sessionKey) => {
        const before = get().queue.length;
        set((s) => {
          const next = { ...s.turnBySession };
          delete next[sessionKey];
          return { queue: s.queue.filter((c) => c.sessionKey !== sessionKey), turnBySession: next };
        });
        return before - get().queue.length;
      },
      remapPath: (oldPath, newPath) =>
        set((s) => ({
          queue: s.queue.map((c) => (c.path === oldPath ? { ...c, path: newPath } : c)),
          referencePaths: s.referencePaths.map((p) => (p === oldPath ? newPath : p)),
          scopeByPath: Object.fromEntries(Object.entries(s.scopeByPath).map(([k, v]) => [k === oldPath ? newPath : k, v])),
          outlineScopeByPath: Object.fromEntries(Object.entries(s.outlineScopeByPath).map(([k, v]) => [k === oldPath ? newPath : k, v])),
        })),
    };
  });
  if (storage) {
    store.subscribe((s, prev) => {
      if (s.queue !== prev.queue) {
        try {
          storage.setItem(QUEUE_KEY(vaultId), JSON.stringify(s.queue));
        } catch {
          /* 가득 찼으면 이번 세션만 */
        }
      }
      if (
        s.scopeOn === prev.scopeOn &&
        s.sourcesOn === prev.sourcesOn &&
        s.referencePaths === prev.referencePaths &&
        s.resourceFolders === prev.resourceFolders &&
        s.externalFolders === prev.externalFolders &&
        s.scopeByPath === prev.scopeByPath &&
        s.outlineScopeByPath === prev.outlineScopeByPath
      )
        return;
      try {
        const settings: V2AiSettings = {
          scopeOn: s.scopeOn,
          sourcesOn: s.sourcesOn,
          referencePaths: s.referencePaths,
          resourceFolders: s.resourceFolders,
          externalFolders: s.externalFolders,
          scopeByPath: s.scopeByPath,
          outlineScopeByPath: s.outlineScopeByPath,
        };
        storage.setItem(SETTINGS_KEY(vaultId), JSON.stringify(settings));
      } catch {
        /* 저장소가 막혀 있으면 이번 세션만 */
      }
    });
  }
  return store;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
