import { create } from "zustand";

import type {
  OutlineCommand,
  OutlineNodeFields,
  VProjectManifest,
  WorkbenchPhase,
} from "@vibe/vdoc-schema";

import { errorMessage, useHistoryStore } from "@/shared/lib";

import { projectApi } from "../api/projectApi";

/**
 * 프로젝트 매니페스트의 클라이언트 캐시.
 *
 * 원장은 서버(`/api/projects`)다. 트리를 바꾸는 규칙(깊이 · 형제 이동 · 연쇄 삭제 · 출처 기록)은 서버 애그리거트가 지키고, 이 저장소는 명령을 보낸 뒤 돌아온 매니페스트로
 * 상태를 교체한다. 되돌리기는 변경 전 매니페스트를 서버에 다시 써서(`replace`) 구현한다.
 *
 * 예외: 제목처럼 타이핑마다 바뀌는 필드는 화면에 먼저 반영하고(낙관적 갱신) 잠시 뒤 한 번만 보낸다.
 */
export type ProjectLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ProjectStoreState {
  projects: VProjectManifest[];
  activeProjectId: string;
  status: ProjectLoadStatus;
  /** 마지막 서버 오류 (사용자에게 보여줄 문장). */
  lastError: string | null;

  hydrate: () => Promise<void>;
  setActiveProjectId: (projectId: string) => void;
  dismissError: () => void;

  /** 프로젝트에 마지막 작업 단계를 기록한다 (화면 이동이라 되돌리기 이력에는 남기지 않는다). */
  setActiveProjectPhase: (phase: WorkbenchPhase) => Promise<void>;
  /** `parentId` 가 `null` 이면 아웃라인 루트 아래에 붙는다. */
  insertStorylineNode: (
    parentId: string | null,
    fields: OutlineNodeFields & { title: string },
    provenance?: { sourceProjectId: string; sourceNodeId: string }
  ) => Promise<void>;
  updateStorylineNode: (nodeId: string, patch: OutlineNodeFields) => void;
  /** 즉시 서버에 제목 변경 명령을 보내고 Undo 이력에 남긴다 (페이지 이름 변경 트랜잭션 공용). */
  renameOutlineNodeImmediate: (nodeId: string, title: string) => Promise<void>;
  deleteStorylineNode: (nodeId: string) => Promise<void>;
  moveStorylineNode: (nodeId: string, direction: -1 | 1) => Promise<void>;
  indentOutlinerNode: (nodeId: string, delta: -1 | 1) => Promise<void>;
  assignTemplateToNode: (nodeId: string, templateId: string) => Promise<void>;
}

const NODE_PATCH_DEBOUNCE_MS = 600;

const pendingNodePatches = new Map<string, { patch: OutlineNodeFields; timer: number }>();

const SERVER_ERROR = "서버와 통신하지 못했습니다.";

export const useProjectStore = create<ProjectStoreState>((set, get) => {
  const activeProject = (): VProjectManifest | undefined =>
    get().projects.find((p) => p.projectId === get().activeProjectId);

  const replaceProject = (project: VProjectManifest) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.projectId === project.projectId ? project : p)),
    }));

  /** 서버에 매니페스트를 되돌려 쓰는 Undo/Redo 항목을 이력에 남긴다. */
  const recordHistory = (label: string, before: VProjectManifest, after: VProjectManifest) => {
    const restore = async (target: VProjectManifest) => {
      replaceProject(await projectApi.replace(target));
    };
    useHistoryStore.getState().push({
      label,
      scope: "project",
      undo: () => restore(before),
      redo: () => restore(after),
    });
  };

  /** 서버 변경 하나를 실행하고 결과로 상태를 교체한다. 실패하면 오류만 남기고 상태는 그대로 둔다. */
  const mutate = async (
    label: string,
    run: (project: VProjectManifest) => Promise<VProjectManifest>
  ) => {
    const before = activeProject();
    if (!before) return;
    await flushNodePatches();
    try {
      const after = await run(before);
      replaceProject(after);
      recordHistory(label, before, after);
    } catch (err) {
      set({ lastError: errorMessage(err, SERVER_ERROR) });
    }
  };

  const command = (label: string, cmd: OutlineCommand) =>
    mutate(label, async (project) => (await projectApi.command(project.projectId, cmd)).project);

  const flushNodePatches = async () => {
    const project = activeProject();
    if (!project) return;
    const entries = [...pendingNodePatches.entries()];
    pendingNodePatches.clear();
    for (const [nodeId, { patch, timer }] of entries) {
      window.clearTimeout(timer);
      try {
        replaceProject(
          (await projectApi.command(project.projectId, { kind: "update_node", nodeId, patch })).project
        );
      } catch (err) {
        set({ lastError: errorMessage(err, SERVER_ERROR) });
      }
    }
  };

  return {
    projects: [],
    activeProjectId: "",
    status: "idle",
    lastError: null,

    hydrate: async () => {
      set({ status: "loading", lastError: null });
      try {
        const projects = await projectApi.list();
        const current = get();
        const active = projects.find((p) => p.projectId === current.activeProjectId) ?? projects[0];
        set({
          projects,
          activeProjectId: active?.projectId ?? "",
          status: "ready",
        });
      } catch (err) {
        set({ status: "error", lastError: errorMessage(err, SERVER_ERROR) });
      }
    },

    setActiveProjectId: (projectId) => {
      useHistoryStore.getState().clearScope("project");
      set({ activeProjectId: projectId });
    },

    dismissError: () => set({ lastError: null }),

    setActiveProjectPhase: async (phase) => {
      const project = activeProject();
      if (!project || project.activePhase === phase) return;
      try {
        replaceProject((await projectApi.command(project.projectId, { kind: "set_phase", phase })).project);
      } catch (err) {
        set({ lastError: errorMessage(err, SERVER_ERROR) });
      }
    },

    insertStorylineNode: (parentId, fields, provenance) => {
      const { title, ...rest } = fields;
      return command(`노드 추가: "${title.slice(0, 28)}"`, {
        kind: "insert_node",
        title,
        parentId,
        fields: rest,
        provenanceSourceProjectId: provenance?.sourceProjectId,
        provenanceSourceNodeId: provenance?.sourceNodeId,
      });
    },

    updateStorylineNode: (nodeId, patch) => {
      const project = activeProject();
      if (!project) return;
      // 낙관적 갱신: 화면은 바로 바꾸고 서버에는 잠시 뒤 합쳐서 보낸다.
      replaceProject({
        ...project,
        storylineNodes: project.storylineNodes.map((n) => (n.nodeId === nodeId ? { ...n, ...patch } : n)),
      });
      const pending = pendingNodePatches.get(nodeId);
      if (pending) window.clearTimeout(pending.timer);
      const merged = { ...pending?.patch, ...patch };
      const timer = window.setTimeout(() => void flushNodePatches(), NODE_PATCH_DEBOUNCE_MS);
      pendingNodePatches.set(nodeId, { patch: merged, timer });
    },

    renameOutlineNodeImmediate: (nodeId, title) =>
      command(`노드 이름 변경: "${title.slice(0, 28)}"`, { kind: "update_node", nodeId, patch: { title } }),

    deleteStorylineNode: (nodeId) =>
      command("아웃라인 노드가 삭제되었습니다.", { kind: "delete_node", nodeId }),

    moveStorylineNode: (nodeId, direction) =>
      command("아웃라인 노드 순서가 변경되었습니다.", { kind: "move_node", nodeId, direction }),

    indentOutlinerNode: (nodeId, delta) =>
      command("노드 계층 깊이(Depth)가 조정되었습니다.", { kind: "indent_node", nodeId, delta }),

    assignTemplateToNode: (nodeId, templateId) =>
      command(`서식 템플릿(${templateId}) 매핑 완료`, { kind: "assign_template", nodeId, templateId }),

  };
});

/** 활성 프로젝트 (없으면 `undefined`). 셀렉터로 쓰면 다른 프로젝트 변경에는 다시 그리지 않는다. */
export const selectActiveProject = (s: ProjectStoreState): VProjectManifest | undefined =>
  s.projects.find((p) => p.projectId === s.activeProjectId);
