import { create } from "zustand";

import {
  PROJECT_ROOT_CRUMB_ID,
  type StagedAiChange,
  type WorkbenchPhase,
} from "@vibe/vdoc-schema";

const PHASES: readonly WorkbenchPhase[] = ["storylining", "templating", "drafting"];

export type ActivityBarTab = "explorer" | "source-control" | "template-hub" | "settings";

/** URL · 저장소에서 복원하는 작업 공간 위치. */
export interface WorkspaceLocation {
  phase?: string | null;
  zoom?: string | null;
  splitRef?: string | null;
}

export interface WorkspaceSessionState {
  currentPhase: WorkbenchPhase;
  zoomRootNodeId: string;
  selectedOutlinerNodeId: string | null;
  quickFilterQuery: string;
  splitReferenceDocId: string | null;
  stagingQueue: StagedAiChange[];
  isAiStreaming: boolean;
  activeRunId: string | null;
  lastAbortedRunId: string | null;
  shortcutPopoverOpen: boolean;
  stagingDrawerOpen: boolean;
  activeActivityTab: ActivityBarTab;
  leftSidebarOpen: boolean;
  restoreLocation: (location: WorkspaceLocation) => void;
  setPhase: (phase: WorkbenchPhase) => void;
  zoomIntoNode: (nodeId: string) => void;
  setSelectedOutlinerNodeId: (nodeId: string | null) => void;
  setQuickFilterQuery: (query: string) => void;
  setSplitReferenceDocId: (docId: string | null) => void;
  enqueueStagedChanges: (changes: StagedAiChange[]) => void;
  removeStagedChange: (diffId: string) => void;
  clearStagingQueue: () => void;
  /**
   * AI 실행 시작. `abort` 는 그 실행을 실제로 멈추는 방법(요청 중단 + 서버 취소)이며,
   * 어디서 중단하든(Esc · 리본 버튼 · 작업대 버튼) `abortAiRun()` 하나로 같은 경로를 탄다.
   */
  startAiRun: (runId: string, abort: () => void) => void;
  finishAiRun: (runId: string) => void;
  abortAiRun: () => void;
  setShortcutPopoverOpen: (open: boolean) => void;
  setStagingDrawerOpen: (open: boolean) => void;
  setActiveActivityTab: (tab: ActivityBarTab) => void;
  toggleActivityTab: (tab: ActivityBarTab) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  referenceDeckHeight: number;
  setReferenceDeckHeight: (height: number) => void;
  collapsedNodeIds: string[];
  toggleNodeCollapse: (nodeId: string) => void;
  collapseAllNodes: (nodeIds: string[]) => void;
  expandAllNodes: () => void;
  hoveredOutlinerNodeId: string | null;
  setHoveredOutlinerNodeId: (id: string | null) => void;
  isPageViewMode: boolean;
  previewDocId: string | null;
  peekPageId: string | null;
  peekDocId: string | null;
  peekPosition: { x: number; y: number } | null;
  setPageViewMode: (on: boolean) => void;
  togglePageViewMode: () => void;
  setPreviewDocId: (docId: string | null) => void;
  setPeekPage: (
    pageId: string | null,
    pos?: { x: number; y: number } | null,
    docId?: string | null
  ) => void;
}

/** 실행 중단 방법은 직렬화할 값이 아니므로 상태 밖에 둔다. */
let activeRunAbort: (() => void) | null = null;

export const useWorkspaceSessionStore = create<WorkspaceSessionState>((set, get) => ({
  currentPhase: "drafting",
  zoomRootNodeId: PROJECT_ROOT_CRUMB_ID,
  selectedOutlinerNodeId: null,
  quickFilterQuery: "",
  splitReferenceDocId: null,
  stagingQueue: [],
  isAiStreaming: false,
  activeRunId: null,
  lastAbortedRunId: null,
  shortcutPopoverOpen: false,
  stagingDrawerOpen: false,
  activeActivityTab: "explorer",
  leftSidebarOpen: true,
  sidebarWidth:
    typeof window !== "undefined"
      ? Number(window.localStorage.getItem("vdoc-sidebar-width")) || 320
      : 320,
  referenceDeckHeight:
    typeof window !== "undefined"
      ? Number(window.localStorage.getItem("vdoc-ref-deck-height")) || 140
      : 140,
  collapsedNodeIds: [],
  hoveredOutlinerNodeId: null,
  isPageViewMode: false,
  previewDocId: null,
  peekPageId: null,
  peekDocId: null,
  peekPosition: null,

  setPageViewMode: (on) => set({ isPageViewMode: on }),
  togglePageViewMode: () => set((s) => ({ isPageViewMode: !s.isPageViewMode })),
  setPreviewDocId: (docId) => set({ previewDocId: docId }),
  setPeekPage: (pageId, pos, docId) =>
    set({
      peekPageId: pageId,
      peekPosition: pos ?? null,
      peekDocId: pageId ? (docId ?? null) : null,
    }),

  restoreLocation: ({ phase, zoom, splitRef }) =>
    set({
      currentPhase: PHASES.includes(phase as WorkbenchPhase) ? (phase as WorkbenchPhase) : "drafting",
      zoomRootNodeId: zoom || PROJECT_ROOT_CRUMB_ID,
      splitReferenceDocId: splitRef || null,
    }),

  setPhase: (phase) => set({ currentPhase: phase }),

  zoomIntoNode: (nodeId) =>
    set({
      zoomRootNodeId: nodeId,
      selectedOutlinerNodeId: nodeId === PROJECT_ROOT_CRUMB_ID ? null : nodeId,
    }),

  setSelectedOutlinerNodeId: (nodeId) => set({ selectedOutlinerNodeId: nodeId }),
  setQuickFilterQuery: (query) => set({ quickFilterQuery: query }),
  setSplitReferenceDocId: (docId) => set({ splitReferenceDocId: docId }),

  enqueueStagedChanges: (changes) =>
    set((s) => ({
      stagingQueue: [...s.stagingQueue, ...changes],
      stagingDrawerOpen: true,
    })),

  removeStagedChange: (diffId) =>
    set((s) => ({
      stagingQueue: s.stagingQueue.filter((c) => c.diffId !== diffId),
    })),

  clearStagingQueue: () => set({ stagingQueue: [] }),

  startAiRun: (runId, abort) => {
    activeRunAbort = abort;
    set({ isAiStreaming: true, activeRunId: runId, lastAbortedRunId: null });
  },

  finishAiRun: (runId) => {
    if (get().activeRunId !== runId) return;
    activeRunAbort = null;
    set({ isAiStreaming: false, activeRunId: null });
  },

  abortAiRun: () => {
    const runId = get().activeRunId;
    if (!runId) return;
    const abort = activeRunAbort;
    activeRunAbort = null;
    set({ isAiStreaming: false, activeRunId: null, lastAbortedRunId: runId });
    abort?.();
  },

  setShortcutPopoverOpen: (open) => set({ shortcutPopoverOpen: open }),
  setStagingDrawerOpen: (open) => set({ stagingDrawerOpen: open }),
  setActiveActivityTab: (tab) => set({ activeActivityTab: tab, leftSidebarOpen: true }),
  toggleActivityTab: (tab) =>
    set((s) => {
      if (s.activeActivityTab === tab && s.leftSidebarOpen) {
        return { leftSidebarOpen: false };
      }
      return { activeActivityTab: tab, leftSidebarOpen: true };
    }),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),

  setSidebarWidth: (width) => {
    const clamped = Math.max(250, Math.min(650, width));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("vdoc-sidebar-width", String(clamped));
      } catch {
        // ignore quota errors
      }
    }
    set({ sidebarWidth: clamped });
  },

  setReferenceDeckHeight: (height) => {
    const maxHeight =
      typeof window !== "undefined"
        ? Math.max(300, Math.floor(window.innerHeight * 0.75))
        : 500;
    const clamped = Math.max(50, Math.min(maxHeight, height));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("vdoc-ref-deck-height", String(clamped));
      } catch {
        // ignore quota errors
      }
    }
    set({ referenceDeckHeight: clamped });
  },

  toggleNodeCollapse: (nodeId) =>
    set((s) => ({
      collapsedNodeIds: s.collapsedNodeIds.includes(nodeId)
        ? s.collapsedNodeIds.filter((id) => id !== nodeId)
        : [...s.collapsedNodeIds, nodeId],
    })),

  collapseAllNodes: (nodeIds) => set({ collapsedNodeIds: nodeIds }),
  expandAllNodes: () => set({ collapsedNodeIds: [] }),

  setHoveredOutlinerNodeId: (id) => set({ hoveredOutlinerNodeId: id }),
}));
