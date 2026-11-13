import React, { useMemo } from "react";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  FileCode,
  FileText,
  GitBranch,
  GitCommit,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { getBlockSlotIds, type StagedSlotHtmlChange } from "@vibe/vdoc-schema";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { RevisionTimeline } from "@/features/document-revisions";
import { attachable, stagedRef } from "@/features/ai-workspace";
import { ProposalCandidateBar, useStageAiChanges } from "@/features/stage-ai-changes";
import { useActiveDiffStore } from "@/features/document-diff";
import { useHistoryStore } from "@/shared/lib";
import { EmptyStateCard } from "@/shared/ui";
import { FigmaDiffBadge } from "./FigmaDiffBadge";

export const SourceControlSidebarPanel: React.FC = () => {
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const {
    stagingQueue,
    acceptAllStagedChanges,
    rejectAllStagedChanges,
    acceptStagedChange,
    rejectStagedChange,
  } = useStageAiChanges();

  const projPastCount = useHistoryStore((s) => s.past.filter((e) => e.scope === "project").length);
  const docPastCount = useHistoryStore((s) => s.past.filter((e) => e.scope === "document").length);
  const totalCommits = docPastCount + projPastCount;
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);
  const commitAllDocChanges = useStudioDocumentStore((s) => s.commitAllDocChanges);
  const activeDoc = useStudioDocumentStore(
    (s) => s.docs.find((d) => d.docId === s.activeDocId) || s.docs[0] || null,
  );

  const changedPages = useMemo(() => {
    if (!activeDoc) return [];

    const stagedBySlotId = new Map<string, StagedSlotHtmlChange>();
    for (const item of stagingQueue) {
      if (item.targetKind === "slot-html" && (!item.docId || item.docId === activeDoc.docId)) {
        const slotChange = item as StagedSlotHtmlChange;
        stagedBySlotId.set(slotChange.payload.slotId, slotChange);
      }
    }

    return activeDoc.pages
      .map((page) => {
        const blockSlotIds = page.blocks.flatMap((b) => getBlockSlotIds(b));
        const extraSlotIds = [page.headerSlotId, page.footerSlotId].filter((id): id is string =>
          Boolean(id),
        );
        const pageSlotIds = Array.from(new Set([...blockSlotIds, ...extraSlotIds]));
        const editedSlotIds = pageSlotIds.filter((sid) => Boolean(activeDoc.slots[sid]?.isEdited));
        const stagedSlotIds = pageSlotIds.filter((sid) => stagedBySlotId.has(sid));
        const isAddedPage = page.pageLabel.includes("새 페이지") && !committedPageIds.has(page.pageId);
        const changedSlotIds = isAddedPage
          ? pageSlotIds
          : Array.from(new Set([...editedSlotIds, ...stagedSlotIds]));

        if (changedSlotIds.length === 0 && !isAddedPage) {
          return null;
        }

        const beforeSlots: Record<string, string> = {};
        const afterSlots: Record<string, string> = {};
        for (const sid of pageSlotIds) {
          const slot = activeDoc.slots[sid];
          const baseHtml = slot?.originalContent ?? slot?.content ?? "";
          const staged = stagedBySlotId.get(sid);
          beforeSlots[sid] = baseHtml;
          afterSlots[sid] = staged ? staged.payload.html : (slot?.content ?? "");
        }

        return {
          page,
          kind: (isAddedPage ? "added" : "edited") as "added" | "edited",
          changedSlotIds,
          beforeSlots,
          afterSlots,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [activeDoc, stagingQueue, committedPageIds]);

  const showStagedDiff = (diff: typeof stagingQueue[0]) => {
    if (diff.targetKind === "slot-html") {
      const slotChange = diff as import("@vibe/vdoc-schema").StagedSlotHtmlChange;
      const currentDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === (diff.docId || activeDocId));
      const currentContent = currentDoc?.slots[slotChange.payload.slotId]?.content || "";
      openDiff({
        type: "staged",
        diffId: diff.diffId,
        slotId: slotChange.payload.slotId,
        label: diff.title || "AI Staged 변경안",
        beforeSlots: { [slotChange.payload.slotId]: currentContent },
        afterSlots: { [slotChange.payload.slotId]: slotChange.payload.html },
        changedSlotIds: [slotChange.payload.slotId],
      });
    }
  };

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
              Staged 변경안 & 되돌리기 이력
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 font-mono">
            <span>· 페이지 변경 {changedPages.length}건 · Staged {stagingQueue.length}건</span>
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
        {/* Demo Git Commit & Push Button (resets baseline so Changes clears) */}
        <button
          type="button"
          data-testid="commit-and-push-btn"
          disabled={!activeDoc || changedPages.length === 0}
          onClick={() => {
            if (!activeDoc) return;
            commitAllDocChanges();
            if (activeDiff?.type === "working") {
              closeDiff();
            }
          }}
          className="w-full py-1.5 px-3 rounded bg-[#0078d4] hover:bg-[#006cbe] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer disabled:cursor-not-allowed"
          title="현재 변경사항을 기준점(Base)으로 확정하고 Changes 목록을 비웁니다 (데모)"
        >
          <Check className="w-3.5 h-3.5" />
          Commit &amp; Push ({changedPages.length})
        </button>

        {/* Changes (Antigravity Source Control style per-page list) */}
        <div>
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-700">
              Changes
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold">
              {changedPages.length}
            </span>
          </div>

          <div className="mt-1.5 space-y-0.5">
            {changedPages.length === 0 ? (
              <p className="text-[11px] text-slate-400 px-1.5 py-2">
                변경된 페이지가 없습니다.
              </p>
            ) : (
              changedPages.map((item) => {
                const isPageDiffActive =
                  activeDiff?.type === "working" && activeDiff.pageId === item.page.pageId;
                const openPageDiff = () =>
                  openDiff({
                    type: "working",
                    diffKind: item.kind,
                    pageId: item.page.pageId,
                    label: item.page.pageLabel,
                    beforeSlots: item.beforeSlots,
                    afterSlots: item.afterSlots,
                    changedSlotIds: item.changedSlotIds,
                  });

                const discardPageChanges = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!activeDoc) return;
                  useStudioDocumentStore.getState().updateDoc(
                    activeDoc.docId,
                    (prev) => {
                      const nextSlots = { ...prev.slots };
                      for (const sid of item.changedSlotIds) {
                        const slot = nextSlots[sid];
                        if (!slot) continue;
                        nextSlots[sid] = {
                          ...slot,
                          content: item.beforeSlots[sid] ?? slot.originalContent ?? slot.content,
                          isEdited: false,
                        };
                      }
                      return { ...prev, slots: nextSlots };
                    },
                    { history: true, label: `${item.page.pageLabel} 변경사항 되돌리기` },
                  );
                  if (isPageDiffActive) closeDiff();
                };

                return (
                  <div
                    key={item.page.pageId}
                    role="button"
                    tabIndex={0}
                    data-diff={item.kind}
                    onClick={openPageDiff}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPageDiff();
                      }
                    }}
                    className={`fig-row group w-full flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition ${
                      isPageDiffActive
                        ? "bg-sky-50/80 ring-1 ring-[#0d99ff]"
                        : "hover:bg-slate-100/80"
                    }`}
                    title={`${item.page.pageLabel} · 클릭 시 중앙 화면에서 1:1 Side-by-Side Diff 비교`}
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="fig-row-label truncate text-[11.5px] font-medium flex-1">
                      {item.page.pageLabel}
                    </span>
                    {item.kind === "edited" && (
                      <button
                        type="button"
                        data-testid={`discard-page-changes-${item.page.pageId}`}
                        onClick={discardPageChanges}
                        title="변경사항 되돌리기 (Discard Changes)"
                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                    <FigmaDiffBadge diffState={{ kind: item.kind, isDirect: true }} />
                  </div>
                );
              })
            )}
          </div>
        </div>

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
                  title="모든 변경안을 승인해 문서 · 프로젝트에 반영"
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
            <ProposalCandidateBar compact />
            {stagingQueue.length === 0 ? (
              <EmptyStateCard
                testId="source-control-empty-state"
                icon={<GitCommit className="w-4 h-4 text-slate-400" />}
                title="스테이징된 변경사항이 없습니다"
                description="AI 컴포저나 슬롯 수정을 실행하면 이곳에 인메모리 Diff가 격리 스테이징됩니다."
              />
            ) : (
              stagingQueue.map((diff) => {
                const isDiffActive = activeDiff?.type === "staged" && activeDiff.diffId === diff.diffId;
                return (
                  <div
                    key={diff.diffId}
                    {...attachable(() => [stagedRef(diff)])}
                    onClick={() => showStagedDiff(diff)}
                    className={`rounded-lg border p-2 text-xs space-y-1.5 cursor-pointer transition ${
                      isDiffActive
                        ? "border-[#0d99ff] bg-sky-50/60 ring-1 ring-[#0d99ff]"
                        : "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
                    }`}
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
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                );
              })
            )}
          </div>
        </div>

        {/* 문서 개정 이력 (서버 · 작성자별 · 복원) */}
        <div className="pt-2 border-t border-slate-100">
          <RevisionTimeline docId={activeDocId} limit={60} />
        </div>

        {/* Local Git & Project Undo History */}
        <div data-testid="commit-history-info" className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between pb-1 text-slate-700">
            <span className="text-[11px] font-bold flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              되돌리기 이력 ({totalCommits})
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            실행 취소(Ctrl+Z) · 다시 실행(Ctrl+Y)으로 되돌릴 수 있는 이 세션의 변경 수입니다. 문서는 자동 저장됩니다.
          </p>

          <div className="space-y-1 text-slate-600 text-[11px] font-mono">
            <div className="px-2 py-1 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span>아웃라인 · 프로젝트 변경</span>
              <span className="font-bold text-slate-900">{projPastCount}</span>
            </div>
            <div className="px-2 py-1 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span>문서 구조 변경</span>
              <span className="font-bold text-slate-900">{docPastCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
