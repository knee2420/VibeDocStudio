import React from "react";
import { FileUp } from "lucide-react";

import { useImportPdfForm } from "../model/useImportPdfForm";
import { ImportPdfModal } from "./ImportPdfModal";

export interface ImportPdfButtonProps {
  onActionDone?: () => void;
}

export const ImportPdfButton: React.FC<ImportPdfButtonProps> = ({ onActionDone }) => {
  const {
    isModalOpen,
    openModal,
    closeModal,
    selectedFile,
    handleFileChange,
    docTitle,
    setDocTitle,
    importMode,
    setImportMode,
    fidelityMode,
    setFidelityMode,
    preview,
    isPreviewLoading,
    selectedPageNumbers,
    togglePreviewPage,
    toggleAllPreviewPages,
    isLoading,
    currentStep,
    errorMessage,
    executeImport,
  } = useImportPdfForm();

  const handleOpen = () => {
    openModal();
    onActionDone?.();
  };

  return (
    <>
      <button
        type="button"
        data-testid="file-menu-import-pdf-btn"
        onClick={handleOpen}
        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition text-xs"
      >
        <div className="flex items-center gap-2">
          <FileUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>PDF 양식 불러오기</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">.pdf</span>
      </button>

      <ImportPdfModal
        isOpen={isModalOpen}
        onClose={closeModal}
        selectedFile={selectedFile}
        onFileSelect={handleFileChange}
        docTitle={docTitle}
        onTitleChange={setDocTitle}
        importMode={importMode}
        onModeChange={setImportMode}
        fidelityMode={fidelityMode}
        onFidelityModeChange={setFidelityMode}
        preview={preview}
        isPreviewLoading={isPreviewLoading}
        selectedPageNumbers={selectedPageNumbers}
        onTogglePreviewPage={togglePreviewPage}
        onToggleAllPreviewPages={toggleAllPreviewPages}
        isLoading={isLoading}
        currentStep={currentStep}
        errorMessage={errorMessage}
        onSubmit={executeImport}
      />
    </>
  );
};
