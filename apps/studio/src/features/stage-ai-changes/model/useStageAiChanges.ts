import { useRef } from "react";

import type { OutlinerNode, StagedAiChange } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

import { phaseComposerApi } from "../api/phaseComposerApi";

export function useStageAiChanges() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const selectedReferenceProjectId = useProjectStore(
    (s) => s.selectedReferenceProjectId
  );
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const assignTemplateToNode = useProjectStore((s) => s.assignTemplateToNode);

  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);

  const stagingQueue = useWorkspaceSessionStore((s) => s.stagingQueue);
  const isAiStreaming = useWorkspaceSessionStore((s) => s.isAiStreaming);
  const activeRunId = useWorkspaceSessionStore((s) => s.activeRunId);
  const enqueueStagedChanges = useWorkspaceSessionStore(
    (s) => s.enqueueStagedChanges
  );
  const removeStagedChange = useWorkspaceSessionStore(
    (s) => s.removeStagedChange
  );
  const clearStagingQueue = useWorkspaceSessionStore(
    (s) => s.clearStagingQueue
  );
  const startAiStreaming = useWorkspaceSessionStore((s) => s.startAiStreaming);
  const stopAiStreaming = useWorkspaceSessionStore((s) => s.stopAiStreaming);

  const streamTimerRef = useRef<number | null>(null);

  const activeProject =
    projects.find((p) => p.projectId === activeProjectId) || projects[0];
  const refProject =
    projects.find((p) => p.projectId === selectedReferenceProjectId) ||
    projects.find((p) => p.isReferenceOnly);

  const runPhase1StorylineAi = async (prompt: string) => {
    const tempRunId = `run-${Date.now().toString(36)}`;
    startAiStreaming(tempRunId);

    const refNodesPayload = (refProject?.storylineNodes || [])
      .filter((n) => n.parentId !== null)
      .map((n) => ({
        ...n,
        sourceProjectId: refProject?.projectId,
      }));

    try {
      const res = await phaseComposerApi.composeStorylinePhase1({
        projectId: activeProject.projectId,
        prompt,
        referenceNodes: refNodesPayload,
        targetParentId: "node-proj-root",
      });
      // Keep streaming indicator visible briefly so user can test `[⏹ 생성 중단 (Esc)]` or see progress
      streamTimerRef.current = window.setTimeout(() => {
        if (useWorkspaceSessionStore.getState().isAiStreaming) {
          enqueueStagedChanges(res.stagedDiffs);
          stopAiStreaming(false);
        }
      }, 450);
    } catch {
      // Deterministic local synthesis fallback
      const fallbackDiffs: StagedAiChange[] = (
        refProject?.storylineNodes.filter((n) => n.parentId !== null) || []
      )
        .slice(0, 3)
        .map((ref, idx) => {
          const newId = `node-ai-${Date.now().toString(36)}-${idx}`;
          return {
            diffId: `stg-p1-${Date.now().toString(36)}-${idx}`,
            phase: "storylining",
            targetKind: "outline-node",
            targetId: newId,
            title: `[Phase 1 목차 추가] ${ref.title}`,
            beforeSummary: "(신규 아웃라인 섹션 삽입)",
            afterSummary: `[AI 재구성] ${ref.title} · 추천 서식: ${
              ref.recommendedTemplateId || "structured-table"
            }`,
            payload: {
              operation: "insert_node",
              projectId: activeProject.projectId,
              node: {
                nodeId: newId,
                parentId: "node-proj-root",
                depth: 1,
                zoomLevel: "page",
                title: `[AI 재구성] ${ref.title}`,
                summary: `${ref.summary} (${prompt || "참조 기반 자동 구성"})`,
                recommendedTemplateId:
                  ref.recommendedTemplateId || "structured-table",
                provenanceSourceProjectId: refProject?.projectId || null,
                provenanceSourceNodeId: ref.nodeId,
                aiStatus: "staged",
              },
            },
            sourceReferenceIds: [
              `${refProject?.projectId || "ref"}:${ref.nodeId}`,
            ],
          };
        });
      streamTimerRef.current = window.setTimeout(() => {
        if (useWorkspaceSessionStore.getState().isAiStreaming) {
          enqueueStagedChanges(fallbackDiffs);
          stopAiStreaming(false);
        }
      }, 450);
    }
  };

  const runPhase2TemplateAi = async (tuningPrompt = "") => {
    const tempRunId = `run-${Date.now().toString(36)}`;
    startAiStreaming(tempRunId);

    const targetNodes = activeProject.storylineNodes.filter(
      (n) => n.parentId !== null
    );

    try {
      const res = await phaseComposerApi.recommendTemplatesPhase2({
        projectId: activeProject.projectId,
        docId: activeDocId,
        nodes: targetNodes.map((n) => ({ ...n })),
        tuningPrompt,
      });
      streamTimerRef.current = window.setTimeout(() => {
        if (useWorkspaceSessionStore.getState().isAiStreaming) {
          enqueueStagedChanges(res.stagedDiffs);
          stopAiStreaming(false);
        }
      }, 450);
    } catch {
      const fallbackDiffs: StagedAiChange[] = targetNodes
        .slice(0, 4)
        .map((n, idx) => ({
          diffId: `stg-p2-${Date.now().toString(36)}-${idx}`,
          phase: "templating",
          targetKind: "template-block",
          targetId: n.nodeId,
          title: `[Phase 2 서식 매핑] ${n.title}`,
          beforeSummary: `기존 서식: ${n.recommendedTemplateId || "section-block"}`,
          afterSummary: `추천 서식: structured-table (다중 항목 정밀 비교 그리드)`,
          payload: {
            operation: "assign_template_block",
            projectId: activeProject.projectId,
            docId: activeDocId,
            nodeId: n.nodeId,
            templateKind: "structured-table",
          },
          sourceReferenceIds: [],
        }));
      streamTimerRef.current = window.setTimeout(() => {
        if (useWorkspaceSessionStore.getState().isAiStreaming) {
          enqueueStagedChanges(fallbackDiffs);
          stopAiStreaming(false);
        }
      }, 450);
    }
  };

  const stageSlotHtmlDiff = (params: {
    slotId: string;
    slotLabel: string;
    beforeHtml: string;
    afterHtml: string;
    sourceRefIds?: string[];
  }) => {
    const item: StagedAiChange = {
      diffId: `stg-slot-${Date.now().toString(36)}`,
      phase: "drafting",
      targetKind: "slot-html",
      targetId: params.slotId,
      title: `[Phase 3 슬롯 초안] ${params.slotLabel}`,
      beforeSummary:
        params.beforeHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 80) ||
        "(빈 슬롯)",
      afterSummary: params.afterHtml
        .replace(/<[^>]+>/g, " ")
        .trim()
        .slice(0, 110),
      payload: {
        slotId: params.slotId,
        html: params.afterHtml,
      },
      sourceReferenceIds: params.sourceRefIds || [],
    };
    enqueueStagedChanges([item]);
  };

  const abortActiveAiRun = async () => {
    if (streamTimerRef.current) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    const runId = activeRunId;
    stopAiStreaming(true);
    if (runId) {
      try {
        await phaseComposerApi.cancelRun(runId, "user_aborted");
      } catch {
        // Local abort already succeeded
      }
    }
  };

  const applyOneStagedChange = (diff: StagedAiChange) => {
    if (diff.targetKind === "outline-node") {
      const nodePayload = diff.payload.node as Partial<OutlinerNode> | undefined;
      if (nodePayload && nodePayload.title) {
        insertStorylineNode(nodePayload.parentId || "node-proj-root", {
          ...nodePayload,
          title: nodePayload.title,
          aiStatus: "applied",
        });
      }
    } else if (diff.targetKind === "template-block") {
      const nodeId = String(diff.payload.nodeId || diff.targetId);
      const tplKind = String(diff.payload.templateKind || "structured-table");
      assignTemplateToNode(nodeId, tplKind);
    } else if (diff.targetKind === "slot-html") {
      const slotId = String(diff.payload.slotId || diff.targetId);
      const html = String(diff.payload.html || "");
      updateCurrentDoc(
        (prev) => {
          const existing = prev.slots[slotId];
          if (!existing) return prev;
          return {
            ...prev,
            slots: {
              ...prev.slots,
              [slotId]: {
                ...existing,
                content: html,
                isEdited: true,
              },
            },
          };
        },
        { history: true }
      );
    }
    removeStagedChange(diff.diffId);
  };

  const acceptAllStagedChanges = () => {
    for (const diff of [...stagingQueue]) {
      applyOneStagedChange(diff);
    }
    clearStagingQueue();
  };

  return {
    stagingQueue,
    isAiStreaming,
    activeRunId,
    runPhase1StorylineAi,
    runPhase2TemplateAi,
    stageSlotHtmlDiff,
    abortActiveAiRun,
    acceptStagedChange: applyOneStagedChange,
    acceptAllStagedChanges,
    rejectStagedChange: removeStagedChange,
    rejectAllStagedChanges: clearStagingQueue,
  };
}

