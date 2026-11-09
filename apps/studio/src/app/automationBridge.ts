import { useAiScopeStore } from "@/entities/ai-scope";
import { useAiStagingStore } from "@/entities/ai-staging";
import { useEvidenceFocusStore } from "@/entities/evidence";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { aiRuntime, composerController } from "@/shared/ai";

/**
 * 외부 자동화 도구가 쓰는 창 전역 브리지.
 *
 * - `window.__studioDocStore`: 백엔드 피델리티 루프(`apps/api/app/catalog/agents/fidelity_loop.py`)가 디버그 크롬에서
 *   `getState().upsertDocument(doc)` 로 측정용 문서를 주입하고 `getState().activeDocId` 로 확인한다.
 *   `upsertDocument` 로 들어온 문서는 화면에만 있는 임시 문서라 서버에 저장되지 않는다.
 *   이 계약(이름 · 두 메서드)을 바꾸면 위 소비자도 함께 바꿔야 한다.
 * - `window.__studioAi` (개발 서버 전용): AI Composer · 인라인 AI 의 화면 테스트 · 응답 속도 측정용.
 */
declare global {
  interface Window {
    __studioDocStore?: typeof useStudioDocumentStore;
    __studioAi?: {
      runtime: typeof aiRuntime;
      composer: typeof composerController;
      selection: typeof useSlotSelectionStore;
      layout: typeof useWorkspaceLayoutStore;
      staging: typeof useAiStagingStore;
      evidence: typeof useEvidenceFocusStore;
      resources: typeof useResourceStore;
      decks: typeof useKnowledgeDeckStore;
      scope: typeof useAiScopeStore;
    };
  }
}

export function installAutomationBridge(): void {
  window.__studioDocStore = useStudioDocumentStore;
  if (import.meta.env.DEV) {
    window.__studioAi = {
      runtime: aiRuntime,
      composer: composerController,
      selection: useSlotSelectionStore,
      layout: useWorkspaceLayoutStore,
      staging: useAiStagingStore,
      evidence: useEvidenceFocusStore,
      resources: useResourceStore,
      decks: useKnowledgeDeckStore,
      scope: useAiScopeStore,
    };
  }
}
