import React, { useState } from "react";
import { Database, FileDown, FileUp } from "lucide-react";

import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { errorMessage as toMessage } from "@/shared/lib";

import { useExportImportVdoc } from "../model/useExportImportVdoc";

export interface VDocFileActionButtonsProps {
  onActionDone?: () => void;
}

export const VDocFileActionButtons: React.FC<VDocFileActionButtonsProps> = ({ onActionDone }) => {
  const openBackdataForm = useWorkspaceLayoutStore((s) => s.openBackdataForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { exportCurrentVDoc, importVDocFile } = useExportImportVdoc();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importVDocFile(file);
      onActionDone?.();
    } catch (err) {
      setErrorMessage(toMessage(err, "문서를 열지 못했습니다."));
    }
  };

  return (
    <div className="flex flex-col space-y-0.5 text-xs text-slate-200">
      {errorMessage && (
        <div
          role="alert"
          onClick={() => setErrorMessage(null)}
          className="mx-1 my-0.5 px-2 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[11px] cursor-pointer"
        >
          {errorMessage}
        </div>
      )}

      <label className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition">
        <div className="flex items-center gap-2">
          <FileUp className="w-3.5 h-3.5 text-sky-400" />
          <span>.vdoc 열기 (양식 임포트)</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">.vdoc</span>
        <input type="file" accept=".vdoc,.json" onChange={(e) => void handleImportFile(e)} className="hidden" />
      </label>

      <button
        type="button"
        data-testid="file-menu-export-vdoc-btn"
        onClick={() => {
          exportCurrentVDoc();
          onActionDone?.();
        }}
        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition"
      >
        <div className="flex items-center gap-2">
          <FileDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>.vdoc 내보내기 (파일 다운로드)</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">.vdoc</span>
      </button>

      <div className="my-1 border-t border-slate-800" />

      <button
        type="button"
        data-testid="file-menu-import-backdata-btn"
        onClick={() => {
          openBackdataForm();
          onActionDone?.();
        }}
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
