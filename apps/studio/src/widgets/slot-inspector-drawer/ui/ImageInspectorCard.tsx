import React, { useRef } from "react";
import {
  ImageIcon,
  Upload,
  Lock,
  Unlock,
  Trash2,
  Maximize2,
  RotateCcw,
  Link2,
} from "lucide-react";
import type { LayoutBlock, ImageBlockDef, BlockFrameRect } from "@vibe/vdoc-schema";

export interface ImageInspectorCardProps {
  pageId: string;
  block: ImageBlockDef;
  onUpdateBlock: (pageId: string, blockId: string, updater: (prev: LayoutBlock) => LayoutBlock) => void;
  onDeleteBlock?: (pageId: string, blockId: string) => void;
}

export const ImageInspectorCard: React.FC<ImageInspectorCardProps> = ({
  pageId,
  block,
  onUpdateBlock,
  onDeleteBlock,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const frame: BlockFrameRect = block.frame || { x: 0, y: 0, w: 200, h: 60 };
  const width = frame.w ?? 200;
  const height = frame.h ?? 60;
  const isLocked = Boolean(block.locked);
  const fit = block.objectFit ?? block.fit ?? "contain";

  const handleUpdate = (updater: (prev: ImageBlockDef) => ImageBlockDef) => {
    onUpdateBlock(pageId, block.blockId, (prev) => {
      if (prev.kind !== "image") return prev;
      return updater(prev as ImageBlockDef);
    });
  };

  const handleWidthChange = (val: number) => {
    const nextW = Math.max(20, Math.round(val));
    handleUpdate((prev) => {
      const cur = prev.frame || { x: 0, y: 0, w: 200, h: 60 };
      return {
        ...prev,
        frame: { x: cur.x, y: cur.y, w: nextW, h: cur.h, zIndex: cur.zIndex },
      };
    });
  };

  const handleHeightChange = (val: number) => {
    const nextH = Math.max(20, Math.round(val));
    handleUpdate((prev) => {
      const cur = prev.frame || { x: 0, y: 0, w: 200, h: 60 };
      return {
        ...prev,
        frame: { x: cur.x, y: cur.y, w: cur.w, h: nextH, zIndex: cur.zIndex },
      };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      if (result) {
        handleUpdate((prev) => ({
          ...prev,
          src: result,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetSize = () => {
    handleUpdate((prev) => {
      const cur = prev.frame || { x: 0, y: 0, w: 200, h: 60 };
      return {
        ...prev,
        frame: { x: cur.x, y: cur.y, w: 200, h: 60, zIndex: cur.zIndex },
      };
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
          <span>이미지 블록 속성</span>
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleUpdate((prev) => ({ ...prev, locked: !prev.locked }))}
            className={`p-1 rounded text-xs transition cursor-pointer ${
              isLocked ? "bg-amber-100 text-amber-700" : "hover:bg-slate-200 text-slate-500"
            }`}
            title={isLocked ? "잠금 해제" : "위치/크기 잠금"}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          {onDeleteBlock && (
            <button
              type="button"
              onClick={() => onDeleteBlock(pageId, block.blockId)}
              className="p-1 rounded text-xs hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition cursor-pointer"
              title="블록 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview Thumbnail */}
      <div className="relative w-full h-24 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2 group">
        <img
          src={block.src}
          alt={block.alt || "Image preview"}
          className={`max-w-full max-h-full ${fit === "cover" ? "object-cover w-full h-full" : "object-contain"}`}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 bg-white text-slate-800 text-[11px] font-semibold rounded shadow-sm hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
          >
            <Upload className="w-3 h-3" />
            교체
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Dimensions (W / H) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
          <span className="flex items-center gap-1">
            <Maximize2 className="w-3 h-3 text-slate-400" />
            크기 (Width × Height)
          </span>
          <button
            type="button"
            onClick={handleResetSize}
            className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 cursor-pointer"
            title="기본 크기로 복원"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            초기화
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center border border-slate-200 rounded bg-white px-2 py-1">
            <span className="text-[10px] font-bold text-slate-400 mr-1.5">W</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={width}
              disabled={isLocked}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
              className="w-full text-xs font-mono outline-none text-slate-800 bg-transparent disabled:opacity-50"
            />
            <span className="text-[10px] text-slate-400">px</span>
          </div>
          <div className="flex items-center border border-slate-200 rounded bg-white px-2 py-1">
            <span className="text-[10px] font-bold text-slate-400 mr-1.5">H</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={height}
              disabled={isLocked}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
              className="w-full text-xs font-mono outline-none text-slate-800 bg-transparent disabled:opacity-50"
            />
            <span className="text-[10px] text-slate-400">px</span>
          </div>
        </div>
      </div>

      {/* Aspect Ratio / Fit mode */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-600 block">
          맞춤 방식 (Object Fit)
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleUpdate((p) => ({ ...p, objectFit: "contain", fit: "contain" }))}
            className={`py-1 text-center rounded text-[11px] font-medium border cursor-pointer transition ${
              fit === "contain"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50"
            }`}
          >
            비율 유지 (Contain)
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleUpdate((p) => ({ ...p, objectFit: "cover", fit: "cover" }))}
            className={`py-1 text-center rounded text-[11px] font-medium border cursor-pointer transition ${
              fit === "cover"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50"
            }`}
          >
            영역 채우기 (Cover)
          </button>
        </div>
      </div>

      {/* Image Source URL */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
          <Link2 className="w-3 h-3 text-slate-400" />
          이미지 경로 또는 URL
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={block.src}
            disabled={isLocked}
            onChange={(e) => handleUpdate((p) => ({ ...p, src: e.target.value }))}
            placeholder="https://... 또는 /images/..."
            className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded bg-white outline-none focus:border-emerald-500 font-mono text-slate-700 truncate disabled:opacity-50"
          />
          <button
            type="button"
            disabled={isLocked}
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 bg-white border border-slate-200 rounded text-xs hover:bg-slate-100 text-slate-600 shrink-0 cursor-pointer disabled:opacity-50"
            title="로컬 이미지 파일 선택"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
