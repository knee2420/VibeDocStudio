import { create } from "zustand";

import { knowledgeDeckApi } from "../api/knowledgeDeckApi";
import type { DeckDepth, DeckFileProgress, JobEvent, KnowledgeDeck, PromoteOptions } from "./types";

/** 진행 중인 색인 작업 구독 (덱 id → 해제 함수). 화면을 다시 그려도 구독이 겹치지 않게 스토어 밖에 둔다. */
const subscriptions = new Map<string, () => void>();

const STAGE_LABEL: Record<string, string> = {
  queued: "대기 중",
  resumed: "이어서 진행",
  start: "시작",
  ingest: "원문 수집",
  segment: "조각 나누기",
  enrich: "AI 카드 보강",
  assemble: "인덱스 조립",
  write: "저장",
  done: "완료",
};

export function deckStageLabel(stage?: string): string {
  return (stage && STAGE_LABEL[stage]) || stage || "";
}

/**
 * 서버 도구 범위에 넣는 덱 표시 — 섹션 일부만 골랐으면 `덱id#SEC-01,SEC-03` (서버가 그 섹션만 보게 좁힌다).
 * 하네스 근거 추천(deckIds)에 쓴다. Composer 첨부는 본문의 `sections:` 줄로 같은 뜻을 전한다.
 */
export const deckScopeRef = (deck: Pick<KnowledgeDeck, "id" | "selectedSections">): string =>
  deck.selectedSections?.length ? `${deck.id}#${deck.selectedSections.join(",")}` : deck.id;

export const isDeckBusy = (deck: Pick<KnowledgeDeck, "status">) => deck.status === "queued" || deck.status === "indexing";

/** Composer 가 지금 쓸 수 있는 덱: 체크되어 있고, 본체가 한 번이라도 만들어진 덱. */
export const isDeckUsable = (deck: KnowledgeDeck) =>
  deck.isChecked && !!deck.builtAt && (deck.status === "ready" || deck.status === "indexing");

interface KnowledgeDeckState {
  decks: KnowledgeDeck[];
  activeDeckId: string | null;
  /** 카드 미리보기 (덱 id, 카드 id) */
  /** `showSource` — 인용에서 열면 원문(근거 자리)을 펼친 채로 보여 준다 */
  previewCard: { deckId: string; cardId: string; showSource?: boolean } | null;
  filterKeyword: string;
  sortBy: "latest" | "topics" | "title";
  isLoading: boolean;
  isPromoting: boolean;
  error: string | null;

  loadDecks: (projectId: string) => Promise<void>;
  promoteToDeck: (projectId: string, options: PromoteOptions) => Promise<KnowledgeDeck | null>;
  /**
   * 원본마다 덱 하나씩 — 고른 순서대로 서버 색인 대기열에 올린다 (서버가 차례로 돌린다).
   * 실패한 것은 건너뛰고 나머지는 계속 올린다. 올라간 덱들을 돌려준다.
   */
  promoteEach: (projectId: string, list: PromoteOptions[]) => Promise<KnowledgeDeck[]>;
  reindexDeck: (projectId: string, deckId: string, depth?: DeckDepth) => Promise<void>;
  cancelIndexing: (deckId: string) => Promise<void>;
  importDeck: (projectId: string, deckData: Record<string, unknown>) => Promise<KnowledgeDeck | null>;
  toggleDeckChoice: (projectId: string, deckId: string, isChecked: boolean) => Promise<void>;
  /** 덱에서 AI 가 쓸 섹션만 고른다 (null = 전부). */
  selectDeckSections: (projectId: string, deckId: string, sectionIds: string[] | null) => Promise<void>;
  toggleAllDecksChoice: (projectId: string, isChecked: boolean) => Promise<void>;
  deleteDeck: (projectId: string, deckId: string) => Promise<void>;
  setActiveDeckId: (id: string | null) => void;
  openCardPreview: (deckId: string, cardId: string, opts?: { showSource?: boolean }) => void;
  closeCardPreview: () => void;
  setFilterKeyword: (kw: string) => void;
  setSortBy: (sort: "latest" | "topics" | "title") => void;
}

export const useKnowledgeDeckStore = create<KnowledgeDeckState>((set, get) => {
  const upsert = (deck: KnowledgeDeck) =>
    set((s) => ({ decks: s.decks.some((d) => d.id === deck.id) ? s.decks.map((d) => (d.id === deck.id ? deck : d)) : [deck, ...s.decks] }));

  const patch = (deckId: string, fields: Partial<KnowledgeDeck>) =>
    set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? { ...d, ...fields } : d)) }));

  /** 작업 이벤트로 목록의 진행률을 바로 갱신하고, 끝나면 서버의 최종 덱(통계 · 품질 · 목차)을 다시 읽는다. */
  const watch = (projectId: string, deck: KnowledgeDeck) => {
    if (!deck.jobId || subscriptions.has(deck.id)) return;
    const stop = knowledgeDeckApi.subscribeJob(deck.jobId, (event: JobEvent) => {
      if (event.type === "progress" || event.type === "started" || event.type === "resumed") {
        const files = Array.isArray(event.detail?.files) ? (event.detail.files as DeckFileProgress[]) : undefined;
        patch(deck.id, {
          status: "indexing",
          stage: event.stage,
          progress: Math.round((event.progress ?? 0) * 100),
          ...(files ? { files } : {}),
        });
        return;
      }
      if (event.type === "warning") {
        patch(deck.id, { error: String(event.detail?.message ?? "") });
        return;
      }
      if (event.type === "succeeded" || event.type === "failed" || event.type === "cancelled") {
        subscriptions.get(deck.id)?.();
        subscriptions.delete(deck.id);
        void knowledgeDeckApi
          .getDeck(projectId, deck.id)
          .then(upsert)
          .catch(() => patch(deck.id, { status: event.type === "succeeded" ? "ready" : "failed" }));
      }
    });
    subscriptions.set(deck.id, stop);
  };

  return {
    decks: [],
    activeDeckId: null,
    previewCard: null,
    filterKeyword: "",
    sortBy: "latest",
    isLoading: false,
    isPromoting: false,
    error: null,

    loadDecks: async (projectId) => {
      set({ isLoading: true, error: null });
      try {
        const res = await knowledgeDeckApi.listDecks(projectId);
        set({ decks: res.decks, isLoading: false });
        // 새로고침 뒤에도 돌고 있는 작업의 진행을 이어서 본다
        res.decks.filter(isDeckBusy).forEach((d) => watch(projectId, d));
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : "지식 덱 목록 조회에 실패했습니다.", isLoading: false });
      }
    },

    promoteToDeck: async (projectId, options) => {
      set({ isPromoting: true, error: null });
      try {
        const { deck } = await knowledgeDeckApi.promoteToDeck(projectId, options);
        upsert(deck);
        set({ activeDeckId: deck.id, isPromoting: false });
        watch(projectId, deck);
        return deck;
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : "지식 덱 색인 요청에 실패했습니다.", isPromoting: false });
        return null;
      }
    },

    promoteEach: async (projectId, list) => {
      set({ isPromoting: true, error: null });
      const made: KnowledgeDeck[] = [];
      const failed: string[] = [];
      for (const options of list) {
        try {
          const { deck } = await knowledgeDeckApi.promoteToDeck(projectId, options);
          upsert(deck);
          watch(projectId, deck);
          made.push(deck);
        } catch {
          failed.push(options.title);
        }
      }
      set({
        isPromoting: false,
        activeDeckId: made[0]?.id ?? get().activeDeckId,
        error: failed.length ? `색인 요청 실패 ${failed.length}건: ${failed.join(", ")}` : null,
      });
      return made;
    },

    reindexDeck: async (projectId, deckId, depth) => {
      try {
        const { deck } = await knowledgeDeckApi.reindex(projectId, deckId, depth);
        upsert(deck);
        watch(projectId, deck);
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : "재색인 요청에 실패했습니다." });
      }
    },

    cancelIndexing: async (deckId) => {
      const deck = get().decks.find((d) => d.id === deckId);
      if (!deck?.jobId) return;
      try {
        await knowledgeDeckApi.cancelJob(deck.jobId);
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : "취소에 실패했습니다." });
      }
    },

    importDeck: async (projectId, deckData) => {
      set({ isLoading: true, error: null });
      try {
        const deck = await knowledgeDeckApi.importDeck(projectId, deckData);
        upsert(deck);
        set({ activeDeckId: deck.id, isLoading: false });
        return deck;
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : "지식 덱 가져오기(Import)에 실패했습니다.", isLoading: false });
        return null;
      }
    },

    toggleDeckChoice: async (projectId, deckId, isChecked) => {
      const previous = get().decks;
      patch(deckId, { isChecked });
      try {
        await knowledgeDeckApi.toggleChoice(projectId, deckId, isChecked);
      } catch {
        set({ decks: previous });
      }
    },

    selectDeckSections: async (projectId, deckId, sectionIds) => {
      const previous = get().decks;
      patch(deckId, { selectedSections: sectionIds ?? [] });
      try {
        upsert(await knowledgeDeckApi.selectSections(projectId, deckId, sectionIds));
      } catch {
        set({ decks: previous });
      }
    },

    toggleAllDecksChoice: async (projectId, isChecked) => {
      const previous = get().decks;
      set({ decks: previous.map((d) => ({ ...d, isChecked })) });
      try {
        await Promise.all(previous.map((d) => knowledgeDeckApi.toggleChoice(projectId, d.id, isChecked)));
      } catch {
        set({ decks: previous });
      }
    },

    deleteDeck: async (projectId, deckId) => {
      const previous = get().decks;
      subscriptions.get(deckId)?.();
      subscriptions.delete(deckId);
      set({
        decks: previous.filter((d) => d.id !== deckId),
        activeDeckId: get().activeDeckId === deckId ? null : get().activeDeckId,
        previewCard: get().previewCard?.deckId === deckId ? null : get().previewCard,
      });
      try {
        await knowledgeDeckApi.deleteDeck(projectId, deckId);
      } catch {
        set({ decks: previous });
      }
    },

    setActiveDeckId: (id) => set({ activeDeckId: id }),
    openCardPreview: (deckId, cardId, opts) =>
      set({ previewCard: { deckId, cardId, showSource: opts?.showSource }, activeDeckId: deckId }),
    closeCardPreview: () => set({ previewCard: null }),
    setFilterKeyword: (kw) => set({ filterKeyword: kw }),
    setSortBy: (sort) => set({ sortBy: sort }),
  };
});
