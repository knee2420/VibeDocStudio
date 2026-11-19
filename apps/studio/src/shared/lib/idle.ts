/**
 * 화면이 그려진 뒤 한가할 때 돌린다 (`requestIdleCallback`, 없으면 짧은 setTimeout).
 * 문서 전환 · 줌 · 커밋 직후에 바로 돌면 다음 화면이 늦게 그려지는, 급하지 않은 뒷일(파생 계산 · URL · 저장소 기록)용.
 * `timeoutMs` 안에는 반드시 돈다. 돌려받은 함수로 취소한다.
 */
export function runWhenIdle(run: () => void, timeoutMs = 300): () => void {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => run(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = setTimeout(run, 16);
  return () => clearTimeout(timer);
}
