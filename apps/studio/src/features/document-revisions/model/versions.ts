import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

import { iterPageSlotIds, restorePageFrom, type VDocDocument } from "@vibe/vdoc-schema";

import { documentApi, useStudioDocumentStore, type DocumentVersion } from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { errorMessage } from "@/shared/lib";

/**
 * 문서 버전 — git 커밋처럼 그 시점 문서 전체가 서버에 보관돼 있어 언제든 통째로(또는 쪽 · 칸만) 되돌린다.
 * named = 사람이 이름 붙인 버전, auto = 자동 보관 지점 (한동안 쉬었다 다시 고치기 직전 · 되돌리기 직전).
 */
interface VersionsState {
  byDoc: Record<string, DocumentVersion[]>;
  error: string | null;
  load: (docId: string) => Promise<void>;
}

export const useVersionsStore = create<VersionsState>((set) => ({
  byDoc: {},
  error: null,
  load: async (docId) => {
    try {
      const versions = await documentApi.versions(docId);
      set((s) => ({ byDoc: { ...s.byDoc, [docId]: versions }, error: null }));
    } catch (err) {
      set({ error: errorMessage(err, "버전 목록을 불러오지 못했습니다.") });
    }
  },
}));

const EMPTY: DocumentVersion[] = [];
const RELOAD_DEBOUNCE_MS = 2000;

/** 문서의 버전 목록 (최신이 앞). 저장이 잠잠해지면 다시 읽는다 (자동 보관 지점이 서버에서 생기므로). */
export function useDocumentVersions(docId: string | null | undefined): DocumentVersion[] {
  const versions = useVersionsStore((s) => (docId ? s.byDoc[docId] : undefined)) ?? EMPTY;
  const revision = useStudioDocumentStore((s) => s.docs.find((d) => d.docId === docId)?.revision);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!docId) return;
    if (loadedFor.current !== docId) {
      loadedFor.current = docId;
      void useVersionsStore.getState().load(docId);
      return;
    }
    const t = window.setTimeout(() => void useVersionsStore.getState().load(docId), RELOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [docId, revision]);
  return versions;
}

/** 마지막으로 이름 붙인 버전 — "지금 작업"의 기준점. */
export const lastNamedVersion = (versions: DocumentVersion[]) => versions.find((v) => v.kind === "named") ?? null;

// 버전 안 문서는 바뀌지 않으니 한 번 받은 것은 기억한다.
const snapshotCache = new Map<string, Promise<VDocDocument>>();

export function getVersionDocument(docId: string, versionId: string): Promise<VDocDocument> {
  const key = `${docId}/${versionId}`;
  let hit = snapshotCache.get(key);
  if (!hit) {
    hit = documentApi.versionDocument(docId, versionId);
    hit.catch(() => snapshotCache.delete(key));
    snapshotCache.set(key, hit);
  }
  return hit;
}

type DocLike = Pick<VDocDocument, "pages" | "slots">;

// 쪽에 실제로 놓인 칸만 글로 친다 (지운 쪽의 칸이 문서에 남아 있어도 "지운 글"로 보이게).
const liveCache = new WeakMap<VDocDocument["pages"], Set<string>>();
function liveSlotIds(doc: DocLike): Set<string> {
  let ids = liveCache.get(doc.pages);
  if (!ids) {
    ids = new Set(doc.pages.flatMap((p) => [...iterPageSlotIds(p)]));
    liveCache.set(doc.pages, ids);
  }
  return ids;
}

/** 쪽 위에 보이는 그 칸의 글 (쪽에 없는 칸이면 ""). */
export const visibleContent = (doc: DocLike, slotId: string) => (liveSlotIds(doc).has(slotId) ? (doc.slots[slotId]?.content ?? "") : "");

/** 두 판에서 쪽 위에 보이는 글이 다른 칸 (한쪽에만 있는 칸 포함). */
export function differingSlotIds(a: DocLike, b: DocLike): string[] {
  const ids = new Set([...liveSlotIds(a), ...liveSlotIds(b)]);
  return [...ids].filter((id) => visibleContent(a, id) !== visibleContent(b, id));
}

/**
 * 지금 상태를 이름 붙인 버전으로 보관한다 (기다리는 저장을 먼저 끝낸다).
 * "바뀐 곳" 표시 기준도 여기로 옮긴다 (예전 Commit & Push 와 같은 동작).
 */
export async function saveVersion(docId: string, name: string, note: string): Promise<DocumentVersion> {
  const docs = useStudioDocumentStore.getState();
  await docs.flushSave(docId);
  const version = await documentApi.createVersion(docId, { name, note, kind: "named" });
  docs.commitAllDocChanges(docId);
  await useVersionsStore.getState().load(docId);
  return version;
}

/**
 * 문서 전체를 그 버전으로 되돌린다 (git checkout).
 * 되돌리기 직전 상태를 자동 보관해 두고, 실행 취소(Ctrl+Z)로도 돌아올 수 있다.
 */
export async function restoreVersion(docId: string, version: Pick<DocumentVersion, "id" | "name">): Promise<void> {
  const store = useStudioDocumentStore.getState();
  await store.flushSave(docId);
  await documentApi.createVersion(docId, { kind: "auto", name: `'${version.name}'로 되돌리기 전`, reason: "되돌리기 전" });
  const snapshot = await getVersionDocument(docId, version.id);
  const current = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
  const label = `'${version.name}' 버전으로 되돌리기`;
  useStudioDocumentStore.getState().updateDoc(
    docId,
    (prev) => ({ ...snapshot, docId: prev.docId, revision: prev.revision, projectId: prev.projectId ?? snapshot.projectId }),
    { history: true, label, change: { slotIds: current ? differingSlotIds(current, snapshot) : [], author: "human", label } },
  );
  await useStudioDocumentStore.getState().flushSave(docId);
  await useVersionsStore.getState().load(docId);
}

/** 쪽에 들어 있는 칸 (머리말 · 꼬리말 포함). */
export const pageSlotIds = (doc: Pick<VDocDocument, "pages">, pageId: string) => {
  const page = doc.pages.find((p) => p.pageId === pageId);
  return page ? [...iterPageSlotIds(page)] : [];
};

/**
 * 버전 ↔ 지금 비교를 가운데에 연다. 왼쪽(이전)은 그 버전 문서 전체, 오른쪽은 지금.
 * `pageId` 를 주면 그 쪽만, `slotId` 를 주면 그 곳부터.
 */
export async function openVersionCompare(
  docId: string,
  version: Pick<DocumentVersion, "id" | "name" | "at" | "kind">,
  opts: { pageId?: string; slotId?: string } = {},
): Promise<void> {
  const snapshot = await getVersionDocument(docId, version.id);
  const current = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
  if (!current) return;
  let ids = differingSlotIds(snapshot, current);
  if (opts.pageId) {
    const inPage = new Set([...pageSlotIds(snapshot, opts.pageId), ...pageSlotIds(current, opts.pageId)]);
    ids = ids.filter((id) => inPage.has(id));
  }
  const pageLabel = opts.pageId
    ? (current.pages.find((p) => p.pageId === opts.pageId) ?? snapshot.pages.find((p) => p.pageId === opts.pageId))?.pageLabel
    : undefined;
  useActiveDiffStore.getState().openDiff({
    type: "version",
    pageId: opts.pageId,
    slotId: opts.slotId,
    diffId: `version-${version.id}${opts.pageId ? `-${opts.pageId}` : ""}`,
    label: `'${version.name}' 이후 바뀐 것${pageLabel ? ` · ${pageLabel}` : ""}`,
    beforeSlots: Object.fromEntries(ids.map((id) => [id, visibleContent(snapshot, id)])),
    afterSlots: Object.fromEntries(ids.map((id) => [id, visibleContent(current, id)])),
    changedSlotIds: ids,
    slotLabels: Object.fromEntries(ids.map((id) => [id, current.slots[id]?.label ?? snapshot.slots[id]?.label ?? "칸"])),
    meta: { at: version.at },
    revertible: true,
    beforeDoc: snapshot,
    version: { id: version.id, name: version.name, at: version.at, kind: version.kind },
  });
}

/** 쪽 하나만 그 버전 모습으로 (지운 쪽이면 다시 넣는다). */
export function restorePageFromVersion(docId: string, snapshot: VDocDocument, pageId: string, versionName: string): boolean {
  const page = snapshot.pages.find((p) => p.pageId === pageId);
  const label = `${page?.pageLabel ?? "쪽"}을 '${versionName}' 버전으로 되돌리기`;
  return useStudioDocumentStore.getState().updateDoc(docId, (doc) => restorePageFrom(doc, snapshot, pageId), {
    history: true,
    label,
    change: { slotIds: page ? [...iterPageSlotIds(page)] : [], author: "human", label },
  });
}

export async function renameVersion(docId: string, versionId: string, patch: { name?: string; note?: string }) {
  await documentApi.updateVersion(docId, versionId, patch);
  await useVersionsStore.getState().load(docId);
}

export async function removeVersion(docId: string, versionId: string) {
  await documentApi.removeVersion(docId, versionId);
  snapshotCache.delete(`${docId}/${versionId}`);
  await useVersionsStore.getState().load(docId);
}

/** 버전 안 문서를 불러와 둔다 (없으면 null, 불러오는 동안도 null). */
export function useVersionDocument(docId: string | null | undefined, versionId: string | null | undefined): VDocDocument | null {
  const [doc, setDoc] = useState<VDocDocument | null>(null);
  useEffect(() => {
    setDoc(null);
    if (!docId || !versionId) return;
    let alive = true;
    getVersionDocument(docId, versionId).then(
      (d) => alive && setDoc(d),
      () => alive && setDoc(null),
    );
    return () => {
      alive = false;
    };
  }, [docId, versionId]);
  return doc;
}
