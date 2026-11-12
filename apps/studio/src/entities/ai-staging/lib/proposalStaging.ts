import type { WorkbenchProposal, WorkbenchProposalCandidate } from "@vibe/ai-kernel";
import type { StagedSlotHtmlChange, VDocDocument } from "@vibe/vdoc-schema";

import { buildSlotHtmlChange } from "./buildChange";

/**
 * `wb_propose` 가 검증 통과해 내보낸 제안서(`WorkbenchProposal`)의 한 후보안을
 * Staged Diff 대기열용 `StagedSlotHtmlChange[]` 목록으로 변환한다.
 *
 * - 문서에 없는 슬롯, 잠금(`locked`) 슬롯, 빈 값, 원문과 동일한 값은 건너뛴다.
 * - `runId` 에 `proposalId` 를 실어 후보안(1안·2안…) 전환과 부분 승인/거절 추적이 맞물리게 한다.
 */
export function buildProposalSlotChanges(
  proposal: WorkbenchProposal,
  doc: VDocDocument,
  candidateIndex = 0,
): StagedSlotHtmlChange[] {
  const candidates = proposal.candidates ?? [];
  if (candidates.length === 0) return [];
  const safeIndex = Math.max(0, Math.min(candidateIndex, candidates.length - 1));
  const candidate: WorkbenchProposalCandidate | undefined = candidates[safeIndex];
  if (!candidate || !candidate.slots) return [];

  const title = candidate.title?.trim();
  const reasonParts: string[] = [];
  if (title) reasonParts.push(title);
  else if (proposal.summary?.trim()) reasonParts.push(proposal.summary.trim());
  if (candidates.length > 1) reasonParts.push(`${safeIndex + 1}안/${candidates.length}`);
  const reason = reasonParts.join(" · ") || undefined;

  const warnings = proposal.warnings?.length ? [...proposal.warnings] : undefined;
  const changes: StagedSlotHtmlChange[] = [];

  for (const [slotId, rawHtml] of Object.entries(candidate.slots)) {
    const slot = doc.slots[slotId];
    if (!slot) continue;
    if (slot.constraints?.locked) continue;
    if (typeof rawHtml !== "string" || !rawHtml.trim()) continue;
    if (rawHtml === slot.content) continue;

    changes.push(
      buildSlotHtmlChange(doc, slot, rawHtml, {
        source: "AI Composer",
        reason,
        phase: "drafting",
        runId: proposal.proposalId,
        harnessId: `workbench:${proposal.mode || "compose"}`,
        warnings,
      }),
    );
  }
  return changes;
}

