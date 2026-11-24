import React from "react";

import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";

import { PHASE_LABEL } from "../model/phaseHome";

const ORDER: WorkbenchPhase[] = ["storylining", "templating", "drafting"];

/**
 * 머리줄 왼쪽의 단계 전환 — 정돈 배치에서 단계를 바꾸는 단 하나의 자리 (Z 의 시작점).
 * 아이콘 대신 "1 뼈대 · 2 서식 · 3 채우기" 글자로. 지난 단계는 연하게, 지금 단계만 진하게.
 */
export const PhaseNav: React.FC = () => {
  const { currentPhase, switchPhase } = useSwitchWorkbenchPhase();
  const at = ORDER.indexOf(currentPhase);
  return (
    <nav className="flex items-center gap-0.5 ml-2 pl-2 border-l border-slate-200" aria-label="작업 단계" data-testid="tidy-phase-nav">
      {ORDER.map((id, i) => {
        const p = PHASE_LABEL[id];
        const active = id === currentPhase;
        return (
          <React.Fragment key={id}>
            {i > 0 && <span className={`w-3 h-px ${i <= at ? "bg-slate-400" : "bg-slate-200"}`} aria-hidden />}
            <button
              type="button"
              data-testid={`tidy-phase-${id}`}
              aria-current={active ? "step" : undefined}
              onClick={() => switchPhase(id)}
              title={`${p.no}단계 · ${p.long} (데이터 손실 없이 자유 전환)`}
              className={`h-6 px-2 rounded-md flex items-center gap-1 text-[12px] cursor-pointer transition ${
                active ? "bg-slate-900 text-white font-semibold" : i < at ? "text-slate-500 hover:bg-slate-200/70" : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              }`}
            >
              <span className={`tabular-nums text-[10.5px] ${active ? "opacity-70" : "opacity-60"}`}>{p.no}</span>
              {p.short}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
