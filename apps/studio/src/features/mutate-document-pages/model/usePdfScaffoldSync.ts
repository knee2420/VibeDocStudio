import { useEffect } from "react";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";

import { pageMutations } from "./usePageMutations";

/**
 * 백그라운드 비동기 PDF 스캐폴딩 작업 스토어(`usePdfScaffoldJobStore`)와
 * `.vdoc` 문서 스토어(`pageMutations.hydrateReservedPdfPage`)를 연결한다.
 * Studio 루트 작업공간에서 한 번만 마운트해, F5 새로고침 후에도 미완료 작업을 자동 복구·반영한다.
 */
export function usePdfScaffoldSync(): void {
  useEffect(() => {
    const jobStore = usePdfScaffoldJobStore.getState();
    jobStore.registerSyncHandlers({
      onHydratePage: ({ job, placeholderPageId, page, slots, variables, thumbnail }) => {
        pageMutations.hydrateReservedPdfPage(job.targetDocId, placeholderPageId, page, slots, {
          thumbnail,
          sourceVariables: variables,
        });
      },
    });
    void jobStore.recoverUnfinishedJobs();
    return () => {
      usePdfScaffoldJobStore.getState().registerSyncHandlers(null);
    };
  }, []);
}

