import React from "react";
import { GripVertical } from "lucide-react";

import { blockIcon, NEW_BLOCK_DRAG_MIME } from "@vibe/slot-canvas";
import { listInsertableBlocks } from "@vibe/vdoc-schema";

import { useMutateCanvasBlocks, type InsertableBlockKind } from "../model/useMutateCanvasBlocks";

export interface BlockInsertionPaletteProps {
  targetPageId: string;
  className?: string;
  showHeader?: boolean;
}

/** 블록 정의에 `insertable` 이 있는 종류 (레지스트리 순서 — 새 블록은 정의만 등록하면 여기 나온다). */
const ITEMS = listInsertableBlocks().map((item) => {
  const Icon = blockIcon(item.icon);
  return { kind: item.kind as InsertableBlockKind, label: item.label, desc: item.description, icon: <Icon className="w-4 h-4 text-emerald-600" /> };
});

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
