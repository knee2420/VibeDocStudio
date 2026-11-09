import { aiRuntime } from "@/shared/ai";

import { CARD_ENTITY_RESOLVER, DECK_CONTEXT_PROVIDER } from "./model/deckAi";

/** 지식 덱 컨텍스트(자동 첨부 · @멘션)와 카드 링크 해석기를 AI 런타임에 등록한다. */
export function registerKnowledgeDeckAi(): () => void {
  const offs = [aiRuntime.contexts.register(DECK_CONTEXT_PROVIDER), aiRuntime.entities.register(CARD_ENTITY_RESOLVER)];
  return () => offs.forEach((off) => off());
}

export { attachDecksToComposer, attachDeckToComposer } from "./model/attach";
export { CARD_ENTITY_KIND, DECK_CONTEXT_KIND, deckContextRef } from "./model/deckAi";
export { useKnowledgeDeckBootstrap } from "./model/useKnowledgeDeckBootstrap";
export { DeckCardPreview } from "./ui/DeckCardPreview";
