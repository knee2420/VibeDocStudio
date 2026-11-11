import React from "react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export interface ProposalCandidateBarProps {
  compact?: boolean;
}

/**
 * `wb_propose` 가 여러 후보안(1안 · 2안 · …)을 내놨을 때,
 * Staged Diff 대기열을 각 후보안으로 즉시 전환하는 선택 막대.
 */
export const ProposalCandidateBar: React.FC<ProposalCandidateBarProps> = ({ compact = false }) => {
  const proposals = useAiStagingStore((s) => s.proposals);
  const selectProposalCandidate = useAiStagingStore((s) => s.selectProposalCandidate);
  const docs = useStudioDocumentStore((s) => s.docs);

  const multiEntries = Object.values(proposals).filter((entry) => entry.proposal.candidates.length > 1);
  if (multiEntries.length === 0) return null;

  return (
    <div
      data-testid="proposal-candidate-bar"
      className={
        compact
          ? "space-y-1.5 rounded-lg border border-violet-200 bg-violet-50/50 p-2 text-xs"
          : "flex flex-wrap items-center gap-2 py-1.5 px-2.5 mt-1.5 rounded-lg border border-violet-200 bg-violet-50/50 text-xs"
      }
    >
      {multiEntries.map(({ proposal, selectedCandidate }) => {
        const doc = docs.find((d) => d.docId === proposal.docId) ?? docs[0];
        const current = proposal.candidates[selectedCandidate];
        return (
          <div
            key={proposal.proposalId}
            className={compact ? "space-y-1" : "flex flex-wrap items-center gap-1.5"}
          >
            <span className="font-semibold text-violet-900">
              {proposal.candidates.length}개 후보안
              {current?.title ? ` · ${current.title}` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-1">
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
                      if (doc && !active) {
                        selectProposalCandidate(proposal.proposalId, idx, doc);
                      }
                    }}
                    className={
                      active
                        ? "px-2 py-0.5 rounded-md bg-violet-600 text-white font-bold cursor-default shadow-2xs"
                        : "px-2 py-0.5 rounded-md bg-white hover:bg-violet-100 text-violet-900 border border-violet-200 font-semibold cursor-pointer transition disabled:opacity-50"
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

