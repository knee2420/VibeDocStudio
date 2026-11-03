import { useState } from "react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { httpClient } from "@/shared/api";
import type { VDocDocument } from "@vibe/vdoc-schema";

export type FidelityMode = "fast" | "balanced" | "strict";

export interface ScaffoldDocumentResponse {
  docId: string;
  title: string;
  totalPages: number;
  checkedBlocks: number;
  checkedSlots: number;
  document: VDocDocument;
  fidelityMode?: string;
  agentRun?: Record<string, unknown>;
}

export interface IngestPdfResponse {
  catalogId: string;
  title: string;
  checkedTables: number;
  checkedSlots: number;
  document: VDocDocument;
}

export type ImportMode = "canvas" | "catalog";

export function useImportPdfForm() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("canvas");
  const [fidelityMode, setFidelityMode] = useState<FidelityMode>("balanced");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addDocument = useStudioDocumentStore((s) => s.addDocument);

  const openModal = () => {
    useSlotSelectionStore.getState().setSelectedBlockId(null);
    useSlotSelectionStore.getState().setSelectedSlotId(null);
    setIsModalOpen(true);
    setErrorMessage(null);
  };

  const closeModal = () => {
    if (isLoading) return;
    setIsModalOpen(false);
    setSelectedFile(null);
    setDocTitle("");
    setErrorMessage(null);
    setCurrentStep(1);
  };

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    setErrorMessage(null);
    if (file && !docTitle) {
      const cleanName = file.name.replace(/\.pdf$/i, "");
      setDocTitle(cleanName);
    }
  };

  const executeImport = async () => {
    if (!selectedFile) {
      setErrorMessage("PDF 파일을 먼저 선택해 주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setCurrentStep(1);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const titleToUse = docTitle.trim() || selectedFile.name.replace(/\.pdf$/i, "");
      formData.append("title", titleToUse);

      if (importMode === "canvas") {
        formData.append("fidelity_mode", fidelityMode);
        setCurrentStep(2);
        const res = await httpClient.post<ScaffoldDocumentResponse>(
          "/api/catalog/scaffold",
          formData
        );

        setCurrentStep(3);
        if (res && res.document) {
          await addDocument(res.document);
        }
      } else {
        formData.append("category", "PDF 임포트 양식");
        setCurrentStep(2);
        const res = await httpClient.post<IngestPdfResponse>(
          "/api/catalog/ingest-pdf",
          formData
        );

        setCurrentStep(3);
        if (res && res.document) {
          await addDocument(res.document);
        }
      }

      // 완료 후 모달 닫기
      setIsModalOpen(false);
      setSelectedFile(null);
      setDocTitle("");
      setCurrentStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PDF 양식 가져오기에 실패했습니다.";
      setErrorMessage(msg);
      setCurrentStep(1);
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
    isLoading,
    currentStep,
    errorMessage,
    openModal,
    closeModal,
    handleFileChange,
    setDocTitle,
    setImportMode,
    setFidelityMode,
    executeImport,
  };
}
