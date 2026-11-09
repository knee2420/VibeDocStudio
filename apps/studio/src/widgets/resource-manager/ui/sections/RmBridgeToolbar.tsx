import React, { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { getCheckedResourceItems, useResourceStore } from "@/entities/resource";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useSlotSelectionStore } from "@/entities/slot";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { attachDecksToComposer } from "@/features/knowledge-deck-ai";

export const RmBridgeToolbar: React.FC = () => {
  const items = useResourceStore((s) => s.items);
  const checkedSources = getCheckedResourceItems(items);

  const decks = useKnowledgeDeckStore((s) => s.decks);
  const checkedDecks = decks.filter((d) => d.isChecked);

  const totalActive = checkedSources.length + checkedDecks.length;

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const openComposerWithPrompt = useSlotSelectionStore((s) => s.openComposerWithPrompt);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);

  const [copied, setCopied] = useState(false);

  const handleAttachAllToComposer = () => {
    // 덱은 첨부 칩으로 넣는다 — 서버가 첨부를 보고 지식 덱 도구(`knowledge.*`)와 탐색 절차를 켠다.
    const usable = checkedDecks.filter((d) => !!d.builtAt);
    const sourceSummary = checkedSources.map((s, idx) => `[원본 ${idx + 1}] ${s.title}`).join("\n");
    if (usable.length > 0) {
      attachDecksToComposer(
        usable,
        checkedSources.length > 0 ? `{handles} 지식 덱과 원본 소스(${checkedSources.length}개)를 참조해서 ` : "{handles} 를 근거로 "
      );
      return;
    }
    openRightPanel("composer");
    openComposerWithPrompt(selectedSlotId || "", `현재 활성화된 원본 소스(${checkedSources.length}개)를 참조하여 작업해줘:\n\n${sourceSummary}`);
  };

  const handleCopySummary = () => {
    if (!navigator.clipboard) return;

    const parts: string[] = [];
    if (checkedDecks.length > 0) {
      parts.push(
        "[Knowledge Decks]\n" +
          checkedDecks.map((d) => `- ⚡ ${d.title} (토픽 ${d.stat.topicsCount}개)`).join("\n")
      );
    }
    if (checkedSources.length > 0) {
      parts.push(
        "[Raw Sources]\n" +
          checkedSources.map((s) => `- 📄 ${s.title} (${s.pathOrUrl || s.type})`).join("\n")
      );
    }

    void navigator.clipboard.writeText(parts.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="px-3 py-2 border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 select-none">
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="font-bold text-violet-700">
          {checkedSources.length}개 소스
          {checkedDecks.length > 0 && ` + ${checkedDecks.length}개 덱`}
        </span>
        <span className="text-slate-500">활성화</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopySummary}
          disabled={totalActive === 0}
          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-40"
          title="선택된 소스 및 지식 덱 목록 텍스트 복사"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "복사됨" : "목록 복사"}</span>
        </button>

        <button
          type="button"
          onClick={handleAttachAllToComposer}
          disabled={totalActive === 0}
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
