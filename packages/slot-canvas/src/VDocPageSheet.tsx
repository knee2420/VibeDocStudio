import React, { useEffect, useState } from "react";

import {
  getBlockKind,
  getBlockSlotIds,
  isBlockLocked,
  type BackdataChunk,
  type LayoutBlock,
  type TableCommand,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import { SlotRichTextEditor, type SlotAiAction } from "@vibe/slot-editor";

import { BlockFrame, type DropEdge, type QuickAddKind } from "./BlockFrame";
import { BaseBlockWrapper } from "./base/BaseBlockWrapper";
import { getBlockView, type BlockRenderContext, type SlotBoxOptions, type TableCellLike } from "./block-views";
import type { TableSelectionInfo } from "./InteractiveTable";
import { ACCENT, BLOCK_DRAG_MIME, DROP_LINE, NEW_BLOCK_DRAG_MIME } from "./tokens";

export interface TableSelectionTarget extends TableSelectionInfo {
  pageId: string;
  blockId: string;
  sectionId: string | null;
}

export interface VDocPageSheetProps {
  docTitle?: string;
  totalPages?: number;
  page: VDocPage;
  slots: Record<string, VDocSlot>;
  backdata: Record<string, BackdataChunk>;
  mode: "Editing" | "Viewing";
  selectedBlockId?: string | null;
  selectedSlotId: string | null;
  composerOpenSlotId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectBlock?: (blockId: string) => void;
  onSelectSlot: (slotId: string) => void;
  onToggleComposerForSlot: (slotId: string) => void;
  onOpenBackdataDrawer: (slotId: string) => void;
  onUpdateSlotContent: (slotId: string, html: string) => void;
  onMoveBlock: (pageId: string, blockIndex: number, direction: -1 | 1) => void;
  onDeleteBlock: (pageId: string, blockId: string) => void;
  onMoveBlockTo?: (fromPageId: string, blockId: string, toPageId: string, toIndex: number) => void;
  onInsertBlock?: (pageId: string, kind: QuickAddKind, index: number) => void;
  onDuplicateBlock?: (pageId: string, blockId: string) => void;
  onToggleBlockLock?: (pageId: string, blockId: string) => void;
  /** Framed blocks moved with the ⋮⋮ handle: new frame position in px. */
  onMoveBlockFrame?: (pageId: string, blockId: string, x: number, y: number) => void;
  onResizeBlockFrame?: (pageId: string, blockId: string, dw: number, dh: number) => void;
  onUpdateBlock?: (pageId: string, blockId: string, updater: (prev: LayoutBlock) => LayoutBlock) => void;
  onTableCommand?: (pageId: string, blockId: string, sectionId: string | null, cmd: TableCommand) => void;
  onTableSelectionChange?: (target: TableSelectionTarget | null) => void;
  onSlotAiAction?: (slotId: string, action: SlotAiAction, selectedText: string) => void;
  renderInlineComposer?: (slot: VDocSlot, boundChunks: BackdataChunk[]) => React.ReactNode;
}


const readDragPayload = (e: React.DragEvent) => {
  const moved = e.dataTransfer.getData(BLOCK_DRAG_MIME);
  if (moved) return { kind: "move" as const, ...(JSON.parse(moved) as { pageId: string; blockId: string }) };
  const added = e.dataTransfer.getData(NEW_BLOCK_DRAG_MIME);
  if (added) return { kind: "new" as const, blockKind: added as QuickAddKind };
  return null;
};

/**
 * `.vdoc` A4 page renderer (`@vibe/slot-canvas`): page sheet, header/footer slots and the
 * LayoutBlock kinds, with yesform/PandaDoc editing affordances on blocks and tables.
 */
export const VDocPageSheet: React.FC<VDocPageSheetProps> = ({
  page,
  slots,
  backdata = {},
  mode,
  selectedBlockId,
  selectedSlotId,
  composerOpenSlotId,
  onSelectPage,
  onSelectBlock,
  onSelectSlot,
  onUpdateSlotContent,
  onMoveBlock,
  onDeleteBlock,
  onMoveBlockTo,
  onInsertBlock,
  onDuplicateBlock,
  onToggleBlockLock,
  onMoveBlockFrame,
  onResizeBlockFrame,
  onUpdateBlock,
  onTableCommand,
  onTableSelectionChange,
  onSlotAiAction,
  renderInlineComposer,
}) => {
  const editable = mode === "Editing";
  const layout = page.layout;
  /** Pages with their own typography let slots inherit it instead of the Studio defaults. */
  const inheritsTypography = Boolean(layout);
  const [dropTarget, setDropTarget] = useState<{ blockId: string; edge: DropEdge } | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);

  useEffect(() => {
    const clear = () => {
      setDropTarget(null);
      setDraggingBlockId(null);
    };
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, []);

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    const payload = readDragPayload(e);
    setDropTarget(null);
    if (!payload) return;
    if (payload.kind === "move") onMoveBlockTo?.(payload.pageId, payload.blockId, page.pageId, toIndex);
    else onInsertBlock?.(page.pageId, payload.blockKind, toIndex);
  };

  const blockDragProps = (block: LayoutBlock) => ({
    draggable: editable,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(BLOCK_DRAG_MIME, JSON.stringify({ pageId: page.pageId, blockId: block.blockId }));
      setDraggingBlockId(block.blockId);
    },
    onDragEnd: () => {
      setDraggingBlockId(null);
      setDropTarget(null);
    },
  });

  const renderSlotBox = (slotId: string, opts: SlotBoxOptions = {}) => {
    const { variant = "inline", className = "", darkTheme = false, compact = false, style = {} } = opts;
    const slot = slots[slotId];
    if (!slot) return null;
    const isSelected = selectedSlotId === slotId;
    const isComposerOpen = composerOpenSlotId === slotId;
    const isLocked = !editable || Boolean(slot.constraints?.locked);
    const slotChunks = slot.backDataRefs.map((cid) => backdata[cid]).filter(Boolean);

    const alignClass =
      slot.constraints?.align === "right" ? "text-right" : slot.constraints?.align === "center" ? "text-center" : "";
    const toneClass = slot.constraints?.tone ? `vdoc-slot-${slot.constraints.tone}` : "";

    const slotStyle: React.CSSProperties = {
      fontSize: slot.constraints?.fontSize,
      lineHeight: slot.constraints?.lineHeight,
      fontWeight: slot.constraints?.fontWeight,
      color: slot.constraints?.color,
      letterSpacing: slot.constraints?.letterSpacing,
      textAlign: slot.constraints?.align,
      ...style,
    };

    // Inline slots show a square focus ring hugging the text; cell slots leave focus to the cell.
    const focusClass =
      variant === "inline" && editable && isSelected ? "outline outline-1 outline-offset-[3px]" : "";

    return (
      <div
        key={slotId}
        data-slot-id={slotId}
        data-vdoc-unit={slotId}
        data-unit-kind="slot"
        onClick={(e) => {
          e.stopPropagation();
          onSelectSlot(slotId);
        }}
        className={`relative min-w-0 ${focusClass} ${toneClass} ${alignClass} ${className}`}
        style={focusClass ? { outlineColor: `${ACCENT}80` } : undefined}
      >
        <div
          style={slotStyle}
          className={`min-w-0 break-words ${
            inheritsTypography || slot.constraints?.fontSize || /(^|\s)text-(\[|xs|sm|base|lg|xl|2xl|3xl)/.test(className)
              ? ""
              : compact
                ? "text-[12.5px] leading-snug"
                : "text-sm"
          } ${darkTheme ? "text-white" : inheritsTypography ? "" : "text-slate-900"}`}
        >
          {slot.constraints?.tone === "brand-logo" || Boolean(slot.content && slot.content.includes("<img")) ? (
            <div className="py-1 select-none flex items-center justify-center w-full" dangerouslySetInnerHTML={{ __html: slot.content }} />
          ) : (
            <SlotRichTextEditor
              slotId={slotId}
              content={slot.content}
              readOnly={isLocked}
              placeholder={slot.constraints?.placeholder}
              onSelectSlot={onSelectSlot}
              onChangeContent={onUpdateSlotContent}
              onAiAction={onSlotAiAction}
            />
          )}
        </div>

        {isComposerOpen && editable && renderInlineComposer && (
          <div onClick={(e) => e.stopPropagation()} className="relative z-30 pt-2 pb-2 min-w-[480px] max-w-[680px] text-left">
            {renderInlineComposer(slot, slotChunks)}
          </div>
        )}
      </div>
    );
  };

  const cellSlot = (cell: TableCellLike, hAlignClass: string) =>
    renderSlotBox(cell.slotId, {
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

  /** 블록 뷰에 넘기는 공통 연결 — 뷰는 이것만 보고 몸통을 그린다 (`block-views`). */
  const renderContext = (block: LayoutBlock): BlockRenderContext => ({
    page,
    slots,
    editable,
    selectedBlockId: selectedBlockId ?? null,
    selectedSlotId,
    renderSlot: renderSlotBox,
    renderSummary,
    tableBindings: (sectionId) => ({
      editable,
      selectedSlotId,
      onSelectSlot,
      onCommand: (cmd) => onTableCommand?.(page.pageId, block.blockId, sectionId, cmd),
      onDeleteTable: () => onDeleteBlock(page.pageId, block.blockId),
      onSelectionChange: (info) =>
        onTableSelectionChange?.(info ? { ...info, pageId: page.pageId, blockId: block.blockId, sectionId } : null),
      gripDragProps: block.frame ? undefined : blockDragProps(block),
      renderCell: (cell, { hAlignClass }) => cellSlot(cell, hAlignClass),
    }),
    updateBlock: (updater) => onUpdateBlock?.(page.pageId, block.blockId, updater),
    unitAttrs: (unitId, kind) => ({ "data-vdoc-unit": unitId, "data-unit-kind": kind }),
  });

  const renderBlockBody = (block: LayoutBlock) => {
    const { View } = getBlockView(block.kind);
    return <View block={block} ctx={renderContext(block)} />;
  };

  function renderSummary(
    summary: {
      align?: "left" | "center" | "right";
      width?: string;
      items: Extract<LayoutBlock, { kind: "summary-list" }>["items"];
    },
    spacing: string
  ) {
    return (
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
  }

  const contentPadding = layout?.margin ? "" : page.hideHeaderFooter ? "px-14 pt-12 pb-12" : "px-10 py-6";
  const contentStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: layout?.blockGap ?? (page.hideHeaderFooter ? 20 : 24),
    ...(layout?.margin
      ? {
          paddingTop: layout.margin.top,
          paddingRight: layout.margin.right,
          paddingBottom: layout.margin.bottom,
          paddingLeft: layout.margin.left,
        }
      : {}),
  };
  const sheetStyle: React.CSSProperties = {
    fontFamily: layout?.fontFamily,
    fontSize: layout?.fontSize,
    color: layout?.color,
    lineHeight: layout?.lineHeight,
    ...(layout?.exactText ? { fontKerning: "none", fontVariantLigatures: "none" } : {}),
  };
  const flowIndexes = page.blocks.map((b, i) => (b.frame ? -1 : i)).filter((i) => i >= 0);

  // 포커스된 활성 블록 계산 (직접 선택된 블록 우선, 슬롯 편집 중인 경우 해당 슬롯 소유 블록)
  const activeBlockId = React.useMemo(() => {
    if (selectedBlockId) return selectedBlockId;
    if (selectedSlotId) {
      const owner = page.blocks.find((b) => getBlockSlotIds(b).includes(selectedSlotId));
      if (owner) return owner.blockId;
    }
    return null;
  }, [selectedBlockId, selectedSlotId, page.blocks]);

  const renderFramedOrFlowBlock = (block: LayoutBlock, bIdx: number) => {
    const model = getBlockKind(block.kind);
    const frame = block.frame;
    return (
      <BaseBlockWrapper
        block={block}
        editable={editable}
        selected={selectedBlockId === block.blockId}
        resizable={Boolean(model.layout?.resizable) || Boolean(frame)}
        hasOwnGrip={Boolean(model.layout?.ownGrip) && !frame}
        locked={isBlockLocked(block, slots)}
        onSelectBlock={onSelectBlock}
        dropEdge={!frame && dropTarget?.blockId === block.blockId ? dropTarget.edge : null}
        dragHandleProps={blockDragProps(block)}
        canMoveUp={bIdx > 0}
        canMoveDown={bIdx < page.blocks.length - 1}
        onDragOverEdge={(edge) => {
          if (frame) return;
          if (dropTarget?.blockId !== block.blockId || dropTarget.edge !== edge) setDropTarget({ blockId: block.blockId, edge });
        }}
        onDropEdge={(e, edge) => !frame && handleDrop(e, edge === "before" ? bIdx : bIdx + 1)}
        onQuickAdd={(kind) => onInsertBlock?.(page.pageId, kind, bIdx + 1)}
        onMoveUp={() => onMoveBlock(page.pageId, bIdx, -1)}
        onMoveDown={() => onMoveBlock(page.pageId, bIdx, 1)}
        onDuplicate={() => onDuplicateBlock?.(page.pageId, block.blockId)}
        onToggleLock={() => onToggleBlockLock?.(page.pageId, block.blockId)}
        onDelete={() => onDeleteBlock(page.pageId, block.blockId)}
        onFreeMove={frame ? (dx, dy) => onMoveBlockFrame?.(page.pageId, block.blockId, frame.x + dx, frame.y + dy) : undefined}
        onResizeFrame={(dw, dh) => onResizeBlockFrame?.(page.pageId, block.blockId, dw, dh)}
      >
        {renderBlockBody(block)}
      </BaseBlockWrapper>
    );
  };

  return (
    <section id={`vdoc-page-${page.pageId}`} onClick={() => onSelectPage(page.pageId)} className="w-[794px] min-w-[794px] mx-auto">
      {/* A4 sheet: 794 × 1123 px at 96 dpi. The ring does not take layout space, so frames map 1:1. */}
      <div
        className="relative bg-white rounded-xs shadow-[0_4px_28px_rgba(15,23,42,0.08),0_1px_4px_rgba(15,23,42,0.04)] ring-1 ring-slate-900/5 w-[794px] min-w-[794px] max-w-[794px] min-h-[1123px] mx-auto flex flex-col justify-between"
        style={sheetStyle}
        data-exact-layout={layout?.exactText ? "" : undefined}
      >
        {!page.hideHeaderFooter && (
          <div className="group/hf px-10 pt-6 pb-3 border-b border-transparent hover:border-dashed hover:border-slate-200">
            {renderSlotBox(page.headerSlotId, { className: "text-xs text-slate-500" })}
          </div>
        )}

        <div
          className={`${contentPadding} flex-1`}
          style={contentStyle}
          onDragOver={(e) => {
            if (!editable) return;
            e.preventDefault();
            // Below the last flowing block: drop at the end of the page.
            const lastIdx = flowIndexes[flowIndexes.length - 1];
            const last = lastIdx !== undefined ? page.blocks[lastIdx] : undefined;
            if (last && dropTarget?.blockId !== last.blockId) setDropTarget({ blockId: last.blockId, edge: "after" });
          }}
          onDrop={(e) => {
            if (!editable) return;
            e.preventDefault();
            handleDrop(e, page.blocks.length);
          }}
        >
          {page.blocks.length === 0 && editable && (
            <div className="h-24 rounded border border-dashed flex items-center justify-center text-xs text-slate-400" style={{ borderColor: DROP_LINE }}>
              블록을 여기에 끌어다 놓으세요
            </div>
          )}
          {flowIndexes.map((bIdx) => {
            const block = page.blocks[bIdx];
            const isCurrentBlockActive = editable && activeBlockId === block.blockId;
            return (
              <div
                key={block.blockId}
                className={`transition-all duration-200 ease-out ${
                  isCurrentBlockActive ? "my-4 relative z-20" : "my-0"
                } ${draggingBlockId === block.blockId ? "opacity-40" : "opacity-100"}`}
              >
                {renderFramedOrFlowBlock(block, bIdx)}
              </div>
            );
          })}
        </div>

        {/* Fixed-position blocks, placed by their frame in sheet coordinates. */}
        {page.blocks.map((block, bIdx) => {
          if (!block.frame) return null;
          const isCurrentBlockActive = editable && activeBlockId === block.blockId;
          return (
            <div
              key={block.blockId}
              data-block-id={block.blockId}
              className={`absolute transition-opacity duration-200 ease-out ${
                isCurrentBlockActive ? "z-20" : "z-10"
              }`}
              style={{ left: block.frame.x, top: block.frame.y, width: block.frame.w, height: block.frame.h }}
            >
              {renderFramedOrFlowBlock(block, bIdx)}
            </div>
          );
        })}

        {!page.hideHeaderFooter && (
          <div className="px-10 py-3 border-t border-transparent hover:border-dashed hover:border-slate-200">
            {renderSlotBox(page.footerSlotId, { className: "text-xs text-slate-500" })}
          </div>
        )}
      </div>

      {/* Page gap; the PDF page break falls here. */}
      <div className="h-6" />
    </section>
  );
};
