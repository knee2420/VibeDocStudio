import React from "react";

import { useRegisterBackdataForm } from "../model/useBindSlotBackdata";

export interface AddBackdataChunkFormProps {
  /** 등록한 청크를 연결할 슬롯 (없으면 보관함에만 넣는다). */
  targetSlotId: string | null;
}

/** 새 원천 자료 조각 등록 양식 (피그마 입력칸 모양). 동작은 `useRegisterBackdataForm` 그대로. */
export const AddBackdataChunkForm: React.FC<AddBackdataChunkFormProps> = ({ targetSlotId }) => {
  const form = useRegisterBackdataForm(targetSlotId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void form.submit();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-2 p-2 rounded-[5px] border border-[var(--fig-border)] space-y-1.5">
      <div className="text-black/50">새 원천 자료(녹취록 · MD · 메모) 조각 등록</div>
      <label className="fig-input">
        <input
          type="text"
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
          placeholder="출처 파일명 (예: 10월_임원회의_녹취록.md)"
        />
      </label>
      <textarea
        rows={3}
        value={form.excerpt}
        onChange={(e) => form.setExcerpt(e.target.value)}
        placeholder="이 슬롯의 근거가 되는 원문 발췌 내용을 붙여넣으세요..."
        className="fig-textarea select-text"
      />
      {form.error && (
        <p role="alert" data-testid="backdata-form-error" className="text-[#f24822]">
          {form.error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={form.cancel} className="fig-btn">
          취소
        </button>
        <button type="submit" disabled={!form.canSubmit} className="fig-btn fig-btn-primary">
          {form.isSubmitting ? "등록 중…" : targetSlotId ? "등록 및 현재 슬롯에 바인딩" : "보관함에 등록"}
        </button>
      </div>
    </form>
  );
};
