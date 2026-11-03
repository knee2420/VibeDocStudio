import { env } from "../config";

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${env.apiBaseUrl}${cleanPath}`;
}

/**
 * 백엔드 통신 단일 게이트웨이 (`@/shared/api`).
 * 모든 `features/<slice>/api` 모듈은 `fetch()` 직접 호출 대신 `httpClient`만 경유한다.
 */
export const httpClient = {
  async get<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    const response = await fetch(buildUrl(path), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...options?.headers,
      },
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP GET ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  },

  async post<T>(
    path: string,
    body: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: isFormData
        ? { ...options?.headers }
        : {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...options?.headers,
          },
      body: isFormData ? body : JSON.stringify(body),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP POST ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  },

  async put<T>(
    path: string,
    body: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const response = await fetch(buildUrl(path), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options?.headers,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP PUT ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  },

  async patch<T>(
    path: string,
    body: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const response = await fetch(buildUrl(path), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options?.headers,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP PATCH ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  },
};

