/**
 * 스튜디오 전역 AI 런타임 (`@/shared/ai`). Composer 와 모든 인라인 표면이 이 인스턴스를 공유한다.
 *
 * 확장 방법: 기능(feature)이 `register…Ai()` 를 내보내 `aiRuntime.tools / contexts / actions` 에
 * 자기 것을 등록하고, 페이지가 한 번 호출한다 (`pages/studio-page`). Composer 코드는 건드리지 않는다.
 */
import { ComposerSessionController, createAiRuntime, type ComposerPersistence, type ComposerSnapshot } from "@vibe/ai-kernel";

import { env } from "@/shared/config";

export const aiRuntime = createAiRuntime({ baseUrl: env.apiBaseUrl });

/** 오른쪽 패널 Composer 의 대화. 인라인 표면이 "Composer 로 이어하기" 할 때도 여기로 보낸다. */
export const composerController = new ComposerSessionController(aiRuntime);

/** 문서별 Composer 대화 보존 (이 브라우저에만). 최근 문서 30개까지 둔다. */
const CONV_PREFIX = "vdoc.composer.conv.";
const CONV_INDEX = "vdoc.composer.conv.index";
const MAX_CONVERSATIONS = 30;

export const localComposerPersistence: ComposerPersistence = {
  load(key) {
    try {
      const raw = localStorage.getItem(CONV_PREFIX + key);
      return raw ? (JSON.parse(raw) as ComposerSnapshot) : null;
    } catch {
      return null;
    }
  },
  save(key, snapshot) {
    try {
      const index: string[] = JSON.parse(localStorage.getItem(CONV_INDEX) ?? "[]");
      const next = [key, ...index.filter((k) => k !== key)];
      for (const old of next.splice(MAX_CONVERSATIONS)) localStorage.removeItem(CONV_PREFIX + old);
      if (snapshot.items.length === 0) {
        localStorage.removeItem(CONV_PREFIX + key);
        localStorage.setItem(CONV_INDEX, JSON.stringify(next.filter((k) => k !== key)));
        return;
      }
      localStorage.setItem(CONV_PREFIX + key, JSON.stringify(snapshot));
      localStorage.setItem(CONV_INDEX, JSON.stringify(next));
    } catch {
      /* 저장소가 가득 찼거나 막혔다 — 이번 세션 대화만 */
    }
  },
};
composerController.setPersistence(localComposerPersistence);

// 페이지를 떠나면 서버 세션(agy 프로세스)을 바로 놓아 준다. bfcache 로 보관되는 경우(persisted)는 되살아날 수 있으니 둔다.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) composerController.closeOnPageExit();
  });
}
// 개발 중 이 모듈이 HMR 로 교체되면 새 컨트롤러가 생기므로, 이전 컨트롤러의 세션을 닫는다.
import.meta.hot?.dispose(() => composerController.closeOnPageExit());
