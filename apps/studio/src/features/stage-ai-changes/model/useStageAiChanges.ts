import type { StagedAiChange } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectActiveProject,
  selectCurrentReferenceProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { isAbortError } from "@/shared/api";
import { historyTransaction, newId } from "@/shared/lib";

import { phaseComposerApi, type PhaseComposeApiResponse } from "../api/phaseComposerApi";
import { applyStagedChange } from "./stagedChangeAppliers";

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * 취소 가능한 AI 실행 하나. `runId` 를 먼저 정해 서버에 보내므로, 응답 전에 중단해도
 * 같은 ID 로 서버 실행을 취소할 수 있다. 중단은 세션 저장소의 `abortAiRun()` 한 경로로만 일어난다.
 */
async function runCancellable(
  request: (runId: string, signal: AbortSignal) => Promise<PhaseComposeApiResponse>
): Promise<void> {
  const session = useWorkspaceSessionStore.getState();
  if (session.isAiStreaming) return;
  const runId = newId("run");
  const controller = new AbortController();
  session.startAiRun(runId, () => {
    controller.abort();
    void phaseComposerApi.cancelRun(runId, "user_aborted").catch(() => undefined);
  });
  try {
    const res = await request(runId, controller.signal);
    if (!controller.signal.aborted) {
      useWorkspaceSessionStore.getState().enqueueStagedChanges(res.stagedDiffs);
    }
  } catch (err) {
    if (!isAbortError(err) && !controller.signal.aborted) {
      useProjectStore.setState({
        lastError: err instanceof Error ? err.message : "AI 실행에 실패했습니다.",
      });
    }
  } finally {
    useWorkspaceSessionStore.getState().finishAiRun(runId);
  }
}

export function useStageAiChanges() {
  const stagingQueue = useWorkspaceSessionStore((s) => s.stagingQueue);
  const isAiStreaming = useWorkspaceSessionStore((s) => s.isAiStreaming);
  const activeRunId = useWorkspaceSessionStore((s) => s.activeRunId);
  const abortActiveAiRun = useWorkspaceSessionStore((s) => s.abortAiRun);
  const removeStagedChange = useWorkspaceSessionStore((s) => s.removeStagedChange);
  const clearStagingQueue = useWorkspaceSessionStore((s) => s.clearStagingQueue);
  const enqueueStagedChanges = useWorkspaceSessionStore((s) => s.enqueueStagedChanges);

  const runPhase1StorylineAi = (prompt: string) => {
    const project = selectActiveProject(useProjectStore.getState());
    if (!project) return Promise.resolve();
    const reference = selectCurrentReferenceProject(useProjectStore.getState());
    const referenceNodes = (reference?.storylineNodes ?? [])
      .filter((n) => n.parentId !== null)
      .map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        summary: n.summary,
        recommendedTemplateId: n.recommendedTemplateId,
        sourceProjectId: reference!.projectId,
      }));
    return runCancellable((runId, signal) =>
      phaseComposerApi.composeStorylinePhase1(
        { runId, projectId: project.projectId, prompt, referenceNodes, targetParentId: null },
        signal
      )
    );
  };

  const runPhase2TemplateAi = (tuningPrompt = "") => {
    const project = selectActiveProject(useProjectStore.getState());
    if (!project) return Promise.resolve();
    const nodes = project.storylineNodes
      .filter((n) => n.parentId !== null)
      .map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        summary: n.summary,
        recommendedTemplateId: n.recommendedTemplateId,
      }));
    const docId = useStudioDocumentStore.getState().activeDocId;
    return runCancellable((runId, signal) =>
      phaseComposerApi.recommendTemplatesPhase2(
        { runId, projectId: project.projectId, docId, nodes, tuningPrompt },
        signal
      )
    );
  };

  const stageSlotHtmlDiff = (params: {
    slotId: string;
    slotLabel: string;
    beforeHtml: string;
    afterHtml: string;
    sourceRefIds?: string[];
  }) => {
    const item: StagedAiChange = {
      diffId: newId("stg-slot"),
      phase: "drafting",
      targetKind: "slot-html",
      targetId: params.slotId,
      title: `[Phase 3 슬롯 초안] ${params.slotLabel}`,
      beforeSummary: stripHtml(params.beforeHtml).slice(0, 80) || "(빈 슬롯)",
      afterSummary: stripHtml(params.afterHtml).slice(0, 110),
      payload: { slotId: params.slotId, html: params.afterHtml },
      sourceReferenceIds: params.sourceRefIds || [],
    };
    enqueueStagedChanges([item]);
  };

  const acceptStagedChange = async (diff: StagedAiChange) => {
    removeStagedChange(diff.diffId);
    await applyStagedChange(diff);
  };

  /** 모두 적용 = Undo 한 번으로 되돌릴 수 있는 하나의 묶음. */
  const acceptAllStagedChanges = async () => {
    const queue = [...useWorkspaceSessionStore.getState().stagingQueue];
    if (queue.length === 0) return;
    clearStagingQueue();
    await historyTransaction(`AI 변경안 ${queue.length}건 일괄 적용`, "project", async () => {
      for (const diff of queue) await applyStagedChange(diff);
    });
  };

  return {
    stagingQueue,
    isAiStreaming,
    activeRunId,
    runPhase1StorylineAi,
    runPhase2TemplateAi,
    stageSlotHtmlDiff,
    abortActiveAiRun,
    acceptStagedChange,
    acceptAllStagedChanges,
    rejectStagedChange: removeStagedChange,
    rejectAllStagedChanges: clearStagingQueue,
  };
}
