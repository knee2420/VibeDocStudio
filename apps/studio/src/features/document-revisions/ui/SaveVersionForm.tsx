import React, { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/shared/lib";

import { saveVersion } from "../model/versions";

/** 기본 이름: "11월 16일 버전" */
const defaultVersionName = (now = new Date()) => `${now.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 버전`;

/**
 * 버전 저장 — 지금 문서 전체를 이름 · 메모와 함께 보관한다 (git 커밋). 나중에 통째로 · 쪽만 · 칸만 이 상태로 되돌릴 수 있다.
 * 저장하면 "지금 작업"이 이 버전 기준으로 다시 비워진다.
 */
export const SaveVersionForm: React.FC<{ docId: string; onDone: () => void }> = ({ docId, onDone }) => {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveVersion(docId, name.trim() || defaultVersionName(), note);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "버전을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="save-version-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
      className="mt-2 p-3 rounded-[8px] border border-[var(--fig-border)] bg-white space-y-2"
    >
      <p className="text-[11.5px] text-black/55 leading-4">지금 문서 전체를 보관합니다. 나중에 언제든 이 상태로 되돌릴 수 있습니다.</p>
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
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" onClick={onDone} className="fig-btn">
          취소
        </button>
        <button type="submit" disabled={busy} className="fig-btn fig-btn-primary" data-testid="save-version-submit">
          {busy ? "보관 중…" : "저장"}
        </button>
      </div>
    </form>
  );
};
