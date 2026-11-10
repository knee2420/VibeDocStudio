import { useRef, useState } from "react";

import { buildReservedPdfPlaceholders, type VDocDocument } from "@vibe/vdoc-schema";

import {
  scaffoldJobApi,
  usePdfScaffoldJobStore,
  type FidelityMode,
  type PdfPreviewResult,
} from "@/entities/scaffold-job";
import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { errorMessage, newId } from "@/shared/lib";

import { importPdfApi } from "../api/importPdfApi";

export type { FidelityMode } from "@/entities/scaffold-job";
export type ImportMode = "canvas" | "catalog";

const stripPdfExtension = (name: string) => name.replace(/\.pdf$/i, "");
const suffixId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * PDF 가져오기 모달의 상태와 실행.
 * - `canvas` 모드: 1단계 썸네일/텍스트 미리보기 → 선택한 페이지 수만큼 새 문서에 예약 페이지 생성 → 순차 비동기 스캐폴딩.
 * - `catalog` 모드: 서식 보관함 등록 (`ingestCatalog`).
 */
export function useImportPdfForm() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("canvas");
  const [fidelityMode, setFidelityMode] = useState<FidelityMode>("balanced");
  const [preview, setPreview] = useState<PdfPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);

  const previewSeqRef = useRef(0);
  const addDocument = useStudioDocumentStore((s) => s.addDocument);

  const reset = () => {
    previewSeqRef.current += 1;
    setSelectedFile(null);
    setDocTitle("");
    setPreview(null);
    setIsPreviewLoading(false);
    setSelectedPageNumbers([]);
    setError(null);
    setCurrentStep(1);
  };

  const openModal = () => {
    useSlotSelectionStore.getState().clearSelection();
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isLoading) return;
    setIsModalOpen(false);
    reset();
  };

  const handleFileChange = (file: File | null) => {
    const seq = ++previewSeqRef.current;
    setSelectedFile(file);
    setPreview(null);
    setSelectedPageNumbers([]);
    setError(null);
    if (!file) {
      setIsPreviewLoading(false);
      return;
    }
    const derivedTitle = docTitle.trim() || stripPdfExtension(file.name);
    if (!docTitle) setDocTitle(derivedTitle);

    setIsPreviewLoading(true);
    void scaffoldJobApi
      .previewPdf(file, derivedTitle)
      .then((res) => {
        if (previewSeqRef.current !== seq) return;
        setPreview(res);
        setSelectedPageNumbers(res.pages.map((p) => p.pageNumber));
        setIsPreviewLoading(false);
      })
      .catch((err) => {
        if (previewSeqRef.current !== seq) return;
        setIsPreviewLoading(false);
        setError(errorMessage(err, "PDF 미리보기 생성에 실패했습니다."));
      });
  };

  const togglePreviewPage = (pageNumber: number) => {
    setSelectedPageNumbers((prev) =>
      prev.includes(pageNumber) ? prev.filter((n) => n !== pageNumber) : [...prev, pageNumber].sort((a, b) => a - b)
    );
  };

  const toggleAllPreviewPages = () => {
    if (!preview) return;
    const all = preview.pages.map((p) => p.pageNumber);
    setSelectedPageNumbers((prev) => (prev.length === all.length ? [] : all));
  };

  const executeImport = async () => {
    if (!selectedFile) {
      setError("PDF 파일을 먼저 선택해 주세요.");
      return;
    }
    const title = docTitle.trim() || stripPdfExtension(selectedFile.name);

    if (importMode === "catalog") {
      setIsLoading(true);
      setError(null);
      try {
        setCurrentStep(2);
        const { document } = await importPdfApi.ingestCatalog(selectedFile, title);
        setCurrentStep(3);
        await addDocument(document);
        setIsModalOpen(false);
        reset();
      } catch (err) {
        setError(errorMessage(err, "서식 보관함 등록에 실패했습니다."));
        setCurrentStep(1);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 캔버스 모드: 선택한 페이지만큼 예약 페이지를 먼저 만들고 비동기 순차 작업 큐에 등록
    const resolvedPreview = preview ?? (await scaffoldJobApi.previewPdf(selectedFile, title));
    const chosenSet = new Set(
      selectedPageNumbers.length > 0 ? selectedPageNumbers : resolvedPreview.pages.map((p) => p.pageNumber)
    );
    const chosenPages = resolvedPreview.pages.filter((p) => chosenSet.has(p.pageNumber));
    if (chosenPages.length === 0) {
      setError("최소 1개 이상의 페이지를 선택해 주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const targetDocId = newId("doc");
      const { pages, slots, thumbnails, mappings } = buildReservedPdfPlaceholders(
        chosenPages,
        title,
        1,
        suffixId
      );
      const docShell: VDocDocument = {
        version: "1.0.0",
        docId: targetDocId,
        title,
        status: "Draft",
        updatedAt: new Date().toISOString(),
        variables: {},
        pages,
        slots,
        backdata: {},
        preview: { pageThumbnails: thumbnails },
      };

      await addDocument(docShell);
      const fileToSubmit = selectedFile;
      setIsModalOpen(false);
      reset();

      const jobStore = usePdfScaffoldJobStore.getState();
      jobStore.markPagesOptimisticQueued(targetDocId, mappings);

      void scaffoldJobApi
        .submitJob({
          file: fileToSubmit,
          title,
          targetDocId,
          mode: "new-doc",
          fidelityMode,
          pages: mappings,
        })
        .then((job) => {
          jobStore.upsertJob(job);
          jobStore.watchJob(job.jobId);
        })
        .catch((err) => {
          jobStore.markPagesOptimisticFailed(
            mappings,
            errorMessage(err, "비동기 PDF 스캐폴딩 작업 등록에 실패했습니다.")
          );
        });
    } catch (err) {
      setError(errorMessage(err, "새 문서 생성에 실패했습니다."));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isModalOpen,
    selectedFile,
    docTitle,
    importMode,
    fidelityMode,
    preview,
    isPreviewLoading,
    selectedPageNumbers,
    isLoading,
    currentStep,
    errorMessage: error,
    openModal,
    closeModal,
    handleFileChange,
    setDocTitle,
    setImportMode,
    setFidelityMode,
    togglePreviewPage,
    toggleAllPreviewPages,
    executeImport,
  };
}
