import { useCallback, useEffect, useState } from "react";

import { findFirstEditableSlotId, type VDocDocument } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useReferenceStore } from "@/entities/reference-manager";
import { useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { documentApi, selectActiveDocument, selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { composerController } from "@/shared/ai";

export type WorkspaceBootStatus = "loading" | "ready" | "error";

/**
 * 작업 공간 기동 순서 (서버가 원장):
 * 1) URL 의 위치(단계 · 줌 · 참조 작업창)를 세션에 복원
 * 2) 프로젝트 매니페스트를 불러오고, URL 에 단계가 없으면 프로젝트에 기록된 단계로 시작
 * 3) 모든 프로젝트의 작업 문서를 불러와 URL 의 `doc` 을 활성 문서로
 * 4) 활성 문서의 첫 편집 슬롯을 선택
 * 레퍼런스(라이브러리 · 프로젝트 연결)는 작업 문서와 따로 불러오고, 활성 프로젝트가 바뀌면 다시 불러온다.
 */
export function useWorkspaceBootstrap(): {
  status: WorkspaceBootStatus;
  error: string | null;
  retry: () => void;
} {
  const [status, setStatus] = useState<WorkspaceBootStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const session = useWorkspaceSessionStore.getState();
    session.restoreLocation({
      phase: params.get("phase"),
      zoom: params.get("zoom"),
      splitRef: params.get("splitRef"),
    });

    (async () => {
      setStatus("loading");
      setError(null);
      await useProjectStore.getState().hydrate();
      if (cancelled) return;
      const projectState = useProjectStore.getState();
      if (projectState.status !== "ready") {
        setError(projectState.lastError ?? "프로젝트를 불러오지 못했습니다.");
        setStatus("error");
        return;
      }
      const activeProjectId = selectActiveProject(projectState)?.projectId;
      // 승인 전 변경안 대기열은 프로젝트별로 서버에 있다 (새로고침 뒤에도 이어서 검토)
      if (activeProjectId) {
        void useAiStagingStore.getState().hydrate(activeProjectId);
        void useResourceStore.getState().loadSession(activeProjectId);
      }
      void useReferenceStore.getState().loadProject(activeProjectId ?? null);
      const recordedPhase = selectActiveProject(projectState)?.activePhase;
      if (!params.get("phase") && recordedPhase) session.setPhase(recordedPhase);

      await useStudioDocumentStore
        .getState()
        .hydrate(projectState.projects.flatMap((p) => p.docIds), params.get("doc"));
      if (cancelled) return;

      const activeDoc = selectActiveDocument(useStudioDocumentStore.getState());
      useSlotSelectionStore.getState().setSelectedSlotId(findFirstEditableSlotId(activeDoc));
      setStatus("ready");
    })();

    // 프로젝트를 바꾸면 그 프로젝트에 연결된 레퍼런스 · 리소스 · Staged 대기열을 다시 불러온다
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.activeProjectId !== prev.activeProjectId) {
        void useReferenceStore.getState().loadProject(state.activeProjectId || null);
        if (state.activeProjectId) {
          void useResourceStore.getState().loadSession(state.activeProjectId);
          void useAiStagingStore.getState().hydrate(state.activeProjectId);
        }
      }
    });

    // AI 가 제안한 레퍼런스 해석 카드 → 레퍼런스 패널 (사용자가 채택 강도를 정하고 확정한다)
    const unsubscribeCards = composerController.onServerEvent("reference_interpretations", (event) => {
      useReferenceStore.getState().receiveInterpretations(event.cards);
    });

    // AI Composer 가 wb_propose 로 검증 통과한 개편안 → 활성/대상 문서의 Staged Diff 대기열로 연결
    const unsubscribeProposals = composerController.onServerEvent("workbench_proposals", (event) => {
      for (const proposal of event.proposals) {
        const docState = useStudioDocumentStore.getState();
        const existingDoc = proposal.docId ? selectDocument(proposal.docId)(docState) : selectActiveDocument(docState);
        const stageForDoc = (doc: VDocDocument) => {
          useAiStagingStore.getState().receiveProposal(proposal, doc, 0);
          const activeProject = selectActiveProject(useProjectStore.getState());
          const inProject = !activeProject || activeProject.docIds.includes(doc.docId);
          if (inProject && useStudioDocumentStore.getState().activeDocId !== doc.docId) {
            useStudioDocumentStore.getState().setActiveDocId(doc.docId);
          }
        };
        if (existingDoc) {
          stageForDoc(existingDoc);
        } else if (proposal.docId) {
          void documentApi
            .get(proposal.docId)
            .then((loaded) => {
              if (cancelled) return;
              useStudioDocumentStore.getState().adoptDocument(loaded);
              stageForDoc(loaded);
            })
            .catch(() => {
              /* 존재하지 않는 문서 id 는 건너뛴다 */
            });
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeCards();
      unsubscribeProposals();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, error, retry };
}
