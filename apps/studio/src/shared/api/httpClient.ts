import { env } from "../config";

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** 서버가 돌려준 오류. `detail` 은 FastAPI 오류 응답의 사람이 읽는 사유다. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(method: string, path: string, status: number, detail: string) {
    super(detail || `HTTP ${method} ${path} failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** 사용자가 취소(Esc / Stop)해 중단된 요청인지. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function buildUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${env.apiBaseUrl}${cleanPath}`;
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail !== undefined) return JSON.stringify(body.detail);
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만으로 오류를 만든다.
  }
  return "";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: HttpRequestOptions
): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const hasJsonBody = body !== undefined && !isFormData;
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
    body: isFormData ? body : hasJsonBody ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new ApiError(method, path, response.status, await readDetail(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * 백엔드 통신 단일 게이트웨이 (`@/shared/api`).
 * 모든 `api` 모듈은 `fetch()` 직접 호출 대신 `httpClient`만 경유한다.
 */
export const httpClient = {
  get: <T>(path: string, options?: HttpRequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body: unknown, options?: HttpRequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body: unknown, options?: HttpRequestOptions) =>
    request<T>("PUT", path, body, options),
  patch: <T>(path: string, body: unknown, options?: HttpRequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T = void>(path: string, options?: HttpRequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
