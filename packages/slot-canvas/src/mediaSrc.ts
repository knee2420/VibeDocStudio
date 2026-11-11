/**
 * 미디어 주소 풀기 — 블록이 들고 있는 `src` 를 `<img>` 에 넣을 주소로 바꾼다.
 *
 *   resource:<resourceId>  리소스 매니저 원본 (`/api/resources/raw/<id>`) — 새로고침 · 다른 PC 에서도 유지된다
 *   http(s): · data: · blob: · /상대경로   그대로
 *
 * 앱이 API 주소를 바꿔 쓸 때만 `setMediaApiBase` 를 부른다 (기본은 같은 출처의 `/api`).
 */
let apiBase = "";

export function setMediaApiBase(base: string): void {
  apiBase = (base || "").replace(/\/+$/, "");
}

export const RESOURCE_SRC_PREFIX = "resource:";

export function resourceMediaSrc(resourceId: string): string {
  return `${RESOURCE_SRC_PREFIX}${resourceId}`;
}

export function resolveMediaSrc(src: string | undefined | null): string {
  const value = (src || "").trim();
  if (!value) return "";
  if (value.startsWith(RESOURCE_SRC_PREFIX)) {
    const id = value.slice(RESOURCE_SRC_PREFIX.length).trim();
    return id ? `${apiBase}/api/resources/raw/${encodeURIComponent(id)}` : "";
  }
  return value;
}
