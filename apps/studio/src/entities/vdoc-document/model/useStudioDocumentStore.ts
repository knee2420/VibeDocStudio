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
  updateCurrentDoc: (updater: (prev: VDocDocument) => VDocDocument) => void;
  upsertDocument: (doc: VDocDocument) => void;
}

const defaultDoc = INITIAL_VDOC_DOCUMENTS[0];

export const useStudioDocumentStore = create<StudioDocumentState>((set) => ({
  docs: INITIAL_VDOC_DOCUMENTS,
  activeDocId: defaultDoc?.docId || "",
  activePageId: defaultDoc?.pages[0]?.pageId || "",
  mode: "Editing",
  setActiveDocId: (docId) =>
    set((state) => {
      const target =
        state.docs.find((d) => d.docId === docId) || state.docs[0];
      return {
        activeDocId: docId,
        activePageId: target?.pages[0]?.pageId || "",
      };
    }),
  setActivePageId: (pageId) => set({ activePageId: pageId }),
  setMode: (mode) => set({ mode }),
  toggleMode: () =>
    set((state) => ({
      mode: state.mode === "Editing" ? "Viewing" : "Editing",
    })),
  updateCurrentDoc: (updater) =>
    set((state) => ({
      docs: state.docs.map((d) =>
        d.docId === state.activeDocId ? updater(d) : d
      ),
    })),
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

