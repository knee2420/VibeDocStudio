import React from "react";
import { FileText } from "lucide-react";

import type { BackdataChunk } from "@vibe/vdoc-schema";

export interface BackdataChunkCardProps {
  chunk: BackdataChunk;
}

/** 연결된 백데이터 한 조각 (피그마 목록 행 모양): 출처 · 종류 · 발췌 · 태그. */
export const BackdataChunkCard: React.FC<BackdataChunkCardProps> = ({ chunk }) => {
  return (
    <div className="fig-list-row select-text !cursor-auto">
      <FileText className="w-3.5 h-3.5 mt-px shrink-0 text-black/50" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{chunk.sourceTitle}</span>
          <span className="fig-badge uppercase !ml-auto">{chunk.sourceType}</span>
        </div>
        <p className="mt-0.5 text-black/60 leading-4">{chunk.excerpt}</p>
        {chunk.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {chunk.tags.map((t) => (
              <span key={t} className="text-[10px] text-[#0d99ff]">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
