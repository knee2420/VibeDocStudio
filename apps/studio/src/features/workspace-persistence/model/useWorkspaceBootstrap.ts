import { useCallback, useEffect, useState } from "react";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

export type WorkspaceBootStatus = "loading" | "ready" | "error";

/**
 * 작업 공간 기동 순서 (서버가 원장):
 * 1) URL 의 위치(단계 · 줌 · 스플릿)를 세션에 복원
 * 2) 프로젝트 매니페스트를 불러오고
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
    useWorkspaceSessionStore.getState().restoreLocation({
      phase: params.get("phase"),
      zoom: params.get("zoom"),
      splitRef: params.get("splitRef"),
    });

    (async () => {
      setStatus("loading");
      setError(null);
      const projectStore = useProjectStore.getState();
      await projectStore.hydrate();
      const { status: projectStatus, projects, lastError } = useProjectStore.getState();
      if (cancelled) return;
      if (projectStatus !== "ready") {
        setError(lastError ?? "프로젝트를 불러오지 못했습니다.");
        setStatus("error");
        return;
      }

      await useStudioDocumentStore
        .getState()
        .hydrate(projects.flatMap((p) => p.docIds), params.get("doc"));
      if (cancelled) return;

      const activeDoc = selectActiveDocument(useStudioDocumentStore.getState());
      const firstEditable =
        Object.values(activeDoc?.slots ?? {}).find((s) => s.role !== "boilerplate")?.slotId ?? null;
      useSlotSelectionStore.getState().setSelectedSlotId(firstEditable);
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, error, retry };
}
