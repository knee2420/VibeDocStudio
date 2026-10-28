import React, { useState } from "react";
import { FileUp, Database, FileDown } from "lucide-react";

import { useSlotSelectionStore } from "@/entities/slot";

import { useExportImportVdoc } from "../model/useExportImportVdoc";

export const VDocFileActionButtons: React.FC = () => {
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

  return (
    <div className="flex items-center gap-2">
      {errorMessage && (
        <span
          onClick={() => setErrorMessage(null)}
          className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] cursor-pointer"
        >
          {errorMessage}
        </span>
      )}
      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition">
        <FileUp className="w-3.5 h-3.5 text-[#248567]" />
        .vdoc 열기 (양식 임포트)
        <input
          type="file"
          accept=".vdoc,.json"
          onChange={importVDocFile}
          className="hidden"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          setRightSidebarOpen(true);
          setShowAddBackdataForm(true);
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-xs font-medium text-indigo-900 cursor-pointer transition"
      >
        <Database className="w-3.5 h-3.5 text-indigo-600" />+ 백데이터 원문
        임포트
      </button>

      <button
        type="button"
        onClick={exportCurrentVDoc}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-semibold shadow-xs cursor-pointer transition"
      >
        <FileDown className="w-3.5 h-3.5" />
        .vdoc 저장
      </button>
    </div>
  );
};

