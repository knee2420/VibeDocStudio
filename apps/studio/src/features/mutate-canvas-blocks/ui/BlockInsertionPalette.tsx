import React from "react";
import { Columns2, Table as TableIcon, FileText, UserCheck, GripVertical } from "lucide-react";

import { NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";

import { useMutateCanvasBlocks, type InsertableBlockKind } from "../model/useMutateCanvasBlocks";

export interface BlockInsertionPaletteProps {
  targetPageId: string;
  className?: string;
  showHeader?: boolean;
}

const ITEMS: { kind: InsertableBlockKind; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    kind: "section-block",
    label: "텍스트 섹션",
    desc: "제목 + 본문 단락",
    icon: <FileText className="w-4 h-4 text-emerald-600" />,
  },
  {
    kind: "structured-table",
    label: "구조화 표",
    desc: "행/열 데이터 테이블",
    icon: <TableIcon className="w-4 h-4 text-emerald-600" />,
  },
  {
    kind: "columns-grid",
    label: "2단 그리드",
    desc: "좌우 분할 2단 슬롯",
    icon: <Columns2 className="w-4 h-4 text-emerald-600" />,
  },
  {
    kind: "fillable-group",
    label: "할당형 필드",
    desc: "담당자 및 실행과제",
    icon: <UserCheck className="w-4 h-4 text-emerald-600" />,
  },
];

/** Block palette: drag an item onto the page (drop line shows where), or click to append. */
export const BlockInsertionPalette: React.FC<BlockInsertionPaletteProps> = ({
  targetPageId,
  className = "",
  showHeader = true,
}) => {
  const { addBlockToPage } = useMutateCanvasBlocks();

  return (
    <div className={`space-y-2 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-0.5">
          <span>블록 팔레트</span>
          <span className="text-[10px] text-slate-400 font-normal">끌어다 놓거나 클릭</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
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
            title="클릭하면 현재 페이지 끝에 추가, 캔버스로 끌면 원하는 위치에 삽입"
            className="group flex flex-col items-start gap-1 p-2.5 rounded-xl bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-500 text-left transition-all cursor-grab active:cursor-grabbing shadow-2xs hover:shadow-xs"
          >
            <div className="flex items-center justify-between w-full">
              <span className="p-1 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-white transition-colors">
                {item.icon}
              </span>
              <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-900 mt-1">
              {item.label}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-emerald-700 line-clamp-1">
              {item.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
