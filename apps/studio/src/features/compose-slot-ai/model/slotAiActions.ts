import type { AiAction } from "@vibe/ai-kernel";
import type { SlotAiAction } from "@vibe/slot-editor";
import inline from "@vibe/harness-packs/authoring/inline-actions.json";

const quote = (text?: string) =>
  text ? inline.selection.quote.replace("{text}", () => text.slice(0, inline.selection.excerptLimit)) : "";

/**
 * 슬롯 AI 액션 — 인라인 카드의 빠른 지시, 선택 영역 AI 바, Composer `/명령` 이 같은 정의를 쓴다.
 * 지시문은 하네스 authoring 팩(`inline-actions.json`)이 정본이다. `{selection}` 은 선택한 글 발췌로 바뀐다.
 * surfaces: `slot-richtext`(슬롯 인라인 카드) · `slot-selection`(선택 영역 바) · `composer`(`/` 명령)
 */
export const SLOT_AI_ACTIONS: AiAction[] = inline.slot.map(({ instruction, ...action }) => ({
  ...action,
  instruction: instruction.includes("{selection}")
    ? ({ selectionText }: { selectionText?: string }) => instruction.replace("{selection}", () => quote(selectionText))
    : instruction,
}));

/** 슬롯 편집기의 선택 영역 AI 바 → 인라인 카드에 넣을 지시. */
export function buildSlotAiActionPrompt(action: SlotAiAction, selectedText: string): string {
  const def = SLOT_AI_ACTIONS.find((a) => a.id === action);
  if (!def) return selectedText;
  return typeof def.instruction === "function" ? def.instruction({ selectionText: selectedText }) : def.instruction;
}
