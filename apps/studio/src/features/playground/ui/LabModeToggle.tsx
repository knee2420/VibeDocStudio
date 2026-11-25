import React from "react";
import { FlaskConical, FolderTree } from "lucide-react";

import { labMode, useLabMode } from "../model/labMode";

/**
 * 피그마 UI3 의 Design ↔ Dev Mode 아이콘 토글 스위치 스타일.
 * 프로젝트(작업 문서) ↔ 실험실(플레이그라운드) — 글자 없이 아이콘 2개와 슬라이딩 썸으로 전환한다.
 */
export const LabModeToggle: React.FC = () => {
  const lab = useLabMode();
  return (
    <div
      role="group"
      aria-label="작업 모드 (프로젝트 / 실험실)"
      data-testid="lab-mode-toggle"
      className={`relative h-8 w-[64px] p-1 rounded-[10px] flex items-center shrink-0 border transition-colors duration-200 ${
        lab
          ? "bg-[#272962] border-[#3a3c86] shadow-inner"
          : "bg-black/[0.06] border-black/[0.06]"
      }`}
    >
      {/* 슬라이딩 활성 썸 (피그마 토글 스위치 감성) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1 bottom-1 w-[27px] rounded-[7px] shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-transform duration-200 ease-out ${
          lab ? "translate-x-[27px] bg-[#5b5bd6]" : "translate-x-0 bg-white"
        }`}
      />
      <button
        type="button"
        aria-pressed={!lab}
        onClick={() => lab && labMode.leave()}
        title="프로젝트 모드 — 실제 작업 문서"
        className={`relative z-10 flex-1 h-full rounded-[7px] flex items-center justify-center cursor-pointer transition-colors ${
          lab ? "text-indigo-200/70 hover:text-white" : "text-slate-900"
        }`}
      >
        <FolderTree className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-pressed={lab}
        data-testid="lab-mode-enter-btn"
        onClick={() => !lab && labMode.enter()}
        title="실험실 모드 — 원본을 건드리지 않고 써 보기 (플레이그라운드)"
        className={`relative z-10 flex-1 h-full rounded-[7px] flex items-center justify-center cursor-pointer transition-colors ${
          lab ? "text-white" : "text-black/45 hover:text-black/80"
        }`}
      >
        <FlaskConical className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
