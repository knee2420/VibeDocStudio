import React, { useMemo } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import type { StagedAiChange, WorkbenchPhase } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";

/** 단계마다 검토할 AI 변경안 종류 */
const KINDS: Record<WorkbenchPhase, StagedAiChange["targetKind"][]> = {
  storylining: ["outline-node"],
  templating: ["template-block"],
  drafting: ["slot-html", "block-props", "variables"],
};

/**
 * 오른쪽 아래 "다음 할 일" 하나 — Z 의 끝점. (reports/기능 세분화와 정돈 배치.md 3장 2번)
 * 검토할 AI 제안이 있으면 그게 먼저 (쌓이면 손이 길을 잃는다). 없으면 단계의 다음 걸음.
 * 아무 기능도 새로 만들지 않는다 — 있는 동작(단계 전환 · 검토 서랍 · AI 패널)을 부를 뿐이다.
 */
export const NextStepButton: React.FC = () => {
  const { currentPhase, switchPhase } = useSwitchWorkbenchPhase();
  const queue = useAiStagingStore((s) => s.queue);
  const isRunning = useAiStagingStore((s) => s.isRunning);
  const reviewOpen = useAiStagingStore((s) => s.reviewOpen);
  const setReviewOpen = useAiStagingStore((s) => s.setReviewOpen);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const pending = useMemo(() => queue.filter((c) => KINDS[currentPhase].includes(c.targetKind)), [queue, currentPhase]);

  // 검토 서랍이 열려 있으면 그 자리가 다음 할 일이다 — 겹치지 않게 비킨다
  if (reviewOpen) return null;

  let label: string;
  let sub: string;
  let tone = "bg-[#0d99ff] hover:brightness-110";
  let run: () => void;

  if (isRunning) {
    label = "AI 가 작업 중이에요";
    sub = "끝나면 여기서 바로 검토해요 · 멈추려면 Esc";
    tone = "bg-slate-500";
    run = () => {};
  } else if (pending.length) {
    const warned = pending.filter((c) => c.warnings?.length).length;
    label = `AI 제안 ${pending.length}개 검토`;
    sub = warned ? `그중 ${warned}개에 경고 — 먼저 봐 주세요` : "받거나 안 받거나 — 승인 전에는 문서에 닿지 않아요";
    tone = warned ? "bg-rose-500 hover:bg-rose-600" : "bg-violet-600 hover:bg-violet-700";
    run = () => setReviewOpen(true);
  } else if (currentPhase === "storylining") {
    label = "기획안 확정 · 2 서식으로";
    sub = "목차는 그대로 가져가요 — 언제든 돌아올 수 있어요";
    run = () => switchPhase("templating");
  } else if (currentPhase === "templating") {
    label = "3 채우기로";
    sub = "서식이 붙은 칸을 채워요";
    run = () => switchPhase("drafting");
  } else {
    label = "AI 에게 채우기 맡기기";
    sub = "오른쪽 AI 에 지시하면 초안이 검토 대기로 와요";
    tone = "bg-violet-600 hover:bg-violet-700";
    run = () => openRightPanel("composer");
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isRunning}
      data-testid="tidy-next-step"
      // 떠 있는 툴바(아래 가운데) 위로 — 좁은 캔버스에서도 겹치지 않게
      className={`absolute right-5 bottom-[76px] z-40 max-w-[320px] rounded-xl shadow-lg px-4 py-2 text-left text-white flex items-center gap-3 cursor-pointer disabled:cursor-default ${tone}`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-bold truncate">{label}</span>
        <span className="block text-[11px] opacity-85 truncate">{sub}</span>
      </span>
      {isRunning ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <ArrowRight className="w-4 h-4 shrink-0" />}
    </button>
  );
};
