import type { StagedAiChange, VProjectManifest } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface PhaseComposeApiResponse {
  runId: string;
  phase: "storylining" | "templating" | "drafting";
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

export const phaseComposerApi = {
  async fetchProjects(): Promise<VProjectManifest[]> {
    return httpClient.get<VProjectManifest[]>("/api/projects");
  },

  async composeStorylinePhase1(payload: {
    projectId: string;
    prompt: string;
    referenceNodes: Record<string, unknown>[];
    targetParentId?: string | null;
  }): Promise<PhaseComposeApiResponse> {
    return httpClient.post<PhaseComposeApiResponse>(
      "/api/ai/phase1/storyline",
      payload
    );
  },

  async recommendTemplatesPhase2(payload: {
    projectId: string;
    docId: string;
    nodes: Record<string, unknown>[];
    tuningPrompt?: string;
  }): Promise<PhaseComposeApiResponse> {
    return httpClient.post<PhaseComposeApiResponse>(
      "/api/ai/phase2/templates",
      payload
    );
  },

  async cancelRun(
    runId: string,
    reason = "user_aborted"
  ): Promise<CancelRunApiResponse> {
    return httpClient.post<CancelRunApiResponse>(
      `/api/ai/runs/${runId}/cancel`,
      { reason }
    );
  },
};

