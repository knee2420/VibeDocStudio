/**
 * 스튜디오 전역 AI 런타임 (`@/shared/ai`). Composer 와 모든 인라인 표면이 이 인스턴스를 공유한다.
 *
 * 확장 방법: 기능(feature)이 `register…Ai()` 를 내보내 `aiRuntime.tools / contexts / actions` 에
 * 자기 것을 등록하고, 페이지가 한 번 호출한다 (`pages/studio-page`). Composer 코드는 건드리지 않는다.
 */
import { ComposerSessionController, createAiRuntime } from "@vibe/ai-kernel";

import { env } from "@/shared/config";

export const aiRuntime = createAiRuntime({ baseUrl: env.apiBaseUrl });

/** 오른쪽 패널 Composer 의 대화. 인라인 표면이 "Composer 로 이어하기" 할 때도 여기로 보낸다. */
export const composerController = new ComposerSessionController(aiRuntime);

// 페이지를 떠나면 서버 세션(agy 프로세스)을 바로 놓아 준다. bfcache 로 보관되는 경우(persisted)는 되살아날 수 있으니 둔다.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) composerController.closeOnPageExit();
  });
}
// 개발 중 이 모듈이 HMR 로 교체되면 새 컨트롤러가 생기므로, 이전 컨트롤러의 세션을 닫는다.
import.meta.hot?.dispose(() => composerController.closeOnPageExit());
