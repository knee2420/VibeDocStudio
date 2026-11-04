import { create } from "zustand";

import type { StagedAiChange } from "@vibe/vdoc-schema";

/**
 * AI 실행과 그 결과로 쌓인 Staged 변경안 대기열.
 *
 * 변경안은 승인 전까지 문서 · 프로젝트에 닿지 않는다 (승인 = `features/stage-ai-changes`).
 * 실행 중단은 어디서 누르든(Esc · 리본 · 작업대) `abortRun()` 한 경로로만 일어난다.
 */
export interface AiStagingState {
  queue: StagedAiChange[];
  isRunning: boolean;
  activeRunId: string | null;
  lastAbortedRunId: string | null;
  /** 마지막 AI 실행 오류 (사용자에게 보여줄 문장). */
  lastError: string | null;
  /** 하단 검토 서랍. 변경안이 들어오거나 실행을 멈추면 열린다. */
  reviewOpen: boolean;

  enqueue: (changes: StagedAiChange[]) => void;
  remove: (diffId: string) => void;
  clear: () => void;
  /** `abort` 는 그 실행을 실제로 멈추는 방법(요청 중단 + 서버 취소)이다. */
  startRun: (runId: string, abort: () => void) => void;
  finishRun: (runId: string) => void;
  abortRun: () => void;
  failRun: (message: string) => void;
  dismissError: () => void;
  setReviewOpen: (open: boolean) => void;
}

/** 실행 중단 방법은 직렬화할 값이 아니므로 상태 밖에 둔다. */
let activeRunAbort: (() => void) | null = null;

export const useAiStagingStore = create<AiStagingState>((set, get) => ({
  queue: [],
  isRunning: false,
  activeRunId: null,
  lastAbortedRunId: null,
  lastError: null,
  reviewOpen: false,

  enqueue: (changes) => {
    if (changes.length === 0) return;
    set((s) => ({ queue: [...s.queue, ...changes], reviewOpen: true }));
  },
  remove: (diffId) => set((s) => ({ queue: s.queue.filter((c) => c.diffId !== diffId) })),
  clear: () => set({ queue: [] }),

  startRun: (runId, abort) => {
    activeRunAbort = abort;
    set({ isRunning: true, activeRunId: runId, lastAbortedRunId: null, lastError: null });
  },
  finishRun: (runId) => {
    if (get().activeRunId !== runId) return;
    activeRunAbort = null;
    set({ isRunning: false, activeRunId: null });
  },
  abortRun: () => {
    const runId = get().activeRunId;
    if (!runId) return;
    const abort = activeRunAbort;
    activeRunAbort = null;
    set({ isRunning: false, activeRunId: null, lastAbortedRunId: runId, reviewOpen: true });
    abort?.();
  },
  failRun: (message) => set({ lastError: message }),
  dismissError: () => set({ lastError: null }),
  setReviewOpen: (open) => set(open ? { reviewOpen: true } : { reviewOpen: false, lastAbortedRunId: null }),
}));
