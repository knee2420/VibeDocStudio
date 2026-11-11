import { create } from "zustand";

import type { WorkbenchProposal } from "@vibe/ai-kernel";
import type { StagedAiChange, VDocDocument } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";
import { buildProposalSlotChanges } from "../lib/proposalStaging";

export interface StagedProposalEntry {
  proposal: WorkbenchProposal;
  selectedCandidate: number;
}

/**
 * AI 실행과 그 결과로 쌓인 Staged 변경안 대기열.
 *
 * 변경안은 승인 전까지 문서 · 프로젝트에 닿지 않는다 (승인 = `features/stage-ai-changes`).
 * 대기열은 프로젝트별로 서버에 저장된다 (`/api/projects/{id}/staging`) — 새로고침 · 탭을 넘어 살아 있고,
 * 서버 일괄 채우기 작업이 덧붙인 변경안도 여기로 들어온다 (`hydrate` · `mergeFromServer`).
 * 실행 중단은 어디서 누르든(Esc · 리본 · 작업대) `abortRun()` 한 경로로만 일어난다.
 */
export interface AiStagingState {
  projectId: string | null;
  queue: StagedAiChange[];
  /** `wb_propose` 로 들어온 다중 후보(1안·2안…) 제안 메타 — 대기열에 남은 변경안이 사라지면 함께 정리된다. */
  proposals: Record<string, StagedProposalEntry>;
  isRunning: boolean;
  activeRunId: string | null;
  lastAbortedRunId: string | null;
  /** 마지막 AI 실행 오류 (사용자에게 보여줄 문장). */
  lastError: string | null;
  /** 하단 검토 서랍. 변경안이 들어오거나 실행을 멈추면 열린다. */
  reviewOpen: boolean;

  hydrate: (projectId: string) => Promise<void>;
  /** 서버에서 새로 들어온 변경안(일괄 작업)을 합친다. */
  mergeFromServer: () => Promise<void>;
  enqueue: (changes: StagedAiChange[]) => void;
  /** `wb_propose` 제안의 후보안을 Staged 변경안으로 올린다 (같은 문서·슬롯의 기존 미승인 diff 는 새 안으로 교체). */
  receiveProposal: (proposal: WorkbenchProposal, doc: VDocDocument, candidateIndex?: number) => StagedAiChange[];
  /** 다중 후보(1안·2안…) 사이를 전환해 Staged diff 를 갈아끼운다. */
  selectProposalCandidate: (proposalId: string, candidateIndex: number, doc: VDocDocument) => StagedAiChange[];
  remove: (diffId: string) => void;
  removeMany: (diffIds: string[]) => void;
  /** 삭제된 문서에 매여 있던 미승인 변경안을 모두 비운다. */
  removeByDoc: (docId: string) => void;
  /** 변경안 하나를 고친다 (부분 승인 뒤 남은 부분 · 경고 갱신). */
  replace: (change: StagedAiChange) => void;
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
let syncTimer: number | undefined;
const SYNC_DELAY_MS = 400;
/** 마지막 동기화 뒤 화면에서 지운(승인 · 거절) 변경안 — 서버는 이것만 지우고, 화면이 못 본 서버 쪽 변경안은 남긴다. */
const removedSinceSync = new Set<string>();

const stagingPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/staging`;

function slotKey(change: StagedAiChange): string | null {
  return change.targetKind === "slot-html" ? `${change.docId ?? ""}\0${change.payload.slotId}` : null;
}

function dedupeIncomingChanges(changes: StagedAiChange[], stamp: string): StagedAiChange[] {
  const withStamp = changes.map((c) => ({ ...c, createdAt: c.createdAt ?? stamp }));
  const seenKeys = new Set<string>();
  const reversed: StagedAiChange[] = [];
  for (let i = withStamp.length - 1; i >= 0; i -= 1) {
    const key = slotKey(withStamp[i]);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    reversed.push(withStamp[i]);
  }
  return reversed.reverse();
}

function mergeReplacingSlots(
  prev: StagedAiChange[],
  incoming: StagedAiChange[],
  extraDrop?: (c: StagedAiChange) => boolean,
): StagedAiChange[] {
  const incomingKeys = new Set(incoming.map(slotKey).filter((k): k is string => k !== null));
  const kept: StagedAiChange[] = [];
  for (const item of prev) {
    const k = slotKey(item);
    const shouldDrop = Boolean(extraDrop?.(item)) || (k !== null && incomingKeys.has(k));
    if (shouldDrop) removedSinceSync.add(item.diffId);
    else kept.push(item);
  }
  return [...kept, ...incoming];
}

function pruneProposals(
  proposals: Record<string, StagedProposalEntry>,
  queue: StagedAiChange[],
): Record<string, StagedProposalEntry> {
  const keys = Object.keys(proposals);
  if (keys.length === 0) return proposals;
  const activeRunIds = new Set(queue.map((c) => c.runId).filter((id): id is string => Boolean(id)));
  let changed = false;
  const next: Record<string, StagedProposalEntry> = {};
  for (const id of keys) {
    if (activeRunIds.has(id)) next[id] = proposals[id];
    else changed = true;
  }
  return changed ? next : proposals;
}

export const useAiStagingStore = create<AiStagingState>((set, get) => {
  /** 대기열 전체를 서버에 맞춘다 (잠깐 모았다가 한 번에). */
  const scheduleSync = () => {
    const projectId = get().projectId;
    if (!projectId || typeof window === "undefined") return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      const removed = [...removedSinceSync];
      removedSinceSync.clear();
      void httpClient
        .put<{ changes: StagedAiChange[] }>(stagingPath(projectId), { changes: get().queue, removed })
        .then((res) => {
          // 일괄 작업이 그사이 덧붙인 변경안을 받아 온다
          const known = new Set(get().queue.map((c) => c.diffId));
          const incoming = (res.changes ?? []).filter((c) => !known.has(c.diffId) && !removedSinceSync.has(c.diffId));
          if (incoming.length) set((st) => ({ queue: [...st.queue, ...incoming] }));
        })
        .catch(() => removed.forEach((id) => removedSinceSync.add(id)));
    }, SYNC_DELAY_MS);
  };

  const setQueue = (
    queue: StagedAiChange[],
    openReview = false,
    proposals?: Record<string, StagedProposalEntry>,
  ) => {
    const nextProposals = pruneProposals(proposals ?? get().proposals, queue);
    set(openReview ? { queue, proposals: nextProposals, reviewOpen: true } : { queue, proposals: nextProposals });
    scheduleSync();
  };

  return {
    projectId: null,
    queue: [],
    proposals: {},
    isRunning: false,
    activeRunId: null,
    lastAbortedRunId: null,
    lastError: null,
    reviewOpen: false,

    hydrate: async (projectId) => {
      set({ projectId, proposals: {} });
      try {
        const res = await httpClient.get<{ changes: StagedAiChange[] }>(stagingPath(projectId));
        const changes = res.changes ?? [];
        set({
          queue: changes,
          proposals: pruneProposals(get().proposals, changes),
          reviewOpen: changes.length > 0 ? get().reviewOpen : false,
        });
      } catch {
        /* 서버 대기열을 못 읽어도 이번 세션 대기열로 계속한다 */
      }
    },

    mergeFromServer: async () => {
      const projectId = get().projectId;
      if (!projectId) return;
      try {
        const res = await httpClient.get<{ changes: StagedAiChange[] }>(stagingPath(projectId));
        const known = new Set(get().queue.map((c) => c.diffId));
        const incoming = (res.changes ?? []).filter((c) => !known.has(c.diffId));
        if (incoming.length) {
          set((s) => {
            const nextQueue = mergeReplacingSlots(s.queue, incoming);
            return { queue: nextQueue, proposals: pruneProposals(s.proposals, nextQueue), reviewOpen: true };
          });
        }
      } catch {
        /* 다음 기회에 */
      }
    },

    enqueue: (changes) => {
      if (changes.length === 0) return;
      const incoming = dedupeIncomingChanges(changes, new Date().toISOString());
      setQueue(mergeReplacingSlots(get().queue, incoming), true);
    },
    receiveProposal: (proposal, doc, candidateIndex = 0) => {
      const candidates = proposal.candidates ?? [];
      if (candidates.length === 0) return [];
      const safeIndex = Math.max(0, Math.min(candidateIndex, candidates.length - 1));
      const built = buildProposalSlotChanges(proposal, doc, safeIndex);
      if (built.length === 0) return [];
      const nextQueue = mergeReplacingSlots(get().queue, built, (c) => c.runId === proposal.proposalId);
      const nextProposals = {
        ...get().proposals,
        [proposal.proposalId]: { proposal, selectedCandidate: safeIndex },
      };
      setQueue(nextQueue, true, nextProposals);
      return built;
    },
    selectProposalCandidate: (proposalId, candidateIndex, doc) => {
      const entry = get().proposals[proposalId];
      if (!entry) return [];
      const candidates = entry.proposal.candidates ?? [];
      if (candidates.length === 0) return [];
      const safeIndex = Math.max(0, Math.min(candidateIndex, candidates.length - 1));
      const built = buildProposalSlotChanges(entry.proposal, doc, safeIndex);
      if (built.length === 0) return [];
      const nextQueue = mergeReplacingSlots(get().queue, built, (c) => c.runId === proposalId);
      const nextProposals = {
        ...get().proposals,
        [proposalId]: { ...entry, selectedCandidate: safeIndex },
      };
      setQueue(nextQueue, false, nextProposals);
      return built;
    },
    remove: (diffId) => {
      removedSinceSync.add(diffId);
      setQueue(get().queue.filter((c) => c.diffId !== diffId));
    },
    removeMany: (diffIds) => {
      const drop = new Set(diffIds);
      diffIds.forEach((id) => removedSinceSync.add(id));
      setQueue(get().queue.filter((c) => !drop.has(c.diffId)));
    },
    removeByDoc: (docId) => {
      if (!docId) return;
      const matching = get().queue.filter((c) => c.docId === docId);
      if (matching.length === 0) return;
      matching.forEach((c) => removedSinceSync.add(c.diffId));
      setQueue(get().queue.filter((c) => c.docId !== docId));
    },
    replace: (change) => setQueue(get().queue.map((c) => (c.diffId === change.diffId ? change : c))),
    clear: () => {
      get().queue.forEach((c) => removedSinceSync.add(c.diffId));
      setQueue([], false, {});
    },

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
  };
});

/** 변경안의 대상 슬롯 id 들 (채움 상태 "staged" 계산용). */
export function stagedSlotIds(queue: StagedAiChange[], docId?: string): Set<string> {
  const ids = new Set<string>();
  for (const c of queue) {
    if (c.targetKind !== "slot-html") continue;
    if (docId && c.docId && c.docId !== docId) continue;
    ids.add(c.payload.slotId);
  }
  return ids;
}
