import { useCallback, useEffect, useRef, useState } from "react";

import { setSlotContent, withSlotFill } from "@vibe/vdoc-schema";

import { documentApi, type RevisionEntry, useStudioDocumentStore } from "@/entities/vdoc-document";

const RELOAD_DEBOUNCE_MS = 1500;

/**
 * 문서 개정 이력 (서버 `revisions.jsonl`) — 저장마다 바뀐 칸을 작성자(사람 | 하네스)와 함께 남긴 기록.
 * 문서의 저장 버전(`revision`)이 바뀔 때마다 다시 읽는다.
 */
export function useRevisions(docId: string | undefined, opts: { slotId?: string; limit?: number } = {}) {
  const revision = useStudioDocumentStore((s) => s.docs.find((d) => d.docId === docId)?.revision);
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      setEntries(await documentApi.revisions(docId, { slotId: opts.slotId, limit: opts.limit ?? 50 }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이력을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [docId, opts.slotId, opts.limit]);

  // 처음엔 바로, 그 뒤 저장마다는 잠잠해지면 한 번 (타이핑 중 자동 저장마다 기록 전체를 다시 받지 않게).
  const loadedFor = useRef<typeof reload | null>(null);
  useEffect(() => {
    if (loadedFor.current !== reload) {
      loadedFor.current = reload;
      void reload();
      return;
    }
    const t = window.setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [reload, revision]);

  return { entries, error, loading, reload };
}

/**
 * 칸들을 개정 기록의 "이전" 내용으로 되돌린다 — 새 변경으로 남는다 (되돌림도 이력이 된다).
 * AI 실행 하나를 통째로 되돌릴 때는 그 기록의 모든 칸을 넘긴다.
 */
export function restoreSlots(docId: string, slots: { slotId: string; before: string }[], label: string): boolean {
  return useStudioDocumentStore.getState().updateDoc(
    docId,
    (doc) =>
      slots.reduce((acc, { slotId, before }) => {
        if (!acc.slots[slotId]) return acc;
        return withSlotFill(setSlotContent(acc, slotId, before), slotId, { author: "human", at: new Date().toISOString() });
      }, doc),
    { history: true, label, change: { slotIds: slots.map((s) => s.slotId), author: "human", label } }
  );
}
