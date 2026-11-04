import {
  getSlotBackdata,
  htmlToSummary,
  type StagedAiChange,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { slotComposerApi } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectActiveProject,
  selectCurrentReferenceProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { isAbortError } from "@/shared/api";
import { errorMessage, historyTransaction, newId } from "@/shared/lib";

import { phaseComposerApi } from "../api/phaseComposerApi";
import { applyStagedChange } from "./stagedChangeAppliers";

const SLOT_DRAFT_PROMPT = "연결된 백데이터와 참조 레퍼런스를 근거로 이 슬롯의 정밀 초안을 작성해줘";

/**
 * 취소 가능한 AI 실행 하나. `runId` 를 먼저 정해 서버에 보내므로, 응답 전에 중단해도
 * 같은 ID 로 서버 실행을 취소할 수 있다. 결과 변경안은 대기열에만 쌓이고 문서는 건드리지 않는다.
 */
async function runCancellable(
  request: (runId: string, signal: AbortSignal) => Promise<StagedAiChange[]>,
  cancelOnServer: boolean
): Promise<void> {
  const staging = useAiStagingStore.getState();
  if (staging.isRunning) return;
  const runId = newId("run");
  const controller = new AbortController();
  staging.startRun(runId, () => {
    controller.abort();
    if (cancelOnServer) void phaseComposerApi.cancelRun(runId, "user_aborted").catch(() => undefined);
  });
  try {
    const changes = await request(runId, controller.signal);
    if (!controller.signal.aborted) useAiStagingStore.getState().enqueue(changes);
  } catch (err) {
    if (!isAbortError(err) && !controller.signal.aborted) {
      useAiStagingStore.getState().failRun(errorMessage(err, "AI 실행에 실패했습니다."));
    }
  } finally {
    useAiStagingStore.getState().finishRun(runId);
  }
}

function slotDraftChange(slot: VDocSlot, html: string): StagedAiChange {
  return {
    diffId: newId("stg-slot"),
    phase: "drafting",
    targetKind: "slot-html",
    targetId: slot.slotId,
    title: `[Phase 3 슬롯 초안] ${slot.label}`,
    beforeSummary: htmlToSummary(slot.content, 80) || "(빈 슬롯)",
    afterSummary: htmlToSummary(html, 110),
    payload: { slotId: slot.slotId, html },
    sourceReferenceIds: slot.backDataRefs,
  };
}

/** AI 실행(Phase 1 · 2 · 슬롯 초안)과 Staged 변경안 승인 · 반려. */
export function useStageAiChanges() {
  const queue = useAiStagingStore((s) => s.queue);
  const isRunning = useAiStagingStore((s) => s.isRunning);
  const abortRun = useAiStagingStore((s) => s.abortRun);
  const remove = useAiStagingStore((s) => s.remove);
  const clear = useAiStagingStore((s) => s.clear);

  const runPhase1StorylineAi = (prompt: string) => {
    const { getState } = useProjectStore;
    const project = selectActiveProject(getState());
    if (!project) return Promise.resolve();
    const reference = selectCurrentReferenceProject(getState());
    const referenceNodes = reference
      ? reference.storylineNodes
          .filter((n) => n.parentId !== null)
          .map((n) => ({
            nodeId: n.nodeId,
            title: n.title,
            summary: n.summary,
            recommendedTemplateId: n.recommendedTemplateId,
            sourceProjectId: reference.projectId,
          }))
      : [];
    return runCancellable(
      async (runId, signal) =>
        (
          await phaseComposerApi.composeStorylinePhase1(
            { runId, projectId: project.projectId, prompt, referenceNodes, targetParentId: null },
            signal
          )
        ).stagedDiffs,
      true
    );
  };

  const runPhase2TemplateAi = (tuningPrompt = "") => {
    const project = selectActiveProject(useProjectStore.getState());
    if (!project) return Promise.resolve();
    const nodes = project.storylineNodes
      .filter((n) => n.parentId !== null)
      .map((n) => ({ nodeId: n.nodeId, title: n.title, summary: n.summary, recommendedTemplateId: n.recommendedTemplateId }));
    const docId = useStudioDocumentStore.getState().activeDocId;
    return runCancellable(
      async (runId, signal) =>
        (
          await phaseComposerApi.recommendTemplatesPhase2(
            { runId, projectId: project.projectId, docId, nodes, tuningPrompt },
            signal
          )
        ).stagedDiffs,
      true
    );
  };

  /** 슬롯 초안을 AI 로 만들어 본문에 바로 쓰지 않고 대기열에 올린다. */
  const stageSlotAiDraft = (doc: VDocDocument, slot: VDocSlot) =>
    runCancellable(async (_runId, signal) => {
      const res = await slotComposerApi.composeSlot(
        {
          slotId: slot.slotId,
          slotLabel: slot.label,
          currentContent: slot.content,
          prompt: SLOT_DRAFT_PROMPT,
          backdata: getSlotBackdata(doc, slot),
          constraints: slot.constraints,
        },
        signal
      );
      if (!res.html) throw new Error("AI 가 빈 초안을 돌려주었습니다.");
      return [slotDraftChange(slot, res.html)];
    }, false);

  const acceptStagedChange = async (diff: StagedAiChange) => {
    remove(diff.diffId);
    await applyStagedChange(diff);
  };

  /** 모두 적용 = Undo 한 번으로 되돌릴 수 있는 하나의 묶음. */
  const acceptAllStagedChanges = async () => {
    const pending = [...useAiStagingStore.getState().queue];
    if (pending.length === 0) return;
    clear();
    await historyTransaction(`AI 변경안 ${pending.length}건 일괄 적용`, "project", async () => {
      for (const diff of pending) await applyStagedChange(diff);
    });
  };

  return {
    stagingQueue: queue,
    isAiStreaming: isRunning,
    runPhase1StorylineAi,
    runPhase2TemplateAi,
    stageSlotAiDraft,
    abortActiveAiRun: abortRun,
    acceptStagedChange,
    acceptAllStagedChanges,
    rejectStagedChange: remove,
    rejectAllStagedChanges: clear,
  };
}
