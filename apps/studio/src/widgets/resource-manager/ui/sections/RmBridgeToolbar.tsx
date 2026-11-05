import React, { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { getCheckedResourceItems, useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

export const RmBridgeToolbar: React.FC = () => {
  const items = useResourceStore((s) => s.items);
  const checkedSources = getCheckedResourceItems(items);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const openComposerWithPrompt = useSlotSelectionStore((s) => s.openComposerWithPrompt);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);

  const [copied, setCopied] = useState(false);

  const handleAttachAllToComposer = () => {
    openRightPanel("composer");
    const sourceSummary = checkedSources
      .map((s, idx) => `[소스 ${idx + 1}] ${s.title}`)
      .join("\n");
    const prompt = `현재 선택된 ${checkedSources.length}개의 리소스를 바탕으로 작업해줘:\n${sourceSummary}`;
    openComposerWithPrompt(selectedSlotId || "", prompt);
  };

  const handleCopySummary = () => {
    if (!navigator.clipboard) return;
    const summary = checkedSources.map((s) => `- ${s.title} (${s.pathOrUrl || s.type})`).join("\n");
    void navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="px-3 py-2 border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 select-none">
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="font-bold text-violet-700">{checkedSources.length}개</span>
        <span>소스 활성화됨</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopySummary}
          disabled={checkedSources.length === 0}
          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-40"
          title="선택된 소스 목록 텍스트 복사"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "복사됨" : "목록 복사"}</span>
        </button>

        <button
          type="button"
          onClick={handleAttachAllToComposer}
          disabled={checkedSources.length === 0}
          className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-40"
          title="우측 AI Composer의 컨텍스트로 일괄 주입"
        >
          <Sparkles className="w-3 h-3" />
          <span>AI Composer 첨부</span>
        </button>
      </div>
    </div>
  );
};

