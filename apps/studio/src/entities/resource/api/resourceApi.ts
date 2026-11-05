import { httpClient } from "@/shared/api";
import type { ResourceItem, ResourceSector, ResourceSessionState } from "@vibe/vdoc-schema";

export interface AiContextBundle {
  totalSources: number;
  sources: Array<{
    id: string;
    title: string;
    type: string;
    snippets: string[];
  }>;
}

export const resourceApi = {
  /** 프로젝트 리소스 세션 조회 */
  getSession: (projectId: string) =>
    httpClient.get<ResourceSessionState>(`/api/resources/${projectId}/session`),

  /** 로컬 디렉토리 덤핑 및 트리 스캔 */
  ingestDirectory: (projectId: string, directoryPath: string) =>
    httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/ingest-directory`, {
      directoryPath,
    }),

  /** 웹 URL 아티클 추가 */
  ingestWebUrl: (projectId: string, url: string, title?: string) =>
    httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/ingest-url`, {
      url,
      title,
    }),

  /** 체크박스 Choice(선택/해제) 토글 */
  toggleChoice: (projectId: string, itemId: string, isChecked: boolean, cascade: boolean = true) =>
    httpClient.patch<ResourceSessionState>(`/api/resources/${projectId}/choice`, {
      itemId,
      isChecked,
      cascade,
    }),

  /** BBox 또는 텍스트 발라낸 섹터 카드 추가 */
  extractSector: (
    projectId: string,
    req: {
      resourceId: string;
      textSnippet: string;
      title?: string;
      page?: number;
      bbox?: [number, number, number, number];
      label?: string;
    }
  ) => httpClient.post<ResourceSector>(`/api/resources/${projectId}/sectors`, req),

  /** AI Composer 컨텍스트 번들 조회 */
  getAiContext: (projectId: string) =>
    httpClient.get<AiContextBundle>(`/api/resources/${projectId}/ai-context`),
};
