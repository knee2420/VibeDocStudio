import React, { useState } from "react";
import { FileUp, Database, FileDown } from "lucide-react";

import { useSlotSelectionStore } from "@/entities/slot";

import { useExportImportVdoc } from "../model/useExportImportVdoc";

export interface VDocFileActionButtonsProps {
  onActionDone?: () => void;
}

export const VDocFileActionButtons: React.FC<VDocFileActionButtonsProps> = ({
  onActionDone,
}) => {
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );
  const setShowAddBackdataForm = useSlotSelectionStore(
    (s) => s.setShowAddBackdataForm
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { exportCurrentVDoc, importVDocFile } = useExportImportVdoc({
    onImportError: (msg) => setErrorMessage(msg),
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    importVDocFile(e);
    onActionDone?.();
  };

  const handleOpenBackdata = () => {
    setRightSidebarOpen(true);
    setShowAddBackdataForm(true);
    onActionDone?.();
  };

  const handleExport = () => {
    exportCurrentVDoc();
    onActionDone?.();
  };

  return (
    <div className="flex flex-col space-y-0.5 text-xs text-slate-200">
      {errorMessage && (
        <div
          onClick={() => setErrorMessage(null)}
          className="mx-1 my-0.5 px-2 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[11px] cursor-pointer"
        >
          {errorMessage}
        </div>
      )}

      {/* 1. .vdoc 열기 (양식 임포트) */}
      <label className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition">
        <div className="flex items-center gap-2">
          <FileUp className="w-3.5 h-3.5 text-sky-400" />
          <span>.vdoc 열기 (양식 임포트)</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">.vdoc</span>
        <input
          type="file"
          accept=".vdoc,.json"
          onChange={handleImportFile}
          className="hidden"
        />
      </label>

      {/* 2. .vdoc 저장 (문서 내보내기) */}
      <button
        type="button"
        data-testid="file-menu-export-vdoc-btn"
        onClick={handleExport}
        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition"
      >
        <div className="flex items-center gap-2">
          <FileDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>.vdoc 저장</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">Ctrl+S</span>
      </button>

      <div className="my-1 border-t border-slate-800" />

      {/* 3. 백데이터 원문 임포트 */}
      <button
        type="button"
        data-testid="file-menu-import-backdata-btn"
        onClick={handleOpenBackdata}
        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition"
      >
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>백데이터 원문 임포트</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">+서랍</span>
      </button>
    </div>
  );
};

