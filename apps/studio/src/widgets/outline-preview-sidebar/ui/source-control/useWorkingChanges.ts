import { useMemo, useRef } from "react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { slotLocations, useStudioDocumentStore } from "@/entities/vdoc-document";
import { computeWorkingPages, stagedSlotHtml, type WorkingPage } from "@/features/document-revisions";
import { useStageAiChanges } from "@/features/stage-ai-changes";

export type { WorkingKind, WorkingPage } from "@/features/document-revisions";

/** 열린 문서의 바뀐 쪽들 (변경 기록 Changes). */
export function useWorkingChanges(doc: VDocDocument | null, base: VDocDocument | null) {
  const { stagingQueue } = useStageAiChanges();
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);

  // 쪽 · 제목 위치는 구조가 바뀔 때만 다시 센다.
  const slotsRef = useRef(doc?.slots);
  slotsRef.current = doc?.slots;
  const where = useMemo(() => slotLocations(doc?.pages ?? [], slotsRef.current ?? {}), [doc?.pages]);
  const baseWhere = useMemo(() => (base ? slotLocations(base.pages, base.slots) : null), [base]);

  return useMemo(() => {
    if (!doc) return [] as WorkingPage[];
    return computeWorkingPages({ doc, base, staged: stagedSlotHtml(stagingQueue, doc.docId), committedPageIds, where, baseWhere });
  }, [doc, base, where, baseWhere, stagingQueue, committedPageIds]);
}
