import React from "react";
import { AtSign, BookOpen, Database, FileText, MousePointerSquareDashed, Paperclip, X } from "lucide-react";

import type { ContextRef } from "@vibe/ai-kernel";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  slot: FileText,
  selection: MousePointerSquareDashed,
  backdata: Database,
  reference: BookOpen,
  document: Paperclip,
};

export interface ContextChipProps {
  context: ContextRef;
  tone?: "light" | "dark";
  /** 자동 첨부(현재 선택) 칩 — 점선 테두리. */
  auto?: boolean;
  muted?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export const ContextChip: React.FC<ContextChipProps> = ({ context, tone = "light", auto, muted, onRemove, onClick }) => {
  const Icon = ICONS[context.kind] ?? AtSign;
  const palette =
    tone === "dark"
      ? "bg-slate-800 text-slate-200 border-slate-700"
      : auto
        ? "bg-white text-slate-600 border-dashed border-slate-300"
        : "bg-indigo-50 text-indigo-800 border-indigo-200";
  return (
    <span
      data-testid="ai-context-chip"
      title={context.hint ?? `${context.kind}: ${context.label}`}
      onClick={onClick}
      className={`inline-flex items-center gap-1 max-w-[220px] px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${palette} ${
        muted ? "opacity-45 line-through" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <Icon className="w-3 h-3 shrink-0 opacity-70" />
      <span className="truncate">{context.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 rounded hover:bg-black/10 p-px cursor-pointer"
          title="첨부 해제"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};
