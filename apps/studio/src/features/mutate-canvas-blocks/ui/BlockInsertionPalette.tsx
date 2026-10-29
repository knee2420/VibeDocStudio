import React from "react";
import { Columns2, Table as TableIcon, FileText, UserCheck, GripVertical } from "lucide-react";

import { NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";

import { useMutateCanvasBlocks, type InsertableBlockKind } from "../model/useMutateCanvasBlocks";

export interface BlockInsertionPaletteProps {
  targetPageId: string;
}

const ITEMS: { kind: InsertableBlockKind; label: string; icon: React.ReactNode }[] = [
  { kind: "section-block", label: "텍스트 섹션", icon: <FileText className="w-3.5 h-3.5 text-[#248567]" /> },
  { kind: "structured-table", label: "표", icon: <TableIcon className="w-3.5 h-3.5 text-[#248567]" /> },
  { kind: "columns-grid", label: "2단 그리드", icon: <Columns2 className="w-3.5 h-3.5 text-[#248567]" /> },
  { kind: "fillable-group", label: "할당형 필드", icon: <UserCheck className="w-3.5 h-3.5 text-[#248567]" /> },
];

/** Block palette: drag an item onto the page (drop line shows where), or click to append. */
export const BlockInsertionPalette: React.FC<BlockInsertionPaletteProps> = ({ targetPageId }) => {
  const { addBlockToPage } = useMutateCanvasBlocks();

  return (
    <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-1.5">
      <div className="text-[11px] font-bold text-slate-700 mb-1">블록 추가 · 페이지로 끌어다 놓기</div>
      <div className="grid grid-cols-2 gap-1.5">
        {ITEMS.map((item) => (
          <button
            key={item.kind}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(NEW_BLOCK_DRAG_MIME, item.kind);
            }}
            onClick={() => addBlockToPage(targetPageId, item.kind)}
            title="클릭하면 페이지 끝에 추가, 끌면 원하는 위치에 추가"
            className="group flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
