import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/**
 * 작업 단계 전환의 단일 경로. 화면 단계(세션 · URL)를 바꾸고, 프로젝트에도 마지막 단계를 기록해
 * 다음에 URL 없이 열어도 같은 단계에서 시작하게 한다. 단계 이동은 되돌리기 이력에 남기지 않는다.
 */
export function useSwitchWorkbenchPhase() {
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const setPhase = useWorkspaceSessionStore((s) => s.setPhase);
  const persistPhase = useProjectStore((s) => s.setActiveProjectPhase);

  const switchPhase = (phase: WorkbenchPhase) => {
    setPhase(phase);
    void persistPhase(phase);
  };

  return { currentPhase, switchPhase };
}
