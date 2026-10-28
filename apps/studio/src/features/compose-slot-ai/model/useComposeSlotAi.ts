import {
  synthesizeGroundedSlotFallback,
  type SynthesizeSlotParams,
} from "@vibe/ai-composer";

import { composerApi } from "../api/composerApi";

export function useComposeSlotAi() {
  const synthesizeSlotContent = async (
    params: SynthesizeSlotParams
  ): Promise<string> => {
    const { slot, chunks, prompt, presetId } = params;
    try {
      const response = await composerApi.composeSlot({
        slotId: slot.slotId,
        slotLabel: slot.label,
        currentContent: slot.content,
        prompt,
        presetId,
        backdata: chunks,
        constraints: slot.constraints,
      });
      if (response.html) {
        return response.html;
      }
    } catch {
      // Fallback to local deterministic grounded synthesis if backend is offline
    }
    return synthesizeGroundedSlotFallback(params);
  };

  return {
    synthesizeSlotContent,
  };
}

