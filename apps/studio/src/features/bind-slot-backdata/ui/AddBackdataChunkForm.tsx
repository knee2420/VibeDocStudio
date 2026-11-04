import React from "react";

import { useRegisterBackdataForm } from "../model/useBindSlotBackdata";

export interface AddBackdataChunkFormProps {
  /** 등록한 청크를 연결할 슬롯 (없으면 보관함에만 넣는다). */
  targetSlotId: string | null;
}

export const AddBackdataChunkForm: React.FC<AddBackdataChunkFormProps> = ({ targetSlotId }) => {
  const form = useRegisterBackdataForm(targetSlotId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void form.submit();
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
      <div className="text-[11px] font-bold text-indigo-950">새 원천 자료(녹취록·MD·메모) 조각 등록</div>
      <input
        type="text"
        value={form.title}
        onChange={(e) => form.setTitle(e.target.value)}
        placeholder="출처 파일명 (예: 10월_임원회의_녹취록.md)"
        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs outline-none"
      />
      <textarea
        rows={3}
        value={form.excerpt}
        onChange={(e) => form.setExcerpt(e.target.value)}
        placeholder="이 슬롯의 근거가 되는 원문 발췌 내용을 붙여넣으세요..."
        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs outline-none select-text"
      />
      {form.error && (
        <p role="alert" data-testid="backdata-form-error" className="text-[11px] text-rose-700">
          {form.error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={form.cancel}
          className="px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-white cursor-pointer"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!form.canSubmit}
          className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {form.isSubmitting ? "등록 중…" : targetSlotId ? "등록 및 현재 슬롯에 바인딩" : "보관함에 등록"}
        </button>
      </div>
    </form>
  );
};
