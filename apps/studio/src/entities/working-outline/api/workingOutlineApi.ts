import type { VDocDocument, WorkingOutlineDocument } from "@vibe/vdoc-schema";
import { httpClient } from "@/shared/api";

export interface CompilePreviewResult {
  projectId: string;
  dirty: boolean;
  documents: VDocDocument[];
}

export interface CommitOutlineApiResult {
  projectId: string;
  documents: VDocDocument[];
  outline: WorkingOutlineDocument;
}

const basePath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/working-outline`;

export const workingOutlineApi = {
  get: (projectId: string, refresh = false) =>
    httpClient.get<WorkingOutlineDocument>(`${basePath(projectId)}${refresh ? "?refresh=true" : ""}`),

  save: (projectId: string, outline: WorkingOutlineDocument) =>
    httpClient.put<WorkingOutlineDocument>(basePath(projectId), {
      revision: outline.revision,
      baseDocRevisions: outline.baseDocRevisions,
      dirty: outline.dirty,
      nodes: outline.nodes,
    }),

  compilePreview: (projectId: string, outline?: WorkingOutlineDocument) =>
    httpClient.post<CompilePreviewResult>(`${basePath(projectId)}/compile-preview`, outline ? { outline } : {}),

  commit: (projectId: string, outline?: WorkingOutlineDocument) =>
    httpClient.post<CommitOutlineApiResult>(`${basePath(projectId)}/commit`, outline ? { outline } : {}),
};
