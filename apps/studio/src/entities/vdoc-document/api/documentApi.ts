import type { VDocDocument } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

interface DocumentEnvelope {
  docId: string;
  document: VDocDocument;
}

const path = (docId: string) => `/api/documents/${encodeURIComponent(docId)}`;

/** `/api/documents` — `.vdoc` 작업 문서의 서버 원장. */
export const documentApi = {
  get: async (docId: string) => (await httpClient.get<DocumentEnvelope>(path(docId))).document,

  save: async (doc: VDocDocument) =>
    (await httpClient.put<DocumentEnvelope>(path(doc.docId), { document: doc })).document,
};
