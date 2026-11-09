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

export const slotComposerApi = {
  /** 슬롯 하나의 AI 초안. `signal` 로 요청을 중단할 수 있다. */
  composeSlot: (payload: ComposeSlotApiRequest, signal?: AbortSignal) =>
    httpClient.post<ComposeSlotApiResponse>("/api/ai/compose", payload, { signal }),
};

