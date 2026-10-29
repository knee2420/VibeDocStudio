import { create } from "zustand";

import {
  INITIAL_VDOC_DOCUMENTS,
  type VDocDocument,
} from "@vibe/vdoc-schema";

export interface StudioDocumentState {
  docs: VDocDocument[];
  activeDocId: string;
  activePageId: string;
  mode: "Editing" | "Viewing";
  setActiveDocId: (docId: string) => void;
  setActivePageId: (pageId: string) => void;
  setMode: (mode: "Editing" | "Viewing") => void;
  toggleMode: () => void;
  /**
   * Replaces the active document. Pass `{ history: true }` for structural edits (blocks, tables,
   * locks) so the document-level undo can restore them; per-keystroke slot edits use the slot
   * editor's own history instead.
   */
  updateCurrentDoc: (
    updater: (prev: VDocDocument) => VDocDocument,
    opts?: { history?: boolean }
  ) => void;
  upsertDocument: (doc: VDocDocument) => void;
  past: VDocDocument[];
  future: VDocDocument[];
  undoDoc: () => void;
  redoDoc: () => void;
}

const HISTORY_LIMIT = 50;

const defaultDoc = INITIAL_VDOC_DOCUMENTS[0];

export const useStudioDocumentStore = create<StudioDocumentState>((set) => ({
  docs: INITIAL_VDOC_DOCUMENTS,
  activeDocId: defaultDoc?.docId || "",
  activePageId: defaultDoc?.pages[0]?.pageId || "",
  mode: "Editing",
  setActiveDocId: (docId) =>
    set((state) => {
      // History is per document session; switching documents starts fresh.
      const target =
        state.docs.find((d) => d.docId === docId) || state.docs[0];
      return {
        activeDocId: docId,
        activePageId: target?.pages[0]?.pageId || "",
        past: [],
        future: [],
      };
    }),
  setActivePageId: (pageId) => set({ activePageId: pageId }),
  setMode: (mode) => set({ mode }),
  toggleMode: () =>
    set((state) => ({
      mode: state.mode === "Editing" ? "Viewing" : "Editing",
    })),
  past: [],
  future: [],
  updateCurrentDoc: (updater, opts) =>
    set((state) => {
      const current = state.docs.find((d) => d.docId === state.activeDocId);
      if (!current) return {};
      const next = updater(current);
      if (next === current) return {};
      return {
        docs: state.docs.map((d) => (d.docId === state.activeDocId ? next : d)),
        ...(opts?.history
          ? { past: [...state.past, current].slice(-HISTORY_LIMIT), future: [] }
          : {}),
      };
    }),
  undoDoc: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      const current = state.docs.find((d) => d.docId === state.activeDocId);
      if (!prev || !current || prev.docId !== current.docId) return {};
      return {
        docs: state.docs.map((d) => (d.docId === prev.docId ? prev : d)),
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }),
  redoDoc: () =>
    set((state) => {
      const next = state.future[0];
      const current = state.docs.find((d) => d.docId === state.activeDocId);
      if (!next || !current || next.docId !== current.docId) return {};
      return {
        docs: state.docs.map((d) => (d.docId === next.docId ? next : d)),
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }),
  upsertDocument: (doc) =>
    set((state) => {
      const exists = state.docs.some((d) => d.docId === doc.docId);
      const nextDocs = exists
        ? state.docs.map((d) => (d.docId === doc.docId ? doc : d))
        : [...state.docs, doc];
      return {
        docs: nextDocs,
        activeDocId: doc.docId,
        activePageId: doc.pages[0]?.pageId || "",
      };
    }),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __studioDocStore: typeof useStudioDocumentStore }).__studioDocStore = useStudioDocumentStore;
}
