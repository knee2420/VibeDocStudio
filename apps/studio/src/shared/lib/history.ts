import { create } from "zustand";

/**
 * 스튜디오 전체가 공유하는 단일 Undo/Redo 이력 (`Ctrl+Z` / `Ctrl+Y`).
 *
 * 프로젝트 아웃라인 · 문서 구조 · AI 변경안 승인 등 어떤 저장소의 변경이든 같은 스택에
 * 시간 순서대로 쌓인다. 그래서 되돌리기는 항상 "가장 마지막에 한 일"을 되돌린다.
 * 각 항목은 자기 자신을 되돌리고 다시 하는 방법(`undo` / `redo`)을 들고 있다 (Command 패턴).
 */
export type HistoryScope = "project" | "document";

export interface HistoryEntry {
  label: string;
  scope: HistoryScope;
  /** 같은 키로 연달아 들어오는 편집(예: 슬롯 타이핑 디바운스)은 첫 `undo` 를 유지한 채 하나로 합친다. */
  coalesceKey?: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

const HISTORY_LIMIT = 60;

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** 마지막 변경 · 되돌리기 안내 (토스트용). */
  lastMessage: string | null;
  push: (entry: HistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** 범위(scope)의 이력만 비운다 (예: 다른 문서로 전환). */
  clearScope: (scope: HistoryScope) => void;
  dismissMessage: () => void;
}

/** `transaction()` 이 열려 있는 동안 쌓이는 항목. 닫힐 때 하나의 항목으로 합쳐진다. */
let openTransaction: HistoryEntry[] | null = null;
let busy = false;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  lastMessage: null,

  push: (entry) => {
    if (openTransaction) {
      const prev = openTransaction.at(-1);
      if (entry.coalesceKey && prev?.coalesceKey === entry.coalesceKey) {
        openTransaction[openTransaction.length - 1] = { ...entry, undo: prev.undo };
      } else {
        openTransaction.push(entry);
      }
      return;
    }
    set((s) => {
      const prev = s.past.at(-1);
      if (entry.coalesceKey && prev?.coalesceKey === entry.coalesceKey) {
        const merged: HistoryEntry = { ...entry, undo: prev.undo };
        return {
          past: [...s.past.slice(0, -1), merged],
          future: [],
          lastMessage: merged.label,
        };
      }
      return {
        past: [...s.past, entry].slice(-HISTORY_LIMIT),
        future: [],
        lastMessage: entry.label,
      };
    });
  },

  undo: async () => {
    const entry = get().past.at(-1);
    if (!entry || busy) return;
    busy = true;
    try {
      await entry.undo();
      set((s) => ({
        past: s.past.slice(0, -1),
        future: [entry, ...s.future].slice(0, HISTORY_LIMIT),
        lastMessage: `되돌림: ${entry.label}`,
      }));
    } finally {
      busy = false;
    }
  },

  redo: async () => {
    const entry = get().future[0];
    if (!entry || busy) return;
    busy = true;
    try {
      await entry.redo();
      set((s) => ({
        past: [...s.past, entry].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        lastMessage: `다시 실행: ${entry.label}`,
      }));
    } finally {
      busy = false;
    }
  },

  clearScope: (scope) =>
    set((s) => ({
      past: s.past.filter((e) => e.scope !== scope),
      future: s.future.filter((e) => e.scope !== scope),
    })),

  dismissMessage: () => set({ lastMessage: null }),
}));

/**
 * 여러 변경을 하나의 Undo 단위로 묶는다 (예: AI 변경안 "모두 적용").
 * 묶인 항목은 되돌릴 때 역순으로, 다시 할 때 원래 순서로 실행된다.
 */
export async function historyTransaction(
  label: string,
  scope: HistoryScope,
  work: () => Promise<void>
): Promise<void> {
  if (openTransaction) {
    await work();
    return;
  }
  const collected: HistoryEntry[] = [];
  openTransaction = collected;
  try {
    await work();
  } finally {
    openTransaction = null;
  }
  if (collected.length === 0) return;
  useHistoryStore.getState().push({
    label,
    scope,
    undo: async () => {
      for (const entry of [...collected].reverse()) await entry.undo();
    },
    redo: async () => {
      for (const entry of collected) await entry.redo();
    },
  });
}
