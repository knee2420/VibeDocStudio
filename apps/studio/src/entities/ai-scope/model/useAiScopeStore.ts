import { create } from "zustand";

import { DEFAULT_SCOPE, type DocScopeSetting, type ResolvedScope, type ScopeMode, type ScopeTarget } from "./scope";

/**
 * Composer 설정바의 범위 상태.
 *
 * - settings: 문서별로 오래 걸어 두는 범위 (이 브라우저에 저장 — 새로고침해도 남는다)
 * - live: 지금 캔버스 초점 (고정이 아니면 범위가 이것을 따르고, 고정이면 "↻ 초점" 제안으로만 보인다)
 * - turn: 지금 Composer 가 처리 중인 메시지의 실제 범위 — 문서 도구가 이 밖을 거부한다
 */
export interface AiScopeState {
  settings: Record<string, DocScopeSetting>;
  live: { docId: string | null; target: ScopeTarget | null; pageId: string | null };
  turn: ResolvedScope | null;
  /** 설정바 행 스위치 — 자료(덱 · RM 원본) / 범위(문서) 를 통째로 켜고 끈다. RM 체크 · 범위 설정은 그대로 둔다 */
  sourcesOn: boolean;
  scopeOn: boolean;
  setSourcesOn: (on: boolean) => void;
  setScopeOn: (on: boolean) => void;

  settingFor: (docId: string) => DocScopeSetting;
  setMode: (docId: string, mode: ScopeMode) => void;
  /** 고정을 켜면 지금 보이는 초점(선택 · 페이지)을 그대로 붙잡는다 */
  setFixed: (docId: string, fixed: boolean) => void;
  /** 특정 대상을 범위로 고정한다 (프롬프트 칩의 📌, 초점 제안 수락) */
  pinTarget: (docId: string, target: ScopeTarget) => void;
  pinPage: (docId: string, pageId: string) => void;
  /** 페이지를 복수로 토글하여 선택 (중복 선택 지원) */
  togglePageSelected: (docId: string, pageId: string) => void;
  selectAllPages: (docId: string, allPageIds: string[]) => void;
  clearSelectedPages: (docId: string) => void;
  /** 고정 해제 — 붙잡아 둔 선택 · 페이지를 지우고 캔버스 초점을 따라가게 한다 */
  clearPin: (docId: string) => void;
  togglePageExcluded: (docId: string, pageId: string) => void;
  setLive: (docId: string | null, target: ScopeTarget | null, pageId: string | null) => void;
  setTurn: (scope: ResolvedScope | null) => void;
}

const KEY = "vdoc.aiScope.v1";
const SWITCH_KEY = "vdoc.aiScope.switches";

function loadSwitches(): { sourcesOn: boolean; scopeOn: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(SWITCH_KEY) ?? "{}");
    return { sourcesOn: raw.sourcesOn !== false, scopeOn: raw.scopeOn !== false };
  } catch {
    return { sourcesOn: true, scopeOn: true };
  }
}

function load(): Record<string, DocScopeSetting> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function save(settings: Record<string, DocScopeSetting>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 이번 세션만 */
  }
}

export const useAiScopeStore = create<AiScopeState>((set, get) => {
  const update = (docId: string, patch: (s: DocScopeSetting) => DocScopeSetting) => {
    const next = { ...get().settings, [docId]: patch(get().settingFor(docId)) };
    save(next);
    set({ settings: next });
  };

  return {
    settings: load(),
    live: { docId: null, target: null, pageId: null },
    turn: null,
    ...loadSwitches(),
    setSourcesOn: (on) => {
      set({ sourcesOn: on });
      try {
        localStorage.setItem(SWITCH_KEY, JSON.stringify({ sourcesOn: on, scopeOn: get().scopeOn }));
      } catch {
        /* 이번 세션만 */
      }
    },
    setScopeOn: (on) => {
      set({ scopeOn: on });
      try {
        localStorage.setItem(SWITCH_KEY, JSON.stringify({ sourcesOn: get().sourcesOn, scopeOn: on }));
      } catch {
        /* 이번 세션만 */
      }
    },

    settingFor: (docId) => ({ ...DEFAULT_SCOPE, ...(get().settings[docId] ?? {}) }),

    setMode: (docId, mode) => update(docId, (s) => ({ ...s, mode })),
    setFixed: (docId, fixed) =>
      update(docId, (s) => {
        if (!fixed) return { ...s, fixed };
        const live = get().live.docId === docId ? get().live : { target: null, pageId: null };
        return { ...s, fixed, target: live.target ?? s.target, pageId: live.pageId ?? s.pageId };
      }),
    pinTarget: (docId, target) => update(docId, (s) => ({ ...s, mode: "selection", fixed: true, target, pageId: target.pageId })),
    clearPin: (docId) => update(docId, (s) => ({ ...s, fixed: false, target: null, pageId: null })),
    // 페이지를 직접 고르면 그 페이지로 고정 (초점을 따라가면 고른 의미가 없다)
    pinPage: (docId, pageId) => update(docId, (s) => ({ ...s, pageId, pageIds: [pageId], fixed: true })),
    togglePageSelected: (docId, pageId) =>
      update(docId, (s) => {
        const cur = s.pageIds && s.pageIds.length > 0 ? s.pageIds : (s.pageId ? [s.pageId] : []);
        const next = cur.includes(pageId) ? cur.filter((id) => id !== pageId) : [...cur, pageId];
        return {
          ...s,
          mode: "page",
          fixed: next.length > 0,
          pageId: next[0] ?? null,
          pageIds: next,
        };
      }),
    selectAllPages: (docId, allPageIds) =>
      update(docId, (s) => ({
        ...s,
        mode: "page",
        fixed: true,
        pageId: allPageIds[0] ?? null,
        pageIds: [...allPageIds],
      })),
    clearSelectedPages: (docId) =>
      update(docId, (s) => ({
        ...s,
        fixed: false,
        pageId: null,
        pageIds: [],
      })),
    togglePageExcluded: (docId, pageId) =>
      update(docId, (s) => ({
        ...s,
        excludedPageIds: s.excludedPageIds.includes(pageId) ? s.excludedPageIds.filter((p) => p !== pageId) : [...s.excludedPageIds, pageId],
      })),
    setLive: (docId, target, pageId) => {
      const cur = get().live;
      if (cur.docId === docId && cur.pageId === pageId && cur.target?.id === target?.id) return;
      set({ live: { docId, target, pageId } });
    },
    setTurn: (scope) => set({ turn: scope }),
  };
});
