import {
  contentHash,
  htmlToSummary,
  type StagedEvidence,
  type StagedSlotHtmlChange,
  type VDocDocument,
  type VDocSlot,
  type WorkbenchPhase,
} from "@vibe/vdoc-schema";

import { newId } from "@/shared/lib";

export interface SlotChangeMeta {
  /** 변경안 제목 앞머리 (예: "AI Composer", "빈 칸 채우기") */
  source: string;
  reason?: string;
  phase?: WorkbenchPhase;
  runId?: string;
  harnessId?: string;
  evidence?: StagedEvidence[];
  warnings?: string[];
  idPrefix?: string;
}

/**
 * 슬롯 본문 변경안 하나 — 변경안을 만드는 모든 곳(Composer 도구 · 인라인 AI · 일괄 채우기)이 이것을 쓴다.
 * 대상 문서 · 기준 지문(baseHash) · 실행 · 근거가 항상 채워져야 승인 · 오래됨 판단 · 근거 기록이 맞는다.
 */
export function buildSlotHtmlChange(doc: VDocDocument, slot: VDocSlot, html: string, meta: SlotChangeMeta): StagedSlotHtmlChange {
  return {
    diffId: newId(meta.idPrefix ?? "stg-slot"),
    phase: meta.phase ?? "drafting",
    targetKind: "slot-html",
    targetId: slot.slotId,
    title: `[${meta.source}] ${slot.label}${meta.reason ? ` — ${meta.reason}` : ""}`,
    beforeSummary: htmlToSummary(slot.content, 80) || "(빈 슬롯)",
    afterSummary: htmlToSummary(html, 110),
    payload: { slotId: slot.slotId, html },
    sourceReferenceIds: slot.backDataRefs,
    docId: doc.docId,
    baseHash: contentHash(slot.content),
    runId: meta.runId,
    harnessId: meta.harnessId,
    createdAt: new Date().toISOString(),
    evidence: meta.evidence,
    warnings: meta.warnings,
  };
}
