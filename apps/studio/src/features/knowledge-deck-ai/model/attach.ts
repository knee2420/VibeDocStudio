import type { KnowledgeDeck } from "@/entities/knowledge-deck";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { composerController } from "@/shared/ai";

import { deckContextRef } from "./deckAi";

/** 덱을 Composer 입력창에 첨부 칩으로 넣는다 (체크하지 않은 덱도 이번 메시지에만 쓰고 싶을 때). */
export function attachDecksToComposer(decks: KnowledgeDeck[], prompt?: string): void {
  if (decks.length === 0) return;
  useWorkspaceLayoutStore.getState().openRightPanel("composer");
  composerController.attach(decks.map(deckContextRef), { prompt });
}

export function attachDeckToComposer(deck: KnowledgeDeck, prompt?: string): void {
  attachDecksToComposer([deck], prompt);
}
