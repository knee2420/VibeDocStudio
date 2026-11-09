import type { VDocDocument } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

interface DocumentEnvelope {
  docId: string;
  document: VDocDocument;
}

/** 이번 저장에 들어간 변경의 출처 — 서버 개정 이력에 슬롯별 작성자로 남는다. 없으면 사람의 편집. */
export interface ChangeNote {
  slotIds: string[];
  variables?: string[];
  author: "human" | "ai";
  harnessId?: string;
  runId?: string;
  label?: string;
}

export interface RevisionSlotChange {
  slotId: string;
  label: string;
  before: string;
  after: string;
  author: "human" | "ai";
  harnessId?: string | null;
  runId?: string | null;
}

export interface RevisionEntry {
  rev: number;
  at: string;
  since?: string;
  author: "human" | "ai";
  label: string;
  harnessId?: string | null;
  runId?: string | null;
  slots: RevisionSlotChange[];
  variables: { key: string; before?: string | null; after?: string | null; author: string }[];
}

const path = (docId: string) => `/api/documents/${encodeURIComponent(docId)}`;

/** `/api/documents` — `.vdoc` 작업 문서의 서버 원장. */
export const documentApi = {
  get: async (docId: string) => (await httpClient.get<DocumentEnvelope>(path(docId))).document,

  /** `baseRevision` 이 서버 버전과 다르면 409 (다른 탭 · 다른 곳에서 먼저 저장). */
  save: async (doc: VDocDocument, opts: { baseRevision?: number; changes?: ChangeNote[] } = {}) =>
    (
      await httpClient.put<DocumentEnvelope>(path(doc.docId), {
        document: doc,
        baseRevision: opts.baseRevision ?? null,
        changes: opts.changes ?? [],
      })
    ).document,

  revisions: async (docId: string, opts: { slotId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.slotId) q.set("slotId", opts.slotId);
    if (opts.limit) q.set("limit", String(opts.limit));
    return (await httpClient.get<{ docId: string; revisions: RevisionEntry[] }>(`${path(docId)}/revisions?${q}`)).revisions;
  },
};
