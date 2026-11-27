import React, { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { resolveImageBlockRenderStyle } from "@vibe/style-core";
import type { ImageBlockDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../mediaSrc";
import { useVDocStyle } from "../styleContext";

export { resolveImageBlockRenderStyle, type ImageBlockRenderStyle } from "@vibe/style-core";

export interface ImageBlockViewProps {
  block: ImageBlockDef;
}

/**
 * ImageBlockView: 이미지 블록 몸통 (`@vibe/style-core` Media Grid Kit 소비).
 */
export const ImageBlockView: React.FC<ImageBlockViewProps> = ({ block }) => {
  const docStyle = useVDocStyle();
  const { media, imgStyle, wrapperPaddingY } = resolveImageBlockRenderStyle(
    block,
    docStyle?.resolvedPack ?? null
  );

  const justifyClass =
    block.align === "right" ? "justify-end" : block.align === "center" ? "justify-center" : "justify-start";
  const src = resolveMediaSrc(block.src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const isFullWidth = block.width === "100%";
  const label = block.alt || block.title || "이미지 슬롯";

  return (
    <div className="relative w-full h-full">
      <div
        className={`flex ${block.frame ? "h-full" : isFullWidth ? "" : "py-2"} ${justifyClass} w-full`}
        style={
          !block.frame && isFullWidth
            ? { paddingTop: wrapperPaddingY ?? "2px", paddingBottom: wrapperPaddingY ?? "2px" }
            : undefined
        }
      >
        {src && !failed ? (
          <img
            src={src}
            alt={label}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="block select-none max-w-full"
            style={imgStyle}
          />
        ) : (
          <div
            style={{
              width: block.width || "100%",
              height: block.frame?.h ? "100%" : undefined,
              borderRadius: media?.radius ?? "6px",
            }}
            className="min-h-[140px] w-full border border-dashed border-slate-300 bg-slate-50/90 px-4 py-6 flex flex-col items-center justify-center gap-1.5 text-slate-400 select-none"
          >
            <ImageIcon className="w-6 h-6 text-slate-300" />
            <span className="text-xs font-medium text-slate-600">[img] {label}</span>
            <span className="text-[11px] text-slate-400">
              {failed ? "이미지를 불러오지 못했습니다 · 상단 툴바에서 URL 교체 가능" : "상단 툴바의 이미지 교체 · URL 에서 지정할 수 있습니다"}
            </span>
          </div>
        )}
      </div>
      {block.caption && (
        <div
          className="pt-1 pb-1"
          style={{
            textAlign: media?.captionAlign ?? "center",
            color: media?.captionColor ?? "#94a3b8",
            fontSize: media?.captionFontSize ?? "12px",
          }}
        >
          {block.caption}
        </div>
      )}
    </div>
  );
};
