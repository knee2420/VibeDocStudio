import type React from "react";

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
    <div className="relative w-full">
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
