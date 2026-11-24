import React from "react";
import { FlaskConical, FolderTree } from "lucide-react";

import { labMode, useLabMode } from "../model/labMode";

/**
 * 상단 모드 전환 (피그마의 Design ↔ Dev Mode 토글 자리).
 * 프로젝트 ↔ 실험실 — 실험실이면 화면 전체가 실험실 색으로 바뀐다 (`[data-studio-mode="lab"]`).
 */
export const LabModeToggle: React.FC = () => {
  const lab = useLabMode();
  return (
    <div
      role="group"
      aria-label="작업 모드"
      data-testid="lab-mode-toggle"
      className={`h-6 p-0.5 rounded-full flex items-center gap-0.5 shrink-0 border ${
        lab ? "bg-[#272962] border-[#3a3c86]" : "bg-slate-200/70 border-transparent"
      }`}
    >
      <button
        type="button"
        aria-pressed={!lab}
        onClick={() => lab && labMode.leave()}
        title="프로젝트 모드 — 실제 작업 문서"
        className={`h-5 px-2 rounded-full inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer transition ${
          lab ? "text-indigo-100/70 hover:text-white" : "bg-white text-slate-800 shadow-2xs"
        }`}
      >
        <FolderTree className="w-3 h-3" />
        프로젝트
      </button>
      <button
        type="button"
        aria-pressed={lab}
        data-testid="lab-mode-enter-btn"
        onClick={() => !lab && labMode.enter()}
        title="실험실 모드 — 프로젝트를 건드리지 않고 써 보기 (플레이그라운드)"
        className={`h-5 px-2 rounded-full inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer transition ${
          lab ? "bg-[#5b5bd6] text-white shadow-2xs" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        <FlaskConical className="w-3 h-3" />
        실험실
      </button>
    </div>
  );
};
