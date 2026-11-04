import { aiRuntime } from "@/shared/ai";

import { WORKSPACE_CONTEXT_PROVIDERS } from "./model/workspaceContexts";
import { WORKSPACE_TOOLS } from "./model/workspaceTools";

/** 워크스페이스 기본 도구 · 컨텍스트를 AI 런타임에 등록한다. 해제 함수를 돌려준다. */
export function registerWorkspaceAi(): () => void {
  const offTools = aiRuntime.tools.registerAll(WORKSPACE_TOOLS);
  const offContexts = aiRuntime.contexts.registerAll(WORKSPACE_CONTEXT_PROVIDERS);
  return () => {
    offTools();
    offContexts();
  };
}
