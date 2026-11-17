import { useMemo, useRef } from "react";

import { type StagedSlotHtmlChange, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

import {
  countBlocks,
  pageBlockChanges,
  slotLocations,
  useStudioDocumentStore,
  type BlockChange,
  type BlockCounts,
  type ChangeItem,
} from "@/entities/vdoc-document";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { sumStats, type CharStat } from "@/shared/lib";

export type WorkingKind = "added" | "edited" | "deleted";

export interface WorkingPage {
  page: VDocPage;
  /** 지금 문서의 쪽 번호 (지운 쪽은 그 버전에서의 번호) */
  pageNo: number;
  /** U 새 쪽 · M 고친 쪽 · D 지운 쪽 */
  kind: WorkingKind;
  /** 블록 단위 변경 (표는 블록 하나 + 바뀐 칸) */
  blocks: BlockChange[];
  counts: BlockCounts;
  /** 글이 바뀐 칸 전부 (검토 화면 · 되돌리기용) */
  items: ChangeItem[];
  stat: CharStat;
  /** 검토 화면에 넘길 이전 · 이후 */
  slotIds: string[];
  before: Record<string, string>;
  after: Record<string, string>;
}

function pack(page: VDocPage, pageNo: number, kind: WorkingKind, blocks: BlockChange[]): WorkingPage {
  const items = blocks.flatMap((b) => b.items);
  return {
    page,
    pageNo,
    kind,
    blocks,
    counts: countBlocks(blocks),
    items,
    stat: sumStats(items.map((i) => i.stat)),
    slotIds: items.map((i) => i.slotId),
    before: Object.fromEntries(items.map((i) => [i.slotId, i.before])),
    after: Object.fromEntries(items.map((i) => [i.slotId, i.after])),
  };
}

/**
 * 기준 이후 지금까지 바뀐 쪽들 — U(새 쪽) · M(블록을 고치거나 넣거나 지우거나 옮긴 쪽) · D(지운 쪽).
 * 기준은 마지막으로 이름 붙인 버전의 문서 전체(`base`), 버전이 아직 없으면 칸의 `originalContent`.
 * AI 변경안이 스테이징돼 있으면 그 글을 "이후"로 본다.
 */
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
    const staged = new Map<string, string>();
    for (const item of stagingQueue) {
      if (item.targetKind === "slot-html" && (!item.docId || item.docId === doc.docId)) {
        const c = item as StagedSlotHtmlChange;
        staged.set(c.payload.slotId, c.payload.html);
      }
    }
    const afterOf = (sid: string) => staged.get(sid) ?? doc.slots[sid]?.content ?? "";
    // 버전이 없을 때: 고친 칸만, 처음 글 기준.
    const beforeOf = (sid: string) => {
      const slot = doc.slots[sid];
      if (!staged.has(sid) && !slot?.isEdited) return undefined;
      return slot?.originalContent ?? slot?.content ?? "";
    };
    const basePages = new Map(base?.pages.map((p) => [p.pageId, p]) ?? []);
    const liveBlockIds = new Set(doc.pages.flatMap((p) => p.blocks.map((b) => b.blockId)));
    const out: WorkingPage[] = [];

    doc.pages.forEach((page, index) => {
      const then = basePages.get(page.pageId) ?? null;
      const added = base ? !then : page.pageLabel.includes("새 페이지") && !committedPageIds.has(page.pageId);
      const blocks = pageBlockChanges({
        page,
        basePage: added ? null : then,
        doc,
        base: added ? { slots: {} } : base,
        beforeOf: added ? () => "" : beforeOf,
        afterOf,
        where,
        baseWhere,
        liveBlockIds,
      });
      const renamed = Boolean(then && then.pageLabel !== page.pageLabel);
      if (blocks.length === 0 && !renamed && !(added && base)) return;
      out.push(pack(page, index + 1, added ? "added" : "edited", blocks));
    });

    if (base && baseWhere) {
      const now = new Set(doc.pages.map((p) => p.pageId));
      base.pages.forEach((page, index) => {
        if (now.has(page.pageId)) return;
        const blocks = pageBlockChanges({ page: null, basePage: page, doc, base, afterOf, where, baseWhere, liveBlockIds });
        out.push(pack(page, index + 1, "deleted", blocks));
      });
    }
    return out;
  }, [doc, base, where, baseWhere, stagingQueue, committedPageIds]);
}
