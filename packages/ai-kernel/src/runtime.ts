import { AssistantClient } from "./client";
import { ActionRegistry, ContextRegistry, DropTranslatorRegistry, EntityRegistry, ToolRegistry } from "./registry";

/**
 * 앱 하나에 하나. Composer 와 모든 인라인 표면이 이 런타임을 공유한다.
 * 기능은 `runtime.tools / contexts / actions` 에 자기 것을 등록하고, UI 는 여기서 읽는다.
 */
export interface AiRuntime {
  client: AssistantClient;
  tools: ToolRegistry;
  contexts: ContextRegistry;
  actions: ActionRegistry;
  /** 화면 요소 해석기 (답변 속 위치 링크 · 첨부 칩의 강조 · 이동). */
  entities: EntityRegistry;
  /** 다른 위젯의 드래그 데이터를 첨부로 바꾸는 번역기. */
  drops: DropTranslatorRegistry;
}

export function createAiRuntime(options: { baseUrl: string; fetchFn?: typeof fetch }): AiRuntime {
  return {
    client: new AssistantClient(options),
    tools: new ToolRegistry(),
    contexts: new ContextRegistry(),
    actions: new ActionRegistry(),
    entities: new EntityRegistry(),
    drops: new DropTranslatorRegistry(),
  };
}
