import React from "react";
import {
  Columns2,
  Table as TableIcon,
  FileText,
  UserCheck,
} from "lucide-react";

import { useMutateCanvasBlocks } from "../model/useMutateCanvasBlocks";

export interface BlockInsertionPaletteProps {
  targetPageId: string;
}

export const BlockInsertionPalette: React.FC<BlockInsertionPaletteProps> = ({
  targetPageId,
}) => {
  const { addBlockToPage } = useMutateCanvasBlocks();

  return (
    <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-1.5">
      <div className="text-[11px] font-bold text-slate-700 mb-1">
        + 현재 페이지에 레이아웃 블록 추가
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => addBlockToPage(targetPageId, "columns-grid")}
          className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
        >
          <Columns2 className="w-3.5 h-3.5 text-[#248567]" />
          2단 그리드
        </button>
        <button
          type="button"
          onClick={() => addBlockToPage(targetPageId, "structured-table")}
          className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
        >
          <TableIcon className="w-3.5 h-3.5 text-[#248567]" />
          정밀 표(Table)
        </button>
        <button
          type="button"
          onClick={() => addBlockToPage(targetPageId, "section-block")}
          className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-[#248567]" />
          문서 섹션
        </button>
        <button
          type="button"
          onClick={() => addBlockToPage(targetPageId, "fillable-group")}
          className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#248567]" />
          할당형 슬롯
        </button>
      </div>
    </div>
  );
};

