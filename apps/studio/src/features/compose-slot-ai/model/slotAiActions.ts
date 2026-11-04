import type { SlotAiAction } from "@vibe/slot-editor";

const SLOT_AI_ACTION_PROMPTS: Record<SlotAiAction, string> = {
  expand: "선택한 부분을 더 상세하게 확장해줘",
  summarize: "선택한 부분을 간결하게 요약해줘",
  translate: "선택한 부분을 영어로 번역해줘",
  grammar: "선택한 부분의 문법과 맞춤법을 수정해줘",
  tone: "선택한 부분을 더 자연스럽고 전문적인 어투로 수정해줘",
};

const SELECTION_EXCERPT_LIMIT = 200;

/** 슬롯 편집기의 선택 영역 AI 바 → 인라인 작성기에 넣을 프롬프트. */
export function buildSlotAiActionPrompt(action: SlotAiAction, selectedText: string): string {
  return `${SLOT_AI_ACTION_PROMPTS[action]}: "${selectedText.slice(0, SELECTION_EXCERPT_LIMIT)}"`;
}
