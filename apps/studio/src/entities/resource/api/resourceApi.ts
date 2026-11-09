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

  /** 브라우저 파일 탐색기에서 선택한 파일 업로드 및 인입 */
  uploadFile: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/upload-file`, formData);
  },

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

  /** 기 등록된 로컬 디렉토리 원본 재스캔 및 동기화 */
  rescanSession: (projectId: string) =>
    httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/rescan`, {}),

  /** 프로젝트 세션에서 해당 리소스 연결 해제 (로컬 원본 보존) */
  decoupleItem: (projectId: string, itemId: string) =>
    httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/decouple`, {
      itemId,
    }),

  /** 여러 리소스 항목 일괄 연결 해제 (로컬 원본 보존) */
  batchDecouple: (projectId: string, itemIds: string[]) =>
    httpClient.post<ResourceSessionState>(`/api/resources/${projectId}/batch-decouple`, {
      itemIds,
    }),
};
