import React from "react";
import { FileEdit, GitCompare, X } from "lucide-react";
import { useActiveDiffStore } from "../model/useActiveDiffStore";

export const CanvasDiffTabBar: React.FC = () => {
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);

  if (!activeDiff) return null;

  return (
    <div
      data-testid="canvas-diff-tab-bar"
      className="h-9 px-3 bg-slate-100/90 border-b border-slate-200/90 flex items-center gap-1 select-none text-xs shrink-0"
    >
      {/* Tab 1: Regular Editor Tab (Inactive) */}
      <button
        type="button"
        onClick={closeDiff}
        className="px-3 py-1.5 rounded-t text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 flex items-center gap-1.5 cursor-pointer transition font-medium text-[11px]"
        title="문서 편집으로 복귀"
      >
        <FileEdit className="w-3.5 h-3.5 text-slate-400" />
        <span>문서 편집</span>
      </button>

      {/* Tab 2: Active Diff Tab (Working Tree Diff) */}
      <div className="px-3 py-1.5 rounded-t bg-white border-t-2 border-t-[#0d99ff] border-x border-slate-200/90 text-slate-900 font-semibold flex items-center gap-2 shadow-2xs text-[11px]">
        <GitCompare className="w-3.5 h-3.5 text-emerald-600" />
        <span className="truncate max-w-sm">{activeDiff.label} (Working Tree)</span>
        <button
          type="button"
          onClick={closeDiff}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer ml-1"
          title="Diff 닫기 (편집 모드로 돌아가기)"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

