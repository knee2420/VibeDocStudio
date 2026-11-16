import React from "react";
import { CheckCheck, Sparkles, Trash2 } from "lucide-react";

import type { StagedSlotHtmlChange } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { attachable, stagedRef } from "@/features/ai-workspace";
import { useActiveDiffStore } from "@/features/document-diff";
import { ProposalCandidateBar, useStageAiChanges } from "@/features/stage-ai-changes";
import { htmlToPlain } from "@/shared/lib";

/** AI 제안 — 문서에 아직 넣지 않은 변경안 (승인 · 반려). 스테이징된 것이 있을 때만 보인다. */
export const StagedChangesSection: React.FC<{ docId: string | null }> = ({ docId }) => {
  const { stagingQueue, acceptAllStagedChanges, rejectAllStagedChanges, acceptStagedChange, rejectStagedChange } = useStageAiChanges();
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);

  const show = (diff: (typeof stagingQueue)[number]) => {
    if (diff.targetKind !== "slot-html") return;
    const c = diff as StagedSlotHtmlChange;
    const doc = useStudioDocumentStore.getState().docs.find((d) => d.docId === (diff.docId || docId));
    openDiff({
      type: "staged",
      diffId: diff.diffId,
      slotId: c.payload.slotId,
      label: diff.title || "AI 제안",
      beforeSlots: { [c.payload.slotId]: doc?.slots[c.payload.slotId]?.content || "" },
      afterSlots: { [c.payload.slotId]: c.payload.html },
      changedSlotIds: [c.payload.slotId],
      meta: { author: "ai", authorName: "AI 제안 (아직 반영 안 됨)" },
    });
  };

  return (
    <>
      <ProposalCandidateBar compact />
      {stagingQueue.length > 0 && (
        <section data-testid="staged-changes">
          <div className="h-8 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--fig-component)]" />
            <span className="text-[12px] font-semibold">AI 제안</span>
            <span className="text-[11px] text-black/40">{stagingQueue.length}건 검토 대기</span>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-testid="accept-all-staged-btn"
                onClick={acceptAllStagedChanges}
                className="h-6 px-1.5 rounded-[5px] text-[11px] text-[#116329] hover:bg-[#dafbe1] inline-flex items-center gap-0.5"
                title="모든 제안을 문서에 반영"
              >
                <CheckCheck className="w-3 h-3" /> 모두 반영
              </button>
              <button
                type="button"
                data-testid="reject-all-staged-btn"
                onClick={rejectAllStagedChanges}
                className="h-6 px-1.5 rounded-[5px] text-[11px] text-black/55 hover:bg-[#ffebe9] hover:text-[#a40e26] inline-flex items-center gap-0.5"
                title="모든 제안 버리기"
              >
                <Trash2 className="w-3 h-3" /> 모두 버리기
              </button>
            </span>
          </div>
          <div className="space-y-1">
            {stagingQueue.map((diff) => {
              const on = activeDiff?.type === "staged" && activeDiff.diffId === diff.diffId;
              const html = diff.targetKind === "slot-html" ? (diff as StagedSlotHtmlChange).payload.html : "";
              return (
                <div
                  key={diff.diffId}
                  {...attachable(() => [stagedRef(diff)])}
                  onClick={() => show(diff)}
                  className={`rounded-[6px] border px-2 py-1.5 cursor-pointer ${
                    on ? "border-[#0d99ff] bg-[var(--fig-selected)]" : "border-[#e9d7fe] bg-[#faf5ff] hover:bg-[#f4ebff]"
                  }`}
                >
                  <div className="text-[12px] font-medium truncate">{diff.title || diff.afterSummary}</div>
                  {html && <div className="text-[11.5px] text-black/55 truncate">{htmlToPlain(html, 80)}</div>}
                  <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => acceptStagedChange(diff)}
                      className="h-6 px-2 rounded-[5px] bg-[#1f883d] text-white text-[11px] font-medium hover:bg-[#1a7f37]"
                    >
                      반영
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectStagedChange(diff.diffId)}
                      className="h-6 px-2 rounded-[5px] bg-white border border-black/10 text-[11px] text-black/65 hover:text-[#a40e26]"
                    >
                      버리기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
};
