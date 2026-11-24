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
    primaryModel: "gemini-4-hydrogen-medium",
    fallbackModel: "gemini-3.5-flash-lite",
    primaryTimeoutSeconds: 180,
    fallbackTimeoutSeconds: 180,
    agentCliBin: "agy",
  },
  googleConfigured: false,
  cliAvailable: true,
  models: [
    {
      id: "gemini-4-hydrogen-medium",
      name: "Gemini 4 Hydrogen (Medium)",
      provider: "agy_cli",
      description: "기본 주력 모델 — Composer · 인라인 권장",
      recommended: true,
    },
    {
      id: "gemini-4-hydrogen-high",
      name: "Gemini 4 Hydrogen (High)",
      provider: "agy_cli",
      description: "고정밀 Hydrogen — 깊은 추론 · 구조 편집",
    },
    {
      id: "gemini-4-hydrogen-xhigh",
      name: "Gemini 4 Hydrogen (XHigh)",
      provider: "agy_cli",
      description: "최고 심층 Hydrogen (Extra Thinking)",
    },
    {
      id: "gemini-4-hydrogen-low",
      name: "Gemini 4 Hydrogen (Low)",
      provider: "agy_cli",
      description: "저부하 Hydrogen — 빠른 초안 · 경량 작업",
    },
    {
      id: "gemini-4-neon-high",
      name: "Gemini 4 Neon (High)",
      provider: "agy_cli",
      description: "Gemini 4 Neon — 고난도 추론 · 복합 분석",
    },
    {
      id: "gemini-4-carbon-medium",
      name: "Gemini 4 Carbon (Medium)",
      provider: "agy_cli",
      description: "Gemini 4 Carbon — 안정적 범용 작업",
    },
    {
      id: "gemini-4-argon-medium",
      name: "Gemini 4 Argon (Medium)",
      provider: "agy_cli",
      description: "Gemini 4 Argon — 복합 조항 · 구조 분석",
    },
    {
      id: "gemini-3.8-flash-medium",
      name: "Gemini 3.8 Flash (Medium)",
      provider: "agy_cli",
      description: "Gemini 3.8 Flash — 균형 고속 모델",
    },
    {
      id: "claude-sonnet-5-5-medium",
      name: "Claude Sonnet 5.5 (Medium)",
      provider: "agy_cli",
      description: "Claude Sonnet 5.5 — 장문 서술 · 편집 품질",
    },
    {
      id: "claude-opus-5-5-medium",
      name: "Claude Opus 5.5 (Medium)",
      provider: "agy_cli",
      description: "Claude Opus 5.5 — 최고 난도 서술 · 판단",
    },
    {
      id: "gemini-3.5-flash-lite",
      name: "Gemini 3.5 Flash Lite (Direct API)",
      provider: "google_api",
      description: "Google Direct REST API 고속",
      recommended: true,
    },
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash (Direct API)",
      provider: "google_api",
      description: "Google Direct REST API 주력",
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

