import { useMemo } from "react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { isPlaygroundProjectId, selectPlaygroundProject, useProjectStore } from "@/entities/vdoc-project";

import { usePlaygroundSettings } from "./usePlaygroundSettings";

/** 이 문서가 플레이그라운드 소속인가 (문서의 projectId 또는 플레이그라운드 프로젝트 목록). */
export function isPlaygroundDoc(doc: Pick<VDocDocument, "docId" | "projectId"> | null | undefined): boolean {
  if (!doc) return false;
  if (isPlaygroundProjectId(doc.projectId)) return true;
  return Boolean(selectPlaygroundProject(useProjectStore.getState())?.docIds.includes(doc.docId));
}

/** 플레이그라운드 문서 id 묶음 (화면용 훅). */
export function usePlaygroundDocIds(): ReadonlySet<string> {
  const ids = useProjectStore((s) => selectPlaygroundProject(s)?.docIds);
  const docs = useStudioDocumentStore((s) => s.docs);
  return useMemo(() => {
    const set = new Set(ids ?? []);
    for (const d of docs) if (isPlaygroundProjectId(d.projectId)) set.add(d.docId);
    return set;
  }, [ids, docs]);
}

/** 플레이그라운드 문서들 (최근 고친 순). */
export function usePlaygroundDocs(): VDocDocument[] {
  const ids = usePlaygroundDocIds();
  const docs = useStudioDocumentStore((s) => s.docs);
  return useMemo(
    () => docs.filter((d) => ids.has(d.docId)).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [docs, ids],
  );
}

/**
 * 프로젝트 쪽(에셋 템플릿 · AI 문서 지정)에 이 문서를 보여도 되는가.
 * 백데이터 제외가 켜져 있으면 플레이그라운드 문서는 빼고, 꺼져 있으면 함께 쓴다.
 */
export function useProjectVisibleDocFilter(): (doc: VDocDocument) => boolean {
  const ids = usePlaygroundDocIds();
  const exclude = usePlaygroundSettings((s) => s.excludeFromBackdata);
  return useMemo(() => (doc: VDocDocument) => !(exclude && ids.has(doc.docId)), [ids, exclude]);
}

export interface PlaygroundVariant {
  /** v2, v3 … (원본이 v1) */
  label: string;
  doc: VDocDocument;
  /** 원본 문서 · (쪽 버전이면) 원본 쪽 */
  sourceDocId: string;
  sourcePageId: string | null;
}

/** 버전 묶음 열쇠: 문서 버전은 문서 id, 쪽 버전은 `문서id:쪽id`. */
export const variantKey = (docId: string, pageId?: string | null) => (pageId ? `${docId}:${pageId}` : docId);

/**
 * 원본 쪽 · 문서별 버전들 — 플레이그라운드로 복사해 온 사본이 곧 그 원본의 다른 버전(v2, v3 …)이다.
 * 복사한 순서대로 번호를 매긴다. 원본(v1)이 지워졌으면 묶음에 넣지 않는다.
 */
export function usePlaygroundVariants(): ReadonlyMap<string, PlaygroundVariant[]> {
  const drafts = usePlaygroundDocs();
  const docs = useStudioDocumentStore((s) => s.docs);
  return useMemo(() => {
    const alive = new Set(docs.map((d) => d.docId));
    const groups = new Map<string, VDocDocument[]>();
    for (const doc of drafts) {
      const from = doc.origin?.copiedFrom;
      if (!from || !alive.has(from.docId)) continue;
      const pageId = from.pageIds?.length === 1 ? from.pageIds[0] : null;
      const key = variantKey(from.docId, pageId);
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }
    const out = new Map<string, PlaygroundVariant[]>();
    for (const [key, list] of groups) {
      const sorted = [...list].sort((a, b) =>
        (a.origin?.copiedFrom?.copiedAt ?? "").localeCompare(b.origin?.copiedFrom?.copiedAt ?? ""),
      );
      out.set(
        key,
        sorted.map((doc, i) => {
          const from = doc.origin!.copiedFrom!;
          return {
            label: `v${i + 2}`,
            doc,
            sourceDocId: from.docId,
            sourcePageId: from.pageIds?.length === 1 ? from.pageIds[0] : null,
          };
        }),
      );
    }
    return out;
  }, [drafts, docs]);
}
