import { useCallback, useState } from "react";

import type {
  AgentSettingsTransport,
  ModelInfo,
  PrimaryProvider,
  RuntimeDashboard,
  RuntimePolicy,
} from "../contracts/types";

export interface UseEngineRoutingProps {
  transport: AgentSettingsTransport;
  initialDashboard?: RuntimeDashboard;
  onPolicySaved?: (policy: RuntimePolicy) => void;
}

export function useEngineRouting({
  transport,
  initialDashboard,
  onPolicySaved,
}: UseEngineRoutingProps) {
  const [dashboard, setDashboard] = useState<RuntimeDashboard | null>(
    initialDashboard || null
  );
  const [formPolicy, setFormPolicy] = useState<RuntimePolicy>(
    initialDashboard?.policy || {
      primaryProvider: "agy_cli",
      fallbackProvider: "google_api",
      primaryModel: "Gemini-3.8-flash",
      fallbackModel: "Gemini-3.5-flash-lite",
      primaryTimeoutSeconds: 180,
      fallbackTimeoutSeconds: 180,
      agentCliBin: "agy",
    }
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await transport.getRuntimeDashboard();
      setDashboard(data);
      setFormPolicy(data.policy);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "런타임 설정을 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [transport]);

  const selectPrimaryEngine = (engine: PrimaryProvider) => {
    setFormPolicy((prev) => {
      // 주 엔진 변경 시, 해당 공급자의 대표 모델로 자동 스위칭
      const availableModels = (dashboard?.models || []).filter(
        (m) => m.provider === engine
      );
      const defaultModel =
        availableModels.find((m) => m.recommended)?.id ||
        availableModels[0]?.id ||
        (engine === "google_api" ? "Gemini-3.8-flash" : "Gemini-3.8-flash");

      return {
        ...prev,
        primaryProvider: engine,
        primaryModel: defaultModel,
      };
    });
    setSuccessMessage(null);
  };

  const updatePrimaryModel = (model: string) => {
    setFormPolicy((prev) => ({ ...prev, primaryModel: model }));
    setSuccessMessage(null);
  };

  const updatePrimaryTimeout = (seconds: number) => {
    setFormPolicy((prev) => ({ ...prev, primaryTimeoutSeconds: seconds }));
    setSuccessMessage(null);
  };

  const updateFallbackModel = (model: string) => {
    setFormPolicy((prev) => ({ ...prev, fallbackModel: model }));
    setSuccessMessage(null);
  };

  const updateFallbackTimeout = (seconds: number) => {
    setFormPolicy((prev) => ({ ...prev, fallbackTimeoutSeconds: seconds }));
    setSuccessMessage(null);
  };

  const savePolicy = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await transport.updateRuntimePolicy(formPolicy);
      setFormPolicy(updated);
      setSuccessMessage("엔진 라우팅 정책이 성공적으로 저장되었습니다.");
      onPolicySaved?.(updated);
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "정책 저장 중 오류가 발생했습니다."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const filterModels = (provider: string): ModelInfo[] => {
    const list = dashboard?.models || [];
    return list.filter(
      (m) =>
        m.provider === provider ||
        (provider === "google_api" && m.provider === "google-api") ||
        (provider === "agy_cli" && m.provider === "agy-cli")
    );
  };

  return {
    dashboard,
    formPolicy,
    isLoading,
    isSaving,
    error,
    successMessage,
    clearError: () => setError(null),
    clearSuccess: () => setSuccessMessage(null),
    reload,
    selectPrimaryEngine,
    updatePrimaryModel,
    updatePrimaryTimeout,
    updateFallbackModel,
    updateFallbackTimeout,
    savePolicy,
    modelsForPrimary: filterModels(formPolicy.primaryProvider),
    modelsForFallback: filterModels(formPolicy.fallbackProvider),
    googleConfigured: dashboard?.googleConfigured ?? false,
    cliAvailable: dashboard?.cliAvailable ?? true,
  };
}

