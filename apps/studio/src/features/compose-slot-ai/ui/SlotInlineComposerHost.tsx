import React from "react";
import { Paperclip } from "lucide-react";

import type { InlineAiSurface } from "@vibe/ai-kernel";
import { InlineComposerCard } from "@vibe/ai-inline";
import { useActiveSlotEditorStore } from "@vibe/slot-editor";
import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { slotContext, useSlotSelectionStore, type SlotTextRange } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { aiRuntime, composerController } from "@/shared/ai";

export interface SlotInlineComposerHostProps {
  targetSlot: VDocSlot;
  boundChunks: BackdataChunk[];
  onApplySlotContent: (slotId: string, newHtml: string) => void;
}

/**
 * 슬롯에 붙는 인라인 AI (표면 `slot-richtext`). 선택 영역 AI 바가 넣어 둔 지시(`composerPrompt`)를
 * 스스로 구독하므로, 지시가 바뀌어도 캔버스 페이지 전체를 다시 그리지 않는다.
 */
export const SlotInlineComposerHost: React.FC<SlotInlineComposerHostProps> = ({
  targetSlot,
  boundChunks,
  onApplySlotContent,
}) => {
  const composerPrompt = useSlotSelectionStore((s) => s.composerPrompt);
  const composerRange = useSlotSelectionStore((s) => s.composerRange);
  const setComposerOpenSlotId = useSlotSelectionStore((s) => s.setComposerOpenSlotId);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);

  const surface = React.useMemo<InlineAiSurface<VDocSlot>>(
    () =>
      composerRange
        ? selectionSurface(composerRange, onApplySlotContent)
        : {
            id: "slot-richtext",
            targetLabel: (slot) => `타겟 슬롯: ${slot.label}`,
            toContexts: (slot) => {
              const doc = selectActiveDocument(useStudioDocumentStore.getState());
              return doc ? [slotContext(doc, slot)] : [];
            },
            outputFormat: "html",
            preview: "html",
            apply: (slot, html) => onApplySlotContent(slot.slotId, html),
          },
    [composerRange, onApplySlotContent]
  );

  return (
    <InlineComposerCard
      runtime={aiRuntime}
      surface={surface}
      target={targetSlot}
      initialInstruction={composerPrompt ?? undefined}
      placeholder={
        boundChunks.length > 0
          ? `연결된 백데이터(${boundChunks.length}건)를 바탕으로 이 슬롯을 어떻게 작성·수정할까요?`
          : "이 슬롯에 들어갈 내용을 지시하세요 (예: 3줄 개조식으로 핵심만 요약해줘)..."
      }
      extraChips={
        <>
          {boundChunks.map((chunk) => (
            <button
              key={chunk.chunkId}
              type="button"
              onClick={() => openRightPanel("inspector")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition cursor-pointer"
              title={chunk.excerpt}
            >
              <Paperclip className="w-3 h-3 text-indigo-400" />
              {chunk.sourceTitle}
            </button>
          ))}
          {boundChunks.length === 0 && (
            <button
              type="button"
              onClick={() => openRightPanel("inspector")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition cursor-pointer"
            >
              <Paperclip className="w-3 h-3" />+ 백데이터 연결하기
            </button>
          )}
          {targetSlot.constraints?.maxLines && (
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
              제약: 최대 {targetSlot.constraints.maxLines}줄
            </span>
          )}
        </>
      }
      onClose={() => setComposerOpenSlotId(null)}
      onEscalate={({ instruction, contexts, result }) => {
        const tail = result ? `\n\n(인라인 초안)\n${result}` : "";
        composerController.setDraft(`${instruction || `'${targetSlot.label}' 슬롯을 함께 다듬어줘`}${tail}`, contexts);
        openRightPanel("composer");
        setComposerOpenSlotId(null);
      }}
    />
  );
};

/**
 * 선택 영역 표면 (`slot-selection`): 선택한 텍스트만 고치고, 수락하면 편집기에서 그 범위만 바꾼다.
 * 슬롯 전체는 맥락으로만 보낸다.
 */
function selectionSurface(
  range: SlotTextRange,
  onApplySlotContent: (slotId: string, html: string) => void
): InlineAiSurface<VDocSlot> {
  return {
    id: "slot-selection",
    targetLabel: (slot) => `선택 영역 ${range.text.length}자 · ${slot.label}`,
    toContexts: (slot) => {
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      return [
        {
          kind: "selection",
          id: `${slot.slotId}#${range.from}-${range.to}`,
          label: `선택한 부분 (${range.text.length}자)`,
          content: `고칠 대상은 아래 선택 텍스트뿐이다. 결과로 이 부분을 대체할 텍스트만 출력하고, 슬롯의 나머지는 출력하지 마라.
---
${range.text}`,
          hint: range.text.slice(0, 60),
        },
        ...(doc ? [{ ...slotContext(doc, slot), label: `맥락: ${slot.label}` }] : []),
      ];
    },
    outputFormat: "text",
    preview: "text",
    actionInput: () => ({ selectionText: range.text }),
    apply: (slot, text) => {
      const { activeSlotId, activeEditor } = useActiveSlotEditorStore.getState();
      const editor = activeSlotId === slot.slotId ? activeEditor : null;
      const stillThere = editor && editor.state.doc.textBetween(range.from, range.to, " ") === range.text;
      if (editor && stillThere) {
        editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, text).run();
        return;
      }
      // 편집기가 바뀌었거나 범위가 밀렸으면 슬롯 HTML 에서 같은 텍스트 첫 위치만 바꾼다.
      if (slot.content.includes(range.text)) onApplySlotContent(slot.slotId, slot.content.replace(range.text, escapeHtml(text)));
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
