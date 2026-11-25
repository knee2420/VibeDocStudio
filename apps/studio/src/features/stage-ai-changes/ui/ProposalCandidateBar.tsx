import React from "react";

import { getBlockSlotIds } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export interface ProposalCandidateBarProps {
  compact?: boolean;
}

/**
 * `wb_propose` 가 여러 후보안(1안 · 2안 · …)을 내놨을 때,
 * Staged Diff 대기열을 각 후보안으로 즉시 전환하는 미니멀 세그먼트 필.
 */
export const ProposalCandidateBar: React.FC<ProposalCandidateBarProps> = ({ compact = false }) => {
  const proposals = useAiStagingStore((s) => s.proposals);
  const selectProposalCandidate = useAiStagingStore((s) => s.selectProposalCandidate);
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);

  const multiEntries = Object.values(proposals).filter((entry) => entry.proposal.candidates.length > 1);
  if (multiEntries.length === 0) return null;

  const focusCandidateSlot = (docId: string, slotIds: string[]) => {
    const doc = docs.find((d) => d.docId === docId);
    if (!doc) return;
    if (activeDocId !== doc.docId) setActiveDocId(doc.docId);
    const firstSlotId = slotIds[0];
    if (firstSlotId) {
      const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(firstSlotId)));
      if (page) setActivePageId(page.pageId);
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(`[data-testid="slot-change-review-${CSS.escape(firstSlotId)}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
      });
    }
  };

  return (
    <div
      data-testid="proposal-candidate-bar"
      className={
        compact
          ? "space-y-1.5 rounded-lg border border-[#e6e6e8] bg-[#f7f7f8] p-2 text-xs"
          : "inline-flex flex-wrap items-center gap-2 py-1 px-2.5 rounded-full border border-[#e6e6e8] bg-white/95 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.06)] text-[11px]"
      }
    >
      {multiEntries.map(({ proposal, selectedCandidate }) => {
        const doc = docs.find((d) => d.docId === proposal.docId) ?? docs[0];
        const current = proposal.candidates[selectedCandidate];
        return (
          <div
            key={proposal.proposalId}
            className={compact ? "space-y-1" : "flex flex-wrap items-center gap-2"}
          >
            <span className="font-medium text-[#6e6e73] max-w-[240px] truncate">
              {current?.title || `${proposal.candidates.length}개 후보안`}
            </span>
            <div className="inline-flex items-center p-0.5 rounded-full bg-[#f0f0f2]">
              {proposal.candidates.map((cand, idx) => {
                const active = idx === selectedCandidate;
                const slotCount = Object.keys(cand.slots ?? {}).length;
                return (
                  <button
                    key={`${proposal.proposalId}-cand-${idx}`}
                    type="button"
                    disabled={!doc}
                    data-testid={`proposal-candidate-btn-${proposal.proposalId}-${idx}`}
                    title={cand.rationale || cand.title || `${idx + 1}안 선택`}
                    onClick={() => {
                      if (!doc) return;
                      if (!active) {
                        selectProposalCandidate(proposal.proposalId, idx, doc);
                      }
                      focusCandidateSlot(doc.docId, Object.keys(cand.slots ?? {}));
                    }}
                    className={
                      active
                        ? "px-2.5 py-0.5 rounded-full bg-white text-[#18181b] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)] cursor-pointer"
                        : "px-2.5 py-0.5 rounded-full text-[#6e6e73] hover:text-[#18181b] font-medium cursor-pointer transition disabled:opacity-50"
                    }
                  >
                    {idx + 1}안{slotCount > 0 ? ` (${slotCount})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
