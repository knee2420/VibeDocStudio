import React, { useEffect, useRef, useState } from "react";

import { defaultVersionName, saveNamedVersion } from "../model/namedVersions";

/**
 * 버전 저장 — 지금 상태에 이름 · 메모를 붙여 기준점으로 (구글 문서 "버전 이름 지정", 피그마 "버전 기록에 추가").
 * 저장하면 "바뀐 곳" 목록이 이 버전 기준으로 비워진다.
 */
export const SaveVersionForm: React.FC<{ docId: string; onDone: () => void }> = ({ docId, onDone }) => {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = () => {
    if (saveNamedVersion(docId, name, note)) onDone();
  };

  return (
    <form
      data-testid="save-version-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
      className="mt-2 p-3 rounded-[8px] border border-[var(--fig-border)] bg-white space-y-2"
    >
      <label className="fig-input !h-8">
        <input
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultVersionName()}
          aria-label="버전 이름"
          data-testid="save-version-name"
        />
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (선택) — 무엇을 고쳤는지, 누구에게 보냈는지"
        rows={2}
        className="fig-textarea w-full"
        aria-label="버전 메모"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" onClick={onDone} className="fig-btn">
          취소
        </button>
        <button type="submit" className="fig-btn fig-btn-primary" data-testid="save-version-submit">
          저장
        </button>
      </div>
    </form>
  );
};
