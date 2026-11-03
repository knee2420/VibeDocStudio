import React from "react";
import { Check, CheckCheck, Sparkles, Trash2, X } from "lucide-react";

import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { EmptyStateCard, TruncatedLabel } from "@/shared/ui";

export const AiStagingDrawer: React.FC = () => {
  const stagingDrawerOpen = useWorkspaceSessionStore(
    (s) => s.stagingDrawerOpen
  );
  const setStagingDrawerOpen = useWorkspaceSessionStore(
    (s) => s.setStagingDrawerOpen
  );
  const lastAbortedRunId = useWorkspaceSessionStore((s) => s.lastAbortedRunId);

  const {
    stagingQueue,
    acceptStagedChange,
    acceptAllStagedChanges,
    rejectStagedChange,
    rejectAllStagedChanges,
  } = useStageAiChanges();

  if (!stagingDrawerOpen && stagingQueue.length === 0 && !lastAbortedRunId) {
    return null;
  }

  return (
    <section
      data-testid="ai-staging-drawer"
      aria-label="AI Staged 변경안 검토 서랍"
      className="border-t border-amber-300 bg-white shadow-[0_-6px_20px_rgba(15,23,42,0.08)] px-5 py-3 shrink-0 z-20 max-h-72 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold font-mono tabular-nums">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            AI Staged 변경 대기열 ({stagingQueue.length}건)
          </span>
          <span className="text-xs text-slate-500 truncate">
            AI가 제안한 인메모리 트리·서식·슬롯 변경안입니다. [수락] 시 실제 문서에 반영됩니다.
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-bold cursor-pointer shadow-2xs transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                전체 반영 ({stagingQueue.length})
              </button>
              <button
                type="button"
                data-testid="reject-all-staged-btn"
                onClick={rejectAllStagedChanges}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                전체 폐기
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setStagingDrawerOpen(false)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
            title="서랍 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Diff Items */}
      <div className="overflow-y-auto pt-2 space-y-2 flex-1">
        {stagingQueue.length === 0 ? (
          <EmptyStateCard
            testId="staging-empty-state"
            title="대기 중인 AI Staged 변경안이 없습니다"
            description="Phase 1(스토리라인 자동 스캐폴딩), Phase 2(서식 추천), 또는 Phase 3(슬롯 AI 작성)를 실행하면 이곳에 변경안 Diff가 스테이징됩니다."
          />
        ) : (
          stagingQueue.map((diff) => (
            <div
              key={diff.diffId}
              data-testid={`staged-diff-item-${diff.diffId}`}
              className="rounded-xl border border-amber-200/90 bg-amber-50/40 px-3.5 py-2.5 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold uppercase font-mono">
                    {diff.phase} · {diff.targetKind}
                  </span>
                  <TruncatedLabel
                    text={diff.title}
                    className="text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <div className="px-2 py-1 rounded bg-rose-50/70 border border-rose-200/70 text-rose-900 truncate">
                    <strong className="font-mono mr-1">[-]</strong>
                    {diff.beforeSummary}
                  </div>
                  <div className="px-2 py-1 rounded bg-emerald-50/80 border border-emerald-200/80 text-emerald-950 truncate">
                    <strong className="font-mono mr-1">[+]</strong>
                    {diff.afterSummary}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid={`accept-staged-btn-${diff.diffId}`}
                  onClick={() => acceptStagedChange(diff)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  수락
                </button>
                <button
                  type="button"
                  data-testid={`reject-staged-btn-${diff.diffId}`}
                  onClick={() => rejectStagedChange(diff.diffId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  폐기
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

