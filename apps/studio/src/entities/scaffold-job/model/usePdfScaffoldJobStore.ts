import { create } from "zustand";

import type { PagePendingState } from "@vibe/slot-canvas";
import type { VDocPage, VDocSlot } from "@vibe/vdoc-schema";

import { errorMessage } from "@/shared/lib";

import { scaffoldJobApi } from "../api/scaffoldJobApi";
import type { ScaffoldJob, ScaffoldJobEvent, ScaffoldPageTask } from "./types";

export interface PageHydrationPayload {
  job: ScaffoldJob;
  pageNumber: number;
  placeholderPageId: string;
  page: VDocPage;
  slots: Record<string, VDocSlot>;
  variables?: Record<string, string>;
  thumbnail?: string | null;
}

export interface PageJobReference {
  jobId: string;
  pageNumber: number;
  targetDocId: string;
}

interface ScaffoldSyncHandlers {
  onHydratePage: (payload: PageHydrationPayload) => void;
}

interface PdfScaffoldJobStoreState {
  jobs: Record<string, ScaffoldJob>;
  pageStatesByPageId: Record<string, PagePendingState>;
  pageJobRefByPageId: Record<string, PageJobReference>;
  hydratedPageIds: Record<string, true>;
  lastError: string | null;

  registerSyncHandlers: (handlers: ScaffoldSyncHandlers | null) => void;
  markPagesOptimisticQueued: (
    targetDocId: string,
    items: readonly { placeholderPageId: string; pageNumber: number; thumbnail?: string | null }[]
  ) => void;
  markPagesOptimisticFailed: (
    items: readonly { placeholderPageId: string; pageNumber: number }[],
    error: string
  ) => void;
  upsertJob: (job: ScaffoldJob) => void;
  applyEvent: (ev: ScaffoldJobEvent) => void;
  markHydrated: (placeholderPageId: string) => void;
  clearPageState: (placeholderPageId: string) => void;
  watchJob: (jobId: string) => void;
  cancelPendingPage: (placeholderPageId: string) => Promise<void>;
  retryPendingPage: (placeholderPageId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  recoverUnfinishedJobs: () => Promise<void>;
  clearError: () => void;
}

let activeHandlers: ScaffoldSyncHandlers | null = null;
const activeSubscriptions = new Map<string, () => void>();

function toPagePendingState(
  task: ScaffoldPageTask,
  index: number,
  totalInJob: number
): PagePendingState | null {
  if (task.status === "completed") return null;
  return {
    status: task.status,
    sourcePageNumber: task.pageNumber,
    queuePosition: index + 1,
    totalInJob,
    stage: task.stage,
    iter: task.iter,
    verdict: task.verdict,
    spanScore: task.spanScore,
    message: task.message,
    error: task.error,
    warnings: task.warnings,
    previewThumb: task.thumbnail ?? null,
  };
}

function buildDerivedPageMaps(jobs: Record<string, ScaffoldJob>): {
  pageStatesByPageId: Record<string, PagePendingState>;
  pageJobRefByPageId: Record<string, PageJobReference>;
} {
  const pageStatesByPageId: Record<string, PagePendingState> = {};
  const pageJobRefByPageId: Record<string, PageJobReference> = {};
  const ordered = Object.values(jobs).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of ordered) {
    const total = job.pages.length;
    job.pages.forEach((task, idx) => {
      if (!task.placeholderPageId) return;
      pageJobRefByPageId[task.placeholderPageId] = {
        jobId: job.jobId,
        pageNumber: task.pageNumber,
        targetDocId: job.targetDocId,
      };
      const pending = toPagePendingState(task, idx, total);
      if (pending) {
        pageStatesByPageId[task.placeholderPageId] = pending;
      }
    });
  }
  return { pageStatesByPageId, pageJobRefByPageId };
}

function hydrateJobCompletedPages(
  job: ScaffoldJob,
  hydrated: Record<string, true>,
  markHydrated: (pageId: string) => void
): void {
  if (!activeHandlers) return;
  for (const task of job.pages) {
    if (task.status !== "completed" || !task.placeholderPageId || !task.page) continue;
    if (hydrated[task.placeholderPageId]) continue;
    markHydrated(task.placeholderPageId);
    activeHandlers.onHydratePage({
      job,
      pageNumber: task.pageNumber,
      placeholderPageId: task.placeholderPageId,
      page: task.page,
      slots: task.slots ?? {},
      variables: task.variables,
      thumbnail: task.thumbnail ?? null,
    });
  }
}

export const usePdfScaffoldJobStore = create<PdfScaffoldJobStoreState>((set, get) => ({
  jobs: {},
  pageStatesByPageId: {},
  pageJobRefByPageId: {},
  hydratedPageIds: {},
  lastError: null,

  registerSyncHandlers: (handlers) => {
    activeHandlers = handlers;
    if (handlers) {
      for (const job of Object.values(get().jobs)) {
        hydrateJobCompletedPages(job, get().hydratedPageIds, get().markHydrated);
      }
    }
  },

  markPagesOptimisticQueued: (targetDocId, items) => {
    set((state) => {
      const nextStates = { ...state.pageStatesByPageId };
      const nextRefs = { ...state.pageJobRefByPageId };
      const total = items.length;
      items.forEach((item, idx) => {
        nextStates[item.placeholderPageId] = {
          status: "queued",
          sourcePageNumber: item.pageNumber,
          queuePosition: idx + 1,
          totalInJob: total,
          stage: "queued",
          message: "서버 작업 등록 중...",
          previewThumb: item.thumbnail ?? null,
        };
        nextRefs[item.placeholderPageId] = {
          jobId: "",
          pageNumber: item.pageNumber,
          targetDocId,
        };
      });
      return { pageStatesByPageId: nextStates, pageJobRefByPageId: nextRefs, lastError: null };
    });
  },

  markPagesOptimisticFailed: (items, error) => {
    set((state) => {
      const nextStates = { ...state.pageStatesByPageId };
      for (const item of items) {
        const prev = nextStates[item.placeholderPageId];
        nextStates[item.placeholderPageId] = {
          status: "failed",
          sourcePageNumber: item.pageNumber,
          message: "작업 등록에 실패했습니다.",
          error,
          previewThumb: prev?.previewThumb ?? null,
        };
      }
      return { pageStatesByPageId: nextStates, lastError: error };
    });
  },

  upsertJob: (job) => {
    set((state) => {
      const nextJobs = { ...state.jobs, [job.jobId]: job };
      const { pageStatesByPageId, pageJobRefByPageId } = buildDerivedPageMaps(nextJobs);
      return { jobs: nextJobs, pageStatesByPageId, pageJobRefByPageId };
    });
    hydrateJobCompletedPages(job, get().hydratedPageIds, get().markHydrated);
  },

  applyEvent: (ev) => {
    const detail = ev.detail ?? {};
    const jobFromDetail = detail.job as ScaffoldJob | undefined;
    if (jobFromDetail && jobFromDetail.jobId) {
      get().upsertJob(jobFromDetail);
      return;
    }

    const pageTask = detail.pageTask as ScaffoldPageTask | undefined;
    set((state) => {
      const prevJob = state.jobs[ev.jobId];
      if (!prevJob) return state;

      let nextPages = prevJob.pages;
      if (pageTask && typeof detail.pageNumber === "number") {
        nextPages = prevJob.pages.map((p) =>
          p.pageNumber === detail.pageNumber
            ? {
                ...p,
                ...pageTask,
                ...(detail.page ? { page: detail.page as VDocPage } : {}),
                ...(detail.slots ? { slots: detail.slots as Record<string, VDocSlot> } : {}),
                ...(detail.variables ? { variables: detail.variables as Record<string, string> } : {}),
              }
            : p
        );
      }

      const nextJob: ScaffoldJob = {
        ...prevJob,
        status: ev.status ?? prevJob.status,
        currentPageNumber: ev.currentPageNumber,
        completedCount: ev.completedCount ?? prevJob.completedCount,
        totalCount: ev.totalCount ?? prevJob.totalCount,
        pages: nextPages,
      };
      const nextJobs = { ...state.jobs, [nextJob.jobId]: nextJob };
      const { pageStatesByPageId, pageJobRefByPageId } = buildDerivedPageMaps(nextJobs);
      return { jobs: nextJobs, pageStatesByPageId, pageJobRefByPageId };
    });

    if (ev.type === "page_completed" && activeHandlers) {
      const placeholderPageId =
        (typeof detail.placeholderPageId === "string" && detail.placeholderPageId) ||
        get().jobs[ev.jobId]?.pages.find((p) => p.pageNumber === detail.pageNumber)?.placeholderPageId ||
        "";
      const pagePayload = detail.page as VDocPage | undefined;
      const slotsPayload = (detail.slots as Record<string, VDocSlot> | undefined) ?? {};
      const varsPayload = detail.variables as Record<string, string> | undefined;
      const thumbPayload = (detail.thumbnail as string | null | undefined) ?? null;
      const jobNow = get().jobs[ev.jobId];
      if (placeholderPageId && pagePayload && jobNow && !get().hydratedPageIds[placeholderPageId]) {
        get().markHydrated(placeholderPageId);
        activeHandlers.onHydratePage({
          job: jobNow,
          pageNumber: Number(detail.pageNumber ?? pagePayload.pageNumber ?? 1),
          placeholderPageId,
          page: pagePayload,
          slots: slotsPayload,
          variables: varsPayload,
          thumbnail: thumbPayload,
        });
      }
    }
  },

  markHydrated: (placeholderPageId) => {
    set((state) => {
      if (state.hydratedPageIds[placeholderPageId]) return state;
      return {
        hydratedPageIds: { ...state.hydratedPageIds, [placeholderPageId]: true },
      };
    });
  },

  clearPageState: (placeholderPageId) => {
    set((state) => {
      const nextStates = { ...state.pageStatesByPageId };
      const nextRefs = { ...state.pageJobRefByPageId };
      delete nextStates[placeholderPageId];
      delete nextRefs[placeholderPageId];
      return { pageStatesByPageId: nextStates, pageJobRefByPageId: nextRefs };
    });
  },

  watchJob: (jobId) => {
    if (!jobId || activeSubscriptions.has(jobId)) return;
    const unsub = scaffoldJobApi.subscribeJob(
      jobId,
      (ev) => get().applyEvent(ev),
      {
        onDone: () => {
          const stop = activeSubscriptions.get(jobId);
          if (stop) activeSubscriptions.delete(jobId);
          void scaffoldJobApi
            .getJob(jobId)
            .then((full) => get().upsertJob(full))
            .catch(() => {});
        },
        onError: (err) => {
          const stop = activeSubscriptions.get(jobId);
          if (stop) activeSubscriptions.delete(jobId);
          set({ lastError: err });
        },
      }
    );
    activeSubscriptions.set(jobId, unsub);
  },

  cancelPendingPage: async (placeholderPageId) => {
    const ref = get().pageJobRefByPageId[placeholderPageId];
    if (!ref?.jobId) return;
    await get().cancelJob(ref.jobId);
  },

  retryPendingPage: async (placeholderPageId) => {
    const ref = get().pageJobRefByPageId[placeholderPageId];
    if (!ref?.jobId) return;
    try {
      const updated = await scaffoldJobApi.retryPage(ref.jobId, ref.pageNumber);
      get().upsertJob(updated);
      get().watchJob(ref.jobId);
    } catch (err) {
      set({ lastError: errorMessage(err, "페이지 재시도 요청에 실패했습니다.") });
    }
  },

  cancelJob: async (jobId) => {
    try {
      const updated = await scaffoldJobApi.cancelJob(jobId);
      const stop = activeSubscriptions.get(jobId);
      if (stop) {
        stop();
        activeSubscriptions.delete(jobId);
      }
      get().upsertJob(updated);
    } catch (err) {
      set({ lastError: errorMessage(err, "작업 중단에 실패했습니다.") });
    }
  },

  recoverUnfinishedJobs: async () => {
    try {
      const recent = await scaffoldJobApi.listJobs(undefined, 20);
      for (const summary of recent) {
        const needsWatch = summary.status === "queued" || summary.status === "running";
        const hasPendingPlaceholder = summary.pages.some(
          (p) => p.placeholderPageId && p.status === "completed" && !get().hydratedPageIds[p.placeholderPageId]
        );
        if (needsWatch || hasPendingPlaceholder) {
          const full = await scaffoldJobApi.getJob(summary.jobId);
          get().upsertJob(full);
          if (full.status === "queued" || full.status === "running") {
            get().watchJob(full.jobId);
          }
        }
      }
    } catch {
      // 오프라인이나 API 초기 기동 중에는 조용히 무시
    }
  },

  clearError: () => set({ lastError: null }),
}));
