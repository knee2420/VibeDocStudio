import { useEffect, useState } from "react";

import type {
  AgentSettingsTransport,
  RuntimeDashboard,
} from "../contracts/types";
import { useEngineRouting } from "./useEngineRouting";
import { useGoogleApiKey } from "./useGoogleApiKey";

export interface UseAgentSettingsProps {
  transport: AgentSettingsTransport;
  isOpen?: boolean;
}

export function useAgentSettings({ transport, isOpen }: UseAgentSettingsProps) {
  const [activeTab, setActiveTab] = useState<"routing" | "google" | "status">(
    "routing"
  );
  const [dashboard, setDashboard] = useState<RuntimeDashboard | null>(null);

  const routing = useEngineRouting({
    transport,
    initialDashboard: dashboard || undefined,
    onPolicySaved: () => void routing.reload(),
  });

  const googleKey = useGoogleApiKey({
    transport,
    initialConfigured: dashboard?.googleConfigured,
    onKeyChanged: () => void routing.reload(),
  });

  useEffect(() => {
    if (isOpen) {
      void routing.reload();
    }
  }, [isOpen]);

  return {
    activeTab,
    setActiveTab,
    routing,
    googleKey,
    dashboard: routing.dashboard,
    isLoading: routing.isLoading,
  };
}

