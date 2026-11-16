import { create } from "zustand";
import {
  buildCommittedDocuments,
  buildWorkingOutlineFromProjectDocs,
  compileOutlineToPreview,
  getElementDef,
  type ElementKind,
  type OutlinerNode,
  type VDocDocument,
  type VProjectManifest,
  type WorkingOutlineDocument,
  type WorkingOutlineNode,
  type ZoomLevel,
} from "@vibe/vdoc-schema";
import { workingOutlineApi } from "../api/workingOutlineApi";

function updateNodeInTree(
  nodes: WorkingOutlineNode[],
  nodeId: string,
  updater: (node: WorkingOutlineNode) => WorkingOutlineNode
): { nodes: WorkingOutlineNode[]; changed: boolean } {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.nodeId === nodeId) {
      changed = true;
      return updater(node);
    }
    if (node.children.length > 0) {
      const childRes = updateNodeInTree(node.children, nodeId, updater);
      if (childRes.changed) {
        changed = true;
        return { ...node, children: childRes.nodes };
      }
    }
    return node;
  });
  return { nodes: next, changed };
}

function zoomLevelForKind(kind: ElementKind, depth: number): ZoomLevel {
  if (kind === "project") return "project";
  if (kind === "document") return "document";
  if (kind === "page" || kind === "section" || depth <= 2) return "page";
  return "slot";
}

export function buildKindByNodeId(
  nodes: readonly WorkingOutlineNode[],
  acc: Record<string, ElementKind> = {}
): Record<string, ElementKind> {
  for (const node of nodes) {
    acc[node.nodeId] = node.elementKind;
    if (node.children.length > 0) {
      buildKindByNodeId(node.children, acc);
    }
  }
  return acc;
}

const projectionCache = new WeakMap<
  WorkingOutlineDocument,
  { title: string; nodes: OutlinerNode[] }
>();

/** WorkingOutline 트리를 좌측 탐색기/브레드크럼이 공통으로 쓰는 OutlinerNode[] 평면 트리로 투영한다. */
export function projectWorkingOutlineToOutlinerNodes(
  outline: WorkingOutlineDocument | null,
  projectTitle?: string
): OutlinerNode[] {
  if (!outline) return [];
  const normalizedTitle = projectTitle || "프로젝트 아웃라인";
  const cached = projectionCache.get(outline);
  if (cached && cached.title === normalizedTitle) {
    return cached.nodes;
  }
  const rootId = "project-root";
  const out: OutlinerNode[] = [
    {
      nodeId: rootId,
      parentId: null,
      depth: 0,
      zoomLevel: "project",
      elementKind: "project",
      title: normalizedTitle,
      summary: `${outline.nodes.length}개 최상위 항목`,
      aiStatus: "idle",
    },
  ];

  const visit = (nodes: readonly WorkingOutlineNode[], parentId: string, depth: number) => {
    for (const node of nodes) {
      const def = getElementDef(node.elementKind);
      out.push({
        nodeId: node.nodeId,
        parentId,
        depth,
        zoomLevel: zoomLevelForKind(node.elementKind, depth),
        elementKind: node.elementKind,
        title: node.text || def.label,
        summary: node.note || def.label,
        targetDocId: node.sourceRef?.docId ?? null,
        targetPageId: node.sourceRef?.pageId ?? null,
        targetBlockId: node.sourceRef?.blockId ?? null,
        targetSlotId: node.sourceRef?.slotId ?? null,
        recommendedTemplateId: node.recommendedTemplateId ?? null,
        collapsed: Boolean(node.isFolded),
        aiStatus: "idle",
      });
      if (node.children.length > 0) {
        visit(node.children, node.nodeId, depth + 1);
      }
    }
  };

  visit(outline.nodes, rootId, 1);
  projectionCache.set(outline, { title: normalizedTitle, nodes: out });
  return out;
}

export interface WorkingOutlineState {
  outline: WorkingOutlineDocument | null;
  kindByNodeId: Record<string, ElementKind>;
  loadedProjectId: string | null;
  loading: boolean;
  saving: boolean;
  compiling: boolean;
  committing: boolean;
  error: string | null;
  previewDocuments: VDocDocument[] | null;
  zoomRootNodeId: string | null;

  loadWorkingOutline: (
    project: VProjectManifest,
    docs: readonly VDocDocument[],
    options?: { refresh?: boolean }
  ) => Promise<WorkingOutlineDocument>;

  setWorkingOutline: (
    nextOutline: WorkingOutlineDocument,
    options?: { dirty?: boolean; scheduleSave?: boolean }
  ) => void;

  turnIntoNode: (nodeId: string, elementKind: ElementKind) => void;
  setZoomRootNodeId: (nodeId: string | null) => void;

  compilePreview: (baseDocs: readonly VDocDocument[], projectTitle?: string) => Promise<VDocDocument[]>;

  commitToPhase3: (
    baseDocs: readonly VDocDocument[],
    project: VProjectManifest
  ) => Promise<{ documents: VDocDocument[]; outline: WorkingOutlineDocument } | null>;

  clearPreview: () => void;
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
const inFlightLoads = new Map<string, Promise<WorkingOutlineDocument>>();

export const useWorkingOutlineStore = create<WorkingOutlineState>((set, get) => ({
  outline: null,
  kindByNodeId: {},
  loadedProjectId: null,
  loading: false,
  saving: false,
  compiling: false,
  committing: false,
  error: null,
  previewDocuments: null,
  zoomRootNodeId: null,

  loadWorkingOutline: async (project, docs, options) => {
    const state = get();
    if (!options?.refresh && state.loadedProjectId === project.projectId && state.outline) {
      return state.outline;
    }
    const existingFlight = !options?.refresh ? inFlightLoads.get(project.projectId) : undefined;
    if (existingFlight) {
      return existingFlight;
    }

    set({ loading: true, error: null });
    const req = (async () => {
      try {
        const fetched = await workingOutlineApi.get(project.projectId, Boolean(options?.refresh));
        set({
          outline: fetched,
          kindByNodeId: buildKindByNodeId(fetched.nodes),
          loadedProjectId: project.projectId,
          loading: false,
          previewDocuments: null,
        });
        return fetched;
      } catch {
        // 서버가 아직 없거나 오프라인인 경우 클라이언트 측 .vdoc extractor로 무손실 초기화
        const fallback = buildWorkingOutlineFromProjectDocs(project, docs);
        set({
          outline: fallback,
          kindByNodeId: buildKindByNodeId(fallback.nodes),
          loadedProjectId: project.projectId,
          loading: false,
          previewDocuments: null,
        });
        return fallback;
      } finally {
        inFlightLoads.delete(project.projectId);
      }
    })();

    inFlightLoads.set(project.projectId, req);
    return req;
  },

  setWorkingOutline: (nextOutline, options) => {
    const dirty = options?.dirty ?? true;
    const updated: WorkingOutlineDocument = {
      ...nextOutline,
      dirty,
      updatedAt: new Date().toISOString(),
    };
    set({
      outline: updated,
      kindByNodeId: buildKindByNodeId(updated.nodes),
      error: null,
    });

    if (options?.scheduleSave === false) return;
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => {
      const latest = get().outline;
      if (!latest) return;
      set({ saving: true });
      void workingOutlineApi
        .save(latest.projectId, latest)
        .then((saved) => {
          set((state) => ({
            saving: false,
            outline:
              state.outline && state.outline.projectId === saved.projectId
                ? { ...state.outline, revision: saved.revision }
                : state.outline,
          }));
        })
        .catch(() => {
          set({ saving: false });
        });
    }, 450);
  },

  turnIntoNode: (nodeId, elementKind) => {
    const current = get().outline;
    if (!current) return;
    const res = updateNodeInTree(current.nodes, nodeId, (node) => ({
      ...node,
      elementKind,
    }));
    if (!res.changed) return;
    get().setWorkingOutline({
      ...current,
      revision: current.revision + 1,
      nodes: res.nodes,
    });
  },

  setZoomRootNodeId: (nodeId) => {
    set({ zoomRootNodeId: nodeId === "project-root" ? null : nodeId });
  },

  compilePreview: async (baseDocs, projectTitle) => {
    const outline = get().outline;
    if (!outline) return [];
    set({ compiling: true, error: null });
    const optimistic = compileOutlineToPreview(outline, baseDocs, { projectTitle });
    set({ previewDocuments: optimistic });
    try {
      const remote = await workingOutlineApi.compilePreview(outline.projectId, outline);
      set({ previewDocuments: remote.documents, compiling: false });
      return remote.documents;
    } catch {
      set({ compiling: false });
      return optimistic;
    }
  },

  commitToPhase3: async (baseDocs, project) => {
    const outline = get().outline;
    if (!outline) return null;
    set({ committing: true, error: null });
    try {
      const remote = await workingOutlineApi.commit(project.projectId, outline);
      set({
        outline: remote.outline,
        kindByNodeId: buildKindByNodeId(remote.outline.nodes),
        previewDocuments: null,
        committing: false,
      });
      return { documents: remote.documents, outline: remote.outline };
    } catch {
      const local = buildCommittedDocuments(outline, baseDocs, project);
      set({
        outline: local.syncedOutline,
        kindByNodeId: buildKindByNodeId(local.syncedOutline.nodes),
        previewDocuments: null,
        committing: false,
      });
      return { documents: local.documents, outline: local.syncedOutline };
    }
  },

  clearPreview: () => set({ previewDocuments: null }),
}));
