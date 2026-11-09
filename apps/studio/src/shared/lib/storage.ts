/**
 * 브라우저 저장소 접근의 단일 출처. 사생활 보호 모드 · 용량 초과 · SSR 에서도 예외 없이 동작한다.
 */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredNumber(key: string, fallback: number): number {
  const raw = storage()?.getItem(key);
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function writeStoredValue(key: string, value: string | number): void {
  try {
    storage()?.setItem(key, String(value));
  } catch {
    // 용량 초과 등은 무시한다 (화면 상태는 이미 바뀌었다).
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  writeStoredValue(key, JSON.stringify(value));
}
