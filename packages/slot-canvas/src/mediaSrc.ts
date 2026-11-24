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

/**
 * 앱별 주소 해석기 — 앱이 자기 저장소의 `resource:` 주소를 먼저 푼다 (예: playground v2 볼트의 `resource:vault:<경로>`).
 * null 을 돌려주면 기본 규칙(리소스 매니저)으로 넘어간다.
 */
let customResolver: ((src: string) => string | null) | null = null;

export function setMediaSrcResolver(resolver: ((src: string) => string | null) | null): void {
  customResolver = resolver;
}

export function resolveMediaSrc(src: string | undefined | null): string {
  const value = (src || "").trim();
  if (!value) return "";
  if (customResolver) {
    const custom = customResolver(value);
    if (custom !== null) return custom;
  }
  if (value.startsWith(RESOURCE_SRC_PREFIX)) {
    const id = value.slice(RESOURCE_SRC_PREFIX.length).trim();
    return id ? `${apiBase}/api/resources/raw/${encodeURIComponent(id)}` : "";
  }
  return value;
}
