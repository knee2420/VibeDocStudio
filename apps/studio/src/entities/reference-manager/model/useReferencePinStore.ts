import { create } from "zustand";
import type { ReferenceSnippet, RegionPinSnippet, TextHighlightSnippet } from "./types";

const STORAGE_KEY = "vibe_reference_snippets_v1";

function loadStoredSnippets(): Record<string, ReferenceSnippet[]> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, ReferenceSnippet[]>;
    return {};
  } catch {
    return {};
  }
}

function persistSnippets(snippets: Record<string, ReferenceSnippet[]>) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch {
    // quota exceeded or SSR
  }
}

export interface FocusedSnippetInfo {
  docId: string;
  snippetId: string;
  page: number;
  kind?: "region" | "text" | "memo";
  bbox?: [number, number, number, number];
  text?: string;
  at: number;
}

export interface ReferencePinStoreState {
  /** 각 docId별 보관된 참조 스니펫(핀) 배열 */
  snippetsByDoc: Record<string, ReferenceSnippet[]>;

  /** 리소스 매니저 스타일로 체크박스 선택된 스니펫 ID 목록 */
  checkedSnippetIds: string[];

  /** 현재 뷰어에서 락온/포커스된 스니펫 정보 */
  focusedSnippet: FocusedSnippetInfo | null;

  /** 새 사각 영역 핀 등록 */
  addRegionPin: (
    docId: string,
    page: number,
    bbox: [number, number, number, number],
    excerpt?: string,
    customLabel?: string
  ) => RegionPinSnippet;

  /** 새 텍스트 하이라이트 핀 등록 */
  addTextPin: (
    docId: string,
    page: number,
    text: string,
    charRange?: [number, number],
    customLabel?: string
  ) => TextHighlightSnippet;

  /** 핀/스니펫 삭제 */
  removeSnippet: (docId: string, snippetId: string) => void;

  /** 개별 스니펫 체크박스 토글 */
  toggleSnippetChecked: (snippetId: string) => void;

  /** 특정 문서의 모든 핀 일괄 체크 / 해제 */
  toggleAllDocSnippets: (docId: string, checked: boolean) => void;

  /** 체크 선택 전체 초기화 */
  clearChecked: () => void;

  /** 뷰어 포커스 설정 */
  setFocusedSnippet: (
    focus:
      | ReferenceSnippet
      | {
          docId: string;
          snippetId?: string;
          id?: string;
          page?: number;
          bbox?: [number, number, number, number];
          text?: string;
          kind?: "region" | "text" | "memo";
        }
      | null
  ) => void;
}

export const useReferencePinStore = create<ReferencePinStoreState>((set) => ({
  snippetsByDoc: loadStoredSnippets(),
  checkedSnippetIds: [],
  focusedSnippet: null,

  addRegionPin: (docId, page, bbox, excerpt, customLabel) => {
    const id = `pin_box_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanExcerpt = excerpt?.trim().replace(/\s+/g, " ") || "";
    const shortText = cleanExcerpt.length > 28 ? `${cleanExcerpt.slice(0, 28)}…` : cleanExcerpt;
    const label = customLabel?.trim() || `${page}p: ${shortText || "사각 영역 발췌"}`;

    const newPin: RegionPinSnippet = {
      id,
      docId,
      kind: "region",
      page,
      bbox,
      label,
      excerpt: cleanExcerpt,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const existing = state.snippetsByDoc[docId] || [];
      const updated = {
        ...state.snippetsByDoc,
        [docId]: [...existing, newPin],
      };
      persistSnippets(updated);
      return { snippetsByDoc: updated };
    });

    return newPin;
  },

  addTextPin: (docId, page, text, charRange, customLabel) => {
    const id = `pin_text_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanText = text.trim().replace(/\s+/g, " ");
    const shortText = cleanText.length > 28 ? `${cleanText.slice(0, 28)}…` : cleanText;
    const label = customLabel?.trim() || `${page}p: ${shortText || "텍스트 발췌"}`;

    const newPin: TextHighlightSnippet = {
      id,
      docId,
      kind: "text",
      page,
      text: cleanText,
      charRange,
      label,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const existing = state.snippetsByDoc[docId] || [];
      const updated = {
        ...state.snippetsByDoc,
        [docId]: [...existing, newPin],
      };
      persistSnippets(updated);
      return { snippetsByDoc: updated };
    });

    return newPin;
  },

  removeSnippet: (docId, snippetId) => {
    set((state) => {
      const existing = state.snippetsByDoc[docId] || [];
      const updatedList = existing.filter((s) => s.id !== snippetId);
      const updated = {
        ...state.snippetsByDoc,
        [docId]: updatedList,
      };
      persistSnippets(updated);

      const updatedChecked = state.checkedSnippetIds.filter((id) => id !== snippetId);
      const updatedFocus = state.focusedSnippet?.snippetId === snippetId ? null : state.focusedSnippet;

      return {
        snippetsByDoc: updated,
        checkedSnippetIds: updatedChecked,
        focusedSnippet: updatedFocus,
      };
    });
  },

  toggleSnippetChecked: (snippetId) => {
    set((state) => {
      const exists = state.checkedSnippetIds.includes(snippetId);
      const updated = exists
        ? state.checkedSnippetIds.filter((id) => id !== snippetId)
        : [...state.checkedSnippetIds, snippetId];
      return { checkedSnippetIds: updated };
    });
  },

  toggleAllDocSnippets: (docId, checked) => {
    set((state) => {
      const docSnippets = state.snippetsByDoc[docId] || [];
      const docSnippetIds = docSnippets.map((s) => s.id);
      let updated: string[];
      if (checked) {
        updated = Array.from(new Set([...state.checkedSnippetIds, ...docSnippetIds]));
      } else {
        updated = state.checkedSnippetIds.filter((id) => !docSnippetIds.includes(id));
      }
      return { checkedSnippetIds: updated };
    });
  },

  clearChecked: () => {
    set({ checkedSnippetIds: [] });
  },

  setFocusedSnippet: (focus) => {
    if (!focus) {
      set({ focusedSnippet: null });
      return;
    }
    const snippetId =
      "id" in focus && focus.id
        ? focus.id
        : "snippetId" in focus && focus.snippetId
        ? focus.snippetId
        : "";
    const page = "page" in focus && typeof focus.page === "number" ? focus.page : 1;
    const bbox = "bbox" in focus ? (focus.bbox as [number, number, number, number]) : undefined;
    const text = "text" in focus ? (focus.text as string) : undefined;
    const kind = "kind" in focus ? focus.kind : bbox ? "region" : "text";

    set({
      focusedSnippet: {
        docId: focus.docId,
        snippetId,
        page,
        kind,
        bbox,
        text,
        at: Date.now(),
      },
    });
  },
}));
