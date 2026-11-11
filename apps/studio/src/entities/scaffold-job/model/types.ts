import type { VDocDocument, VDocPage, VDocSlot } from "@vibe/vdoc-schema";

export type FidelityMode = "fast" | "balanced" | "strict";

export interface PdfPreviewPage {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  hasTextLayer: boolean;
  spanCount: number;
  imageCount: number;
  drawingCount: number;
  thumbnailDataUrl: string;
}

export interface PdfPreviewResult {
  title: string;
  totalPages: number;
  hasAnyTextLayer: boolean;
  pages: PdfPreviewPage[];
}

export interface ScaffoldPageSelectionInput {
  pageNumber: number;
  placeholderPageId: string;
  thumbnail?: string | null;
}

export type ScaffoldTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ScaffoldPageTask {
  pageNumber: number;
  placeholderPageId: string | null;
  status: ScaffoldTaskStatus;
  stage: string;
  iter: number;
  verdict: string | null;
  spanScore: number | null;
  message: string;
  warnings: string[];
  error: string | null;
  thumbnail?: string | null;
  blockCount: number;
  slotCount: number;
  page?: VDocPage | null;
  slots?: Record<string, VDocSlot>;
  variables?: Record<string, string>;
}

export interface ScaffoldJob {
  jobId: string;
  title: string;
  targetDocId: string;
  mode: "insert-pages" | "new-doc" | string;
  fidelityMode: FidelityMode;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  currentPageNumber: number | null;
  error: string | null;
  completedCount: number;
  totalCount: number;
  pages: ScaffoldPageTask[];
  document?: VDocDocument | null;
}

export interface ScaffoldJobEvent {
  seq: number;
  type:
    | "job_queued"
    | "job_started"
    | "job_resumed"
    | "page_started"
    | "page_progress"
    | "page_completed"
    | "page_failed"
    | "page_retried"
    | "job_completed"
    | "job_failed"
    | "job_cancelled";
  jobId: string;
  targetDocId: string;
  status: ScaffoldJob["status"];
  currentPageNumber: number | null;
  completedCount: number;
  totalCount: number;
  detail: Record<string, unknown>;
  ts: number;
}

