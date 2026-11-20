import React from "react";
import { ExternalLink, Image as ImageIcon, LayoutGrid, Table2 } from "lucide-react";

import type { RefBlock, RefFrame } from "../core/types";

export interface SemanticCanvasSurfaceProps {
  readonly frame: RefFrame;
  readonly blocks: readonly RefBlock[];
  readonly selectedBlockId: string | null;
  readonly onSelectBlock?: (block: RefBlock) => void;
}

/**
 * Renders a `semantic-canvas` frame for sources without raster tiles
 * (e.g. static HTML web articles, layout-only web captures, Markdown, or `.vdoc` references).
 * Each block is positioned at its exact normalized `0..1000` bbox so visual grounding &
 * region pinning operate identically to PDF and image frames.
 */
export const SemanticCanvasSurface: React.FC<SemanticCanvasSurfaceProps> = ({
  frame,
  blocks,
  selectedBlockId,
  onSelectBlock,
}) => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#fcfcfd] text-slate-800 select-text">
      {/* Subtle page header strip */}
      <div className="pointer-events-none absolute top-2 right-4 left-4 flex items-center justify-between text-[10px] font-code text-slate-400">
        <span className="truncate">{frame.title || frame.label || `Frame ${frame.index}`}</span>
        <span>
          Semantic Canvas · {blocks.length} blocks
        </span>
      </div>

      {blocks.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-[12px] text-slate-400">
          이 프레임에 추출된 구조 블록이 없습니다.
        </div>
      ) : (
        blocks.map((block) => {
          const bbox = block.bbox ?? [40, 48, 120, 952];
          const topPct = bbox[0] / 10;
          const leftPct = bbox[1] / 10;
          const heightPct = Math.max(1.4, (bbox[2] - bbox[0]) / 10);
          const widthPct = Math.max(5, (bbox[3] - bbox[1]) / 10);
          const isSelected = selectedBlockId === block.id;
          const align = String(block.style?.align ?? "left");
          const alignClass =
            align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

          return (
            <div
              key={block.id}
              onClick={() => onSelectBlock?.(block)}
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
              className={`absolute overflow-hidden rounded-[4px] px-2 py-1 transition-colors ${alignClass} ${
                isSelected ? "bg-amber-50/70" : "hover:bg-slate-100/70"
              }`}
            >
              {block.kind === "heading" && (
                <div
                  className={`truncate font-bold text-slate-900 ${
                    (block.level ?? 2) <= 1 ? "text-[16px]" : "text-[13.5px]"
                  }`}
                >
                  {block.text || "(제목 없음)"}
                </div>
              )}

              {block.kind === "divider" && (
                <div className="flex h-full items-center">
                  <hr className="w-full border-slate-300" />
                </div>
              )}

              {block.kind === "media" && (
                <div className="flex h-full w-full items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-slate-100/80 px-3 text-[11px] text-slate-500">
                  {block.media?.src?.[0] ? (
                    <img
                      src={block.media.src[0]}
                      alt={block.text || "media"}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                      onError={(ev) => {
                        (ev.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">
                        {block.text || `이미지 (${block.media?.role ?? "photo"})`}
                      </span>
                    </>
                  )}
                </div>
              )}

              {block.kind === "media-group" && (
                <div className="flex h-full w-full items-center justify-center gap-2 rounded border border-dashed border-indigo-300 bg-indigo-50/50 px-3 text-[11px] text-indigo-700">
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    사진 묶음 ({block.media?.count ?? 2}장
                    {block.media?.widths?.length ? ` · ${block.media.widths.join(":")}` : ""})
                  </span>
                </div>
              )}

              {block.kind === "link-card" && (
                <div className="flex h-full items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 text-[11px] shadow-2xs">
                  <span className="truncate font-medium text-slate-700">
                    {block.text || block.media?.url || "링크 카드"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-code text-[10px] text-blue-600">
                    <ExternalLink className="h-3 w-3" />
                    {block.media?.domain || "link"}
                  </span>
                </div>
              )}

              {block.kind === "table" && (
                <div className="flex h-full flex-col justify-center rounded border border-emerald-200 bg-emerald-50/40 px-2.5 py-1 text-[11px] text-slate-700">
                  <div className="mb-0.5 flex items-center gap-1 font-code text-[10px] font-semibold text-emerald-700">
                    <Table2 className="h-3 w-3" />
                    <span>TABLE</span>
                  </div>
                  <div className="line-clamp-3 leading-snug">{block.text}</div>
                </div>
              )}

              {block.kind === "callout" && (
                <div className="h-full rounded border-l-3 border-amber-500 bg-amber-50/70 px-2.5 py-1 text-[11.5px] leading-snug text-slate-700">
                  {block.text}
                </div>
              )}

              {(block.kind === "text" || block.kind === "list" || block.kind === "ui-region") && (
                <div className="line-clamp-4 whitespace-pre-line text-[11.5px] leading-relaxed text-slate-700">
                  {block.text}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
