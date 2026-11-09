/**
 * 지식 덱 ↔ AI Composer 연결.
 *
 * - 컨텍스트: 체크된(에이전트 참조 활성화) 덱은 Composer 메시지마다 자동 첨부된다 (kind="deck").
 *   서버는 이 첨부를 보고 `knowledge.*` 서버 도구와 탐색 절차 스킬을 켠다. 첨부 본문(섹션 지도)은 서버가 채운다.
 * - 화면 요소: 답변 속 출처 링크 `vdoc:kcard/<deckId>:<cardId>` 를 누르면 카드 미리보기가 열린다.
 */
import type { ContextProvider, ContextRef, EntityInfo, EntityResolver } from "@vibe/ai-kernel";

import { useEvidenceFocusStore } from "@/entities/evidence";
import { isDeckUsable, type KnowledgeDeck, useKnowledgeDeckStore } from "@/entities/knowledge-deck";

export const DECK_CONTEXT_KIND = "deck";
export const CARD_ENTITY_KIND = "kcard";

/**
 * 덱 첨부 본문 — 서버가 섹션 지도로 바꿔 채운다. 표식 줄 두 개만 실어 보낸다:
 *   builtAt     덱이 다시 색인되면 서버가 지도를 새로 보낸다 (같은 대화라도)
 *   focusCards  지금 고른 칸의 근거 카드 — 서버가 "우선 카드" 로 먼저 보게 한다
 */
function deckContextContent(deck: KnowledgeDeck): string {
  const focus = useEvidenceFocusStore.getState().focusCards[deck.id] ?? [];
  return [
    `(지식 덱 ${deck.id} — 섹션 지도는 서버가 채운다)`,
    deck.builtAt ? `builtAt: ${deck.builtAt}` : "",
    focus.length ? `focusCards: ${focus.join(", ")}` : "",
    deck.selectedSections?.length ? `sections: ${deck.selectedSections.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function deckContextRef(deck: KnowledgeDeck): ContextRef {
  const cards = deck.stat.cardsCount ?? deck.stat.topicsCount;
  return {
    kind: DECK_CONTEXT_KIND,
    id: deck.id,
    label: deck.title,
    // 서버가 섹션 지도로 바꿔 채운다 — 비워 두면 보내기 직전 resolve 단계를 다시 타므로 표식만 둔다
    content: deckContextContent(deck),
    hint: `${deck.selectedSections?.length ? `고른 섹션 ${deck.selectedSections.length}/` : ""}${deck.stat.sectionsCount ?? 0}섹션 · ${cards}카드 · 표 ${deck.stat.tablesCount} · 그림 ${deck.stat.figuresCount ?? 0}`,
    access: "read",
    role: "reference",
  };
}

const usableDecks = () => useKnowledgeDeckStore.getState().decks.filter(isDeckUsable);

export const DECK_CONTEXT_PROVIDER: ContextProvider = {
  id: "knowledge-decks",
  label: "지식 덱",
  auto: true,
  current: () => usableDecks().map(deckContextRef),
  search: (query) =>
    useKnowledgeDeckStore
      .getState()
      .decks.filter((d) => !!d.builtAt)
      .filter((d) => !query || d.title.toLowerCase().includes(query) || d.tags.some((t) => t.toLowerCase().includes(query)))
      .slice(0, 6)
      .map(deckContextRef),
};

function parseCardId(id: string): { deckId: string; cardId: string } | null {
  const m = /^([\w-]+):(C-\d{2}-\d{2})$/.exec(id);
  return m ? { deckId: m[1], cardId: m[2] } : null;
}

export const CARD_ENTITY_RESOLVER: EntityResolver = {
  id: "knowledge-cards",
  resolve(id: string, kind?: string): EntityInfo | null {
    if (kind && kind !== CARD_ENTITY_KIND) return null;
    const parsed = parseCardId(id);
    if (!parsed) return null;
    const deck = useKnowledgeDeckStore.getState().decks.find((d) => d.id === parsed.deckId);
    return {
      kind: CARD_ENTITY_KIND,
      id,
      label: parsed.cardId,
      detail: deck ? deck.title : "지식 덱 카드",
      reveal: () => useKnowledgeDeckStore.getState().openCardPreview(parsed.deckId, parsed.cardId),
      highlight: () => undefined,
      toContext: deck ? () => deckContextRef(deck) : undefined,
    };
  },
};
