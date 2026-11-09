import React from "react";
import { AgentSettingsButton, createHttpTransport } from "@vibe/agent-core";

import { env } from "@/shared/config";

const DEFAULT_CLASS =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition shadow-2xs";

export interface StudioAgentSettingsButtonProps {
  className?: string;
  /** 버튼 안쪽 내용 (기본: 톱니 아이콘 + "AI 설정"). */
  children?: React.ReactNode;
}

/** 에이전트 · LLM 런타임 설정 모달을 여는 버튼 (스튜디오 API 서버에 연결). */
export const StudioAgentSettingsButton: React.FC<StudioAgentSettingsButtonProps> = ({ className, children }) => {
  const transport = React.useMemo(() => createHttpTransport({ baseUrl: env.apiBaseUrl }), []);
  return (
    <AgentSettingsButton transport={transport} className={className ?? DEFAULT_CLASS}>
      {children}
    </AgentSettingsButton>
  );
};
