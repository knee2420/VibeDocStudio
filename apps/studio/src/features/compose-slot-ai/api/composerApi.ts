import type { BackdataChunk, SlotConstraints } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface ComposeSlotApiRequest {
  slotId: string;
  slotLabel: string;
  currentContent: string;
  prompt: string;
  presetId?: string;
  backdata: BackdataChunk[];
  constraints?: SlotConstraints;
}

export interface ComposeSlotApiResponse {
  slotId: string;
  html: string;
  boundaryGuarantee: string;
}

export const composerApi = {
  async composeSlot(
    payload: ComposeSlotApiRequest
  ): Promise<ComposeSlotApiResponse> {
    return httpClient.post<ComposeSlotApiResponse>("/api/ai/compose", payload);
  },
};

