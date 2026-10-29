import React, { useRef } from "react";
import { AlignCenter, AlignLeft, AlignRight, RefreshCw, Upload } from "lucide-react";
import type { ImageBlockDef } from "@vibe/vdoc-schema";

export interface ImageBlockViewProps {
  block: ImageBlockDef;
  editable: boolean;
  selected: boolean;
  onUpdateBlock?: (updater: (prev: ImageBlockDef) => ImageBlockDef) => void;
}

/**
 * ImageBlockView: PandaDoc-style interactive Image Block component.
 * Supports aspect ratio scaling, image replacement via file input or URL prompt,
 * alignment toggles, and floating action toolbar when selected.
 */
export const ImageBlockView: React.FC<ImageBlockViewProps> = ({
  block,
  editable,
  selected,
  onUpdateBlock,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdateBlock?.((prev) => ({
      ...prev,
      src: url,
      alt: file.name,
    }));
  };

  const handlePromptUrl = () => {
    const current = block.src.startsWith("blob:") ? "" : block.src;
    const nextUrl = window.prompt("이미지 URL을 입력하세요:", current);
    if (nextUrl && nextUrl.trim()) {
      onUpdateBlock?.((prev) => ({ ...prev, src: nextUrl.trim() }));
    }
  };

  const setAlign = (align: "left" | "center" | "right") => {
    onUpdateBlock?.((prev) => ({ ...prev, align }));
  };

  const resetSize = () => {
    onUpdateBlock?.((prev) => ({
      ...prev,
      width: undefined,
      height: undefined,
      frame: prev.frame ? { ...prev.frame, w: 320, h: undefined } : undefined,
    }));
  };

  const justifyClass =
    block.align === "right"
      ? "justify-end"
      : block.align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <div className="relative group w-full">
      {/* Hidden file input for replacement */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Floating mini toolbar when selected in editing mode */}
      {editable && selected && (
        <div
          data-keep-selection
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 text-white shadow-xl text-xs font-medium animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          <button
            type="button"
            title="이미지 파일 교체"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>교체</span>
          </button>
          <button
            type="button"
            title="이미지 URL 직접 입력"
            onClick={handlePromptUrl}
            className="px-1.5 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            URL
          </button>
          <span className="w-px h-3 bg-slate-700 mx-0.5" />
          <button
            type="button"
            title="좌측 정렬"
            onClick={() => setAlign("left")}
            className={`p-1 rounded hover:bg-slate-800 ${
              block.align === "left" || !block.align ? "text-emerald-400" : "text-slate-400"
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="가운데 정렬"
            onClick={() => setAlign("center")}
            className={`p-1 rounded hover:bg-slate-800 ${
              block.align === "center" ? "text-emerald-400" : "text-slate-400"
            }`}
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="우측 정렬"
            onClick={() => setAlign("right")}
            className={`p-1 rounded hover:bg-slate-800 ${
              block.align === "right" ? "text-emerald-400" : "text-slate-400"
            }`}
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <span className="w-px h-3 bg-slate-700 mx-0.5" />
          <button
            type="button"
            title="원래 크기로 초기화"
            onClick={resetSize}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Image Element */}
      <div className={`flex ${block.frame ? "" : "py-2"} ${justifyClass} w-full`}>
        <img
          src={block.src}
          alt={block.alt || block.title || "Image"}
          draggable={false}
          className="select-none max-w-full"
          style={{
            width: block.width || "auto",
            height: block.height || "auto",
            maxHeight: block.maxHeight,
            objectFit: block.objectFit || "contain",
          }}
        />
      </div>
    </div>
  );
};

