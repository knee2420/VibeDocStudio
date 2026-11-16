import { useMemo, useRef } from "react";

import { getBlockSlotIds, type StagedSlotHtmlChange, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

import {
  buildChanges,
  slotLocations,
  summarizeChanges,
  useStudioDocumentStore,
  type ChangeItem,
  type ChangeSummary,
} from "@/entities/vdoc-document";
import { useStageAiChanges } from "@/features/stage-ai-changes";

export interface WorkingPage {
  page: VDocPage;
  pageNo: number;
  /** 지난 버전 이후 새로 만든 쪽 */
  added: boolean;
  items: ChangeItem[];
  summary: ChangeSummary;
  /** 검토 화면에 넘길 이전 · 이후 (쪽 안 바뀐 칸) */
  slotIds: string[];
  before: Record<string, string>;
  after: Record<string, string>;
}

/**
 * 마지막 버전(기준점) 이후 지금까지 바뀐 곳 — 쪽마다 바뀐 칸 · 글자 수.
 * 기준은 칸의 `originalContent` (버전 저장 때 옮겨진다), AI 변경안이 스테이징돼 있으면 그 글을 "이후"로 본다.
 */
export function useWorkingChanges(doc: VDocDocument | null) {
  const { stagingQueue } = useStageAiChanges();
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);

  // 쪽 · 제목 위치는 구조가 바뀔 때만 다시 센다.
  const slotsRef = useRef(doc?.slots);
  slotsRef.current = doc?.slots;
  const where = useMemo(() => slotLocations(doc?.pages ?? [], slotsRef.current ?? {}), [doc?.pages]);

  return useMemo(() => {
    if (!doc) return { pages: [] as WorkingPage[], total: summarizeChanges([]) };
    const staged = new Map<string, string>();
    for (const item of stagingQueue) {
      if (item.targetKind === "slot-html" && (!item.docId || item.docId === doc.docId)) {
        const c = item as StagedSlotHtmlChange;
        staged.set(c.payload.slotId, c.payload.html);
      }
    }

    const pages: WorkingPage[] = [];
    doc.pages.forEach((page, index) => {
      const ids = [...new Set([page.headerSlotId, ...page.blocks.flatMap((b) => getBlockSlotIds(b)), page.footerSlotId].filter(Boolean))] as string[];
      const added = page.pageLabel.includes("새 페이지") && !committedPageIds.has(page.pageId);
      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      const slotIds: string[] = [];
      for (const sid of ids) {
        const slot = doc.slots[sid];
        const now = staged.get(sid) ?? slot?.content ?? "";
        const base = added ? "" : (slot?.originalContent ?? slot?.content ?? "");
        if (!added && !staged.has(sid) && !slot?.isEdited) continue;
        if (base === now) continue;
        slotIds.push(sid);
        before[sid] = base;
        after[sid] = now;
      }
      const items = buildChanges(doc, where, { slotIds, before, after });
      if (items.length === 0) return;
      pages.push({ page, pageNo: index + 1, added, items, summary: summarizeChanges(items), slotIds, before, after });
    });
    return { pages, total: summarizeChanges(pages.flatMap((p) => p.items)) };
  }, [doc, where, stagingQueue, committedPageIds]);
}
