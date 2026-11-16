import React, { useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";

import { htmlToPlainText, plainTextToHtml, type VDocSlot } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";

import { useSlotContentActions } from "../model/useSlotContentActions";

/**
 * 인스펙터의 평문 편집기 (피그마 디자인 패널 구역 모양). 캔버스의 리치 텍스트 편집기와 같은 슬롯을
 * 실시간으로 고친다. 슬롯을 바꾸면(`key={slotId}`) 평문을 다시 만든다.
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
    <div className="fig-dsec">
      <div className="fig-dsec-head">
        <span className="flex items-center gap-1.5">
          내용
          <span className="inline-flex items-center gap-1 font-normal text-black/50" title="캔버스와 실시간 동기화">
            <span className="w-1.5 h-1.5 rounded-full bg-[#14ae5c]" />
            실시간
          </span>
        </span>
        <div className="fig-dsec-actions">
          {slot.isEdited && (
            <button
              type="button"
              data-testid="restore-slot-original-btn"
              onClick={handleRestore}
              className="fig-icon-btn"
              title={slot.originalContent !== undefined ? "원문 복원 — 첫 편집 이전 원문으로 되돌리기" : "원문이 남아 있지 않아 편집 표시만 지웁니다"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <textarea
        rows={5}
        value={text}
        onChange={handleChange}
        disabled={Boolean(slot.constraints?.locked)}
        placeholder="슬롯 내용을 입력하세요..."
        className="fig-textarea select-text"
      />

      <div className="mt-1.5 flex items-center justify-between text-black/50">
        <span>{text.length}자</span>
        <button type="button" onClick={() => toggleComposerForSlot(slot.slotId)} className="fig-link">
          <Sparkles className="w-3 h-3" />
          AI 컴포저 호출 (Ctrl+K)
        </button>
      </div>
    </div>
  );
};
