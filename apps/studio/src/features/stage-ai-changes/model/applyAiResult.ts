import { withSlotFill, type StagedEvidence } from "@vibe/vdoc-schema";

import { buildSlotHtmlChange } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { newId } from "@/shared/lib";

import { applyStagedChange } from "./stagedChangeAppliers";

export interface AiResultMeta {
  /** 변경안 제목 앞머리 (예: "인라인 AI") */
  source: string;
  harnessId: string;
  reason?: string;
  runId?: string;
  evidence?: StagedEvidence[];
  docId?: string;
}

/**
 * 사람이 그 자리에서 승인한 AI 결과 (인라인 AI 의 "적용" · 범위 AI 의 "바로 반영").
 *
 * 대기열을 거치지 않을 뿐, Staged 변경안 승인과 **같은 경로**를 탄다 — 채움 메타(작성자 = 하네스),
 * 근거 링크, 공용 이력(Ctrl+Z), 서버 개정 이력의 작성자가 모두 같은 규칙으로 남는다.
 */
export async function applyAiSlotResult(slotId: string, html: string, meta: AiResultMeta): Promise<boolean> {
  const store = useStudioDocumentStore.getState();
  const doc = store.docs.find((d) => d.docId === (meta.docId ?? store.activeDocId));
  const slot = doc?.slots[slotId];
  if (!doc || !slot) return false;
  const change = buildSlotHtmlChange(doc, slot, html, {
    source: meta.source,
    reason: meta.reason,
    harnessId: meta.harnessId,
    runId: meta.runId ?? newId("run"),
    evidence: meta.evidence,
    idPrefix: "inline",
  });
  await applyStagedChange(change);
  return true;
}

/** 편집기 안에서 AI 가 선택 범위만 바꿨다 — 칸의 작성자를 AI 로 남긴다 (편집기 갱신이 끝난 뒤 부른다). */
export function markSlotAiEdited(slotId: string, harnessId: string): void {
  const store = useStudioDocumentStore.getState();
  store.updateDoc(
    store.activeDocId,
    (doc) => withSlotFill(doc, slotId, { author: "ai", harnessId, at: new Date().toISOString() }),
    { change: { slotIds: [slotId], author: "ai", harnessId, label: "[인라인 AI] 선택 영역 수정" } }
  );
}
