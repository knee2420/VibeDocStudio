import { create } from "zustand";

import {
  INITIAL_VPROJECTS,
  type OutlinerNode,
  type ProvenanceRecord,
  type VProjectManifest,
  type WorkbenchPhase,
} from "@vibe/vdoc-schema";

export interface ProjectStoreState {
  projects: VProjectManifest[];
  activeProjectId: string;
  selectedReferenceProjectId: string;
  past: VProjectManifest[];
  future: VProjectManifest[];
  lastUndoMessage: string | null;
  setProjects: (projects: VProjectManifest[]) => void;
  setActiveProjectId: (projectId: string) => void;
  setSelectedReferenceProjectId: (refProjectId: string) => void;
  updateActiveProject: (
    updater: (prev: VProjectManifest) => VProjectManifest,
    opts?: { history?: boolean; label?: string }
  ) => void;
  setActiveProjectPhase: (phase: WorkbenchPhase) => void;
  insertStorylineNode: (
    parentId: string | null,
    partial: Partial<OutlinerNode> & { title: string }
  ) => OutlinerNode | null;
  updateStorylineNode: (
    nodeId: string,
    patch: Partial<OutlinerNode>,
    opts?: { history?: boolean; label?: string }
  ) => void;
  deleteStorylineNode: (nodeId: string) => void;
  moveStorylineNode: (nodeId: string, direction: -1 | 1) => void;
  indentOutlinerNode: (nodeId: string, deltaDepth: -1 | 1) => void;
  cloneNodeFromReference: (
    sourceProjectId: string,
    sourceNodeId: string,
    targetParentId?: string | null
  ) => { clonedNode: OutlinerNode; provenance: ProvenanceRecord } | null;
  bindReferenceProjects: (referenceIds: string[]) => void;
  assignTemplateToNode: (nodeId: string, templateId: string) => void;
  undoProject: () => void;
  redoProject: () => void;
  dismissUndoToast: () => void;
}

const HISTORY_LIMIT = 40;
const defaultActive =
  INITIAL_VPROJECTS.find((p) => !p.isReferenceOnly) || INITIAL_VPROJECTS[0];
const defaultRef =
  INITIAL_VPROJECTS.find((p) => p.isReferenceOnly) || INITIAL_VPROJECTS[1];

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: INITIAL_VPROJECTS,
  activeProjectId: defaultActive?.projectId || "vproj-enterprise-architecture-suite",
  selectedReferenceProjectId:
    defaultRef?.projectId || "vproj-ref-cloud-migration-rfp",
  past: [],
  future: [],
  lastUndoMessage: null,

  setProjects: (projects) => set({ projects }),

  setActiveProjectId: (projectId) =>
    set({
      activeProjectId: projectId,
      past: [],
      future: [],
      lastUndoMessage: null,
    }),

  setSelectedReferenceProjectId: (refProjectId) =>
    set({ selectedReferenceProjectId: refProjectId }),

  updateActiveProject: (updater, opts) =>
    set((state) => {
      const current = state.projects.find(
        (p) => p.projectId === state.activeProjectId
      );
      if (!current || current.isReferenceOnly) return {};
      const next = updater(current);
      if (next === current) return {};
      return {
        projects: state.projects.map((p) =>
          p.projectId === current.projectId ? next : p
        ),
        ...(opts?.history
          ? {
              past: [...state.past, current].slice(-HISTORY_LIMIT),
              future: [],
              lastUndoMessage: opts.label || "작업 내용이 변경되었습니다.",
            }
          : {}),
      };
    }),

  setActiveProjectPhase: (phase) => {
    get().updateActiveProject((prev) => ({
      ...prev,
      activePhase: phase,
      updatedAt: new Date().toISOString(),
    }));
  },

  insertStorylineNode: (parentId, partial) => {
    let created: OutlinerNode | null = null;
    get().updateActiveProject(
      (prev) => {
        const parent = prev.storylineNodes.find((n) => n.nodeId === parentId);
        const resolvedParentId =
          parent?.nodeId || prev.storylineNodes[0]?.nodeId || null;
        const depth = parent ? parent.depth + 1 : 1;
        const nodeId =
          partial.nodeId ||
          `node-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
        created = {
          nodeId,
          parentId: resolvedParentId,
          depth,
          zoomLevel: partial.zoomLevel || (depth === 1 ? "document" : depth === 2 ? "page" : "slot"),
          title: partial.title,
          summary: partial.summary || "",
          targetDocId: partial.targetDocId ?? prev.docIds[0] ?? null,
          targetPageId: partial.targetPageId ?? null,
          targetBlockId: partial.targetBlockId ?? null,
          targetSlotId: partial.targetSlotId ?? null,
          recommendedTemplateId:
            partial.recommendedTemplateId || "section-block",
          provenanceSourceProjectId: partial.provenanceSourceProjectId ?? null,
          provenanceSourceNodeId: partial.provenanceSourceNodeId ?? null,
          aiStatus: partial.aiStatus || "idle",
        };
        return {
          ...prev,
          storylineNodes: [...prev.storylineNodes, created],
          updatedAt: new Date().toISOString(),
        };
      },
      { history: true, label: `노드 추가: "${partial.title.slice(0, 28)}"` }
    );
    return created;
  },

  updateStorylineNode: (nodeId, patch, opts) => {
    get().updateActiveProject(
      (prev) => ({
        ...prev,
        storylineNodes: prev.storylineNodes.map((n) =>
          n.nodeId === nodeId ? { ...n, ...patch } : n
        ),
        updatedAt: new Date().toISOString(),
      }),
      opts
    );
  },

  deleteStorylineNode: (nodeId) => {
    get().updateActiveProject(
      (prev) => {
        const target = prev.storylineNodes.find((n) => n.nodeId === nodeId);
        if (!target || target.parentId === null) return prev;
        const toDelete = new Set<string>([nodeId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const n of prev.storylineNodes) {
            if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.nodeId)) {
              toDelete.add(n.nodeId);
              changed = true;
            }
          }
        }
        return {
          ...prev,
          storylineNodes: prev.storylineNodes.filter(
            (n) => !toDelete.has(n.nodeId)
          ),
          updatedAt: new Date().toISOString(),
        };
      },
      { history: true, label: "아웃라인 노드가 삭제되었습니다." }
    );
  },

  moveStorylineNode: (nodeId, direction) => {
    get().updateActiveProject(
      (prev) => {
        const list = [...prev.storylineNodes];
        const idx = list.findIndex((n) => n.nodeId === nodeId);
        if (idx <= 0) return prev;
        const swapIdx = idx + direction;
        if (swapIdx <= 0 || swapIdx >= list.length) return prev;
        const tmp = list[idx];
        list[idx] = list[swapIdx];
        list[swapIdx] = tmp;
        return {
          ...prev,
          storylineNodes: list,
          updatedAt: new Date().toISOString(),
        };
      },
      { history: true, label: "아웃라인 노드 순서가 변경되었습니다." }
    );
  },

  indentOutlinerNode: (nodeId, deltaDepth) => {
    get().updateActiveProject(
      (prev) => ({
        ...prev,
        storylineNodes: prev.storylineNodes.map((n) => {
          if (n.nodeId !== nodeId || n.parentId === null) return n;
          const nextDepth = Math.max(1, Math.min(3, n.depth + deltaDepth));
          const nextZoom =
            nextDepth === 1 ? "document" : nextDepth === 2 ? "page" : "slot";
          return { ...n, depth: nextDepth, zoomLevel: nextZoom };
        }),
        updatedAt: new Date().toISOString(),
      }),
      { history: true, label: "노드 계층 깊이(Depth)가 조정되었습니다." }
    );
  },

  cloneNodeFromReference: (sourceProjectId, sourceNodeId, targetParentId) => {
    const state = get();
    const sourceProj = state.projects.find(
      (p) => p.projectId === sourceProjectId
    );
    const sourceNode = sourceProj?.storylineNodes.find(
      (n) => n.nodeId === sourceNodeId
    );
    if (!sourceProj || !sourceNode) return null;

    let result: { clonedNode: OutlinerNode; provenance: ProvenanceRecord } | null =
      null;

    get().updateActiveProject(
      (prev) => {
        const resolvedParentId =
          targetParentId || prev.storylineNodes[0]?.nodeId || null;
        const clonedNodeId = `node-clone-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 5)}`;
        const now = new Date().toISOString();

        const clonedNode: OutlinerNode = {
          nodeId: clonedNodeId,
          parentId: resolvedParentId,
          depth: 1,
          zoomLevel:
            sourceNode.zoomLevel === "project" ? "page" : sourceNode.zoomLevel,
          title: sourceNode.title,
          summary: sourceNode.summary,
          targetDocId: sourceNode.targetDocId || prev.docIds[0] || null,
          recommendedTemplateId:
            sourceNode.recommendedTemplateId || "structured-table",
          provenanceSourceProjectId: sourceProj.projectId,
          provenanceSourceNodeId: sourceNode.nodeId,
          aiStatus: "applied",
        };

        const provenance: ProvenanceRecord = {
          recordId: `prov-${Date.now().toString(36)}`,
          targetProjectId: prev.projectId,
          targetNodeId: clonedNodeId,
          sourceProjectId: sourceProj.projectId,
          sourceProjectTitle: sourceProj.title,
          sourceNodeId: sourceNode.nodeId,
          sourceNodeTitle: sourceNode.title,
          clonedAt: now,
        };

        result = { clonedNode, provenance };
        return {
          ...prev,
          storylineNodes: [...prev.storylineNodes, clonedNode],
          provenanceLineage: [...prev.provenanceLineage, provenance],
          updatedAt: now,
        };
      },
      {
        history: true,
        label: `참조 복제 완료: "${sourceNode.title.slice(0, 24)}" (Provenance 기록됨)`,
      }
    );

    return result;
  },

  bindReferenceProjects: (referenceIds) => {
    get().updateActiveProject(
      (prev) => ({
        ...prev,
        referenceProjectIds: referenceIds,
        updatedAt: new Date().toISOString(),
      }),
      {
        history: true,
        label: `참조 프로젝트 덱 구성 변경 (${referenceIds.length}개 연결)`,
      }
    );
  },

  assignTemplateToNode: (nodeId, templateId) => {
    get().updateActiveProject(
      (prev) => ({
        ...prev,
        storylineNodes: prev.storylineNodes.map((n) =>
          n.nodeId === nodeId
            ? { ...n, recommendedTemplateId: templateId, aiStatus: "applied" }
            : n
        ),
        updatedAt: new Date().toISOString(),
      }),
      { history: true, label: `서식 템플릿(${templateId}) 매핑 완료` }
    );
  },

  undoProject: () =>
    set((state) => {
      const prevProj = state.past[state.past.length - 1];
      const current = state.projects.find(
        (p) => p.projectId === state.activeProjectId
      );
      if (!prevProj || !current) return {};
      return {
        projects: state.projects.map((p) =>
          p.projectId === prevProj.projectId ? prevProj : p
        ),
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, HISTORY_LIMIT),
        lastUndoMessage: "이전 프로젝트/아웃라인 상태로 되돌렸습니다.",
      };
    }),

  redoProject: () =>
    set((state) => {
      const nextProj = state.future[0];
      const current = state.projects.find(
        (p) => p.projectId === state.activeProjectId
      );
      if (!nextProj || !current) return {};
      return {
        projects: state.projects.map((p) =>
          p.projectId === nextProj.projectId ? nextProj : p
        ),
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        lastUndoMessage: "작업을 다시 실행했습니다.",
      };
    }),

  dismissUndoToast: () => set({ lastUndoMessage: null }),
}));

