import { useEffect, useMemo, useRef, useState } from "react";

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

import { getVersionDocument, lastNamedVersion, useVersionsStore } from "./versions";

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

export interface WorkingChangesInput {
  doc: VDocDocument;
  /** 마지막으로 이름 붙인 버전의 문서 (없으면 칸의 처음 글 기준) */
  base: VDocDocument | null;
  /** 스테이징된 AI 변경안 글 (slotId → html) — "이후"로 본다 */
  staged?: ReadonlyMap<string, string>;
  committedPageIds: ReadonlySet<string>;
  where?: ReturnType<typeof slotLocations>;
  baseWhere?: ReturnType<typeof slotLocations> | null;
}

/**
 * 기준 이후 지금까지 바뀐 쪽들 — U(새 쪽) · M(블록을 고치거나 넣거나 지우거나 옮긴 쪽) · D(지운 쪽).
 * 기준은 마지막으로 이름 붙인 버전의 문서 전체(`base`), 버전이 아직 없으면 칸의 `originalContent`.
 * 변경 기록(Changes)과 아웃라인 표시가 이 함수 하나를 같이 써서 늘 같은 것을 "바뀜"으로 본다.
 */
export function computeWorkingPages(input: WorkingChangesInput): WorkingPage[] {
  const { doc, base, committedPageIds } = input;
  const staged = input.staged ?? new Map<string, string>();
  const where = input.where ?? slotLocations(doc.pages, doc.slots);
  const baseWhere = input.baseWhere !== undefined ? input.baseWhere : base ? slotLocations(base.pages, base.slots) : null;
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
}

/** 스테이징된 AI 변경안 중 이 문서의 칸 글 (slotId → html). */
export function stagedSlotHtml(stagingQueue: readonly { targetKind: string; docId?: string | null }[], docId: string): Map<string, string> {
  const staged = new Map<string, string>();
  for (const item of stagingQueue) {
    if (item.targetKind === "slot-html" && (!item.docId || item.docId === docId)) {
      const c = item as unknown as StagedSlotHtmlChange;
      staged.set(c.payload.slotId, c.payload.html);
    }
  }
  return staged;
}

/** 문서마다 "마지막으로 이름 붙인 버전"의 문서. undefined = 아직 불러오는 중, null = 버전 없음. */
export function useLastVersionBases(docIds: readonly string[]): Record<string, VDocDocument | null | undefined> {
  const byDoc = useVersionsStore((s) => s.byDoc);
  const requested = useRef(new Set<string>());
  const [bases, setBases] = useState<Record<string, { versionId: string | null; doc: VDocDocument | null }>>({});

  // 버전 목록을 아직 안 받은 문서는 한 번 받는다 (버전 저장 · 되돌리기 때는 그쪽에서 다시 받는다).
  useEffect(() => {
    for (const id of docIds) {
      if (byDoc[id] || requested.current.has(id)) continue;
      requested.current.add(id);
      void useVersionsStore.getState().load(id);
    }
  }, [docIds, byDoc]);

  useEffect(() => {
    let alive = true;
    for (const id of docIds) {
      const versions = byDoc[id];
      if (!versions) continue;
      const versionId = lastNamedVersion(versions)?.id ?? null;
      if (bases[id] && bases[id].versionId === versionId) continue;
      if (!versionId) {
        setBases((prev) => ({ ...prev, [id]: { versionId: null, doc: null } }));
        continue;
      }
      getVersionDocument(id, versionId).then(
        (doc) => alive && setBases((prev) => ({ ...prev, [id]: { versionId, doc } })),
        () => alive && setBases((prev) => ({ ...prev, [id]: { versionId, doc: null } })),
      );
    }
    return () => {
      alive = false;
    };
  }, [docIds, byDoc, bases]);

  return useMemo(() => {
    const out: Record<string, VDocDocument | null | undefined> = {};
    for (const id of docIds) {
      const versions = byDoc[id];
      const want = versions ? (lastNamedVersion(versions)?.id ?? null) : undefined;
      const have = bases[id];
      out[id] = want === undefined || !have || have.versionId !== want ? undefined : have.doc;
    }
    return out;
  }, [docIds, byDoc, bases]);
}

/**
 * 여러 문서의 "마지막 버전 이후 바뀐 쪽" — 아웃라인 표시 · 페이지 탭 M · 변경 기록 배지가 같이 쓴다.
 * 기준 버전을 불러오는 중인 문서는 undefined (그동안은 아무 표시도 하지 않는다).
 */
export function useWorkingPagesByDoc(docIds: readonly string[]): Record<string, WorkingPage[] | undefined> {
  const key = [...new Set(docIds)].sort().join("|");
  const ids = useMemo(() => (key ? key.split("|") : []), [key]);
  const docs = useStudioDocumentStore((s) => s.docs);
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);
  const { stagingQueue } = useStageAiChanges();
  const bases = useLastVersionBases(ids);
  return useMemo(() => {
    const out: Record<string, WorkingPage[] | undefined> = {};
    for (const id of ids) {
      const doc = docs.find((d) => d.docId === id);
      const base = bases[id];
      out[id] = doc && base !== undefined ? computeWorkingPages({ doc, base, staged: stagedSlotHtml(stagingQueue, id), committedPageIds }) : undefined;
    }
    return out;
  }, [ids, docs, bases, stagingQueue, committedPageIds]);
}
