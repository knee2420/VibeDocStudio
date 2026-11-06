import React, { useState } from "react";
import { ChevronDown, ChevronRight, GitCommit, RefreshCw, RotateCcw, Sparkles, User } from "lucide-react";

import { htmlToSummary } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import type { RevisionEntry } from "@/entities/vdoc-document";
import { revealCanvasElement } from "@/shared/lib";

import { restoreSlots, useRevisions } from "../model/useRevisions";

function ago(at: string): string {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return new Date(t).toLocaleDateString();
}

const AuthorBadge: React.FC<{ entry: Pick<RevisionEntry, "author" | "harnessId"> }> = ({ entry }) =>
  entry.author === "ai" ? (
    <span className="inline-flex items-center gap-0.5 px-1 rounded bg-violet-100 text-violet-800 text-[9.5px] font-bold" title={entry.harnessId ?? "AI"}>
      <Sparkles className="w-2.5 h-2.5" />
      {entry.harnessId ?? "AI"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 px-1 rounded bg-slate-100 text-slate-700 text-[9.5px] font-bold">
      <User className="w-2.5 h-2.5" />
      사람
    </span>
  );

const EntryRow: React.FC<{ entry: RevisionEntry; docId: string; compact?: boolean }> = ({ entry, docId, compact }) => {
  const [open, setOpen] = useState(false);
  const selectSlot = useSlotSelectionStore((s) => s.setSelectedSlotId);
  return (
    <div className="rounded border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer hover:bg-slate-50">
        {open ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
        <AuthorBadge entry={entry} />
        <span className="truncate text-[11px] text-slate-700 flex-1" title={entry.label}>
          {compact ? entry.slots.map((s) => s.label).join(", ") || entry.label : entry.label}
        </span>
        <span className="text-[9.5px] text-slate-400 shrink-0 font-mono">
          r{entry.rev} · {ago(entry.at)}
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          {entry.slots.map((change) => (
            <div key={change.slotId} className="text-[10.5px] border-t border-slate-100 pt-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    selectSlot(change.slotId);
                    revealCanvasElement({ slotId: change.slotId });
                  }}
                  className="font-semibold text-slate-800 hover:text-violet-700 truncate cursor-pointer"
                >
                  {change.label}
                </button>
                <button
                  type="button"
                  onClick={() => restoreSlots(docId, [{ slotId: change.slotId, before: change.before }], `'${change.label}' r${entry.rev} 이전으로 복원`)}
                  className="ml-auto inline-flex items-center gap-0.5 px-1 rounded border border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 cursor-pointer"
                  title="이 변경 이전 내용으로 되돌린다 (새 변경으로 남는다)"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> 복원
                </button>
              </div>
              <div className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-50/70 text-rose-900 line-clamp-2">{htmlToSummary(change.before, 140) || "(빈 칸)"}</div>
              <div className="mt-0.5 px-1.5 py-0.5 rounded bg-emerald-50/80 text-emerald-950 line-clamp-3">{htmlToSummary(change.after, 200) || "(빈 칸)"}</div>
            </div>
          ))}
          {entry.variables.length > 0 && (
            <div className="text-[10.5px] text-slate-600 border-t border-slate-100 pt-1">
              변수: {entry.variables.map((v) => `${v.key}=${v.after ?? ""}`).join(", ")}
            </div>
          )}
          {entry.author === "ai" && entry.slots.length > 1 && (
            <button
              type="button"
              onClick={() =>
                restoreSlots(docId, entry.slots.map((s) => ({ slotId: s.slotId, before: s.before })), `AI 실행 ${entry.runId ?? `r${entry.rev}`} 전체 되돌리기`)
              }
              className="w-full mt-1 inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded border border-rose-200 text-rose-700 text-[10.5px] font-semibold hover:bg-rose-50 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> 이 AI 실행 전체 되돌리기 ({entry.slots.length}칸)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface RevisionTimelineProps {
  docId: string | undefined;
  /** 주면 그 칸의 기록만 (인스펙터의 "누가 썼나") */
  slotId?: string;
  limit?: number;
  title?: string;
}

/** 문서 · 칸의 개정 이력 — git 커밋 목록처럼 작성자(사람 | 하네스) · 바뀐 칸 · 복원. */
export const RevisionTimeline: React.FC<RevisionTimelineProps> = ({ docId, slotId, limit, title = "개정 이력" }) => {
  const { entries, error, loading, reload } = useRevisions(docId, { slotId, limit });
  if (!docId) return null;
  return (
    <div data-testid={slotId ? "slot-revision-timeline" : "revision-timeline"} className="space-y-1">
      <div className="flex items-center gap-1 text-slate-700">
        <GitCommit className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-[11px] font-bold">
          {title} ({entries.length})
        </span>
        <button type="button" onClick={() => void reload()} className="ml-auto p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer" title="새로고침">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-600">{error}</p>}
      {!error && entries.length === 0 && <p className="text-[10px] text-slate-400">아직 기록이 없습니다. 저장되면 바뀐 칸이 작성자와 함께 남습니다.</p>}
      {entries.map((entry) => (
        <EntryRow key={`${entry.rev}-${entry.at}`} entry={entry} docId={docId} compact={!slotId} />
      ))}
    </div>
  );
};
