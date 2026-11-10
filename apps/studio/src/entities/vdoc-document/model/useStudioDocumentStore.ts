import { create } from "zustand";

import {
  iterPageSlotIds,
  replacePageContent,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { errorMessage, useHistoryStore } from "@/shared/lib";

import { type ChangeNote, documentApi } from "../api/documentApi";
import { ApiError } from "@/shared/api";

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
export type DocumentSaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface UpdateDocOptions {
  history?: boolean;
  label?: string;
  /** 같은 키로 연달아 들어오는 편집은 하나의 Undo 항목으로 합친다. */
  coalesceKey?: string;
  /** 이 변경의 출처 (AI 변경안 승인 등). 저장할 때 서버 개정 이력에 작성자로 남는다. */
  change?: ChangeNote;
  /** 비동기로 채워진 예약 페이지 ID — 이전 시점 문서 스냅샷 Undo 가 이 페이지 결과를 덮어쓰지 않게 보호한다. */
  asyncHydratedPageId?: string;
}

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
  updateCurrentDoc: (updater: (prev: VDocDocument) => VDocDocument, opts?: UpdateDocOptions) => void;
  /** 활성 문서가 아니어도 id 로 고친다 (AI 변경안은 자기 문서를 가리킨다). 없는 문서면 false. */
  updateDoc: (docId: string, updater: (prev: VDocDocument) => VDocDocument, opts?: UpdateDocOptions) => boolean;
  /** 서버 판으로 다시 불러온다 (저장 충돌 뒤). 저장하지 못한 로컬 변경은 버린다. */
  reloadDoc: (docId: string) => Promise<void>;
  /** 화면에만 올리는 임시 문서 (저장하지 않는다). 측정 도구 브리지 계약이므로 시그니처를 바꾸지 않는다. */
  upsertDocument: (doc: VDocDocument) => void;
  /** 서버에 저장되는 새 작업 문서 (PDF 가져오기 · .vdoc 파일 열기). */
  addDocument: (doc: VDocDocument) => Promise<void>;
  dismissError: () => void;
}

const AUTOSAVE_DELAY_MS = 800;
const autosaveTimers = new Map<string, number>();
/** 다음 저장에 실어 보낼 변경 출처 (문서별). 저장이 성공하면 비운다. */
const pendingNotes = new Map<string, ChangeNote[]>();
/** 비동기로 수화된 예약 페이지 ID (문서별) — 이전 스냅샷 restore() 가 비동기 결과를 지우지 않게 보호한다. */
const asyncHydratedPages = new Map<string, Set<string>>();


export const useStudioDocumentStore = create<StudioDocumentState>((set, get) => {
  const replaceDoc = (doc: VDocDocument) =>
    set((s) => ({ docs: s.docs.map((d) => (d.docId === doc.docId ? doc : d)) }));

  const setSaveState = (docId: string, state: DocumentSaveState) =>
    set((s) => ({ saveState: { ...s.saveState, [docId]: state } }));

  const saveNow = async (docId: string) => {
    autosaveTimers.delete(docId);
    const doc = get().docs.find((d) => d.docId === docId);
    if (!doc || !get().persistedDocIds.has(docId)) return;
    if (get().saveState[docId] === "conflict") return; // 충돌을 풀 때까지 덮어쓰지 않는다
    const notes = pendingNotes.get(docId) ?? [];
    pendingNotes.delete(docId);
    setSaveState(docId, "saving");
    try {
      const saved = await documentApi.save(doc, { baseRevision: doc.revision, changes: notes });
      // 서버가 매긴 새 버전만 받는다 (저장 중에 친 글자를 서버 판으로 덮지 않게)
      set((s) => ({
        docs: s.docs.map((d) => (d.docId === docId ? { ...d, revision: saved.revision } : d)),
      }));
      // 저장 중에 또 바뀌었으면 다음 자동 저장이 이미 예약돼 있다.
      if (!autosaveTimers.has(docId)) setSaveState(docId, "saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveState(docId, "conflict");
        set({ lastError: err.detail || "다른 곳에서 먼저 저장된 문서입니다. 다시 불러오세요." });
        return;
      }
      pendingNotes.set(docId, [...notes, ...(pendingNotes.get(docId) ?? [])]); // 다음 저장에 다시 싣는다
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
    const liveDoc = get().docs.find((d) => d.docId === doc.docId);
    if (!liveDoc) return;
    let merged = doc;
    const hydratedIds = asyncHydratedPages.get(doc.docId);
    if (hydratedIds && hydratedIds.size > 0) {
      for (const pageId of hydratedIds) {
        const liveIdx = liveDoc.pages.findIndex((p) => p.pageId === pageId);
        const snapIdx = merged.pages.findIndex((p) => p.pageId === pageId);
        if (liveIdx < 0 || snapIdx < 0) continue;
        const livePage = liveDoc.pages[liveIdx];
        const snapPage = merged.pages[snapIdx];
        if (snapPage.blocks.length === 0 && livePage.blocks.length > 0) {
          const liveSlots: Record<string, VDocSlot> = {};
          for (const sid of [livePage.headerSlotId, livePage.footerSlotId, ...iterPageSlotIds(livePage)]) {
            if (sid && liveDoc.slots[sid]) liveSlots[sid] = liveDoc.slots[sid];
          }
          merged = replacePageContent(merged, pageId, livePage, liveSlots, {
            thumbnail: liveDoc.preview?.pageThumbnails?.[liveIdx],
            sourceVariables: liveDoc.variables,
          });
        }
      }
    }
    replaceDoc(merged);
    scheduleSave(merged.docId);
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
      get().updateDoc(get().activeDocId, updater, opts);
    },

    updateDoc: (docId, updater, opts) => {
      const current = get().docs.find((d) => d.docId === docId);
      if (!current) return false;
      const next = updater(current);
      if (next === current) return true;
      replaceDoc(next);
      if (opts?.asyncHydratedPageId) {
        let setForDoc = asyncHydratedPages.get(next.docId);
        if (!setForDoc) {
          setForDoc = new Set<string>();
          asyncHydratedPages.set(next.docId, setForDoc);
        }
        setForDoc.add(opts.asyncHydratedPageId);
      }
      if (opts?.change) pendingNotes.set(docId, [...(pendingNotes.get(docId) ?? []), opts.change]);
      scheduleSave(next.docId);
      if (opts?.history) {
        useHistoryStore.getState().push({
          label: opts.label ?? "문서 구조가 변경되었습니다.",
          // 활성 문서가 아닌 문서의 변경은 프로젝트 범위로 둔다 (문서를 바꿔도 되돌릴 수 있게)
          scope: docId === get().activeDocId ? "document" : "project",
          coalesceKey: opts.coalesceKey,
          undo: () => restore(current),
          redo: () => restore(next),
        });
      }
      return true;
    },

    reloadDoc: async (docId) => {
      const fresh = await documentApi.get(docId);
      const timer = autosaveTimers.get(docId);
      if (timer) window.clearTimeout(timer);
      autosaveTimers.delete(docId);
      pendingNotes.delete(docId);
      asyncHydratedPages.delete(docId);
      replaceDoc(fresh);
      setSaveState(docId, "saved");
      set({ lastError: null });
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
