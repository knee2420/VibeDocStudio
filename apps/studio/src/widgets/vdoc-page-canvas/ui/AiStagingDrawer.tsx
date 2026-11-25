import React, { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

import { getBlockSlotIds } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { attachable, stagedRef } from "@/features/ai-workspace";
import { ProposalCandidateBar, useStageAiChanges } from "@/features/stage-ai-changes";

/**
 * Manyfast 스타일 하단 플로팅 AI 검토 필 (Review Bar):
 * - 캔버스 상단에 줄을 늘리지 않고, 하단 플로팅 툴바 바로 위(bottom-[68px])에
 *   깔끔한 화이트 필로 떠서 툴바와 절대 겹치지 않는다.
 * - `[일괄처리 ▾ | ‹ 1/N 수정 · 요약 › | × 거절 | ✓ 승인]`
 */
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

  const [cursor, setCursor] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cursor >= stagingQueue.length) {
      setCursor(Math.max(0, stagingQueue.length - 1));
    }
  }, [cursor, stagingQueue.length]);

  useEffect(() => {
    if (!batchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setBatchOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [batchOpen]);

  if (!reviewOpen || (stagingQueue.length === 0 && !lastAbortedRunId)) {
    return null;
  }

  const activeDiff = stagingQueue[cursor] ?? stagingQueue[0];
  const isNew = activeDiff ? !activeDiff.beforeSummary?.trim() : false;

  const jumpTo = (index: number) => {
    if (stagingQueue.length === 0) return;
    const next = (index + stagingQueue.length) % stagingQueue.length;
    setCursor(next);
    const target = stagingQueue[next];
    if (!target) return;

    // 다른 문서나 다른 쪽에 있는 제안이면 자동으로 해당 문서·쪽으로 이동 후 스크롤
    const docStore = useStudioDocumentStore.getState();
    const targetDocId = target.docId ?? docStore.activeDocId;
    const targetDoc = docStore.docs.find((d) => d.docId === targetDocId);
    if (targetDoc && docStore.activeDocId !== targetDoc.docId) {
      docStore.setActiveDocId(targetDoc.docId);
    }
    if (targetDoc && target.targetKind === "slot-html") {
      const targetPage = targetDoc.pages.find((p) =>
        p.blocks.some((b) => getBlockSlotIds(b).includes(target.payload.slotId)),
      );
      if (targetPage && docStore.activePageId !== targetPage.pageId) {
        docStore.setActivePageId(targetPage.pageId);
      }
    }

    const scrollAndPulse = () => {
      const el = document.querySelector<HTMLElement>(`[data-staged-diff-id="${CSS.escape(target.diffId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.animate?.(
          [{ boxShadow: "0 0 0 3px rgba(13,153,255,0.38)" }, { boxShadow: "0 0 0 3px rgba(13,153,255,0)" }],
          { duration: 700, easing: "ease-out" },
        );
      }
    };
    requestAnimationFrame(() => setTimeout(scrollAndPulse, 60));
  };

  return (
    <div
      ref={containerRef}
      data-testid="ai-staging-drawer"
      aria-label="AI 제안 검토 막대"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[68px] z-30 flex flex-col items-center gap-2 max-w-[min(640px,calc(100%-32px))] select-none"
    >
      {/* 2안 이상 제안 시에만 표시되는 미니멀 후보 전환 필 */}
      <div className="pointer-events-auto">
        <ProposalCandidateBar />
      </div>

      {/* 일괄처리 & 전체 목록 팝오버 (필요할 때만 위로 열림) */}
      {batchOpen && stagingQueue.length > 0 && (
        <div className="pointer-events-auto w-[420px] max-w-[90vw] max-h-64 overflow-y-auto rounded-xl border border-[#e6e6e8] bg-white/98 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-2 space-y-1.5">
          <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-[#e6e6e8]">
            <span className="text-[11px] font-semibold text-[#6e6e73]">제안 {stagingQueue.length}건 일괄처리</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="reject-all-staged-btn"
                onClick={() => {
                  rejectAllStagedChanges();
                  setBatchOpen(false);
                }}
                className="h-6 px-2 rounded-md border border-[#e6e6e8] bg-white hover:bg-[#f7f7f8] text-[#6e6e73] hover:text-[#18181b] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition"
              >
                <X className="w-3 h-3" />
                모두 거절
              </button>
              <button
                type="button"
                data-testid="accept-all-staged-btn"
                onClick={() => {
                  void acceptAllStagedChanges();
                  setBatchOpen(false);
                }}
                className="h-6 px-2.5 rounded-md bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition"
              >
                <CheckCheck className="w-3 h-3" />
                모두 승인 ({stagingQueue.length})
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            {stagingQueue.map((diff, idx) => {
              const itemNew = !diff.beforeSummary?.trim();
              const isCurrent = idx === cursor;
              return (
                <div
                  key={diff.diffId}
                  data-testid={`staged-diff-item-${diff.diffId}`}
                  {...attachable(() => [stagedRef(diff)])}
                  onClick={() => {
                    jumpTo(idx);
                    setBatchOpen(false);
                  }}
                  className={`rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition ${
                    isCurrent ? "bg-[var(--vds-accent-soft)]" : "hover:bg-[#f7f7f8]"
                  }`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2 text-[11.5px]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--vds-accent-soft)] text-[var(--vds-accent)] text-[10px] font-semibold shrink-0">
                      {itemNew ? "신규" : "수정"}
                    </span>
                    <span className="truncate text-[#18181b]">{diff.afterSummary || diff.beforeSummary}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      data-testid={`reject-staged-btn-${diff.diffId}`}
                      onClick={() => rejectStagedChange(diff.diffId)}
                      className="w-6 h-6 rounded-md hover:bg-zinc-200/70 text-[#6e6e73] hover:text-[#18181b] flex items-center justify-center cursor-pointer transition"
                      title="거절"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      data-testid={`accept-staged-btn-${diff.diffId}`}
                      onClick={() => void acceptStagedChange(diff)}
                      className="w-6 h-6 rounded-md bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white flex items-center justify-center cursor-pointer transition"
                      title="승인"
                    >
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manyfast 스타일 메인 플로팅 화이트 필 */}
      <div className="pointer-events-auto h-10 px-2 rounded-full bg-white/98 backdrop-blur-md border border-[#e6e6e8] shadow-[0_8px_28px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-1.5">
        {stagingQueue.length > 0 && (
          <>
            {/* 일괄처리 트리거 */}
            <button
              type="button"
              onClick={() => setBatchOpen((v) => !v)}
              aria-expanded={batchOpen}
              className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition shrink-0 ${
                batchOpen ? "bg-[#efeff1] text-[#18181b]" : "text-[#6e6e73] hover:bg-[#f7f7f8] hover:text-[#18181b]"
              }`}
            >
              일괄처리
              <ChevronDown className={`w-3 h-3 transition-transform ${batchOpen ? "rotate-180" : ""}`} />
            </button>

            <div className="w-px h-4 bg-[#e6e6e8] shrink-0" />

            {/* 이전 / 카운터 / 배지 / 요약 / 다음 */}
            <button
              type="button"
              onClick={() => jumpTo(cursor - 1)}
              title="이전 제안"
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#6e6e73] hover:bg-[#f7f7f8] hover:text-[#18181b] cursor-pointer transition shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="text-[11.5px] font-mono text-[#6e6e73] tabular-nums shrink-0">
              {cursor + 1}/{stagingQueue.length}
            </span>

            <span className="px-1.5 py-0.5 rounded bg-[var(--vds-accent-soft)] text-[var(--vds-accent)] text-[10.5px] font-semibold shrink-0">
              {isNew ? "신규" : "수정"}
            </span>

            {activeDiff && (
              <button
                type="button"
                onClick={() => jumpTo(cursor)}
                className="max-w-[160px] truncate text-[12px] font-medium text-[#18181b] hover:text-[var(--vds-accent)] cursor-pointer transition"
                title={activeDiff.afterSummary || activeDiff.beforeSummary}
              >
                {activeDiff.afterSummary || activeDiff.beforeSummary || "변경 제안"}
              </button>
            )}

            <button
              type="button"
              onClick={() => jumpTo(cursor + 1)}
              title="다음 제안"
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#6e6e73] hover:bg-[#f7f7f8] hover:text-[#18181b] cursor-pointer transition shrink-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-[#e6e6e8] shrink-0" />

            {/* 현재 제안 거절 / 승인 */}
            {activeDiff && (
              <>
                <button
                  type="button"
                  onClick={() => rejectStagedChange(activeDiff.diffId)}
                  className="h-7 px-2.5 rounded-full border border-[#e6e6e8] bg-white hover:bg-[#f7f7f8] text-[#18181b] text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                >
                  <X className="w-3 h-3 text-[#6e6e73]" />
                  거절
                </button>
                <button
                  type="button"
                  onClick={() => void acceptStagedChange(activeDiff)}
                  className="h-7 px-3 rounded-full bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  승인
                </button>
              </>
            )}
          </>
        )}

        {lastAbortedRunId && stagingQueue.length === 0 && (
          <div className="flex items-center gap-2 px-2">
            <span data-testid="aborted-run-badge" className="text-[11.5px] text-[#6e6e73]">
              실행 중단됨 — 기존 문서 보존
            </span>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="w-6 h-6 rounded-full hover:bg-[#f7f7f8] text-[#6e6e73] flex items-center justify-center cursor-pointer"
              title="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
