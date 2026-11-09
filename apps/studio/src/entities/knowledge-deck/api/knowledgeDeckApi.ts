import { httpClient } from "@/shared/api";
import { env } from "@/shared/config";

import type {
  DeckCardDetail,
  DeckOverview,
  IndexJob,
  JobEvent,
  KnowledgeDeck,
  KnowledgeDeckListResponse,
  PromoteOptions,
} from "../model/types";

const enc = encodeURIComponent;

export const knowledgeDeckApi = {
  listDecks: (projectId: string) => httpClient.get<KnowledgeDeckListResponse>(`/api/knowledge/${enc(projectId)}`),

  /** 원본 → 지식 덱 색인 (비동기). 곧바로 `queued` 덱과 작업을 돌려준다. */
  promoteToDeck: (projectId: string, req: PromoteOptions) =>
    httpClient.post<{ deck: KnowledgeDeck; job: IndexJob }>(`/api/knowledge/${enc(projectId)}/promote`, {
      title: req.title,
      itemIds: req.itemIds ?? [],
      sourcePaths: req.sourcePaths,
      tags: req.tags ?? [],
      depth: req.depth ?? "enriched",
      profile: req.profile,
    }),

  reindex: (projectId: string, deckId: string, depth?: KnowledgeDeck["depth"]) =>
    httpClient.post<{ deck: KnowledgeDeck; job: IndexJob }>(`/api/knowledge/${enc(projectId)}/${enc(deckId)}/reindex`, { depth }),

  cancelJob: (jobId: string) => httpClient.post<IndexJob>(`/api/knowledge/jobs/${enc(jobId)}/cancel`, {}),

  getJob: (jobId: string) => httpClient.get<IndexJob>(`/api/knowledge/jobs/${enc(jobId)}`),

  importDeck: (projectId: string, deckData: Record<string, unknown>) =>
    httpClient.post<KnowledgeDeck>(`/api/knowledge/${enc(projectId)}/import`, { deckData }),

  /** null · 빈 목록 = 전부 */
  selectSections: (projectId: string, deckId: string, sectionIds: string[] | null) =>
    httpClient.post<KnowledgeDeck>(`/api/knowledge/${enc(projectId)}/sections`, { deckId, sectionIds }),
  toggleChoice: (projectId: string, deckId: string, isChecked: boolean) =>
    httpClient.post<KnowledgeDeck>(`/api/knowledge/${enc(projectId)}/toggle`, { deckId, isChecked }),

  getDeck: (projectId: string, deckId: string) => httpClient.get<KnowledgeDeck>(`/api/knowledge/${enc(projectId)}/${enc(deckId)}`),

  deleteDeck: (projectId: string, deckId: string) =>
    httpClient.delete<{ success: boolean; deckId: string }>(`/api/knowledge/${enc(projectId)}/${enc(deckId)}`),

  overview: (deckId: string) => httpClient.get<DeckOverview>(`/api/knowledge/decks/${enc(deckId)}/overview`),

  card: (deckId: string, cardId: string) => httpClient.get<DeckCardDetail>(`/api/knowledge/decks/${enc(deckId)}/cards/${enc(cardId)}`),

  search: (deckId: string, q: string, mode: "lookup" | "grep" = "lookup") =>
    httpClient.get<Record<string, unknown>>(`/api/knowledge/decks/${enc(deckId)}/search?q=${enc(q)}&mode=${mode}`),

  /**
   * 작업 진행 이벤트 구독 (SSE). 연결이 끊기면 마지막으로 받은 seq 다음부터 다시 붙는다.
   * 작업이 끝나면(성공 · 실패 · 취소) 스스로 닫는다. 반환값은 구독 해제 함수.
   */
  subscribeJob: (jobId: string, onEvent: (event: JobEvent) => void): (() => void) => {
    let seq = 0;
    let closed = false;
    let source: EventSource | null = null;
    let retry: number | undefined;
    const open = () => {
      if (closed) return;
      source = new EventSource(`${env.apiBaseUrl}/api/knowledge/jobs/${enc(jobId)}/events?after=${seq}`);
      source.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as JobEvent;
          seq = Math.max(seq, event.seq);
          onEvent(event);
          if (event.type === "succeeded" || event.type === "failed" || event.type === "cancelled") stop();
        } catch {
          /* 깨진 줄은 건너뛴다 */
        }
      };
      source.onerror = () => {
        source?.close();
        if (!closed) retry = window.setTimeout(open, 2000);
      };
    };
    const stop = () => {
      closed = true;
      window.clearTimeout(retry);
      source?.close();
    };
    open();
    return stop;
  },
};
