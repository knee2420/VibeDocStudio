import React from "react";

import type { ColumnsGridBlockDef, LayoutBlock, VDocPage } from "@vibe/vdoc-schema";

import type { SectionAssetItem } from "@/entities/asset-library";

interface SectionAssetPreviewProps {
  section: SectionAssetItem;
  pageLayout?: VDocPage["layout"];
  defaultScale?: number;
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #f8fafc 0% 50%)",
  backgroundSize: "10px 10px",
};

const renderWireframeBlock = (block: LayoutBlock, key: string, compact: boolean): React.ReactNode => {
  switch (block.kind) {
    case "heading":
    case "form-title":
      return (
        <div key={key} className="space-y-1">
          <div className={`${compact ? "h-1.5" : "h-2"} w-3/5 rounded-xs bg-slate-600/80`} />
        </div>
      );

    case "image":
      return (
        <div
          key={key}
          style={CHECKERBOARD_STYLE}
          className={`w-full ${compact ? "h-6" : "h-12"} rounded border border-slate-200/80`}
        />
      );

    case "columns-grid": {
      const grid = block as ColumnsGridBlockDef;
      const cols = grid.columns && grid.columns.length > 0
        ? grid.columns
        : grid.widths.map(() => ({ slotId: "col" }));
      const colCount = Math.max(1, Math.min(4, cols.length));
      return (
        <div
          key={key}
          className="grid gap-1 w-full"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {cols.slice(0, 4).map((col, idx) =>
            "image" in col && col.image ? (
              <div
                key={idx}
                style={CHECKERBOARD_STYLE}
                className={`${compact ? "h-5" : "h-9"} rounded-xs border border-slate-200/80`}
              />
            ) : (
              <div
                key={idx}
                className="rounded-xs border border-slate-200/70 bg-slate-50/70 p-1 space-y-1"
              >
                <div className="h-1 w-3/4 rounded-xs bg-slate-400/70" />
                <div className="h-1 w-full rounded-xs bg-slate-200" />
              </div>
            ),
          )}
        </div>
      );
    }

    case "callout-box":
      return (
        <div
          key={key}
          className="w-full rounded border border-slate-200/90 bg-slate-50/80 p-1.5 space-y-1"
        >
          <div className="h-1.5 w-1/3 rounded-xs bg-slate-500/75" />
          <div className="h-1 w-4/5 rounded-xs bg-slate-200" />
          <div className="h-1 w-2/3 rounded-xs bg-slate-200" />
        </div>
      );

    case "structured-table":
    case "table":
      return (
        <div key={key} className="w-full grid grid-cols-3 gap-0.5 rounded border border-slate-200/80 p-0.5 bg-slate-50">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-[1px] ${idx < 3 ? "bg-slate-300/80" : "bg-slate-200/70"}`}
            />
          ))}
        </div>
      );

    case "hero":
      return (
        <div
          key={key}
          style={CHECKERBOARD_STYLE}
          className={`w-full ${compact ? "h-8" : "h-14"} rounded border border-slate-200/80 p-1.5 flex flex-col justify-end gap-1`}
        >
          <div className="h-2 w-1/2 rounded-xs bg-slate-700/80" />
          <div className="h-1 w-1/3 rounded-xs bg-slate-500/60" />
        </div>
      );

    case "section-block":
      return (
        <div key={key} className="w-full rounded border border-slate-200/80 p-1.5 space-y-1 bg-white">
          <div className="h-1.5 w-1/2 rounded-xs bg-slate-600/75" />
          <div className="h-1 w-full rounded-xs bg-slate-200" />
          <div className="h-1 w-5/6 rounded-xs bg-slate-200" />
        </div>
      );

    case "divider":
      return <div key={key} className="w-full h-px bg-slate-300 my-0.5" />;

    default:
      return (
        <div key={key} className="space-y-1">
          <div className="h-1.5 w-full rounded-xs bg-slate-200" />
          <div className="h-1.5 w-5/6 rounded-xs bg-slate-200" />
        </div>
      );
  }
};

/**
 * 캡처된 섹션 에셋의 블록 구조(제목·텍스트·이미지 그리드·콜아웃·표)를
 * 피그마 스타일의 재사용 서식 와이어프레임으로 미리보기 렌더링한다.
 */
export const SectionAssetPreview: React.FC<SectionAssetPreviewProps> = ({
  section,
  defaultScale = 0.15,
}) => {
  const compact = defaultScale < 0.2;
  const blocks = section.blocks.map((b) => b.block);

  return (
    <div
      className={`w-full h-full ${
        compact ? "p-1.5" : "p-3"
      } bg-[#f5f5f5] flex items-start justify-center overflow-hidden select-none pointer-events-none`}
    >
      <div
        className={`w-full h-full bg-white rounded border border-slate-200/80 shadow-2xs ${
          compact ? "p-1.5 space-y-1.5" : "p-2.5 space-y-2"
        } overflow-hidden flex flex-col`}
      >
        {blocks.slice(0, compact ? 5 : 8).map((block, idx) =>
          renderWireframeBlock(block, `${block.blockId}_${idx}`, compact),
        )}
      </div>
    </div>
  );
};
