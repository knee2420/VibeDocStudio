import type {
  OutlineCommand,
  VProjectManifest,
} from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface OutlineCommandResponse {
  project: VProjectManifest;
  affectedNodeId: string | null;
}

const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

/** `/api/projects` — 프로젝트 매니페스트의 서버 원장. */
export const projectApi = {
  list: () => httpClient.get<VProjectManifest[]>("/api/projects"),

  /** 매니페스트 전체 교체 (Undo 시점으로의 복원). */
  replace: (project: VProjectManifest) =>
    httpClient.put<VProjectManifest>(path(project.projectId), project),

  command: (projectId: string, command: OutlineCommand) =>
    httpClient.post<OutlineCommandResponse>(`${path(projectId)}/commands`, command),
};
