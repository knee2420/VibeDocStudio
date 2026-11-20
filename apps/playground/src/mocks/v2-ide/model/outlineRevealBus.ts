/**
 * 좌하단 구조 패널 → 열린 `.outline` 편집 화면으로 "이 불릿을 보여 달라"는 요청을 전한다.
 * 같은 파일을 연 편집 화면들만 듣는다 (파일 경로가 주소).
 */
type RevealListener = (nodeId: string) => void;

const listeners = new Map<string, Set<RevealListener>>();

export function requestOutlineReveal(path: string, nodeId: string): void {
  for (const listener of listeners.get(path) ?? []) listener(nodeId);
}

export function subscribeOutlineReveal(path: string, listener: RevealListener): () => void {
  let set = listeners.get(path);
  if (!set) {
    set = new Set();
    listeners.set(path, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(path);
  };
}
