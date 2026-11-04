import type { VDocDocument } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export type FidelityMode = "fast" | "balanced" | "strict";

export interface ScaffoldDocumentResponse {
  docId: string;
  title: string;
  totalPages: number;
  checkedBlocks: number;
  checkedSlots: number;
  document: VDocDocument;
  fidelityMode?: string;
  agentRun?: Record<string, unknown>;
}

export interface IngestPdfResponse {
  catalogId: string;
  title: string;
  checkedTables: number;
  checkedSlots: number;
  document: VDocDocument;
}

const IMPORTED_CATALOG_CATEGORY = "PDF 임포트 양식";

/** `/api/catalog` — PDF 를 편집 캔버스 문서(scaffold)나 카탈로그 양식(ingest)으로 바꾼다. */
export const importPdfApi = {
  scaffoldCanvas: (file: File, title: string, fidelityMode: FidelityMode) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("fidelity_mode", fidelityMode);
    return httpClient.post<ScaffoldDocumentResponse>("/api/catalog/scaffold", form);
  },

  ingestCatalog: (file: File, title: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("category", IMPORTED_CATALOG_CATEGORY);
    return httpClient.post<IngestPdfResponse>("/api/catalog/ingest-pdf", form);
  },
};
