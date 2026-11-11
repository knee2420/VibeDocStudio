import { create } from "zustand";

import { errorMessage } from "@/shared/lib";

import { referenceApi, type CreatePinInput } from "../api/referenceApi";
import type {
  BoundReference,
  ConsensusAdoption,
  ConsensusCard,
  FocusedReferencePin,
  ReferenceExtraction,
  ReferenceItem,
  ReferenceLayers,
  ReferencePin,
  ReferenceShotsManifest,
} from "./types";

/**
 * 레퍼런스 클라이언트 캐시 (원장은 서버 `/api/reference`).
 *
 * - library: 워크스페이스 공용 라이브러리 (프로젝트와 무관)
 * - bound:   활성 프로젝트에 연결된 레퍼런스 (순서 = 참조 번호, 사용 여부 · 층위 on/off)
 * - pins:    레퍼런스별 핀 (서버 저장). checkedPinIds 는 "AI 에 보낼 핀" 화면 선택일 뿐이다.
 *
 * 레퍼런스는 작업 문서가 아니므로 에디터 문서 스토어에 절대 쓰지 않는다.
 */
export interface ReferenceState {
  projectId: string | null;
  library: ReferenceItem[];
  bound: BoundReference[];
  pins: Record<string, ReferencePin[]>;
  extraction: Record<string, ReferenceExtraction>;
  layers: Record<string, ReferenceLayers>;
  shots: Record<string, ReferenceShotsManifest>;
  checkedPinIds: string[];
  /** AI 가 이번 대화에서 제안한 해석 카드 (확정 전) — refId 별 */
  pendingCards: Record<string, ConsensusCard[]>;
  focusedPin: FocusedReferencePin | null;
  activeRefId: string | null;
  loading: boolean;
  error: string | null;

  loadProject: (projectId: string | null) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  ensureDetail: (refId: string) => Promise<void>;
  /** 파일 하나를 라이브러리에 넣고 활성 프로젝트에 연결한다. */
  addFile: (file: File, title?: string) => Promise<ReferenceItem>;
  addUrl: (url: string, title?: string) => Promise<ReferenceItem>;
  reanalyze: (refId: string) => Promise<void>;
  captureLive: (refId: string) => Promise<void>;
  bind: (refId: string) => Promise<void>;
  unbind: (refId: string) => Promise<void>;
  removeFromLibrary: (refId: string) => Promise<void>;
  setEnabled: (refId: string, enabled: boolean) => Promise<void>;
  setAllEnabled: (enabled: boolean) => Promise<void>;
  toggleLayer: (refId: string, layerId: string) => Promise<void>;
  /** 서버가 보낸 AI 해석 카드 (reference_interpretations) 를 받는다 */
  receiveInterpretations: (cards: ConsensusCard[]) => void;
  /** 제안 카드를 (고친 채택 강도 · 고른 대안으로) 확정한다 */
  confirmCard: (refId: string, cardId: string, edits?: { adoption?: ConsensusAdoption; alternative?: number }) => Promise<void>;
  discardCard: (refId: string, cardId: string) => void;
  setCardAdoption: (refId: string, cardId: string, adoption: ConsensusAdoption) => Promise<void>;
  removeCard: (refId: string, cardId: string) => Promise<void>;

  addPin: (refId: string, input: CreatePinInput) => Promise<ReferencePin>;
  updatePin: (refId: string, pinId: string, patch: { label?: string; note?: string; layer?: string }) => Promise<void>;
  removePin: (refId: string, pinId: string) => Promise<void>;
  toggleChecked: (pinId: string) => void;
  setRefPinsChecked: (refId: string, checked: boolean) => void;
  clearChecked: () => void;
  setFocusedPin: (pin: ReferencePin | null) => void;
  setActiveRefId: (refId: string | null) => void;
}

const upsert = (items: ReferenceItem[], item: ReferenceItem) =>
  items.some((it) => it.refId === item.refId) ? items.map((it) => (it.refId === item.refId ? item : it)) : [...items, item];

export const useReferenceStore = create<ReferenceState>((set, get) => {
  /** 서버가 돌려준 연결 목록으로 교체하고, 연결된 레퍼런스의 핀을 불러 둔다. */
  const applyBinding = async (entries: BoundReference[]) => {
    set((s) => ({
      bound: entries,
      library: entries.reduce((acc, e) => upsert(acc, e.item), s.library),
    }));
    const missing = entries.filter((e) => !get().pins[e.refId]);
    const loaded = await Promise.allSettled(missing.map((e) => referenceApi.listPins(e.refId)));
    set((s) => {
      const pins = { ...s.pins };
      loaded.forEach((r, i) => {
        if (r.status === "fulfilled") pins[missing[i].refId] = r.value;
      });
      return { pins };
    });
  };

  const guard = async <T,>(work: () => Promise<T>): Promise<T> => {
    set({ error: null });
    try {
      return await work();
    } catch (err) {
      set({ error: errorMessage(err, "레퍼런스 서버 요청에 실패했습니다.") });
      throw err;
    }
  };

  const currentProject = (): string => {
    const id = get().projectId;
    if (!id) throw new Error("활성 프로젝트가 없습니다.");
    return id;
  };

  return {
    projectId: null,
    library: [],
    bound: [],
    pins: {},
    extraction: {},
    layers: {},
    shots: {},
    checkedPinIds: [],
    pendingCards: {},
    focusedPin: null,
    activeRefId: null,
    loading: false,
    error: null,

    loadProject: async (projectId) => {
      if (!projectId) {
        set({ projectId: null, bound: [], activeRefId: null });
        return;
      }
      set({ projectId, loading: true, error: null });
      try {
        const [binding, library] = await Promise.all([referenceApi.binding(projectId), referenceApi.listItems()]);
        if (get().projectId !== projectId) return; // 그새 프로젝트가 바뀌었다
        set({ library });
        await applyBinding(binding.entries);
        const active = get().activeRefId;
        if (!active || !binding.entries.some((e) => e.refId === active)) {
          set({ activeRefId: binding.entries[0]?.refId ?? null });
        }
      } catch (err) {
        set({ error: errorMessage(err, "레퍼런스 서버 요청에 실패했습니다.") });
      } finally {
        set({ loading: false });
      }
    },

    refreshLibrary: async () => {
      const library = await guard(() => referenceApi.listItems());
      set({ library });
    },

    ensureDetail: async (refId) => {
      const { extraction, layers, shots } = get();
      if (extraction[refId] && layers[refId] && shots[refId]) return;
      const [ex, ly, sh] = await Promise.allSettled([
        referenceApi.extraction(refId),
        referenceApi.layers(refId),
        referenceApi.shots(refId),
      ]);
      set((s) => ({
        extraction: ex.status === "fulfilled" ? { ...s.extraction, [refId]: ex.value } : s.extraction,
        layers: ly.status === "fulfilled" ? { ...s.layers, [refId]: ly.value } : s.layers,
        shots: sh.status === "fulfilled" ? { ...s.shots, [refId]: sh.value } : s.shots,
      }));
    },

    addFile: async (file, title) =>
      guard(async () => {
        const created = await referenceApi.addFile(file, title);
        set((s) => ({ library: upsert(s.library, created) }));
        if (get().projectId) await get().bind(created.refId);
        set({ activeRefId: created.refId });
        return created;
      }),

    addUrl: async (url, title) =>
      guard(async () => {
        const created = await referenceApi.addUrl(url, title);
        set((s) => ({ library: upsert(s.library, created) }));
        if (get().projectId) await get().bind(created.refId);
        set({ activeRefId: created.refId });
        return created;
      }),

    reanalyze: async (refId) =>
      guard(async () => {
        const updated = await referenceApi.reanalyze(refId);
        set((s) => ({
          library: upsert(s.library, updated),
          bound: s.bound.map((b) => (b.refId === refId ? { ...b, item: updated } : b)),
          extraction: Object.fromEntries(Object.entries(s.extraction).filter(([k]) => k !== refId)),
          layers: Object.fromEntries(Object.entries(s.layers).filter(([k]) => k !== refId)),
          shots: Object.fromEntries(Object.entries(s.shots).filter(([k]) => k !== refId)),
        }));
        await get().ensureDetail(refId);
      }),

    captureLive: async (refId) =>
      guard(async () => {
        const updated = await referenceApi.captureLive(refId);
        set((s) => ({
          library: upsert(s.library, updated),
          bound: s.bound.map((b) => (b.refId === refId ? { ...b, item: updated } : b)),
          extraction: Object.fromEntries(Object.entries(s.extraction).filter(([k]) => k !== refId)),
          layers: Object.fromEntries(Object.entries(s.layers).filter(([k]) => k !== refId)),
          shots: Object.fromEntries(Object.entries(s.shots).filter(([k]) => k !== refId)),
        }));
        await get().ensureDetail(refId);
      }),

    bind: async (refId) =>
      guard(async () => {
        const binding = await referenceApi.bind(currentProject(), refId);
        await applyBinding(binding.entries);
      }),

    unbind: async (refId) =>
      guard(async () => {
        const binding = await referenceApi.unbind(currentProject(), refId);
        await applyBinding(binding.entries);
        if (get().activeRefId === refId) set({ activeRefId: binding.entries[0]?.refId ?? null });
      }),

    removeFromLibrary: async (refId) =>
      guard(async () => {
        await referenceApi.remove(refId);
        const pinIds = new Set((get().pins[refId] ?? []).map((p) => p.pinId));
        set((s) => ({
          library: s.library.filter((it) => it.refId !== refId),
          bound: s.bound.filter((b) => b.refId !== refId),
          checkedPinIds: s.checkedPinIds.filter((id) => !pinIds.has(id)),
          activeRefId: s.activeRefId === refId ? s.bound.find((b) => b.refId !== refId)?.refId ?? null : s.activeRefId,
        }));
      }),

    setEnabled: async (refId, enabled) =>
      guard(async () => {
        const binding = await referenceApi.updateBinding(currentProject(), refId, { enabled });
        await applyBinding(binding.entries);
      }),

    setAllEnabled: async (enabled) => {
      for (const b of get().bound) {
        if (b.enabled !== enabled) await get().setEnabled(b.refId, enabled);
      }
    },

    toggleLayer: async (refId, layerId) =>
      guard(async () => {
        const entry = get().bound.find((b) => b.refId === refId);
        const on = entry ? entry.layers[layerId] ?? true : true;
        const binding = await referenceApi.updateBinding(currentProject(), refId, { layers: { [layerId]: !on } });
        await applyBinding(binding.entries);
      }),

    receiveInterpretations: (cards) =>
      set((s) => {
        const next = { ...s.pendingCards };
        for (const card of cards) {
          const refId = card.refId ?? "";
          if (!refId) continue;
          next[refId] = [...(next[refId] ?? []).filter((c) => c.cardId !== card.cardId), { ...card, status: "proposed" }];
        }
        return { pendingCards: next };
      }),

    confirmCard: async (refId, cardId, edits) =>
      guard(async () => {
        const card = (get().pendingCards[refId] ?? []).find((c) => c.cardId === cardId);
        if (!card) return;
        let { reading, evidence, alternatives } = card;
        const pick = edits?.alternative;
        if (pick !== undefined && alternatives[pick]) {
          // 고른 대안을 본 해석으로, 원래 해석은 대안으로 남긴다
          const chosen = alternatives[pick];
          alternatives = [{ reading, evidence }, ...alternatives.filter((_, i) => i !== pick)];
          reading = chosen.reading;
          evidence = chosen.evidence?.length ? chosen.evidence : evidence;
        }
        await referenceApi.confirmCard(currentProject(), refId, {
          cardId,
          layer: card.layer,
          scope: card.scope,
          adoption: edits?.adoption ?? card.adoption,
          reading,
          evidence,
          alternatives,
        });
        set((s) => ({ pendingCards: { ...s.pendingCards, [refId]: (s.pendingCards[refId] ?? []).filter((c) => c.cardId !== cardId) } }));
        await applyBinding((await referenceApi.binding(currentProject())).entries);
      }),

    discardCard: (refId, cardId) =>
      set((s) => ({ pendingCards: { ...s.pendingCards, [refId]: (s.pendingCards[refId] ?? []).filter((c) => c.cardId !== cardId) } })),

    setCardAdoption: async (refId, cardId, adoption) =>
      guard(async () => {
        await referenceApi.updateCard(currentProject(), refId, cardId, { adoption });
        await applyBinding((await referenceApi.binding(currentProject())).entries);
      }),

    removeCard: async (refId, cardId) =>
      guard(async () => {
        await referenceApi.removeCard(currentProject(), refId, cardId);
        await applyBinding((await referenceApi.binding(currentProject())).entries);
      }),

    addPin: async (refId, input) =>
      guard(async () => {
        const pin = await referenceApi.addPin(refId, input);
        set((s) => ({ pins: { ...s.pins, [refId]: [...(s.pins[refId] ?? []), pin] } }));
        return pin;
      }),

    updatePin: async (refId, pinId, patch) =>
      guard(async () => {
        const pin = await referenceApi.updatePin(refId, pinId, patch);
        set((s) => ({ pins: { ...s.pins, [refId]: (s.pins[refId] ?? []).map((p) => (p.pinId === pinId ? pin : p)) } }));
      }),

    removePin: async (refId, pinId) =>
      guard(async () => {
        await referenceApi.removePin(refId, pinId);
        set((s) => ({
          pins: { ...s.pins, [refId]: (s.pins[refId] ?? []).filter((p) => p.pinId !== pinId) },
          checkedPinIds: s.checkedPinIds.filter((id) => id !== pinId),
          focusedPin: s.focusedPin?.pinId === pinId ? null : s.focusedPin,
        }));
      }),

    toggleChecked: (pinId) =>
      set((s) => ({
        checkedPinIds: s.checkedPinIds.includes(pinId)
          ? s.checkedPinIds.filter((id) => id !== pinId)
          : [...s.checkedPinIds, pinId],
      })),

    setRefPinsChecked: (refId, checked) =>
      set((s) => {
        const ids = (s.pins[refId] ?? []).map((p) => p.pinId);
        const rest = s.checkedPinIds.filter((id) => !ids.includes(id));
        return { checkedPinIds: checked ? [...rest, ...ids] : rest };
      }),

    clearChecked: () => set({ checkedPinIds: [] }),

    setFocusedPin: (pin) =>
      set({
        focusedPin: pin
          ? {
              refId: pin.refId,
              pinId: pin.pinId,
              page: pin.page ?? 1,
              kind: pin.kind,
              bbox: pin.bbox ?? undefined,
              text: pin.text,
              at: Date.now(),
            }
          : null,
      }),

    setActiveRefId: (refId) => set({ activeRefId: refId }),
  };
});

// --- 셀렉터 · 조회 ----------------------------------------------------------------------------

/** 참조 번호 (1부터). 연결되지 않았으면 0. */
export function referenceNumber(refId: string): number {
  return useReferenceStore.getState().bound.findIndex((b) => b.refId === refId) + 1;
}

export function findReferenceItem(refId: string): ReferenceItem | undefined {
  const s = useReferenceStore.getState();
  return s.bound.find((b) => b.refId === refId)?.item ?? s.library.find((it) => it.refId === refId);
}

export function findReferencePin(pinId: string): ReferencePin | undefined {
  for (const list of Object.values(useReferenceStore.getState().pins)) {
    const pin = list.find((p) => p.pinId === pinId);
    if (pin) return pin;
  }
  return undefined;
}

/** AI 에 보낼 핀: 체크한 핀이 하나라도 있으면 그것만, 없으면 전부. */
export function activePinsOf(refId: string): ReferencePin[] {
  const { pins, checkedPinIds } = useReferenceStore.getState();
  const list = pins[refId] ?? [];
  if (checkedPinIds.length === 0) return list;
  const checked = new Set(checkedPinIds);
  return list.filter((p) => checked.has(p.pinId));
}

/** 지금 보고 있는 레퍼런스 (없으면 사용 중인 첫 레퍼런스). */
export function currentReferenceId(): string | null {
  const { activeRefId, bound } = useReferenceStore.getState();
  if (activeRefId && bound.some((b) => b.refId === activeRefId)) return activeRefId;
  return bound.find((b) => b.enabled)?.refId ?? bound[0]?.refId ?? null;
}

/** 레퍼런스 목차 (구조 추출의 제목들). 블록 id 가 없으면 `p<쪽>` 을 쓴다. 불러오지 않았으면 빈 목록. */
export function referenceOutlineNodes(refId: string): { blockId: string; title: string; level: number; page: number }[] {
  const extraction = useReferenceStore.getState().extraction[refId];
  return (extraction?.outline ?? []).map((o, i) => ({ ...o, blockId: o.blockId || `p${o.page}-${i + 1}` }));
}

/** 셀렉터: 지금 보고 있는 레퍼런스 id (훅에서 쓰는 순수 함수). */
export const selectCurrentReferenceId = (s: ReferenceState): string | null => {
  if (s.activeRefId && s.bound.some((b) => b.refId === s.activeRefId)) return s.activeRefId;
  return s.bound.find((b) => b.enabled)?.refId ?? s.bound[0]?.refId ?? null;
};
