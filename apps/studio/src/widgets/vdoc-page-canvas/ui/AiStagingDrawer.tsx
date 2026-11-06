import React from "react";
import { ArrowRight, Check, CheckCheck, Sparkles, Trash2, X } from "lucide-react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { attachable, stagedRef } from "@/features/ai-workspace";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { EmptyStateCard, TruncatedLabel } from "@/shared/ui";

export const AiStagingDrawer: React.FC = () => {
  const reviewOpen = useAiStagingStore((s) => s.reviewOpen);
  const setReviewOpen = useAiStagingStore((s) => s.setReviewOpen);
  const lastAbortedRunId = useAiStagingStore((s) => s.lastAbortedRunId);

  const {
    stagingQueue,
    acceptStagedChange,
    acceptAllStagedChanges,
    rejectStagedChange,
    rejectAllStagedChanges,
  } = useStageAiChanges();

  if (!reviewOpen) {
    return null;
  }

  return (
    <section
      data-testid="ai-staging-drawer"
      aria-label="AI Staged 변경안 검토 서랍"
      className="border-t border-slate-200 bg-white shadow-[0_-6px_24px_rgba(15,23,42,0.06)] px-5 py-2.5 shrink-0 z-20 max-h-72 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-100/70 border border-violet-200 text-violet-900 text-xs font-bold font-mono tabular-nums">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            AI Staged 변경 대기열 ({stagingQueue.length}건)
          </span>
          <span className="text-xs text-slate-500 truncate">
            AI가 제안한 변경안입니다. [수락] 시 실제 문서에 반영됩니다.
          </span>
          {lastAbortedRunId && (
            <span
              data-testid="aborted-run-badge"
              className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold font-mono"
            >
              ⏹ 실행 중단됨 ({lastAbortedRunId.slice(0, 12)}) — 기존 문서 100% 보존됨
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {stagingQueue.length > 0 && (
            <>
              <button
                type="button"
                data-testid="accept-all-staged-btn"
                onClick={acceptAllStagedChanges}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-2xs transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                전체 반영 ({stagingQueue.length})
              </button>
              <button
                type="button"
                data-testid="reject-all-staged-btn"
                onClick={rejectAllStagedChanges}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                전체 폐기
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setReviewOpen(false)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
            title="서랍 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Diff Items: GitHub PR Diff List 스타일 */}
      <div className="overflow-y-auto pt-2 space-y-1.5 flex-1">
        {stagingQueue.length === 0 ? (
          <EmptyStateCard
            testId="staging-empty-state"
            title="대기 중인 AI Staged 변경안이 없습니다"
            description="AI 작성을 실행하면 이곳에 변경안 Diff가 스테이징됩니다."
          />
        ) : (
          stagingQueue.map((diff) => (
            <div
              key={diff.diffId}
              data-testid={`staged-diff-item-${diff.diffId}`}
              {...attachable(() => [stagedRef(diff)])}
              className="rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 hover:bg-slate-50 px-3 py-1.5 flex items-center justify-between gap-3 transition"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-bold uppercase font-mono shrink-0">
                  {diff.targetKind}
                </span>

                <div className="min-w-0 flex-1 flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-800 shrink-0">
                    {diff.title.replace(/^\[([^\]]+)\].*/, "$1")}:
                  </span>

                  {/* 단일 줄 Diff 라인 */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px] truncate">
                    <span className="text-rose-600/90 line-through truncate max-w-[240px]" title={diff.beforeSummary}>
                      - {diff.beforeSummary || "(빈 칸)"}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-emerald-800 font-semibold truncate flex-1" title={diff.afterSummary}>
                      + {diff.afterSummary}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid={`reject-staged-btn-${diff.diffId}`}
                  onClick={() => rejectStagedChange(diff.diffId)}
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-semibold cursor-pointer transition"
                >
                  <X className="w-3 h-3" />
                  폐기
                </button>
                <button
                  type="button"
                  data-testid={`accept-staged-btn-${diff.diffId}`}
                  onClick={() => acceptStagedChange(diff)}
                  className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-2xs transition"
                >
                  <Check className="w-3 h-3" />
                  수락
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
