import React from "react";
import { FileText } from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { getPageThumbnailUrl } from "../lib/previewAssets";

export interface PageThumbnailProps {
  doc: VDocDocument | undefined;
  pageNumber: number;
  /** `cover` 는 썸네일 타일, `contain` 은 큰 미리보기. */
  fit?: "cover" | "contain";
  className?: string;
}

/** 페이지 캡처. 캡처가 없는 문서는 페이지 번호 자리표시를 그린다. */
export const PageThumbnail: React.FC<PageThumbnailProps> = ({ doc, pageNumber, fit = "cover", className = "" }) => {
  const url = getPageThumbnailUrl(doc, pageNumber);
  if (!url) {
    return (
      <div
        data-testid="page-thumbnail-placeholder"
        className={`w-full h-full flex flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-300 ${className}`}
      >
        <FileText className="w-1/3 max-w-8 h-auto" />
        <span className="text-[8px] font-mono text-slate-400">{pageNumber}p</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Page ${pageNumber}`}
      loading="lazy"
      className={`w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"} select-none pointer-events-none ${className}`}
    />
  );
};
