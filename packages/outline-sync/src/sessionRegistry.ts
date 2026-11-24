import { applyPatch, flatToTree, importTree, type TreePatchRequest } from "@vibe/outliner/core";
import type { EvidenceLocator } from "@vibe/vdoc-schema";
import { basename, type VaultPort } from "@vibe/vault-core";
import { parseOutlineJson, serializeOutlineJson, type OutlineFilePayload } from "@vibe/vault-formats";
import { syncAllBoundVDocsFromOutline } from "./bridge";
import { previewOutlinePatch } from "./outlineDiff";

export interface OutlineLiveSessionHandle {
  /** 열린 OutlineTabEditor 의 applyPatch (Undo 스택 자동 적재 + 덮어쓰기 경합 없음) */
  applyPatch(requests: readonly TreePatchRequest[], nodeEvidence?: Record<string, EvidenceLocator[]>): boolean;
  /** 열린 에디터 Undo 1단계 실행 */
  undo(): boolean;
  /** 열린 에디터에서 불릿 선택 및 스크롤/줌 */
  selectNodes(nodeIds: readonly string[], zoom?: boolean): void;
  getSnapshot(): OutlineFilePayload;
  /** 열린 에디터의 트리가 바뀔 때 (편집 · 완료 표시 · 패치). 없으면 변경 감지는 볼트 저장으로만 된다 */
  subscribe?(listener: () => void): () => void;
}

const liveSessions = new Map<string, OutlineLiveSessionHandle>();
const closedUndoStack = new Map<string, string[]>();
/** 경로별 감시자 — 에디터가 열리고 닫힐 때 새 핸들에 다시 붙는다 */
const pathWatchers = new Map<string, Set<() => void>>();

function notifyPath(path: string): void {
  pathWatchers.get(path)?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* 감시자 오류가 에디터를 막지 않게 */
    }
  });
}

export function registerLiveOutlineSession(path: string, handle: OutlineLiveSessionHandle): () => void {
  liveSessions.set(path, handle);
  notifyPath(path);
  return () => {
    if (liveSessions.get(path) === handle) {
      liveSessions.delete(path);
      notifyPath(path);
    }
  };
}

/**
 * `.outline` 의 열린 에디터 변화를 지켜본다 — 에디터가 열리거나 닫히면 새 핸들로 옮겨 붙고, 그때도 한 번 부른다.
 * 닫힌 파일의 변화(디스크 · 다른 창)는 볼트 이벤트로 따로 본다.
 */
export function watchLiveOutline(path: string, listener: () => void): () => void {
  let offHandle: (() => void) | null = null;
  const attach = () => {
    offHandle?.();
    offHandle = liveSessions.get(path)?.subscribe?.(listener) ?? null;
  };
  const onRegistration = () => {
    attach();
    listener();
  };
  const set = pathWatchers.get(path) ?? new Set<() => void>();
  set.add(onRegistration);
  pathWatchers.set(path, set);
  attach();
  return () => {
    offHandle?.();
    offHandle = null;
    set.delete(onRegistration);
    if (set.size === 0) pathWatchers.delete(path);
  };
}

export function getLiveOutlineSession(path: string): OutlineLiveSessionHandle | null {
  return liveSessions.get(path) ?? null;
}

export function mergeOutlineNodeEvidence(
  prev: Record<string, EvidenceLocator[]> | undefined,
  incoming: Record<string, EvidenceLocator[]> | undefined
): Record<string, EvidenceLocator[]> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return prev;
  const next: Record<string, EvidenceLocator[]> = { ...(prev ?? {}) };
  for (const [nodeId, list] of Object.entries(incoming)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const existing = next[nodeId] ? [...next[nodeId]] : [];
    const seen = new Set(existing.map((e) => `${e.kind}:${e.refId}:${e.sourcePath ?? ""}`));
    for (const loc of list) {
      const k = `${loc.kind}:${loc.refId}:${loc.sourcePath ?? ""}`;
      if (!seen.has(k)) {
        seen.add(k);
        existing.push(loc);
      }
    }
    next[nodeId] = existing;
  }
  return next;
}

export interface ApplyOutlinePatchResult {
  readonly viaLiveSession: boolean;
  readonly updatedVDocs: readonly string[];
  readonly payload: OutlineFilePayload;
}

/**
 * Staged `.outline` 패치 승인 반영:
 * - 해당 `.outline` 탭이 열려 있으면 `OutlineLiveSessionHandle.applyPatch` 를 경유해
 *   열린 에디터 덮어쓰기 경합을 원천 차단하고 `@vibe/outliner` 의 Undo 스택에 그대로 적재한다.
 * - 탭이 닫혀 있으면 `@vibe/outliner` 의 `applyPatch` 로 변환해 저장하고 직전 스냅샷을 Undo 스택에 보관한다.
 */
export function applyOutlinePatchSafely(
  vault: VaultPort,
  path: string,
  requests: readonly TreePatchRequest[],
  nodeEvidence?: Record<string, EvidenceLocator[]>,
  options?: { readonly recompileBoundVDocs?: boolean }
): ApplyOutlinePatchResult {
  if (!vault.exists(path)) throw new Error(`대상 .outline 파일이 없습니다: ${path}`);
  const live = liveSessions.get(path);
  // All-or-Nothing 원자적 사전 검증: 1건이라도 실패하는 패치는 부분 적용(특히 delete 만 실행)을 원천 차단한다
  const currentRoots = live
    ? live.getSnapshot().rootNodes
    : parseOutlineJson(vault.read(path), basename(path)).rootNodes;
  const preflight = previewOutlinePatch(currentRoots, requests);
  if (preflight.failedOps.length > 0) {
    const reasons = preflight.failedOps
      .slice(0, 3)
      .map((f) => `#${f.index + 1}: ${f.error}`)
      .join(" · ");
    throw new Error(`패치 사전 검증 실패 (${preflight.failedOps.length}건 오류 — 부분 삭제 방지를 위해 중단): ${reasons}`);
  }

  if (live) {
    const ok = live.applyPatch(requests, nodeEvidence);
    if (!ok) throw new Error(`열린 아웃라인 세션에 패치를 적용하지 못했습니다: ${path}`);
    const payload = live.getSnapshot();
    const updatedVDocs = options?.recompileBoundVDocs ? syncAllBoundVDocsFromOutline(vault, path, payload) : [];
    return { viaLiveSession: true, updatedVDocs, payload };
  }

  const prevRaw = vault.read(path);
  const current = parseOutlineJson(prevRaw, basename(path));
  let seq = 0;
  const imported = importTree(current.rootNodes);
  const outcome = applyPatch(imported.tree, [...requests], {
    now: Date.now(),
    generateId: () => `ai-ol-${Date.now().toString(36)}-${++seq}`,
  });
  const failed = outcome.results.filter((r) => !r.ok);
  if (failed.length > 0) {
    throw new Error(`패치 적용 실패 (${failed.length}건): ${failed.map((f) => (f.ok ? "" : f.error)).join(" · ")}`);
  }
  const nextPayload: OutlineFilePayload = {
    ...current,
    updatedAt: new Date().toISOString(),
    nodeEvidence: mergeOutlineNodeEvidence(current.nodeEvidence, nodeEvidence),
    rootNodes: flatToTree(outcome.tree),
  };
  const stack = closedUndoStack.get(path) ?? [];
  stack.push(prevRaw);
  if (stack.length > 20) stack.shift();
  closedUndoStack.set(path, stack);

  vault.write(path, serializeOutlineJson(nextPayload));
  const updatedVDocs = options?.recompileBoundVDocs ? syncAllBoundVDocsFromOutline(vault, path, nextPayload) : [];
  return { viaLiveSession: false, updatedVDocs, payload: nextPayload };
}

/** 마지막으로 승인한 `.outline` 패치를 되돌린다 (열린 탭은 outliner Undo, 닫힌 탭은 직전 스냅샷 복원). */
export function undoApprovedOutlinePatch(vault: VaultPort, path: string): boolean {
  const live = liveSessions.get(path);
  if (live) {
    return live.undo();
  }
  const stack = closedUndoStack.get(path);
  if (!stack || stack.length === 0) return false;
  const prevRaw = stack.pop();
  if (typeof prevRaw !== "string") return false;
  vault.write(path, prevRaw);
  return true;
}

export function canUndoApprovedOutlinePatch(path: string): boolean {
  if (liveSessions.has(path)) return true;
  return (closedUndoStack.get(path)?.length ?? 0) > 0;
}
