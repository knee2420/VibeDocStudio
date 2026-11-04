import type { SynthesizeSlotParams } from "@vibe/ai-composer";

import { slotComposerApi } from "@/entities/slot";

/**
 * 인라인 작성기의 생성 함수. 서버 AI 결과만 돌려주며, 서버가 실패하면 예외를 그대로 올려
 * 작성기가 오류를 보여주게 한다 (로컬 합성 결과를 AI 결과처럼 내보내지 않는다).
 */
export async function synthesizeSlotContent({ slot, chunks, prompt, presetId }: SynthesizeSlotParams): Promise<string> {
  const response = await slotComposerApi.composeSlot({
    slotId: slot.slotId,
    slotLabel: slot.label,
    currentContent: slot.content,
    prompt,
    presetId,
    backdata: chunks,
    constraints: slot.constraints,
  });
  if (!response.html) throw new Error("AI 가 빈 결과를 돌려주었습니다.");
  return response.html;
}
