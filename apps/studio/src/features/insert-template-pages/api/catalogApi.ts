import type { VDocCatalogManifest, VDocDocument } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface CatalogBundleResponse {
  manifest: VDocCatalogManifest;
  document: VDocDocument;
}

interface ScaffoldDocumentResponse {
  docId: string;
  title: string;
  totalPages: number;
  document: VDocDocument;
}

/** `/api/catalog` — 등록된 서식 · 섹터 템플릿 목록, 번들 조회 및 일회용 PDF 템플릿 변환 클라이언트. */
export const catalogApi = {
  list: () => httpClient.get<VDocCatalogManifest[]>("/api/catalog"),

  getBundle: (catalogId: string) =>
    httpClient.get<CatalogBundleResponse>(`/api/catalog/${encodeURIComponent(catalogId)}`),

  scaffoldPdf: (file: File, title: string, fidelityMode: "fast" | "balanced" | "strict" = "balanced") => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("fidelity_mode", fidelityMode);
    return httpClient.post<ScaffoldDocumentResponse>("/api/catalog/scaffold", form);
  },
};
