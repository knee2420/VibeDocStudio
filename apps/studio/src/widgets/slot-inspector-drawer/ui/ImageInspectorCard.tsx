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

  // 피그마 디자인 패널처럼 이미지 · 레이아웃 · 채우기 구역으로 나눈다. 동작(잠금 · 삭제 · 교체 · 크기 · 맞춤 · 경로)은 그대로.
  return (
    <>
      <div className="fig-dsec" data-testid="image-inspector-section">
        <div className="fig-dsec-head !h-10">
          <span className="flex items-center gap-1.5 text-[13px]">
            <ImageIcon className="w-3.5 h-3.5 text-black/50" />
            이미지
          </span>
          <div className="fig-dsec-actions">
            <button
              type="button"
              aria-pressed={isLocked}
              onClick={() => handleUpdate((prev) => ({ ...prev, locked: !prev.locked }))}
              className="fig-icon-btn"
              title={isLocked ? "잠금 해제" : "위치/크기 잠금"}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            {onDeleteBlock && (
              <button
                type="button"
                onClick={() => onDeleteBlock(pageId, block.blockId)}
                className="fig-icon-btn fig-danger"
                title="블록 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="relative w-full h-28 rounded-[5px] bg-[#f5f5f5] overflow-hidden flex items-center justify-center group">
          <img
            src={block.src}
            alt={block.alt || "Image preview"}
            className={`max-w-full max-h-full ${fit === "cover" ? "object-cover w-full h-full" : "object-contain"}`}
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="fig-btn">
              <Upload className="w-3 h-3" />
              교체
            </button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
      </div>

      <div className="fig-dsec">
        <div className="fig-dsec-head">
          <span>레이아웃</span>
          <div className="fig-dsec-actions">
            <button type="button" onClick={handleResetSize} className="fig-icon-btn" title="기본 크기(200 × 60)로 초기화">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <span className="fig-dlabel !mt-0 flex items-center gap-1">
          <Maximize2 className="w-3 h-3" />
          크기
        </span>
        <div className="grid grid-cols-2 gap-2">
          <label className="fig-input">
            <span className="fig-input-prefix">W</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={width}
              disabled={isLocked}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
            />
          </label>
          <label className="fig-input">
            <span className="fig-input-prefix">H</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={height}
              disabled={isLocked}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="fig-dsec">
        <div className="fig-dsec-head">
          <span>채우기</span>
        </div>
        <span className="fig-dlabel !mt-0">맞춤 방식</span>
        <div className="fig-seg">
          <button
            type="button"
            disabled={isLocked}
            aria-pressed={fit === "contain"}
            onClick={() => handleUpdate((p) => ({ ...p, objectFit: "contain", fit: "contain" }))}
          >
            비율 유지 (Contain)
          </button>
          <button
            type="button"
            disabled={isLocked}
            aria-pressed={fit === "cover"}
            onClick={() => handleUpdate((p) => ({ ...p, objectFit: "cover", fit: "cover" }))}
          >
            영역 채우기 (Cover)
          </button>
        </div>

        <span className="fig-dlabel flex items-center gap-1">
          <Link2 className="w-3 h-3" />
          이미지 경로 또는 URL
        </span>
        <div className="flex gap-1">
          <label className="fig-input flex-1">
            <input
              type="text"
              value={block.src}
              disabled={isLocked}
              onChange={(e) => handleUpdate((p) => ({ ...p, src: e.target.value }))}
              placeholder="https://... 또는 /images/..."
              className="fig-mono truncate"
            />
          </label>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => fileInputRef.current?.click()}
            className="fig-icon-btn !w-6 !h-6 border border-[var(--fig-border)]"
            title="로컬 이미지 파일 선택"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};
