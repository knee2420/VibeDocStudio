import { create } from "zustand";

import { PROJECT_ROOT_CRUMB_ID, type WorkbenchPhase } from "@vibe/vdoc-schema";

/**
 * 작업 공간 안에서 "지금 어디를 보고 있는가" (URL 로 공유되는 위치 상태).
 *
 * - 단계 · 줌 루트 · 아웃라인 선택/필터/접힘/호버
 * - 캔버스 옆에 띄운 참조 문서 작업창 (`openReferenceIds`, URL `splitRef`)
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
  /** 캔버스 왼쪽에 나란히 띄운 레퍼런스 작업창 (refId, 띄운 순서). */
  openReferenceIds: string[];
  previewDocId: string | null;

  restoreLocation: (location: WorkspaceLocation) => void;
  setPhase: (phase: WorkbenchPhase) => void;
  zoomIntoNode: (nodeId: string) => void;
  setSelectedOutlinerNodeId: (nodeId: string | null) => void;
  setQuickFilterQuery: (query: string) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  /** 주어진 노드들만 한꺼번에 접거나 편다 (다른 구역의 접힘 상태는 건드리지 않는다). */
  setNodesCollapsed: (nodeIds: readonly string[], collapsed: boolean) => void;
  setHoveredOutlineTargetId: (id: string | null) => void;
  setHighlightedEntityId: (id: string | null) => void;
  toggleReference: (refId: string) => void;
  openReference: (refId: string) => void;
  closeReference: (refId: string) => void;
  closeAllReferences: () => void;
  setOpenReferenceIds: (refIds: string[]) => void;
  setPreviewDocId: (docId: string | null) => void;
}

export function parseReferenceIds(raw: string | null | undefined): string[] {
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
  openReferenceIds: [],
  previewDocId: null,

  restoreLocation: ({ phase, zoom, splitRef }) =>
    set({
      currentPhase: isWorkbenchPhase(phase) ? phase : "drafting",
      zoomRootNodeId: zoom || PROJECT_ROOT_CRUMB_ID,
      openReferenceIds: parseReferenceIds(splitRef),
    }),

  setPhase: (phase) => set({ currentPhase: phase }),

  zoomIntoNode: (nodeId) =>
    set({
      zoomRootNodeId: nodeId,
      selectedOutlinerNodeId: nodeId === PROJECT_ROOT_CRUMB_ID ? null : nodeId,
    }),

  setSelectedOutlinerNodeId: (nodeId) => set((s) => (s.selectedOutlinerNodeId === nodeId ? s : { selectedOutlinerNodeId: nodeId })),
  setQuickFilterQuery: (query) => set((s) => (s.quickFilterQuery === query ? s : { quickFilterQuery: query })),

  toggleNodeCollapse: (nodeId) =>
    set((s) => {
      const next = s.collapsedNodeIds.includes(nodeId)
        ? s.collapsedNodeIds.filter((id) => id !== nodeId)
        : [...s.collapsedNodeIds, nodeId];
      saveOutlinerCollapsedToSession(next);
      return { collapsedNodeIds: next };
    }),
  setNodesCollapsed: (nodeIds, collapsed) =>
    set((s) => {
      if (nodeIds.length === 0) return s;
      const ids = new Set(s.collapsedNodeIds);
      for (const id of nodeIds) {
        if (collapsed) ids.add(id);
        else ids.delete(id);
      }
      const next = [...ids];
      saveOutlinerCollapsedToSession(next);
      return { collapsedNodeIds: next };
    }),

  // 호버는 초당 수십 번 들어온다. 값이 같으면 구독자(아웃라인 줄 · 캔버스)를 깨우지 않는다.
  setHoveredOutlineTargetId: (id) => set((s) => (s.hoveredOutlineTargetId === id ? s : { hoveredOutlineTargetId: id })),
  setHighlightedEntityId: (id) => set((s) => (s.highlightedEntityId === id ? s : { highlightedEntityId: id })),

  toggleReference: (docId) =>
    set((s) => ({
      openReferenceIds: s.openReferenceIds.includes(docId)
        ? s.openReferenceIds.filter((id) => id !== docId)
        : [...s.openReferenceIds, docId],
    })),
  openReference: (docId) =>
    set((s) => (s.openReferenceIds.includes(docId) ? s : { openReferenceIds: [...s.openReferenceIds, docId] })),
  closeReference: (docId) =>
    set((s) => ({ openReferenceIds: s.openReferenceIds.filter((id) => id !== docId) })),
  closeAllReferences: () => set({ openReferenceIds: [] }),
  setOpenReferenceIds: (docIds) => set({ openReferenceIds: parseReferenceIds(docIds.join(",")) }),

  setPreviewDocId: (docId) => set({ previewDocId: docId }),
}));
