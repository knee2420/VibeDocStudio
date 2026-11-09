import React from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { deckFilePercent, type DeckFileProgress } from "@/entities/knowledge-deck";

/** 덱의 원본 파일 진행 요약 — "완료 n / 전체 N" (건너뛴 파일은 전체에서 뺀다). */
export function deckFileSummary(files: DeckFileProgress[]): { done: number; total: number; skipped: number } {
  const skipped = files.filter((f) => f.status === "skipped").length;
  return { done: files.filter((f) => f.status === "done").length, total: files.length - skipped, skipped };
}

const ICON: Record<DeckFileProgress["status"], React.ReactNode> = {
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
  running: <Loader2 className="w-3.5 h-3.5 text-violet-600 animate-spin shrink-0" />,
  pending: <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
  skipped: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
};

const LABEL: Record<DeckFileProgress["status"], string> = {
  done: "완료",
  running: "보강 중",
  pending: "대기",
  skipped: "건너뜀",
};

/**
 * 덱 안 원본 파일별 진행 — 묶음 덱을 펼쳐 어느 파일이 끝났고(초록 체크) 어느 파일이 몇 % 인지 본다.
 * 진행은 작업 이벤트로 실시간 갱신된다 (`useKnowledgeDeckStore.watch`).
 */
export const DeckFileProgressList: React.FC<{ files: DeckFileProgress[] }> = ({ files }) => (
  <ul data-testid="deck-file-progress" className="space-y-0.5">
    {files.map((f) => {
      const pct = deckFilePercent(f);
      const done = f.status === "done";
      return (
        <li
          key={f.path}
          data-file-status={f.status}
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] ${done ? "bg-emerald-50/70" : "bg-white"}`}
          title={[
            f.path,
            f.docTitle && f.docTitle !== f.title ? `제목: ${f.docTitle}` : "",
            f.status === "skipped" ? `건너뜀: ${f.reason ?? ""}` : `조각 ${f.done}/${f.segments}`,
          ]
            .filter(Boolean)
            .join("\n")}
        >
          {ICON[f.status]}
          <span className={`truncate flex-1 min-w-0 ${done ? "text-emerald-900" : f.status === "skipped" ? "text-amber-800" : "text-slate-700"}`}>
            {f.title}
          </span>
          {f.status === "skipped" ? (
            <span className="text-[10px] text-amber-700 shrink-0">{LABEL.skipped}</span>
          ) : done ? (
            <span className="text-[10px] font-bold text-emerald-700 shrink-0">{LABEL.done}</span>
          ) : (
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-16 h-1 rounded-full bg-slate-200 overflow-hidden">
                <span className="block h-full bg-violet-500 transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
              </span>
              <span className="w-12 text-right text-[10px] font-mono text-slate-500">
                {f.status === "pending" ? LABEL.pending : `${pct}%`}
              </span>
            </span>
          )}
        </li>
      );
    })}
  </ul>
);
