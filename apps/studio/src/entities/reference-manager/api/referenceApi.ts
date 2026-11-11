import { httpClient } from "@/shared/api";
import { env } from "@/shared/config";

import type {
  ConsensusAdoption,
  ConsensusCard,
  ProjectReferenceBinding,
  ReferenceExtraction,
  ReferenceItem,
  ReferenceLayers,
  ReferencePin,
  ReferencePinKind,
  ReferenceShotsManifest,
} from "../model/types";

const item = (refId: string) => `/api/reference/items/${encodeURIComponent(refId)}`;
const project = (projectId: string) => `/api/reference/projects/${encodeURIComponent(projectId)}`;

export interface CreatePinInput {
  kind: ReferencePinKind;
  page?: number | null;
  bbox?: [number, number, number, number] | null;
  text?: string;
  label?: string;
  note?: string;
  layer?: string;
}

/** `/api/reference` — 레퍼런스 라이브러리 · 핀 · 프로젝트 연결. vdoc 문서 API 와 섞지 않는다. */
export const referenceApi = {
  listItems: () => httpClient.get<ReferenceItem[]>("/api/reference/items"),

  addFile: (file: File, title?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    return httpClient.post<ReferenceItem>("/api/reference/items/file", form);
  },

  addUrl: (url: string, title?: string) =>
    httpClient.post<ReferenceItem>("/api/reference/items/url", { url, title: title ?? "" }),

  rename: (refId: string, title: string) => httpClient.patch<ReferenceItem>(item(refId), { title }),

  remove: (refId: string) => httpClient.delete<{ deleted: boolean }>(item(refId)),

  reanalyze: (refId: string) => httpClient.post<ReferenceItem>(`${item(refId)}/reanalyze`, {}),

  captureLive: (refId: string) => httpClient.post<ReferenceItem>(`${item(refId)}/capture-live`, {}),

  extraction: (refId: string) => httpClient.get<ReferenceExtraction>(`${item(refId)}/extraction`),

  layers: (refId: string) => httpClient.get<ReferenceLayers>(`${item(refId)}/layers`),

  shots: (refId: string) => httpClient.get<ReferenceShotsManifest>(`${item(refId)}/shots`),

  shotUrl: (refId: string, filename: string, cacheBust?: number) =>
    `${env.apiBaseUrl}${item(refId)}/shots/${encodeURIComponent(filename)}${cacheBust ? `?t=${cacheBust}` : ""}`,

  /** 원본 바이트 주소 (PDF 뷰어 · 이미지 태그가 직접 읽는다). */
  sourceUrl: (refId: string) => `${env.apiBaseUrl}${item(refId)}/source`,

  listPins: (refId: string) => httpClient.get<ReferencePin[]>(`${item(refId)}/pins`),

  addPin: (refId: string, input: CreatePinInput) => httpClient.post<ReferencePin>(`${item(refId)}/pins`, input),

  updatePin: (refId: string, pinId: string, patch: { label?: string; note?: string; layer?: string }) =>
    httpClient.patch<ReferencePin>(`${item(refId)}/pins/${encodeURIComponent(pinId)}`, patch),

  removePin: (refId: string, pinId: string) =>
    httpClient.delete<{ deleted: boolean }>(`${item(refId)}/pins/${encodeURIComponent(pinId)}`),

  binding: (projectId: string) => httpClient.get<ProjectReferenceBinding>(project(projectId)),

  bind: (projectId: string, refId: string) =>
    httpClient.put<ProjectReferenceBinding>(`${project(projectId)}/items/${encodeURIComponent(refId)}`, {}),

  unbind: (projectId: string, refId: string) =>
    httpClient.delete<ProjectReferenceBinding>(`${project(projectId)}/items/${encodeURIComponent(refId)}`),

  /** 해석 카드 확정 (AI 제안을 그대로 또는 고쳐서) — 프로젝트 합의로 저장된다. */
  confirmCard: (projectId: string, refId: string, card: Omit<ConsensusCard, "status" | "by" | "at" | "measures" | "refId">) =>
    httpClient.post<ConsensusCard>(`${project(projectId)}/items/${encodeURIComponent(refId)}/consensus`, card),

  updateCard: (
    projectId: string,
    refId: string,
    cardId: string,
    patch: { adoption?: ConsensusAdoption; reading?: string; chooseAlternative?: number },
  ) => httpClient.patch<ConsensusCard>(`${project(projectId)}/items/${encodeURIComponent(refId)}/consensus/${encodeURIComponent(cardId)}`, patch),

  removeCard: (projectId: string, refId: string, cardId: string) =>
    httpClient.delete<{ deleted: boolean }>(`${project(projectId)}/items/${encodeURIComponent(refId)}/consensus/${encodeURIComponent(cardId)}`),

  updateBinding: (projectId: string, refId: string, patch: { enabled?: boolean; layers?: Record<string, boolean> }) =>
    httpClient.patch<ProjectReferenceBinding>(`${project(projectId)}/items/${encodeURIComponent(refId)}`, {
      enabled: patch.enabled,
      layers: patch.layers ?? {},
    }),
};
