import { create } from "zustand";

import type { StagedAiChange, WorkbenchPhase } from "@vibe/vdoc-schema";

function readInitialUrlState(): {
  phase: WorkbenchPhase;
  zoomRootNodeId: string;
  splitReferenceDocId: string | null;
} {
  if (typeof window === "undefined") {
    return {
      phase: "drafting",
      zoomRootNodeId: "project-root",
      splitReferenceDocId: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawPhase = params.get("phase");
  const phase: WorkbenchPhase =
    rawPhase === "storylining" ||
    rawPhase === "templating" ||
    rawPhase === "drafting"
      ? rawPhase
      : "drafting";
  const zoomRootNodeId = params.get("zoom") || "project-root";
  const splitReferenceDocId = params.get("splitRef") || null;
  return { phase, zoomRootNodeId, splitReferenceDocId };
}

const initialUrl = readInitialUrlState();

export type ActivityBarTab = "explorer" | "source-control" | "template-hub" | "settings";

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
  setPhase: (phase: WorkbenchPhase) => void;
  zoomIntoNode: (nodeId: string) => void;
  setSelectedOutlinerNodeId: (nodeId: string | null) => void;
  setQuickFilterQuery: (query: string) => void;
  setSplitReferenceDocId: (docId: string | null) => void;
  enqueueStagedChanges: (changes: StagedAiChange[]) => void;
  removeStagedChange: (diffId: string) => void;
  clearStagingQueue: () => void;
  startAiStreaming: (runId: string) => void;
  stopAiStreaming: (aborted?: boolean) => void;
  setShortcutPopoverOpen: (open: boolean) => void;
  setStagingDrawerOpen: (open: boolean) => void;
  setActiveActivityTab: (tab: ActivityBarTab) => void;
  toggleActivityTab: (tab: ActivityBarTab) => void;
  setLeftSidebarOpen: (open: boolean) => void;
}

export const useWorkspaceSessionStore = create<WorkspaceSessionState>((set) => ({
  currentPhase: initialUrl.phase,
  zoomRootNodeId: initialUrl.zoomRootNodeId,
  selectedOutlinerNodeId: "node-doc-minutes",
  quickFilterQuery: "",
  splitReferenceDocId: initialUrl.splitReferenceDocId,
  stagingQueue: [],
  isAiStreaming: false,
  activeRunId: null,
  lastAbortedRunId: null,
  shortcutPopoverOpen: false,
  stagingDrawerOpen: false,
  activeActivityTab: "explorer",
  leftSidebarOpen: true,

  setPhase: (phase) => set({ currentPhase: phase }),

  zoomIntoNode: (nodeId) =>
    set({
      zoomRootNodeId: nodeId,
      selectedOutlinerNodeId: nodeId === "project-root" ? null : nodeId,
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

  startAiStreaming: (runId) =>
    set({ isAiStreaming: true, activeRunId: runId }),

  stopAiStreaming: (aborted = false) =>
    set((s) => ({
      isAiStreaming: false,
      lastAbortedRunId: aborted ? s.activeRunId : s.lastAbortedRunId,
      activeRunId: null,
    })),

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
}));

