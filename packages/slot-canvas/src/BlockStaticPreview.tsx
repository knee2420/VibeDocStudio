import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { LayoutBlock, VDocPage, VDocSlot } from "@vibe/vdoc-schema";

import { getBlockView, type BlockRenderContext, type SlotBoxOptions, type TableBindings } from "./block-views";

export interface PreviewBlockSnapshot {
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
}

export interface BlockStaticPreviewProps {
  blocks: readonly PreviewBlockSnapshot[];
  /** 블록을 그리는 실제 폭 (A4 본문 폭 기준). 이 폭으로 그린 뒤 상자에 맞게 줄인다. */
  contentWidth?: number;
  /** `width`: 상자 폭에 맞추고 높이는 내용만큼 · `contain`: 상자 안에 통째로 들어가게 (타일 썸네일). */
  fit?: "width" | "contain";
  /** 상자 높이 (`contain` 일 때). */
  height?: number;
  className?: string;
}

const NOOP = () => {};

/**
 * 블록 묶음의 읽기 전용 미리보기 — 캔버스와 같은 블록 뷰로 그리고 슬롯은 정적인 HTML 로 보여 준다
 * (편집기 · 선택 · 끌기 없음). 에셋 썸네일 · 세부 정보 미리보기에 쓴다.
 *
 * 캔버스의 `data-slot-id` · `data-block-id` 는 붙이지 않는다 — 호버 강조 · 레이어 숨김 CSS 가
 * 그 속성으로 대상을 찾기 때문에, 원본 내용을 그대로 담은 미리보기가 캔버스와 함께 칠해지면 안 된다.
 */
export const BlockStaticPreview: React.FC<BlockStaticPreviewProps> = ({
  blocks,
  contentWidth = 714,
  fit = "width",
  height,
  className = "",
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [innerHeight, setInnerHeight] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const w = box.clientWidth;
      const h = inner.scrollHeight;
      setInnerHeight(h);
      const byWidth = w / contentWidth;
      setScale(fit === "contain" && height ? Math.min(byWidth, height / Math.max(h, 1)) : byWidth);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    ro?.observe(inner);
    return () => ro?.disconnect();
  }, [contentWidth, fit, height, blocks]);

  const slots = useMemo(() => Object.assign({}, ...blocks.map((b) => b.slots)) as Record<string, VDocSlot>, [blocks]);
  const page = useMemo<VDocPage>(
    () => ({
      pageId: "asset-preview",
      pageNumber: 1,
      pageLabel: "미리보기",
      headerSlotId: "",
      footerSlotId: "",
      blocks: blocks.map((b) => b.block),
      hideHeaderFooter: true,
    }),
    [blocks]
  );

  const renderSlot = (slotId: string, opts: SlotBoxOptions = {}) => {
    const slot = slots[slotId];
    if (!slot) return null;
    const c = slot.constraints;
    return (
      <div
        className={`min-w-0 break-words prose-sm max-w-none ${opts.compact ? "text-[12.5px] leading-snug" : c?.fontSize ? "" : "text-sm"} ${
          opts.darkTheme ? "text-white" : "text-slate-900"
        } ${c?.align === "center" ? "text-center" : c?.align === "right" ? "text-right" : ""} ${opts.className ?? ""}`}
        style={{
          fontSize: c?.fontSize,
          lineHeight: c?.lineHeight,
          fontWeight: c?.fontWeight,
          color: c?.color,
          ...opts.style,
        }}
        dangerouslySetInnerHTML={{ __html: slot.content || "" }}
      />
    );
  };

  const ctxFor = (block: LayoutBlock): BlockRenderContext => {
    const bindings: TableBindings = {
      editable: false,
      selectedSlotId: null,
      blockSelected: false,
      onSelectSlot: NOOP,
      onCommand: NOOP,
      onDeleteTable: NOOP,
      onSelectionChange: NOOP,
      renderCell: (cell, { hAlignClass }) =>
        renderSlot(cell.slotId, {
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
        }),
    };
    return {
      page,
      slots,
      editable: false,
      selectedBlockId: null,
      selectedSlotId: null,
      renderSlot,
      renderSummary: (summary, spacing) => (
        <div className={`flex flex-col items-end w-full ${spacing}`}>
          <div style={{ width: summary.width || "320px" }} className="space-y-1.5 text-[13px] text-slate-600">
            {summary.items.map((item) => (
              <div key={item.itemId} className="flex items-center justify-between">
                {item.labelSlotId ? renderSlot(item.labelSlotId) : <span>{item.label}</span>}
                {item.valueSlotId ? renderSlot(item.valueSlotId) : <span>{item.value}</span>}
              </div>
            ))}
          </div>
        </div>
      ),
      tableBindings: () => bindings,
      updateBlock: NOOP,
      unitAttrs: (unitId, kind) => ({ "data-vdoc-unit": `preview:${unitId}`, "data-unit-kind": kind }),
    };
  };

  const scaledHeight = innerHeight * scale;
  return (
    <div
      ref={boxRef}
      aria-hidden
      className={`relative w-full overflow-hidden pointer-events-none select-none ${className}`}
      style={{ height: fit === "contain" && height ? height : scaledHeight || undefined }}
    >
      <div
        ref={innerRef}
        className="absolute left-0 top-0 flex flex-col gap-5 bg-white"
        style={{
          width: contentWidth,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: "top left",
          left: fit === "contain" && height ? Math.max(0, ((boxRef.current?.clientWidth ?? 0) - contentWidth * scale) / 2) : 0,
          top: fit === "contain" && height ? Math.max(0, (height - scaledHeight) / 2) : 0,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {blocks.map(({ block }) => {
          const { View } = getBlockView(block.kind);
          return (
            <div key={block.blockId} className="min-w-0">
              <View block={block} ctx={ctxFor(block)} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
