import { create } from "zustand";

import { contentHash } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { resolveSlotEvidence, slotTarget } from "@/entities/evidence";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { httpClient } from "@/shared/api";
import { env } from "@/shared/config";
import { newId } from "@/shared/lib";

import { evidencePayload, measureSlot, pinnedEvidence, usableDeckIds } from "./harnessRuns";

export interface FillJobState {
  jobId: string | null;
  harnessId: string;
  status: "idle" | "running" | "succeeded" | "cancelled" | "failed";
  done: number;
  total: number;
  staged: number;
  failed: number;
  error: string | null;
}

export const useFillJobStore = create<FillJobState>(() => ({
  jobId: null,
  harnessId: "fill.slot",
  status: "idle",
  done: 0,
  total: 0,
  staged: 0,
  failed: 0,
  error: null,
}));

let source: EventSource | null = null;

/**
 * `fill.scope` — 범위의 칸마다 하네스를 서버 작업으로 돌린다 (동시 2칸).
 * 칸 정보 · 근거 · 기준 지문은 여기서 만들어 보낸다. 결과 변경안은 서버가 프로젝트 대기열에 덧붙이고,
 * 화면은 진행 이벤트마다 대기열을 다시 읽어 캔버스 자리 diff 로 보여 준다.
 */
export async function runFillScope(slotIds: string[], opts: { harnessId?: "fill.slot" | "ground.cite"; instruction?: string } = {}) {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  const projectId = selectActiveProject(useProjectStore.getState())?.projectId;
  if (!doc || !projectId || slotIds.length === 0) return;
  if (useFillJobStore.getState().status === "running") return;
  const pinned = pinnedEvidence();
  const items = slotIds
    .filter((id) => doc.slots[id])
    .map((id) => ({
      target: slotTarget(doc, id, measureSlot(id)),
      evidence: evidencePayload(resolveSlotEvidence(doc, id, { pinned })),
      baseHash: contentHash(doc.slots[id].content),
    }));
  const harnessId = opts.harnessId ?? "fill.slot";
  useFillJobStore.setState({ jobId: null, harnessId, status: "running", done: 0, total: items.length, staged: 0, failed: 0, error: null });
  try {
    const job = await httpClient.post<{ jobId: string }>("/api/assistant/harness/batch", {
      harnessId,
      runId: newId("run"),
      projectId,
      docId: doc.docId,
      instruction: opts.instruction,
      deckIds: usableDeckIds(),
      items,
    });
    useFillJobStore.setState({ jobId: job.jobId });
    follow(job.jobId);
  } catch (err) {
    useFillJobStore.setState({ status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}

function follow(jobId: string) {
  source?.close();
  source = new EventSource(`${env.apiBaseUrl}/api/assistant/harness/jobs/${encodeURIComponent(jobId)}/events`);
  source.onmessage = (msg) => {
    try {
      const ev = JSON.parse(msg.data) as { type: string; done: number; total: number; staged: number; failed: number; ok?: boolean };
      useFillJobStore.setState({ done: ev.done, total: ev.total, staged: ev.staged, failed: ev.failed });
      if (ev.type === "item" && ev.ok) void useAiStagingStore.getState().mergeFromServer();
      if (ev.type === "succeeded" || ev.type === "cancelled") {
        useFillJobStore.setState({ status: ev.type });
        void useAiStagingStore.getState().mergeFromServer();
        source?.close();
        source = null;
      }
    } catch {
      /* 깨진 줄은 건너뛴다 */
    }
  };
  source.onerror = () => {
    source?.close();
    source = null;
    // 연결이 끊겨도 작업은 서버에서 계속된다 — 대기열을 한 번 맞추고 진행 표시는 멈춘다
    void useAiStagingStore.getState().mergeFromServer();
    if (useFillJobStore.getState().status === "running") useFillJobStore.setState({ status: "failed", error: "진행 연결이 끊겼습니다 (작업은 서버에서 계속될 수 있습니다)." });
  };
}

export async function cancelFillScope() {
  const jobId = useFillJobStore.getState().jobId;
  if (!jobId) return;
  await httpClient.post(`/api/assistant/harness/jobs/${encodeURIComponent(jobId)}/cancel`, {}).catch(() => undefined);
}
