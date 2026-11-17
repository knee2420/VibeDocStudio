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

/** 문서 버전 — 그 시점 문서 전체가 서버에 보관돼 있어 통째로 되돌릴 수 있다. */
export interface DocumentVersion {
  id: string;
  /** named: 사람이 이름 붙인 버전 · auto: 자동 보관 지점 (쉬었다 다시 고치기 직전 · 되돌리기 직전) */
  kind: "named" | "auto";
  name: string;
  note: string;
  /** 자동 보관 이유 ("편집 시작 전" · "되돌리기 전") */
  reason: string;
  /** 이 버전에 담긴 서버 저장 번호 */
  rev: number;
  at: string;
  pageCount: number;
  /** 블록 수 (예전 버전에는 없다) */
  blockCount?: number;
  /** 글자 수 (공백 제외) */
  chars: number;
}

export interface DocumentSummary {
  docId: string;
  title: string;
  status: string;
  updatedAt: string;
  pageCount: number;
  slotCount: number;
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

  /** 빈 문서 한 편을 만들어 프로젝트 문서 목록에 넣는다 (지면 · 장르 · 만든 이). */
  create: async (input: {
    projectId: string;
    title: string;
    surface?: "paged" | "scroll";
    surfaceWidth?: number;
    genre?: string;
  }) => (await httpClient.post<DocumentEnvelope>("/api/documents", input)).document,

  rename: async (docId: string, title: string) =>
    (await httpClient.patch<DocumentEnvelope>(`${path(docId)}/title`, { title })).document,

  duplicate: async (docId: string, opts: { title?: string; projectId?: string } = {}) =>
    (await httpClient.post<DocumentEnvelope>(`${path(docId)}/duplicate`, opts)).document,

  /** 서버에 있는 문서 전부 (불러오기 목록). */
  list: async () => httpClient.get<DocumentSummary[]>("/api/documents"),

  /** 이미 있는 문서를 프로젝트 문서 목록에 넣는다. */
  link: async (docId: string, projectId: string) =>
    (await httpClient.post<DocumentEnvelope>(`${path(docId)}/link`, { projectId })).document,

  /** 문서를 지우고 그 문서를 가진 프로젝트 목록에서도 뺀다. */
  remove: async (docId: string) =>
    httpClient.delete<{ docId: string; unlinkedProjects: string[] }>(path(docId)),

  revisions: async (docId: string, opts: { slotId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.slotId) q.set("slotId", opts.slotId);
    if (opts.limit) q.set("limit", String(opts.limit));
    return (await httpClient.get<{ docId: string; revisions: RevisionEntry[] }>(`${path(docId)}/revisions?${q}`)).revisions;
  },

  /** 버전 목록 (최신이 앞). */
  versions: async (docId: string) =>
    (await httpClient.get<{ docId: string; versions: DocumentVersion[] }>(`${path(docId)}/versions`)).versions,

  /** 지금 서버에 저장된 문서 전체를 버전으로 보관한다 (먼저 저장을 끝내고 부른다). */
  createVersion: async (docId: string, input: { name?: string; note?: string; kind?: "named" | "auto"; reason?: string }) =>
    httpClient.post<DocumentVersion>(`${path(docId)}/versions`, input),

  /** 버전 안의 문서 전체. */
  versionDocument: async (docId: string, versionId: string) =>
    (await httpClient.get<{ docId: string; version: DocumentVersion; document: VDocDocument }>(`${path(docId)}/versions/${encodeURIComponent(versionId)}`)).document,

  updateVersion: async (docId: string, versionId: string, patch: { name?: string; note?: string }) =>
    httpClient.patch<DocumentVersion>(`${path(docId)}/versions/${encodeURIComponent(versionId)}`, patch),

  removeVersion: async (docId: string, versionId: string) =>
    httpClient.delete<void>(`${path(docId)}/versions/${encodeURIComponent(versionId)}`),
};
