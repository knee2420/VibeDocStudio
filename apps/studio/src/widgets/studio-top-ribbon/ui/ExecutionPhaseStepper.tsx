import React from "react";
import { FileEdit, GitBranch, LayoutTemplate } from "lucide-react";

import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";

const PHASES: {
  id: WorkbenchPhase;
  step: string;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: "storylining",
    step: "Phase 1",
    label: "스토리라인 기획",
    desc: "참조 프로젝트 대조 & 목차 트리 구성",
    icon: GitBranch,
  },
  {
    id: "templating",
    step: "Phase 2",
    label: "템플릿·서식 조율",
    desc: "목차 노드별 서식 블록·테이블 매핑",
    icon: LayoutTemplate,
  },
  {
    id: "drafting",
    step: "Phase 3",
    label: "슬롯 본문 집필",
    desc: "A4 조판 캔버스 & Tiptap 슬롯 정밀 편집",
    icon: FileEdit,
  },
];

export const ExecutionPhaseStepper: React.FC = () => {
  const { currentPhase, switchPhase } = useSwitchWorkbenchPhase();

  return (
    <div
      data-testid="execution-phase-stepper"
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/90"
    >
      {PHASES.map((p) => {
        const Icon = p.icon;
        const active = currentPhase === p.id;
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`phase-step-${p.id}`}
            title={`${p.step}: ${p.label} — ${p.desc} (데이터 손실 없이 자유 전환)`}
            onClick={() => switchPhase(p.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition cursor-pointer ${
              active
                ? "bg-[#248567] text-white font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/70 font-medium"
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] opacity-80 font-mono">{p.step}</span>
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
};

