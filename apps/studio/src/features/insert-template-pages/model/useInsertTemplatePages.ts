import { useCallback, useRef, useState } from "react";

import type { VDocCatalogManifest, VDocDocument } from "@vibe/vdoc-schema";

import {
  scaffoldJobApi,
  usePdfScaffoldJobStore,
  type FidelityMode,
  type PdfPreviewResult,
} from "@/entities/scaffold-job";
import { isAbortError } from "@/shared/api";
import { errorMessage } from "@/shared/lib";

import { catalogApi, type UrlScaffoldParams } from "../api/catalogApi";
import {
  buildBasicPageTemplate,
  listCatalogTemplatesGrouped,
  loadCatalogTemplateDocument,
} from "./templateSources";

export type CommitTemplatePagesFn = (
  targetDocId: string,
  sourceDoc: VDocDocument,
  pageIds: readonly string[],
  label?: string
) => void;

export type ReservePdfPlaceholdersFn = (
  targetDocId: string,
  selectedPages: readonly { pageNumber: number; thumbnailDataUrl?: string | null }[],
  opts?: { title?: string; atIndex?: number }
) => {
  targetDocId: string;
  reserved: { pageNumber: number; placeholderPageId: string; thumbnail: string }[];
} | null;

export interface UseInsertTemplatePagesOptions {
  onReservePdfPlaceholders?: ReservePdfPlaceholdersFn;
}

export interface PdfPreviewPickerState {
  targetDocId: string;
  sourceTitle: string;
  file: File;
  preview: PdfPreviewResult;
}

const stripPdfExt = (name: string) => name.replace(/\.pdf$/i, "").trim() || "PDF 양식";

export function useInsertTemplatePages(
  onCommitPages: CommitTemplatePagesFn,
  options?: UseInsertTemplatePagesOptions
) {
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagePicker, setPagePicker] = useState<{
    targetDocId: string;
    sourceTitle: string;
    sourceDoc: VDocDocument;
    warnings?: string[];
  } | null>(null);
  const [pdfPreviewPicker, setPdfPreviewPicker] = useState<PdfPreviewPickerState | null>(null);
  const [catalogBrowser, setCatalogBrowser] = useState<{
    targetDocId: string;
    categories: { category: string; items: VDocCatalogManifest[] }[];
  } | null>(null);
  const [urlImportTargetDocId, setUrlImportTargetDocId] = useState<string | null>(null);
  const [urlImporting, setUrlImporting] = useState(false);

  const pendingPdfDocId = useRef<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const urlAbortRef = useRef<AbortController | null>(null);

  const resolveOrPickPages = useCallback(
    (targetDocId: string, sourceTitle: string, sourceDoc: VDocDocument) => {
      if (sourceDoc.pages.length === 0) {
        setError(`"${sourceTitle}" 에 삽입할 수 있는 페이지가 없습니다.`);
        return;
      }
      if (sourceDoc.pages.length === 1) {
        onCommitPages(targetDocId, sourceDoc, [sourceDoc.pages[0].pageId], `페이지 추가: "${sourceTitle}"`);
        setCatalogBrowser(null);
        setPagePicker(null);
        return;
      }
      setCatalogBrowser(null);
      setPagePicker({ targetDocId, sourceTitle, sourceDoc });
    },
    [onCommitPages]
  );

  const insertBasicPage = useCallback(
    (targetDocId: string, pageLabel = "새 페이지") => {
      const tmpl = buildBasicPageTemplate(pageLabel);
      resolveOrPickPages(targetDocId, pageLabel, tmpl);
    },
    [resolveOrPickPages]
  );

  const triggerPdfPick = useCallback((targetDocId: string) => {
    pendingPdfDocId.current = targetDocId;
    setError(null);
    pdfInputRef.current?.click();
  }, []);

  /** 1단계: 파싱 전 썸네일 및 텍스트 레이어 진단 결과만 빠르게 가져와 페이지 선택 모달을 연다. */
  const handlePdfFileSelected = useCallback(async (file: File | undefined | null) => {
    const targetDocId = pendingPdfDocId.current;
    pendingPdfDocId.current = null;
    if (!file || !targetDocId) return;

    const cleanTitle = stripPdfExt(file.name);
    setError(null);
    setLoadingMessage(`"${file.name}" 페이지 썸네일과 텍스트 레이어를 확인하는 중입니다…`);
    try {
      const preview = await scaffoldJobApi.previewPdf(file, cleanTitle);
      setLoadingMessage(null);
      if (preview.pages.length === 0) {
        setError(`"${file.name}" 에 표시할 페이지가 없습니다.`);
        return;
      }
      setCatalogBrowser(null);
      setPagePicker(null);
      setPdfPreviewPicker({
        targetDocId,
        sourceTitle: preview.title || cleanTitle,
        file,
        preview,
      });
    } catch (err) {
      setLoadingMessage(null);
      setError(errorMessage(err, "PDF 미리보기 생성에 실패했습니다."));
    }
  }, []);

  /** 2단계: 고른 페이지만큼 예약 페이지를 즉시 만들고, 선택한 페이지만 순차 비동기 스캐폴딩 작업을 등록한다. */
  const confirmPdfPages = useCallback(
    async (
      targetDocId: string,
      file: File,
      title: string,
      selectedPageNumbers: number[],
      fidelityMode: FidelityMode
    ) => {
      const currentPicker = pdfPreviewPicker;
      if (!currentPicker || selectedPageNumbers.length === 0) return;

      const selectedSet = new Set(selectedPageNumbers);
      const selectedPreviewPages = currentPicker.preview.pages.filter((p) => selectedSet.has(p.pageNumber));
      if (selectedPreviewPages.length === 0) return;

      const reserveFn = options?.onReservePdfPlaceholders;
      if (!reserveFn) {
        setError("예약 페이지 삽입 핸들러가 연결되지 않았습니다.");
        return;
      }

      const reservation = reserveFn(targetDocId, selectedPreviewPages, { title });
      setPdfPreviewPicker(null);
      setCatalogBrowser(null);
      if (!reservation) {
        setError("문서에 예약 페이지를 추가하지 못했습니다.");
        return;
      }

      const jobStore = usePdfScaffoldJobStore.getState();
      jobStore.markPagesOptimisticQueued(targetDocId, reservation.reserved);

      try {
        const job = await scaffoldJobApi.submitJob({
          file,
          title,
          targetDocId,
          mode: "insert-pages",
          fidelityMode,
          pages: reservation.reserved,
        });
        jobStore.upsertJob(job);
        jobStore.watchJob(job.jobId);
      } catch (err) {
        jobStore.markPagesOptimisticFailed(
          reservation.reserved,
          errorMessage(err, "비동기 PDF 스캐폴딩 작업 등록에 실패했습니다.")
        );
      }
    },
    [options, pdfPreviewPicker]
  );

  const openCatalogBrowser = useCallback(async (targetDocId: string) => {
    setError(null);
    setLoadingMessage("카탈로그 템플릿 목록을 불러오는 중입니다…");
    try {
      const { categories } = await listCatalogTemplatesGrouped();
      setLoadingMessage(null);
      setCatalogBrowser({ targetDocId, categories });
    } catch (err) {
      setLoadingMessage(null);
      setError(errorMessage(err, "카탈로그 목록을 불러오지 못했습니다."));
    }
  }, []);

  const selectCatalogTemplate = useCallback(
    async (targetDocId: string, manifest: VDocCatalogManifest) => {
      setError(null);
      setLoadingMessage(`"${manifest.title}" 템플릿을 불러오는 중입니다…`);
      try {
        const sourceDoc = await loadCatalogTemplateDocument(manifest.catalogId);
        setLoadingMessage(null);
        resolveOrPickPages(targetDocId, manifest.title, sourceDoc);
      } catch (err) {
        setLoadingMessage(null);
        setError(errorMessage(err, "템플릿 번들을 불러오지 못했습니다."));
      }
    },
    [resolveOrPickPages]
  );

  const confirmSelectedPages = useCallback(
    (targetDocId: string, sourceDoc: VDocDocument, pageIds: string[], label: string) => {
      onCommitPages(targetDocId, sourceDoc, pageIds, label);
      setPagePicker(null);
      setCatalogBrowser(null);
    },
    [onCommitPages]
  );

  const openUrlImport = useCallback((targetDocId: string) => {
    setError(null);
    setCatalogBrowser(null);
    setPagePicker(null);
    setPdfPreviewPicker(null);
    setUrlImportTargetDocId(targetDocId);
  }, []);

  const submitUrlImport = useCallback(async (targetDocId: string, params: UrlScaffoldParams) => {
    urlAbortRef.current?.abort();
    const controller = new AbortController();
    urlAbortRef.current = controller;
    setError(null);
    setUrlImporting(true);
    try {
      const res = await catalogApi.scaffoldUrl(params, controller.signal);
      if (res.document.pages.length === 0) {
        setError("가져온 웹페이지에 삽입할 페이지가 없습니다.");
        return;
      }
      setUrlImportTargetDocId(null);
      setPagePicker({
        targetDocId,
        sourceTitle: res.title || params.url,
        sourceDoc: res.document,
        warnings: res.warnings,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setError(errorMessage(err, "웹페이지 가져오기에 실패했습니다."));
      }
    } finally {
      if (urlAbortRef.current === controller) {
        urlAbortRef.current = null;
      }
      setUrlImporting(false);
    }
  }, []);

  const closeModals = useCallback(() => {
    if (loadingMessage || urlImporting) return;
    setPagePicker(null);
    setPdfPreviewPicker(null);
    setCatalogBrowser(null);
    setUrlImportTargetDocId(null);
    setError(null);
  }, [loadingMessage, urlImporting]);

  return {
    loadingMessage,
    error,
    pagePicker,
    pdfPreviewPicker,
    catalogBrowser,
    urlImportTargetDocId,
    urlImporting,
    pdfInputRef,
    insertBasicPage,
    triggerPdfPick,
    handlePdfFileSelected,
    confirmPdfPages,
    openCatalogBrowser,
    selectCatalogTemplate,
    openUrlImport,
    submitUrlImport,
    confirmSelectedPages,
    dismissError: () => setError(null),
    closeModals,
  };
}
