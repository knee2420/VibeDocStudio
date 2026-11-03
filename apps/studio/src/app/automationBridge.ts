import { useStudioDocumentStore } from "@/entities/vdoc-document";

/**
 * 외부 자동화 도구가 쓰는 창 전역 브리지 (`window.__studioDocStore`).
 *
 * 소비자: 백엔드 피델리티 루프(`apps/api/app/catalog/agents/fidelity_loop.py`)가 디버그 크롬에서
 * `getState().upsertDocument(doc)` 로 측정용 문서를 주입하고 `getState().activeDocId` 로 확인한다.
 * `upsertDocument` 로 들어온 문서는 화면에만 있는 임시 문서라 서버에 저장되지 않는다.
 * 이 계약(이름 · 두 메서드)을 바꾸면 위 소비자도 함께 바꿔야 한다.
 */
declare global {
  interface Window {
    __studioDocStore?: typeof useStudioDocumentStore;
  }
}

export function installAutomationBridge(): void {
  window.__studioDocStore = useStudioDocumentStore;
}
