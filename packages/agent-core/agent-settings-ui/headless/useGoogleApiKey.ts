import { useState } from "react";

import type { AgentSettingsTransport } from "../contracts/types";

export interface UseGoogleApiKeyProps {
  transport: AgentSettingsTransport;
  initialConfigured?: boolean;
  onKeyChanged?: () => void;
}

export function useGoogleApiKey({
  transport,
  initialConfigured = false,
  onKeyChanged,
}: UseGoogleApiKeyProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isConfigured, setIsConfigured] = useState(initialConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const saveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setError("Google API 키를 입력해 주세요.");
      return false;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await transport.saveGoogleApiKey(trimmed);
      setIsConfigured(true);
      setApiKeyInput("");
      setSuccessMessage("Google API 키가 안전하게 저장되었습니다.");
      onKeyChanged?.();
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "API 키 저장에 실패했습니다."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const removeApiKey = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await transport.removeGoogleApiKey();
      setIsConfigured(false);
      setApiKeyInput("");
      setSuccessMessage("저장된 Google API 키가 제거되었습니다.");
      onKeyChanged?.();
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "API 키 삭제에 실패했습니다."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    apiKeyInput,
    setApiKeyInput,
    isConfigured,
    setIsConfigured,
    isSaving,
    error,
    successMessage,
    clearError: () => setError(null),
    saveApiKey,
    removeApiKey,
  };
}

