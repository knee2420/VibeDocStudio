import React from "react";
import { AgentSettingsButton, createHttpTransport } from "@vibe/agent-core";

import { env } from "@/shared/config";

export const StudioAgentSettingsButton: React.FC = () => {
  const transport = React.useMemo(
    () => createHttpTransport({ baseUrl: env.apiBaseUrl }),
    []
  );

  return (
    <AgentSettingsButton
      transport={transport}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition shadow-2xs"
    />
  );
};

