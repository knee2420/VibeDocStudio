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
