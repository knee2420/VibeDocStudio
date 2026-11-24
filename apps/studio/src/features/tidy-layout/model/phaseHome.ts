import { useEffect, useRef } from "react";

import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useWorkspaceLayoutStore, type ActivityBarTab, type RightPanelTab } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/**
 * 단계마다 "여기서 시작" — 넛지의 기본값. (reports/기능 세분화와 정돈 배치.md 3장 5번)
 *  1 뼈대: 왼쪽 레퍼런스(따라 짤 목차) · 오른쪽 AI
 *  2 서식: 왼쪽 서식 허브 · 오른쪽 인스펙터
 *  3 채우기: 왼쪽 아웃라인 · 오른쪽 AI
 */
export const PHASE_HOME: Record<WorkbenchPhase, { left: ActivityBarTab; right: RightPanelTab }> = {
  storylining: { left: "reference", right: "composer" },
  templating: { left: "template-hub", right: "inspector" },
  drafting: { left: "explorer", right: "composer" },
};

export const PHASE_LABEL: Record<WorkbenchPhase, { no: number; short: string; long: string }> = {
  storylining: { no: 1, short: "뼈대", long: "스토리라인 기획 — 목차 짜기" },
  templating: { no: 2, short: "서식", long: "템플릿 · 서식 조율 — 목차마다 서식 블록" },
  drafting: { no: 3, short: "채우기", long: "슬롯 본문 집필 — 칸 채우고 검토" },
};

/**
 * 단계를 바꾸는 순간에만 패널 기본값을 한 번 맞춘다. 그 뒤 사용자가 다른 탭을 열면 그대로 둔다
 * (계속 끌고 다니지 않는다 — 자유는 그대로). 처음 열 때는 건드리지 않는다.
 */
export function usePhaseDefaultPanels(enabled: boolean) {
  const phase = useWorkspaceSessionStore((s) => s.currentPhase);
  const prev = useRef(phase);
  useEffect(() => {
    if (prev.current === phase) return;
    prev.current = phase;
    if (!enabled) return;
    const home = PHASE_HOME[phase];
    const layout = useWorkspaceLayoutStore.getState();
    layout.setActiveActivityTab(home.left);
    layout.openRightPanel(home.right);
  }, [phase, enabled]);
}
