import React from "react";

import {
  getBlockKind,
  isBlockLocked,
  slotPlainText,
  type LayoutBlock,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { getBlockView, type BlockRenderContext, type SlotBoxOptions, type SummaryLike, type TableCellLike } from "./block-views";
import { useVDocStyle } from "./styleContext";

const NOOP = () => undefined;

const EMPTY_PREVIEW_PAGE: VDocPage = {
  pageId: "__preview_page__",
  pageNumber: 1,
  pageLabel: "미리보기",
  headerSlotId: "",
  footerSlotId: "",
  hideHeaderFooter: true,
  blocks: [],
};

export interface StaticBlocksPreviewProps {
  readonly blocks: readonly LayoutBlock[];
  readonly slots: Readonly<Record<string, VDocSlot>>;
  /** 선택적 페이지 메타 (레이아웃/타이포 상속) */
  readonly page?: VDocPage;
  readonly className?: string;
}

/**
 * 읽기 전용 2D 블록 목록 프리뷰 (`@vibe/slot-canvas`).
 * - `VDocPageSheet` 의 페이지 크롬(고정 폭 · 그림자 · 여백) 없이, 현재 지면의 `VDocStyleProvider` 와
 *   실제 블록 뷰(`getBlockView`)를 그대로 사용해 1:1 모양으로 그린다.
 * - 에셋 제안 Unified Diff의 `+ 제안` 영역이나 인라인 변경안 비교에 사용한다.
 */
export const StaticBlocksPreview: React.FC<StaticBlocksPreviewProps> = ({
  blocks,
  slots,
  page = EMPTY_PREVIEW_PAGE,
  className = "",
}) => {
  const docStyle = useVDocStyle();
  const inheritsTypography = Boolean(page.layout || docStyle);

  const renderSlotBox = (slotId: string, opts: SlotBoxOptions = {}): React.ReactNode => {
    const { className: slotCls = "", darkTheme = false, compact = false, style = {} } = opts;
    const slot = slots[slotId];
    if (!slot) return null;

    const alignClass =
      slot.constraints?.align === "right" ? "text-right" : slot.constraints?.align === "center" ? "text-center" : "";
    const toneClass = slot.constraints?.tone ? `vdoc-slot-${slot.constraints.tone}` : "";
    const plain = slotPlainText(slot.content).trim();
    const hasImg = Boolean(slot.content && slot.content.includes("<img"));
    const isEmpty = !plain && !hasImg;

    const slotStyle: React.CSSProperties = {
      fontSize: slot.constraints?.fontSize,
      lineHeight: slot.constraints?.lineHeight,
      fontWeight: slot.constraints?.fontWeight,
      color: slot.constraints?.color,
      letterSpacing: slot.constraints?.letterSpacing,
      textAlign: slot.constraints?.align,
      ...style,
    };

    const placeholderText = slot.constraints?.placeholder || slot.label || "빈 자리";

    return (
      <div
        key={slotId}
        className={`relative min-w-0 ${toneClass} ${alignClass} ${slotCls}`}
      >
        <div
          style={slotStyle}
          className={`min-w-0 break-words ${
            inheritsTypography || slot.constraints?.fontSize || /(^|\s)text-(\[|xs|sm|base|lg|xl|2xl|3xl)/.test(slotCls)
              ? ""
              : compact
                ? "text-[12.5px] leading-snug"
                : "text-sm"
          } ${darkTheme ? "text-white" : inheritsTypography ? "" : "text-slate-900"}`}
        >
          {isEmpty ? (
            <span className="inline-block rounded border border-dashed border-emerald-400/70 bg-emerald-50/70 px-1.5 py-0.5 text-[11px] italic text-emerald-700/80">
              {placeholderText}
            </span>
          ) : (
            <div
              className="prose-sm max-w-none [&_p]:my-0"
              dangerouslySetInnerHTML={{ __html: slot.content }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderSummary = (summary: SummaryLike, spacing: string): React.ReactNode => (
    <div
      className={`flex flex-col ${
        summary.align === "left" ? "items-start" : summary.align === "center" ? "items-center" : "items-end"
      } w-full ${spacing} pr-1`}
    >
      <div style={{ width: summary.width || "320px" }} className="space-y-1.5">
        {summary.items.map((item) => (
          <div
            key={item.itemId}
            style={{
              borderTop: item.borderTop,
              paddingTop: item.borderTop ? "8px" : "2px",
              paddingBottom: "2px",
              color: item.textColor || (item.isTotal ? "#0f172a" : "#475569"),
              fontSize: item.fontSize || (item.isTotal ? "14.5px" : "13px"),
              fontWeight: item.fontWeight || (item.isTotal ? "700" : "500"),
            }}
            className="flex items-center justify-between"
          >
            {item.labelSlotId ? renderSlotBox(item.labelSlotId, { className: "text-left" }) : <span>{item.label}</span>}
            {item.valueSlotId ? (
              renderSlotBox(item.valueSlotId, { className: "text-right" })
            ) : (
              <span className={item.isTotal ? "font-bold text-slate-900" : "font-medium"}>{item.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderNestedBlocks = (nestedBlocks: readonly LayoutBlock[]): React.ReactNode => (
    <div className="flex w-full flex-col gap-2 text-left">
      {nestedBlocks.map((nested) => {
        const { View } = getBlockView(nested.kind);
        return (
          <div key={nested.blockId} className="min-w-0 w-full">
            <View block={nested} ctx={buildContext(nested)} />
          </div>
        );
      })}
    </div>
  );

  const cellSlot = (cell: TableCellLike, hAlignClass: string): React.ReactNode => {
    if (cell.blocks && cell.blocks.length > 0) {
      return (
        <div
          className={`w-full ${hAlignClass}`}
          style={{
            fontSize: cell.fontSize,
            lineHeight: cell.lineHeight,
            color: cell.color,
            fontWeight: cell.fontWeight,
            fontFamily: cell.fontFamily,
          }}
        >
          {renderNestedBlocks(cell.blocks)}
        </div>
      );
    }
    return renderSlotBox(cell.slotId, {
      variant: "cell",
      className: hAlignClass,
      compact: Boolean(cell.compact || cell.padding),
      style: {
        fontSize: cell.fontSize,
        lineHeight: cell.lineHeight,
        color: cell.color,
        fontWeight: cell.fontWeight,
        fontFamily: cell.fontFamily,
        textAlign: cell.hAlign as React.CSSProperties["textAlign"],
      },
    });
  };

  const buildContext = (_block: LayoutBlock): BlockRenderContext => ({
    page,
    slots: slots as Record<string, VDocSlot>,
    editable: false,
    selectedBlockId: null,
    selectedSlotId: null,
    renderSlot: renderSlotBox,
    renderNestedBlocks,
    renderSummary,
    tableBindings: () => ({
      editable: false,
      selectedSlotId: null,
      blockSelected: false,
      onSelectBlock: NOOP,
      onSelectSlot: NOOP,
      onCommand: NOOP,
      onDeleteTable: NOOP,
      onSelectionChange: NOOP,
      renderCell: (cell, { hAlignClass }) => cellSlot(cell, hAlignClass),
    }),
    updateBlock: NOOP,
    unitAttrs: (unitId, kind) => ({ "data-vdoc-unit": `preview:${unitId}`, "data-unit-kind": kind }),
  });

  return (
    <div className={`flex flex-col gap-3 pointer-events-none select-none ${className}`}>
      {blocks.map((block) => {
        // Ensure registered block kind fallback works identically to VDocPageSheet
        void getBlockKind(block.kind);
        void isBlockLocked(block, slots as Record<string, VDocSlot>);
        const { View } = getBlockView(block.kind);
        return (
          <div key={block.blockId} className="min-w-0 w-full">
            <View block={block} ctx={buildContext(block)} />
          </div>
        );
      })}
    </div>
  );
};
