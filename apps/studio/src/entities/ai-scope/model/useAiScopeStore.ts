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
  /** 설정바 행 스위치 — 레퍼런스(규정·서식) / 자료(덱 · RM 원본) / 범위(문서) 를 통째로 켜고 끈다. */
  referencesOn: boolean;
  sourcesOn: boolean;
  scopeOn: boolean;
  setReferencesOn: (on: boolean) => void;
  setSourcesOn: (on: boolean) => void;
  setScopeOn: (on: boolean) => void;

  /** Composer 전용 리소스 제외 플래그 (RM 원장은 보존하고 Composer 세션에서만 제외/선별) */
  excludedSourceIds: Record<string, string[]>;
  toggleSourceExcluded: (projectId: string, itemId: string, descendantIds?: string[]) => void;
  setSourcesExcluded: (projectId: string, itemIds: string[], excluded: boolean) => void;
  clearExcludedSources: (projectId: string) => void;

  /** Composer 전용 레퍼런스 제외 플래그 (RM 원장은 보존하고 Composer 세션에서만 제외/선별) */
  excludedReferenceIds: Record<string, string[]>;
  toggleReferenceExcluded: (projectId: string, refId: string) => void;
  setReferencesExcluded: (projectId: string, refIds: string[], excluded: boolean) => void;
  clearExcludedReferences: (projectId: string) => void;

  /** Composer 전용 레퍼런스 핀 제외 플래그 (RM 핀 원장은 보존하고 Composer 세션에서만 제외/선별) */
  excludedReferencePinIds: Record<string, string[]>;
  toggleReferencePinExcluded: (projectId: string, pinId: string) => void;
  setReferencePinsExcluded: (projectId: string, pinIds: string[], excluded: boolean) => void;
  clearExcludedReferencePins: (projectId: string) => void;

  /** 특정 참조 문서(규정/서식) 제외 관리 — 제외되지 않은 참조 문서는 Composer 컨텍스트에 자동 주입된다 */

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
const EXCLUDED_SOURCES_KEY = "vdoc.aiScope.excludedSources";
const EXCLUDED_REFERENCES_KEY = "vdoc.aiScope.excludedReferences";
const EXCLUDED_REF_PINS_KEY = "vdoc.aiScope.excludedRefPins";

function loadSwitches(): { referencesOn: boolean; sourcesOn: boolean; scopeOn: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(SWITCH_KEY) ?? "{}");
    return {
      referencesOn: raw.referencesOn !== false,
      sourcesOn: raw.sourcesOn !== false,
      scopeOn: raw.scopeOn !== false,
    };
  } catch {
    return { referencesOn: true, sourcesOn: true, scopeOn: true };
  }
}

function loadExcludedMap(key: string): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveExcludedMap(key: string, data: Record<string, string[]>) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* 이번 세션만 */
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
    setReferencesOn: (on) => {
      set({ referencesOn: on });
      try {
        localStorage.setItem(
          SWITCH_KEY,
          JSON.stringify({
            referencesOn: on,
            sourcesOn: get().sourcesOn,
            scopeOn: get().scopeOn,
          })
        );
      } catch {
        /* 이번 세션만 */
      }
    },
    setSourcesOn: (on) => {
      set({ sourcesOn: on });
      try {
        localStorage.setItem(
          SWITCH_KEY,
          JSON.stringify({
            referencesOn: get().referencesOn,
            sourcesOn: on,
            scopeOn: get().scopeOn,
          })
        );
      } catch {
        /* 이번 세션만 */
      }
    },
    setScopeOn: (on) => {
      set({ scopeOn: on });
      try {
        localStorage.setItem(
          SWITCH_KEY,
          JSON.stringify({
            referencesOn: get().referencesOn,
            sourcesOn: get().sourcesOn,
            scopeOn: on,
          })
        );
      } catch {
        /* 이번 세션만 */
      }
    },

    excludedSourceIds: loadExcludedMap(EXCLUDED_SOURCES_KEY),
    toggleSourceExcluded: (projectId, itemId, descendantIds) => {
      const curMap = get().excludedSourceIds;
      const curList = curMap[projectId] ?? [];
      const targets = [itemId, ...(descendantIds ?? [])];
      const isCurrentlyExcluded = curList.includes(itemId);
      const nextList = isCurrentlyExcluded
        ? curList.filter((id) => !targets.includes(id))
        : [...new Set([...curList, ...targets])];
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_SOURCES_KEY, nextMap);
      set({ excludedSourceIds: nextMap });
    },
    setSourcesExcluded: (projectId, itemIds, excluded) => {
      const curMap = get().excludedSourceIds;
      const curList = curMap[projectId] ?? [];
      const targetSet = new Set(itemIds);
      const nextList = excluded
        ? [...new Set([...curList, ...itemIds])]
        : curList.filter((id) => !targetSet.has(id));
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_SOURCES_KEY, nextMap);
      set({ excludedSourceIds: nextMap });
    },
    clearExcludedSources: (projectId) => {
      const curMap = get().excludedSourceIds;
      const nextMap = { ...curMap, [projectId]: [] };
      saveExcludedMap(EXCLUDED_SOURCES_KEY, nextMap);
      set({ excludedSourceIds: nextMap });
    },

    excludedReferenceIds: loadExcludedMap(EXCLUDED_REFERENCES_KEY),
    toggleReferenceExcluded: (projectId, refId) => {
      const curMap = get().excludedReferenceIds;
      const curList = curMap[projectId] ?? [];
      const isCurrentlyExcluded = curList.includes(refId);
      const nextList = isCurrentlyExcluded
        ? curList.filter((id) => id !== refId)
        : [...curList, refId];
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_REFERENCES_KEY, nextMap);
      set({ excludedReferenceIds: nextMap });
    },
    setReferencesExcluded: (projectId, refIds, excluded) => {
      const curMap = get().excludedReferenceIds;
      const curList = curMap[projectId] ?? [];
      const targetSet = new Set(refIds);
      const nextList = excluded
        ? [...new Set([...curList, ...refIds])]
        : curList.filter((id) => !targetSet.has(id));
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_REFERENCES_KEY, nextMap);
      set({ excludedReferenceIds: nextMap });
    },
    clearExcludedReferences: (projectId) => {
      const curMap = get().excludedReferenceIds;
      const nextMap = { ...curMap, [projectId]: [] };
      saveExcludedMap(EXCLUDED_REFERENCES_KEY, nextMap);
      set({ excludedReferenceIds: nextMap });
    },

    excludedReferencePinIds: loadExcludedMap(EXCLUDED_REF_PINS_KEY),
    toggleReferencePinExcluded: (projectId, pinId) => {
      const curMap = get().excludedReferencePinIds;
      const curList = curMap[projectId] ?? [];
      const isCurrentlyExcluded = curList.includes(pinId);
      const nextList = isCurrentlyExcluded
        ? curList.filter((id) => id !== pinId)
        : [...curList, pinId];
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_REF_PINS_KEY, nextMap);
      set({ excludedReferencePinIds: nextMap });
    },
    setReferencePinsExcluded: (projectId, pinIds, excluded) => {
      const curMap = get().excludedReferencePinIds;
      const curList = curMap[projectId] ?? [];
      const targetSet = new Set(pinIds);
      const nextList = excluded
        ? [...new Set([...curList, ...pinIds])]
        : curList.filter((id) => !targetSet.has(id));
      const nextMap = { ...curMap, [projectId]: nextList };
      saveExcludedMap(EXCLUDED_REF_PINS_KEY, nextMap);
      set({ excludedReferencePinIds: nextMap });
    },
    clearExcludedReferencePins: (projectId) => {
      const curMap = get().excludedReferencePinIds;
      const nextMap = { ...curMap, [projectId]: [] };
      saveExcludedMap(EXCLUDED_REF_PINS_KEY, nextMap);
      set({ excludedReferencePinIds: nextMap });
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
