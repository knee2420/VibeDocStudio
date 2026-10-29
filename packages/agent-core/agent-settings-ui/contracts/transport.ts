import type {
  AgentSettingsTransport,
  RuntimeDashboard,
  RuntimePolicy,
} from "./types";

export interface HttpTransportOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

const DEFAULT_DASHBOARD: RuntimeDashboard = {
  policy: {
    primaryProvider: "agy_cli",
    fallbackProvider: "google_api",
    primaryModel: "Gemini-3.8-flash",
    fallbackModel: "Gemini-3.5-flash-lite",
    primaryTimeoutSeconds: 180,
    fallbackTimeoutSeconds: 180,
    agentCliBin: "agy",
  },
  googleConfigured: false,
  cliAvailable: true,
  models: [
    {
      id: "Gemma4 31b",
      name: "Gemma4 31b",
      provider: "agy_cli",
      description: "초경량 로컬/고속 서식 태깅",
    },
    {
      id: "Gemini-3.8-flash",
      name: "Gemini-3.8-flash",
      provider: "agy_cli",
      description: "균형 잡힌 주력 서식 스캐폴더 (권장)",
      recommended: true,
    },
    {
      id: "Gemini-3.1-pro",
      name: "Gemini-3.1-pro",
      provider: "agy_cli",
      description: "고난도 복합 조항 심층 분석",
    },
    {
      id: "Gemini-3.5-flash-lite",
      name: "Gemini-3.5-flash-lite",
      provider: "agy_cli",
      description: "초저비용 고속 분류",
    },
    {
      id: "Gemini-3.8-flash",
      name: "Gemini-3.8-flash",
      provider: "google_api",
      description: "Google Direct REST API 주력",
      recommended: true,
    },
    {
      id: "Gemini-3.5-flash-lite",
      name: "Gemini-3.5-flash-lite",
      provider: "google_api",
      description: "Google Direct REST API Fallback",
    },
  ],
};

export function createHttpTransport(
  options: HttpTransportOptions = {}
): AgentSettingsTransport {
  const baseUrl = options.baseUrl ?? "";
  const fetcher = options.fetchFn ?? fetch;

  const buildUrl = (path: string) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  return {
    async getRuntimeDashboard(): Promise<RuntimeDashboard> {
      try {
        const res = await fetcher(buildUrl("/api/runtime"), {
          headers: { Accept: "application/json", ...options.headers },
        });
        if (!res.ok) {
          return DEFAULT_DASHBOARD;
        }
        return (await res.json()) as RuntimeDashboard;
      } catch {
        return DEFAULT_DASHBOARD;
      }
    },

    async updateRuntimePolicy(
      policy: Partial<RuntimePolicy>
    ): Promise<RuntimePolicy> {
      const res = await fetcher(buildUrl("/api/runtime/policy"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        throw new Error(`런타임 정책 저장 실패 (${res.status})`);
      }
      return (await res.json()) as RuntimePolicy;
    },

    async saveGoogleApiKey(apiKey: string): Promise<void> {
      const res = await fetcher(buildUrl("/api/providers/google-api"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!res.ok) {
        throw new Error(`Google API 키 저장 실패 (${res.status})`);
      }
    },

    async removeGoogleApiKey(): Promise<void> {
      const res = await fetcher(buildUrl("/api/providers/google-api"), {
        method: "DELETE",
        headers: { ...options.headers },
      });
      if (!res.ok) {
        throw new Error(`Google API 키 제거 실패 (${res.status})`);
      }
    },
  };
}

