import type { OutlinerNode, StagedAiChange } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface PhaseComposeApiResponse {
  runId: string;
  phase: "storylining" | "templating" | "drafting";
  /** 실행 엔진 식별자 (LLM 모델명 또는 규칙 엔진 이름). */
  modelName: string;
  createdAt: string;
  stagedDiffs: StagedAiChange[];
}

export interface CancelRunApiResponse {
  runId: string;
  status: string;
  reason: string;
  cancelledAt: string;
}

export type ReferenceNodePayload = Pick<
  OutlinerNode,
  "nodeId" | "title" | "summary" | "recommendedTemplateId"
> & { sourceProjectId: string };

export type StorylineNodePayload = Pick<
  OutlinerNode,
  "nodeId" | "title" | "summary" | "recommendedTemplateId"
>;

/** `/api/ai` Phase 1 · 2 와 실행 취소. `runId` 는 클라이언트가 먼저 정해 취소에도 같은 값을 쓴다. */
export const phaseComposerApi = {
  composeStorylinePhase1: (
    payload: {
      runId: string;
      projectId: string;
      prompt: string;
      referenceNodes: ReferenceNodePayload[];
      targetParentId?: string | null;
    },
    signal?: AbortSignal
  ) => httpClient.post<PhaseComposeApiResponse>("/api/ai/phase1/storyline", payload, { signal }),

  recommendTemplatesPhase2: (
    payload: {
      runId: string;
      projectId: string;
      docId: string;
      nodes: StorylineNodePayload[];
      tuningPrompt?: string;
    },
    signal?: AbortSignal
  ) => httpClient.post<PhaseComposeApiResponse>("/api/ai/phase2/templates", payload, { signal }),

  cancelRun: (runId: string, reason = "user_aborted") =>
    httpClient.post<CancelRunApiResponse>(`/api/ai/runs/${encodeURIComponent(runId)}/cancel`, {
      reason,
    }),
};
