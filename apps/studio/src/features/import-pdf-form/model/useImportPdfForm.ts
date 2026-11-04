import { useState } from "react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { errorMessage } from "@/shared/lib";

import { importPdfApi, type FidelityMode } from "../api/importPdfApi";

export type { FidelityMode } from "../api/importPdfApi";
export type ImportMode = "canvas" | "catalog";

const stripPdfExtension = (name: string) => name.replace(/\.pdf$/i, "");

/** PDF 가져오기 모달의 상태와 실행. 결과 문서는 서버에 저장되는 새 작업 문서가 된다. */
export function useImportPdfForm() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("canvas");
  const [fidelityMode, setFidelityMode] = useState<FidelityMode>("balanced");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);

  const addDocument = useStudioDocumentStore((s) => s.addDocument);

  const reset = () => {
    setSelectedFile(null);
    setDocTitle("");
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
    setSelectedFile(file);
    setError(null);
    if (file && !docTitle) setDocTitle(stripPdfExtension(file.name));
  };

  const executeImport = async () => {
    if (!selectedFile) {
      setError("PDF 파일을 먼저 선택해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const title = docTitle.trim() || stripPdfExtension(selectedFile.name);
      setCurrentStep(2);
      const { document } =
        importMode === "canvas"
          ? await importPdfApi.scaffoldCanvas(selectedFile, title, fidelityMode)
          : await importPdfApi.ingestCatalog(selectedFile, title);
      setCurrentStep(3);
      await addDocument(document);
      setIsModalOpen(false);
      reset();
    } catch (err) {
      setError(errorMessage(err, "PDF 양식 가져오기에 실패했습니다."));
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
    errorMessage: error,
    openModal,
    closeModal,
    handleFileChange,
    setDocTitle,
    setImportMode,
    setFidelityMode,
    executeImport,
  };
}
