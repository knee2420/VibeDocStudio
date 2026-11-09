import React, { useState } from "react";
import { Edit3, RotateCcw, Sparkles } from "lucide-react";

import { htmlToPlainText, plainTextToHtml, type VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";

import { useSlotContentActions } from "../model/useSlotContentActions";

/**
 * 인스펙터의 평문 편집기. 캔버스의 리치 텍스트 편집기와 같은 슬롯을 고친다.
 * 슬롯을 바꾸면(`key={slotId}`) 평문을 다시 만든다.
 */
export const SlotPlainTextEditorCard: React.FC<{ slot: VDocSlot }> = ({ slot }) => {
  const { updateSlotContent, resetSlotEdit } = useSlotContentActions();
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const [text, setText] = useState(() => htmlToPlainText(slot.content));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    updateSlotContent(slot.slotId, plainTextToHtml(e.target.value));
  };

  const handleRestore = () => {
    resetSlotEdit(slot.slotId);
    setText(htmlToPlainText(slot.originalContent ?? slot.content));
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
          슬롯 본문 실시간 편집
        </h4>
        <div className="flex items-center gap-1.5">
          {slot.isEdited && (
            <button
              type="button"
              data-testid="restore-slot-original-btn"
              onClick={handleRestore}
              className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
              title={slot.originalContent !== undefined ? "첫 편집 이전 원문으로 복원" : "원문이 남아 있지 않아 편집 표시만 지웁니다"}
            >
              <RotateCcw className="w-2.5 h-2.5" />
              원문 복원
            </button>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
            🟢 실시간 동기화
          </span>
        </div>
      </div>

      <textarea
        rows={5}
        value={text}
        onChange={handleChange}
        disabled={Boolean(slot.constraints?.locked)}
        placeholder="슬롯 내용을 입력하세요..."
        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
      />

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>
          글자 수: <strong className="text-slate-700">{text.length}</strong>자
        </span>
        <button
          type="button"
          onClick={() => toggleComposerForSlot(slot.slotId)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          AI 컴포저 호출 (Ctrl+K)
        </button>
      </div>
    </div>
  );
};
