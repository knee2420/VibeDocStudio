import React from "react";
import {
  CheckCheck,
  ChevronLeft,
  FileCode,
  GitBranch,
  GitCommit,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { EmptyStateCard } from "@/shared/ui";

export const SourceControlSidebarPanel: React.FC = () => {
  const stagingQueue = useWorkspaceSessionStore((s) => s.stagingQueue);
  const setLeftSidebarOpen = useWorkspaceSessionStore(
    (s) => s.setLeftSidebarOpen
  );
  const {
    acceptAllStagedChanges,
    rejectAllStagedChanges,
    acceptStagedChange,
    rejectStagedChange,
  } = useStageAiChanges();

  const docPastCount = useStudioDocumentStore((s) => s.past.length);
  const projPastCount = useProjectStore((s) => s.past.length);
  const totalCommits = docPastCount + projPastCount;

  return (
    <div
      data-testid="source-control-panel"
      className="flex-1 flex flex-col h-full overflow-hidden bg-white"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-violet-600 shrink-0" />
            <h3 className="text-xs font-bold text-slate-900 truncate">
              소스 제어 & Staged 변경안
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 font-mono">
            <span
              data-testid="git-branch-badge"
              className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold"
            >
              branch: bigbang-patch
            </span>
            <span>· 변경 {stagingQueue.length}건</span>
          </div>
        </div>

        <button
          type="button"
          data-testid="collapse-left-sidebar-btn"
          onClick={() => setLeftSidebarOpen(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
          title="좌측 패널 접기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Staged Changes Section */}
        <div>
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              스테이징된 변경사항 ({stagingQueue.length})
            </span>
            {stagingQueue.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="accept-all-staged-btn"
                  onClick={acceptAllStagedChanges}
                  title="모든 변경사항 승인 및 커밋 반영"
                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  <CheckCheck className="w-2.5 h-2.5" />
                  전체 승인
                </button>
                <button
                  type="button"
                  data-testid="reject-all-staged-btn"
                  onClick={rejectAllStagedChanges}
                  title="모든 변경사항 반려 및 폐기"
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  전체 반려
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 space-y-1.5">
            {stagingQueue.length === 0 ? (
              <EmptyStateCard
                testId="source-control-empty-state"
                icon={<GitCommit className="w-4 h-4 text-slate-400" />}
                title="스테이징된 변경사항이 없습니다"
                description="AI 컴포저나 슬롯 수정을 실행하면 이곳에 인메모리 Diff가 격리 스테이징됩니다."
              />
            ) : (
              stagingQueue.map((diff) => (
                <div
                  key={diff.diffId}
                  className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-amber-950 flex items-center gap-1 text-[11px] truncate">
                      <FileCode className="w-3 h-3 text-amber-600 shrink-0" />
                      {diff.title || diff.afterSummary}
                    </span>
                    <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-mono shrink-0">
                      {diff.targetKind}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Phase: {diff.phase}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => acceptStagedChange(diff)}
                        className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 cursor-pointer"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectStagedChange(diff.diffId)}
                        className="px-1.5 py-0.5 rounded bg-white text-slate-600 text-[10px] font-medium hover:bg-rose-50 hover:text-rose-600 border border-slate-200 cursor-pointer"
                      >
                        반려
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Local Git & Project Undo History */}
        <div data-testid="commit-history-info" className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between pb-1 text-slate-700">
            <span className="text-[11px] font-bold flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              로컬 버전 히스토리 스택 ({totalCommits})
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            실행 취소(Ctrl+Z) 및 재실행(Ctrl+Y)으로 자유롭게 이전 커밋 시점으로 롤백할 수 있습니다.
          </p>

          <div className="space-y-1 text-slate-600 text-[11px] font-mono">
            <div className="px-2 py-1 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span>Project Tree Commits</span>
              <span className="font-bold text-slate-900">{projPastCount}</span>
            </div>
            <div className="px-2 py-1 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span>Document Slot Commits</span>
              <span className="font-bold text-slate-900">{docPastCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
