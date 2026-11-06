import { create } from "zustand";

import { PROJECT_ROOT_CRUMB_ID, type WorkbenchPhase } from "@vibe/vdoc-schema";

/**
 * 작업 공간 안에서 "지금 어디를 보고 있는가" (URL 로 공유되는 위치 상태).
 *
 * - 단계 · 줌 루트 · 아웃라인 선택/필터/접힘/호버
 * - 캔버스 옆에 띄운 참조 문서 작업창 (`openReferenceDocIds`, URL `splitRef`)
 * - 페이지 미리보기 패널이 보여주는 문서 (`previewDocId`, 없으면 활성 문서)
 *
 * 화면 배치(패널 크기 · 열림)는 `workspace-layout`, AI 실행과 변경안은 `ai-staging` 이 맡는다.
 */
export const WORKBENCH_PHASES: readonly WorkbenchPhase[] = ["storylining", "templating", "drafting"];

export function isWorkbenchPhase(value: unknown): value is WorkbenchPhase {
  return WORKBENCH_PHASES.includes(value as WorkbenchPhase);
}

/** URL · 저장소에서 복원하는 작업 공간 위치. */
export interface WorkspaceLocation {
  phase?: string | null;
  zoom?: string | null;
  /** 쉼표로 이은 참조 문서 ID 목록. */
  splitRef?: string | null;
}

export interface WorkspaceSessionState {
  currentPhase: WorkbenchPhase;
  zoomRootNodeId: string;
  selectedOutlinerNodeId: string | null;
  quickFilterQuery: string;
  collapsedNodeIds: string[];
  /** 아웃라인에서 가리키고 있는 캔버스 대상(슬롯 · 블록 · 페이지 · 노드 ID). */
  hoveredOutlineTargetId: string | null;
  /** AI 답변 · 첨부 칩이 가리키는 화면 요소 (페이지 · 블록 · 슬롯 · 참조 문서 id). 호버 동안만. */
  highlightedEntityId: string | null;
  /** 캔버스 왼쪽에 나란히 띄운 참조 문서 작업창 (띄운 순서). */
  openReferenceDocIds: string[];
  previewDocId: string | null;

  restoreLocation: (location: WorkspaceLocation) => void;
  setPhase: (phase: WorkbenchPhase) => void;
  zoomIntoNode: (nodeId: string) => void;
  setSelectedOutlinerNodeId: (nodeId: string | null) => void;
  setQuickFilterQuery: (query: string) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  collapseAllNodes: (nodeIds: string[]) => void;
  expandAllNodes: () => void;
  setHoveredOutlineTargetId: (id: string | null) => void;
  setHighlightedEntityId: (id: string | null) => void;
  toggleReferenceDoc: (docId: string) => void;
  openReferenceDoc: (docId: string) => void;
  closeReferenceDoc: (docId: string) => void;
  closeAllReferenceDocs: () => void;
  setOpenReferenceDocIds: (docIds: string[]) => void;
  setPreviewDocId: (docId: string | null) => void;
}

export function parseReferenceDocIds(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
}

const SESSION_STORAGE_KEY_OUTLINER = "vdoc:outliner_collapsed_nodes";

const loadOutlinerCollapsedFromSession = (): string[] => {
  if (typeof window === "undefined" || !window.sessionStorage) return [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY_OUTLINER);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOutlinerCollapsedToSession = (ids: string[]) => {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY_OUTLINER, JSON.stringify(ids));
  } catch {
    // quota exceeded 등 무시
  }
};

export const useWorkspaceSessionStore = create<WorkspaceSessionState>((set) => ({
  currentPhase: "drafting",
  zoomRootNodeId: PROJECT_ROOT_CRUMB_ID,
  selectedOutlinerNodeId: null,
  quickFilterQuery: "",
  collapsedNodeIds: loadOutlinerCollapsedFromSession(),
  hoveredOutlineTargetId: null,
  highlightedEntityId: null,
  openReferenceDocIds: [],
  previewDocId: null,

  restoreLocation: ({ phase, zoom, splitRef }) =>
    set({
      currentPhase: isWorkbenchPhase(phase) ? phase : "drafting",
      zoomRootNodeId: zoom || PROJECT_ROOT_CRUMB_ID,
      openReferenceDocIds: parseReferenceDocIds(splitRef),
    }),

  setPhase: (phase) => set({ currentPhase: phase }),

  zoomIntoNode: (nodeId) =>
    set({
      zoomRootNodeId: nodeId,
      selectedOutlinerNodeId: nodeId === PROJECT_ROOT_CRUMB_ID ? null : nodeId,
    }),

  setSelectedOutlinerNodeId: (nodeId) => set({ selectedOutlinerNodeId: nodeId }),
  setQuickFilterQuery: (query) => set({ quickFilterQuery: query }),

  toggleNodeCollapse: (nodeId) =>
    set((s) => {
      const next = s.collapsedNodeIds.includes(nodeId)
        ? s.collapsedNodeIds.filter((id) => id !== nodeId)
        : [...s.collapsedNodeIds, nodeId];
      saveOutlinerCollapsedToSession(next);
      return { collapsedNodeIds: next };
    }),
  collapseAllNodes: (nodeIds) => {
    saveOutlinerCollapsedToSession(nodeIds);
    set({ collapsedNodeIds: nodeIds });
  },
  expandAllNodes: () => {
    saveOutlinerCollapsedToSession([]);
    set({ collapsedNodeIds: [] });
  },

  setHoveredOutlineTargetId: (id) => set({ hoveredOutlineTargetId: id }),
  setHighlightedEntityId: (id) => set({ highlightedEntityId: id }),

  toggleReferenceDoc: (docId) =>
    set((s) => ({
      openReferenceDocIds: s.openReferenceDocIds.includes(docId)
        ? s.openReferenceDocIds.filter((id) => id !== docId)
        : [...s.openReferenceDocIds, docId],
    })),
  openReferenceDoc: (docId) =>
    set((s) => (s.openReferenceDocIds.includes(docId) ? s : { openReferenceDocIds: [...s.openReferenceDocIds, docId] })),
  closeReferenceDoc: (docId) =>
    set((s) => ({ openReferenceDocIds: s.openReferenceDocIds.filter((id) => id !== docId) })),
  closeAllReferenceDocs: () => set({ openReferenceDocIds: [] }),
  setOpenReferenceDocIds: (docIds) => set({ openReferenceDocIds: parseReferenceDocIds(docIds.join(",")) }),

  setPreviewDocId: (docId) => set({ previewDocId: docId }),
}));
