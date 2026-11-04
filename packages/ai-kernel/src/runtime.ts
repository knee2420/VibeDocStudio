import { AssistantClient } from "./client";
import { ActionRegistry, ContextRegistry, ToolRegistry } from "./registry";

/**
 * 앱 하나에 하나. Composer 와 모든 인라인 표면이 이 런타임을 공유한다.
 * 기능은 `runtime.tools / contexts / actions` 에 자기 것을 등록하고, UI 는 여기서 읽는다.
 */
export interface AiRuntime {
  client: AssistantClient;
  tools: ToolRegistry;
  contexts: ContextRegistry;
  actions: ActionRegistry;
}

export function createAiRuntime(options: { baseUrl: string; fetchFn?: typeof fetch }): AiRuntime {
  return {
    client: new AssistantClient(options),
    tools: new ToolRegistry(),
    contexts: new ContextRegistry(),
    actions: new ActionRegistry(),
  };
}
