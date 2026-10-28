import React from "react";

import type { BackdataChunk } from "@vibe/vdoc-schema";

export interface BackdataChunkCardProps {
  chunk: BackdataChunk;
}

export const BackdataChunkCard: React.FC<BackdataChunkCardProps> = ({
  chunk,
}) => {
  return (
    <div className="p-3 rounded-xl bg-indigo-50/40 border border-indigo-200/80 space-y-1.5 select-text">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-indigo-950 truncate">
          📄 {chunk.sourceTitle}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold uppercase">
          {chunk.sourceType}
        </span>
      </div>
      <p className="text-xs text-slate-700 leading-relaxed">{chunk.excerpt}</p>
      <div className="flex flex-wrap items-center gap-1 pt-1">
        {chunk.tags.map((t) => (
          <span
            key={t}
            className="px-1.5 py-0.2 rounded bg-white border border-indigo-100 text-[10px] text-indigo-600"
          >
            #{t}
          </span>
        ))}
      </div>
    </div>
  );
};

