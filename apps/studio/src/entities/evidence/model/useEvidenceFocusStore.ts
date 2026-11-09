import { create } from "zustand";

import type { EvidenceLocator } from "@vibe/vdoc-schema";

/** 초점 근거 — 지금 고른 칸(들)에 이어진 자료. RM · 덱 · Composer 가 함께 본다. */
export interface FocusEvidence {
  locator: EvidenceLocator;
  tier: "direct" | "inherited";
}

/**
 * 근거 초점 — RM · 캔버스 · 아웃라이너 · Composer 가 "지금 무엇과 무엇이 이어져 있나"를 함께 보는 화면 상태.
 * 저장하지 않는다. 캔버스 선택이 바뀌면 다시 계산된다 (`features/evidence-focus` 의 동기화 훅).
 *
 * 체크(핀)와 다르다: 체크는 사람이 고정한 "항상 쓰는 자료", 초점은 선택을 따라 움직이는 "지금 이 칸의 자료".
 */
export interface EvidenceFocusState {
  /** 캔버스에서 빛낼 슬롯 (RM 항목을 가리켰을 때 그 자료를 쓰는 칸들 · 인용을 눌렀을 때 그 칸) */
  highlightedSlotIds: ReadonlySet<string>;
  setHighlightedSlots: (ids: Iterable<string>) => void;
  clearHighlightedSlots: () => void;

  /** 초점 근거를 만든 칸들 */
  focusSlotIds: string[];
  focusEvidence: FocusEvidence[];
  /** RM 트리에서 칠할 자료 id (섹터면 그 자료) */
  focusResourceIds: ReadonlySet<string>;
  /** 칠할 섹터 id */
  focusSectorIds: ReadonlySet<string>;
  /** 덱별 초점 카드 — 덱 첨부에 "우선 카드" 로 실린다 */
  focusCards: Readonly<Record<string, string[]>>;
  setFocus: (slotIds: string[], evidence: FocusEvidence[]) => void;

  /** "초점 따라가기" — 켜면 RM 이 초점 자료로 스스로 펼치고 스크롤한다 */
  follow: boolean;
  setFollow: (on: boolean) => void;
}

const FOLLOW_KEY = "vdoc.evidenceFocus.follow";
const readFollow = (): boolean => {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "0";
  } catch {
    return true;
  }
};

export const useEvidenceFocusStore = create<EvidenceFocusState>((set) => ({
  highlightedSlotIds: new Set<string>(),
  setHighlightedSlots: (ids) => set({ highlightedSlotIds: new Set(ids) }),
  clearHighlightedSlots: () => set({ highlightedSlotIds: new Set<string>() }),

  focusSlotIds: [],
  focusEvidence: [],
  focusResourceIds: new Set<string>(),
  focusSectorIds: new Set<string>(),
  focusCards: {},
  setFocus: (slotIds, evidence) => {
    const resources = new Set<string>();
    const sectors = new Set<string>();
    const cards: Record<string, string[]> = {};
    for (const { locator: l } of evidence) {
      if (l.kind === "sector") {
        sectors.add(l.refId);
        if (l.resourceId) resources.add(l.resourceId);
      } else if (l.kind === "resource") {
        resources.add(l.resourceId ?? l.refId);
      } else if (l.kind === "kcard") {
        const i = l.refId.lastIndexOf(":");
        const deckId = l.deckId ?? (i > 0 ? l.refId.slice(0, i) : "");
        const cardId = l.cardId ?? (i > 0 ? l.refId.slice(i + 1) : "");
        if (deckId && cardId) {
          const list = (cards[deckId] ??= []);
          if (!list.includes(cardId)) list.push(cardId);
        }
      }
    }
    set({ focusSlotIds: slotIds, focusEvidence: evidence, focusResourceIds: resources, focusSectorIds: sectors, focusCards: cards });
  },

  follow: readFollow(),
  setFollow: (on) => {
    try {
      localStorage.setItem(FOLLOW_KEY, on ? "1" : "0");
    } catch {
      /* 이번 세션만 */
    }
    set({ follow: on });
  },
}));
