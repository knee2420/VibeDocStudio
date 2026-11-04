import { useCallback, useEffect, useState } from "react";

import { findFirstEditableSlotId } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

export type WorkspaceBootStatus = "loading" | "ready" | "error";

/**
 * 작업 공간 기동 순서 (서버가 원장):
 * 1) URL 의 위치(단계 · 줌 · 참조 작업창)를 세션에 복원
 * 2) 프로젝트 매니페스트를 불러오고, URL 에 단계가 없으면 프로젝트에 기록된 단계로 시작
 * 3) 모든 프로젝트가 참조하는 문서를 불러와 URL 의 `doc` 을 활성 문서로
 * 4) 활성 문서의 첫 편집 슬롯을 선택
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

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, error, retry };
}
