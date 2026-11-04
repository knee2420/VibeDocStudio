import React from "react";
import { Check, RotateCcw, X } from "lucide-react";

export interface AcceptRejectBarProps {
  tone?: "light" | "dark";
  acceptLabel?: string;
  onAccept(): void;
  onRetry?(): void;
  onReject(): void;
  extra?: React.ReactNode;
}

/** 결과 미리보기 아래의 [반영 · 다시 · 버리기] — 인라인 카드와 Composer 도구 카드가 함께 쓴다. */
export const AcceptRejectBar: React.FC<AcceptRejectBarProps> = ({
  tone = "light",
  acceptLabel = "반영",
  onAccept,
  onRetry,
  onReject,
  extra,
}) => {
  const ghost =
    tone === "dark"
      ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
      : "bg-slate-100 hover:bg-slate-200 text-slate-700";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        data-testid="ai-accept"
        onClick={onAccept}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
      >
        <Check className="w-3.5 h-3.5" /> {acceptLabel}
      </button>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${ghost}`}>
          <RotateCcw className="w-3 h-3" /> 다시
        </button>
      )}
      <button type="button" onClick={onReject} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${ghost}`}>
        <X className="w-3 h-3" /> 버리기
      </button>
      {extra}
    </div>
  );
};
