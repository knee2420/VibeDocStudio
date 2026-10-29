import React from "react";
import { FileUp } from "lucide-react";

import { useImportPdfForm } from "../model/useImportPdfForm";
import { ImportPdfModal } from "./ImportPdfModal";

export const ImportPdfButton: React.FC = () => {
  const {
    isModalOpen,
    openModal,
    closeModal,
    selectedFile,
    setSelectedFile,
    docTitle,
    setDocTitle,
    importMode,
    setImportMode,
    isLoading,
    currentStep,
    errorMessage,
    executeImport,
  } = useImportPdfForm();

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-xs font-medium text-emerald-900 cursor-pointer transition shadow-2xs"
      >
        <FileUp className="w-3.5 h-3.5 text-emerald-700" />
        PDF 양식 불러오기
      </button>

      <ImportPdfModal
        isOpen={isModalOpen}
        onClose={closeModal}
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
        docTitle={docTitle}
        onTitleChange={setDocTitle}
        importMode={importMode}
        onModeChange={setImportMode}
        isLoading={isLoading}
        currentStep={currentStep}
        errorMessage={errorMessage}
        onSubmit={executeImport}
      />
    </>
  );
};

