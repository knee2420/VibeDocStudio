import type { VDocNamedVersion } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { newId } from "@/shared/lib";

/** 기본 이름: "11월 16일 버전" */
export const defaultVersionName = (now = new Date()) =>
  `${now.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 버전`;

/**
 * 지금 상태에 이름을 붙여 기준점으로 남긴다 (구글 문서 "현재 버전 이름 지정" · 제출본).
 * - "바뀐 곳" 기준도 여기로 옮긴다 (예전 Commit & Push 와 같은 동작).
 * - 버전은 문서 안(`versions`)에 저장되어 서버에 같이 남는다.
 * - `rev` 는 이 버전을 담아 보내는 다음 저장 번호 — 그때까지의 편집이 모두 이 버전에 들어간다.
 */
export function saveNamedVersion(docId: string, name: string, note?: string): VDocNamedVersion | null {
  const store = useStudioDocumentStore.getState();
  store.commitAllDocChanges();
  const doc = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
  if (!doc) return null;
  const version: VDocNamedVersion = {
    id: newId("ver"),
    name: name.trim() || defaultVersionName(),
    ...(note?.trim() ? { note: note.trim() } : {}),
    rev: (doc.revision ?? 0) + 1,
    at: new Date().toISOString(),
    pages: doc.pages.map((p) => ({ pageId: p.pageId, label: p.pageLabel })),
  };
  const ok = store.updateDoc(docId, (prev) => ({ ...prev, versions: [...(prev.versions ?? []), version] }), {
    history: false,
    label: `버전 '${version.name}' 저장`,
  });
  return ok ? version : null;
}

/** 버전 이름 · 메모 고치기 · 지우기 (기록 자체는 그대로). */
export function updateNamedVersion(docId: string, id: string, patch: Partial<Pick<VDocNamedVersion, "name" | "note">> | null) {
  useStudioDocumentStore.getState().updateDoc(
    docId,
    (prev) => ({
      ...prev,
      versions: patch
        ? (prev.versions ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v))
        : (prev.versions ?? []).filter((v) => v.id !== id),
    }),
    { history: false, label: patch ? "버전 이름 바꾸기" : "버전 표시 지우기" },
  );
}
