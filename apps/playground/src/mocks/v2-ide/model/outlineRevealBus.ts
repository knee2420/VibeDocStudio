/**
 * 좌하단 구조 패널 및 `.vdoc` 편집 화면 → 열린 `.outline` 편집 화면으로
 * "이 불릿을 보여 달라(선택적으로 줌인)"는 요청을 전한다.
 * 탭이 아직 마운트되기 직전이라면 짧은 TTL 큐에 보관해 마운트 즉시 실행한다.
 */
export interface OutlineRevealOptions {
  /** true 면 해당 불릿 자체를 activeRootId 로 줌인한다 (예: 1:N 마스터 아웃라인에서 특정 `<<doc>>` 열기). */
  readonly zoom?: boolean;
}

type RevealListener = (nodeId: string, options?: OutlineRevealOptions) => void;

interface PendingReveal {
  readonly nodeId: string;
  readonly options?: OutlineRevealOptions;
  readonly expiresAt: number;
}

const listeners = new Map<string, Set<RevealListener>>();
const pendingReveals = new Map<string, PendingReveal>();
const PENDING_TTL_MS = 2500;

export function requestOutlineReveal(
  path: string,
  nodeId: string,
  options?: OutlineRevealOptions
): void {
  const subs = listeners.get(path);
  if (subs && subs.size > 0) {
    for (const listener of subs) listener(nodeId, options);
    return;
  }
  pendingReveals.set(path, {
    nodeId,
    options,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

export function subscribeOutlineReveal(path: string, listener: RevealListener): () => void {
  let set = listeners.get(path);
  if (!set) {
    set = new Set();
    listeners.set(path, set);
  }
  set.add(listener);

  const pending = pendingReveals.get(path);
  if (pending) {
    pendingReveals.delete(path);
    if (pending.expiresAt >= Date.now()) {
      queueMicrotask(() => {
        listener(pending.nodeId, pending.options);
      });
    }
  }

  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(path);
  };
}
