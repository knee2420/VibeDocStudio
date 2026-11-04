import { aiRuntime } from "@/shared/ai";

import { SLOT_AI_ACTIONS } from "./model/slotAiActions";

export { buildSlotAiActionPrompt, SLOT_AI_ACTIONS } from "./model/slotAiActions";
export { SlotInlineComposerHost } from "./ui/SlotInlineComposerHost";
export type { SlotInlineComposerHostProps } from "./ui/SlotInlineComposerHost";

/** 슬롯 AI 액션을 런타임 액션 레지스트리에 등록 (인라인 카드 · 선택 바 · Composer `/명령` 공용). */
export function registerSlotAiActions(): () => void {
  return aiRuntime.actions.registerAll(SLOT_AI_ACTIONS);
}
