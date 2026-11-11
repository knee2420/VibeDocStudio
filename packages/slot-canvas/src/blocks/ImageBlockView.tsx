import type React from "react";
import { ImageIcon } from "lucide-react";

import type { ImageBlockDef } from "@vibe/vdoc-schema";

export interface ImageBlockViewProps {
  block: ImageBlockDef;
}

/**
 * ImageBlockView: 이미지 블록 몸통 (정렬 · 크기 · 맞춤만 그린다).
 * 교체 · URL · 정렬 같은 조작은 블록 정의의 `controls` 로 위쪽 툴바 "블록 도구" 에 나온다 — 블록마다 따로 툴바를 띄우지 않는다.
 */
export const ImageBlockView: React.FC<ImageBlockViewProps> = ({ block }) => {
  const justifyClass = block.align === "right" ? "justify-end" : block.align === "center" ? "justify-center" : "justify-start";
  return (
    <div className="relative w-full h-full">
      <div className={`flex ${block.frame ? "h-full" : "py-2"} ${justifyClass} w-full`}>
        {block.src ? (
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
        ) : (
          <div
            style={{ width: block.width || "100%", height: block.frame?.h ? "100%" : undefined }}
            className="min-h-[112px] w-full rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 flex flex-col items-center justify-center gap-1.5 text-slate-400 select-none"
          >
            <ImageIcon className="w-6 h-6 text-slate-300" />
            <span className="text-xs font-medium text-slate-500">이미지를 추가하세요</span>
            <span className="text-[11px] text-slate-400">상단 툴바의 이미지 교체 · URL 에서 지정할 수 있습니다</span>
          </div>
        )}
      </div>
    </div>
  );
};
