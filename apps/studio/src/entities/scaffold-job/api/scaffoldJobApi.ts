import { httpClient } from "@/shared/api";
import { env } from "@/shared/config";

import type {
  FidelityMode,
  PdfPreviewResult,
  ScaffoldJob,
  ScaffoldJobEvent,
  ScaffoldPageSelectionInput,
} from "../model/types";

export interface SubmitScaffoldJobParams {
  file: File;
  title: string;
  targetDocId: string;
  mode: "insert-pages" | "new-doc";
  fidelityMode: FidelityMode;
  pages: ScaffoldPageSelectionInput[];
  signal?: AbortSignal;
}

export interface SubscribeJobHandlers {
  onDone?: () => void;
  onError?: (detail: string) => void;
}

export const scaffoldJobApi = {
  /** 1단계: 파싱 전 PDF 페이지별 썸네일 및 텍스트 레이어 진단 (빠른 동기 미리보기). */
  previewPdf(file: File, title?: string, signal?: AbortSignal): Promise<PdfPreviewResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title?.trim() ?? "");
    return httpClient.post<PdfPreviewResult>("/api/catalog/pdf-preview", form, { signal });
  },

  /** 2단계: 선택된 페이지만 순차 실행하는 비동기 스캐폴딩 작업을 등록한다. */
  submitJob(params: SubmitScaffoldJobParams): Promise<ScaffoldJob> {
    const form = new FormData();
    form.append("file", params.file);
    form.append("title", params.title);
    form.append("target_doc_id", params.targetDocId);
    form.append("mode", params.mode);
    form.append("fidelity_mode", params.fidelityMode);
    form.append("pages_json", JSON.stringify(params.pages));
    return httpClient.post<ScaffoldJob>("/api/catalog/scaffold-jobs", form, { signal: params.signal });
  },

  listJobs(targetDocId?: string, limit = 20): Promise<ScaffoldJob[]> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (targetDocId) qs.set("targetDocId", targetDocId);
    return httpClient.get<ScaffoldJob[]>(`/api/catalog/scaffold-jobs?${qs.toString()}`);
  },

  getJob(jobId: string): Promise<ScaffoldJob> {
    return httpClient.get<ScaffoldJob>(`/api/catalog/scaffold-jobs/${encodeURIComponent(jobId)}`);
  },

  cancelJob(jobId: string): Promise<ScaffoldJob> {
    return httpClient.post<ScaffoldJob>(`/api/catalog/scaffold-jobs/${encodeURIComponent(jobId)}/cancel`, {});
  },

  retryPage(jobId: string, pageNumber: number): Promise<ScaffoldJob> {
    return httpClient.post<ScaffoldJob>(
      `/api/catalog/scaffold-jobs/${encodeURIComponent(jobId)}/pages/${pageNumber}/retry`,
      {}
    );
  },

  /** SSE 진행 스트림 구독. 재연결 시 마지막 seq 이후만 재수신한다. */
  subscribeJob(
    jobId: string,
    onEvent: (event: ScaffoldJobEvent) => void,
    handlers?: SubscribeJobHandlers
  ): () => void {
    let closed = false;
    let lastSeq = 0;
    let retries = 0;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupSource = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (es) {
        es.close();
        es = null;
      }
    };

    const open = () => {
      if (closed) return;
      const url = `${env.apiBaseUrl}/api/catalog/scaffold-jobs/${encodeURIComponent(jobId)}/events?after=${lastSeq}`;
      const source = new EventSource(url);
      es = source;

      source.onmessage = (msg) => {
        retries = 0;
        let ev: ScaffoldJobEvent;
        try {
          ev = JSON.parse(msg.data) as ScaffoldJobEvent;
        } catch {
          return;
        }
        if (typeof ev.seq === "number" && ev.seq > lastSeq) {
          lastSeq = ev.seq;
        }
        onEvent(ev);
        if (ev.type === "job_completed" || ev.type === "job_failed" || ev.type === "job_cancelled") {
          closed = true;
          cleanupSource();
          handlers?.onDone?.();
        }
      };

      source.onerror = () => {
        source.close();
        if (es === source) es = null;
        if (closed) return;
        retries += 1;
        if (retries > 10) {
          closed = true;
          handlers?.onError?.("PDF 스캐폴딩 진행 스트림 연결이 끊어졌습니다.");
          return;
        }
        retryTimer = setTimeout(() => {
          retryTimer = null;
          open();
        }, 1500);
      };
    };

    open();
    return () => {
      closed = true;
      cleanupSource();
    };
  },
};

