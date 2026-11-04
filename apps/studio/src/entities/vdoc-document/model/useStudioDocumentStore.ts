import { create } from "zustand";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { errorMessage, useHistoryStore } from "@/shared/lib";

import { documentApi } from "../api/documentApi";

/**
 * 열려 있는 `.vdoc` 문서들의 클라이언트 작업 사본.
 *
 * 원장은 서버(`/api/documents`)다. 서버에서 불러왔거나(`hydrate`) 영속 문서로 추가한(`addDocument`)
 * 문서만 `persistedDocIds` 에 들어가며, 그 문서의 변경은 잠시 모았다가 자동 저장된다.
 * `upsertDocument` 로 넣은 문서는 화면에만 있는 임시 문서다 (측정 도구가 주입하는 문서 등).
 *
 * 구조 편집(`{ history: true }`)은 공용 이력(`useHistoryStore`)에 남아 `Ctrl+Z` 로 되돌린다.
 * 슬롯 타이핑은 슬롯 편집기 자체 이력을 쓰므로 여기 남기지 않는다.
 */
export type DocumentSaveState = "saved" | "dirty" | "saving" | "error";

export interface StudioDocumentState {
  docs: VDocDocument[];
  activeDocId: string;
  activePageId: string;
  mode: "Editing" | "Viewing";
  persistedDocIds: ReadonlySet<string>;
  saveState: Record<string, DocumentSaveState>;
  lastError: string | null;

  /** 서버에서 문서들을 불러와 작업 사본을 만든다. */
  hydrate: (docIds: string[], preferredActiveDocId?: string | null) => Promise<void>;
  setActiveDocId: (docId: string) => void;
  setActivePageId: (pageId: string) => void;
  setMode: (mode: "Editing" | "Viewing") => void;
  toggleMode: () => void;
  updateCurrentDoc: (
    updater: (prev: VDocDocument) => VDocDocument,
    opts?: { history?: boolean; label?: string }
  ) => void;
  /** 화면에만 올리는 임시 문서 (저장하지 않는다). 측정 도구 브리지 계약이므로 시그니처를 바꾸지 않는다. */
  upsertDocument: (doc: VDocDocument) => void;
  /** 서버에 저장되는 새 작업 문서 (PDF 가져오기 · .vdoc 파일 열기). */
  addDocument: (doc: VDocDocument) => Promise<void>;
  dismissError: () => void;
}

const AUTOSAVE_DELAY_MS = 800;
const autosaveTimers = new Map<string, number>();


export const useStudioDocumentStore = create<StudioDocumentState>((set, get) => {
  const replaceDoc = (doc: VDocDocument) =>
    set((s) => ({ docs: s.docs.map((d) => (d.docId === doc.docId ? doc : d)) }));

  const setSaveState = (docId: string, state: DocumentSaveState) =>
    set((s) => ({ saveState: { ...s.saveState, [docId]: state } }));

  const saveNow = async (docId: string) => {
    autosaveTimers.delete(docId);
    const doc = get().docs.find((d) => d.docId === docId);
    if (!doc || !get().persistedDocIds.has(docId)) return;
    setSaveState(docId, "saving");
    try {
      await documentApi.save(doc);
      // 저장 중에 또 바뀌었으면 다음 자동 저장이 이미 예약돼 있다.
      if (!autosaveTimers.has(docId)) setSaveState(docId, "saved");
    } catch (err) {
      setSaveState(docId, "error");
      set({ lastError: errorMessage(err, "문서를 저장하지 못했습니다.") });
    }
  };

  const scheduleSave = (docId: string) => {
    if (!get().persistedDocIds.has(docId)) return;
    const existing = autosaveTimers.get(docId);
    if (existing) window.clearTimeout(existing);
    autosaveTimers.set(docId, window.setTimeout(() => void saveNow(docId), AUTOSAVE_DELAY_MS));
    setSaveState(docId, "dirty");
  };

  /** 문서 전체를 갈아 끼우는 Undo/Redo (같은 문서가 열려 있을 때만). */
  const restore = (doc: VDocDocument) => {
    if (!get().docs.some((d) => d.docId === doc.docId)) return;
    replaceDoc(doc);
    scheduleSave(doc.docId);
  };

  return {
    docs: [],
    activeDocId: "",
    activePageId: "",
    mode: "Editing",
    persistedDocIds: new Set<string>(),
    saveState: {},
    lastError: null,

    hydrate: async (docIds, preferredActiveDocId) => {
      const unique = [...new Set(docIds)];
      const results = await Promise.allSettled(unique.map((id) => documentApi.get(id)));
      const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.length - loaded.length;
      const active =
        loaded.find((d) => d.docId === preferredActiveDocId) ??
        loaded.find((d) => d.docId === get().activeDocId) ??
        loaded[0];
      set({
        docs: loaded,
        persistedDocIds: new Set(loaded.map((d) => d.docId)),
        saveState: Object.fromEntries(loaded.map((d) => [d.docId, "saved" as const])),
        activeDocId: active?.docId ?? "",
        activePageId: active?.pages[0]?.pageId ?? "",
        lastError: failed > 0 ? `문서 ${failed}개를 불러오지 못했습니다.` : null,
      });
    },

    setActiveDocId: (docId) => {
      // 문서 이력은 문서 세션 단위다. 다른 문서로 가면 이전 문서의 되돌리기 항목을 비운다.
      if (docId !== get().activeDocId) useHistoryStore.getState().clearScope("document");
      const target = get().docs.find((d) => d.docId === docId) ?? get().docs[0];
      set({ activeDocId: docId, activePageId: target?.pages[0]?.pageId ?? "" });
    },

    setActivePageId: (pageId) => set({ activePageId: pageId }),
    setMode: (mode) => set({ mode }),
    toggleMode: () => set((s) => ({ mode: s.mode === "Editing" ? "Viewing" : "Editing" })),

    updateCurrentDoc: (updater, opts) => {
      const current = get().docs.find((d) => d.docId === get().activeDocId);
      if (!current) return;
      const next = updater(current);
      if (next === current) return;
      replaceDoc(next);
      scheduleSave(next.docId);
      if (opts?.history) {
        useHistoryStore.getState().push({
          label: opts.label ?? "문서 구조가 변경되었습니다.",
          scope: "document",
          undo: () => restore(current),
          redo: () => restore(next),
        });
      }
    },

    upsertDocument: (doc) =>
      set((s) => {
        const exists = s.docs.some((d) => d.docId === doc.docId);
        return {
          docs: exists ? s.docs.map((d) => (d.docId === doc.docId ? doc : d)) : [...s.docs, doc],
          activeDocId: doc.docId,
          activePageId: doc.pages[0]?.pageId ?? "",
        };
      }),

    addDocument: async (doc) => {
      get().upsertDocument(doc);
      set((s) => ({ persistedDocIds: new Set([...s.persistedDocIds, doc.docId]) }));
      await saveNow(doc.docId);
    },

    dismissError: () => set({ lastError: null }),
  };
});

/** ID 로 문서 하나를 고르는 셀렉터 (`useStudioDocumentStore(selectDocument(id))`). */
export const selectDocument =
  (docId: string | null | undefined) =>
  (s: StudioDocumentState): VDocDocument | undefined =>
    docId ? s.docs.find((d) => d.docId === docId) : undefined;

/** 활성 문서 (없으면 `undefined`). */
export const selectActiveDocument = (s: StudioDocumentState): VDocDocument | undefined =>
  s.docs.find((d) => d.docId === s.activeDocId) ?? s.docs[0];
