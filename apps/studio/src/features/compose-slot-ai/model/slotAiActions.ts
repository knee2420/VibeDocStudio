import type { AiAction } from "@vibe/ai-kernel";
import type { SlotAiAction } from "@vibe/slot-editor";

const SELECTION_EXCERPT_LIMIT = 200;

const quote = (text?: string) => (text ? `: "${text.slice(0, SELECTION_EXCERPT_LIMIT)}"` : "");

/**
 * 슬롯 AI 액션 — 인라인 카드의 빠른 지시, 선택 영역 AI 바, Composer `/명령` 이 같은 정의를 쓴다.
 * surfaces: `slot-richtext`(슬롯 인라인 카드) · `slot-selection`(선택 영역 바) · `composer`(`/` 명령)
 */
export const SLOT_AI_ACTIONS: AiAction[] = [
  {
    id: "ground-summary",
    label: "백데이터 기반 핵심 요약",
    icon: "file-text",
    instruction: "연결된 백데이터 원문을 근거로 핵심 내용만 명확하게 요약해 채워줘",
    surfaces: ["slot-richtext", "composer"],
  },
  {
    id: "bullet-3",
    label: "3줄 개조식",
    icon: "list-checks",
    instruction: "이 슬롯의 공간 제약에 맞춰 3줄 이내 개조식 불릿 리스트로 압축해줘",
    surfaces: ["slot-richtext", "composer"],
  },
  {
    id: "executive-tone",
    label: "공문서 전문 톤",
    icon: "wand",
    instruction: "수치와 핵심 키워드를 굵게 강조하고 의사결정권자용 간결한 문체로 다듬어줘",
    surfaces: ["slot-richtext", "composer"],
  },
  {
    id: "compact-fit",
    label: "줄 수 제약에 맞게 축약",
    icon: "minimize",
    instruction: "레이아웃이 절대 넘치지 않도록 핵심 결론 1~2문장으로 고밀도 축약해줘",
    surfaces: ["slot-richtext", "composer"],
  },
  {
    id: "expand",
    label: "확장",
    instruction: ({ selectionText }) => `선택한 부분을 더 상세하게 확장해줘${quote(selectionText)}`,
    surfaces: ["slot-selection"],
  },
  {
    id: "summarize",
    label: "요약",
    instruction: ({ selectionText }) => `선택한 부분을 간결하게 요약해줘${quote(selectionText)}`,
    surfaces: ["slot-selection", "composer"],
  },
  {
    id: "translate",
    label: "영어로 번역",
    instruction: ({ selectionText }) => `선택한 부분을 영어로 번역해줘${quote(selectionText)}`,
    surfaces: ["slot-selection", "composer"],
  },
  {
    id: "grammar",
    label: "문법 · 맞춤법",
    instruction: ({ selectionText }) => `선택한 부분의 문법과 맞춤법을 수정해줘${quote(selectionText)}`,
    surfaces: ["slot-selection", "composer"],
  },
  {
    id: "tone",
    label: "자연스러운 전문 어투",
    instruction: ({ selectionText }) => `선택한 부분을 더 자연스럽고 전문적인 어투로 수정해줘${quote(selectionText)}`,
    surfaces: ["slot-selection"],
  },
];

/** 슬롯 편집기의 선택 영역 AI 바 → 인라인 카드에 넣을 지시. */
export function buildSlotAiActionPrompt(action: SlotAiAction, selectedText: string): string {
  const def = SLOT_AI_ACTIONS.find((a) => a.id === action);
  if (!def) return selectedText;
  return typeof def.instruction === "function" ? def.instruction({ selectionText: selectedText }) : def.instruction;
}
