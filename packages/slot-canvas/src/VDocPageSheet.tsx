import React, { useEffect, useState } from "react";

import {
  isBlockLocked,
  type BackdataChunk,
  type LayoutBlock,
  type TableCommand,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import { SlotRichTextEditor, type SlotAiAction } from "@vibe/slot-editor";

import { BlockFrame, type DropEdge, type QuickAddKind } from "./BlockFrame";
import { InteractiveTable, type TableSelectionInfo } from "./InteractiveTable";
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
  selectedSlotId: string | null;
  composerOpenSlotId: string | null;
  onSelectPage: (pageId: string) => void;
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
  onTableCommand?: (pageId: string, blockId: string, sectionId: string | null, cmd: TableCommand) => void;
  onTableSelectionChange?: (target: TableSelectionTarget | null) => void;
  onSlotAiAction?: (slotId: string, action: SlotAiAction, selectedText: string) => void;
  renderInlineComposer?: (slot: VDocSlot, boundChunks: BackdataChunk[]) => React.ReactNode;
}

interface SlotBoxOptions {
  /** `cell`: fills a table cell edge to edge, the cell draws focus. `inline`: free-standing slot. */
  variant?: "cell" | "inline";
  className?: string;
  darkTheme?: boolean;
  /** Dense table cells keep the original 12.5px / snug leading. */
  compact?: boolean;
  style?: React.CSSProperties;
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
  selectedSlotId,
  composerOpenSlotId,
  onSelectPage,
  onSelectSlot,
  onUpdateSlotContent,
  onMoveBlock,
  onDeleteBlock,
  onMoveBlockTo,
  onInsertBlock,
  onDuplicateBlock,
  onToggleBlockLock,
  onMoveBlockFrame,
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
    const isLocked = !editable || Boolean(slot.constraints?.locked) || slot.role === "boilerplate";
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
          {slot.constraints?.tone === "brand-logo" ? (
            <div className="py-1 select-none flex items-center" dangerouslySetInnerHTML={{ __html: slot.content }} />
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

  const cellSlot = (
    cell: { slotId: string; compact?: boolean; padding?: string; fontSize?: string; lineHeight?: string; color?: string; fontWeight?: string; hAlign?: string },
    hAlignClass: string
  ) =>
    renderSlotBox(cell.slotId, {
      variant: "cell",
      className: hAlignClass,
      compact: Boolean(cell.compact || cell.padding),
      style: {
        fontSize: cell.fontSize,
        lineHeight: cell.lineHeight,
        color: cell.color,
        fontWeight: cell.fontWeight,
        textAlign: cell.hAlign as React.CSSProperties["textAlign"],
      },
    });

  const tableSelectionHandler = (blockId: string, sectionId: string | null) => (info: TableSelectionInfo | null) =>
    onTableSelectionChange?.(info ? { ...info, pageId: page.pageId, blockId, sectionId } : null);

  const renderBlockBody = (block: LayoutBlock) => {
    switch (block.kind) {
      case "heading":
      case "form-title": {
        const alignClass = block.align === "left" ? "text-left" : block.align === "right" ? "text-right" : "text-center";
        return (
          <div
            className={`flex flex-col pt-1 pb-3 ${
              block.align === "left" ? "items-start" : block.align === "right" ? "items-end" : "items-center"
            }`}
          >
            <div
              className="font-bold text-slate-950 w-full"
              style={{ letterSpacing: block.letterSpacing || (block.kind === "form-title" ? "0.35em" : undefined) }}
            >
              {renderSlotBox(block.slotId, {
                className: `${alignClass} ${block.kind === "form-title" ? "text-[24px]" : "text-[20px]"} font-bold`,
              })}
            </div>
            {(block.underline || block.underlineWidth) && (
              <div
                style={{
                  width: block.underline?.width || block.underlineWidth || "286px",
                  height: block.underline?.thickness || block.underlineThickness || "2px",
                  backgroundColor: block.underline?.color || "#0f172a",
                  marginTop: block.underline?.marginTop || "4px",
                }}
              />
            )}
          </div>
        );
      }

      case "image":
        return (
          <div className={`flex ${block.frame ? "" : "py-2"} ${block.align === "right" ? "justify-end" : block.align === "center" ? "justify-center" : "justify-start"}`}>
            <img
              src={block.src}
              alt={block.alt || block.title || "Image"}
              draggable={false}
              style={{
                width: block.width || "auto",
                height: block.height || "auto",
                maxHeight: block.maxHeight,
                objectFit: block.objectFit || "contain",
              }}
            />
          </div>
        );

      case "composite-form-frame":
        return (
          <div className="bg-white border-slate-950" style={{ borderWidth: block.outerBorderWidth || "2px", borderStyle: "solid" }}>
            {block.sections.map((sec, sIdx) => {
              const isLastSec = sIdx === block.sections.length - 1;
              return (
                <div
                  key={sec.sectionId}
                  style={{
                    borderBottom: isLastSec ? undefined : sec.bottomBorderThick ? "2px solid #020617" : "1px solid #1e293b",
                  }}
                >
                  <InteractiveTable
                    table={sec}
                    borderRules={{
                      outer: "none",
                      rowBottom: "1px solid #1e293b",
                      vertical: "1px solid #1e293b",
                      ...sec.borderRules,
                    }}
                    headerStyle={{ bg: "rgba(241,245,249,0.9)", fontWeight: "600", ...sec.headerStyle }}
                    roundedOuter={false}
                    editable={editable}
                    selectedSlotId={selectedSlotId}
                    onSelectSlot={onSelectSlot}
                    onCommand={(cmd) => onTableCommand?.(page.pageId, block.blockId, sec.sectionId, cmd)}
                    onDeleteTable={() => onDeleteBlock(page.pageId, block.blockId)}
                    onSelectionChange={tableSelectionHandler(block.blockId, sec.sectionId)}
                    gripDragProps={block.frame ? undefined : blockDragProps(block)}
                    renderCell={(cell, { hAlignClass }) => cellSlot(cell, hAlignClass)}
                  />
                </div>
              );
            })}
          </div>
        );

      case "cover-banner":
        return (
          <div className="rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-8 min-h-[540px] flex flex-col justify-between shadow-inner">
            <div className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">PandaDoc Kolas Cover Container · WYSIWYM</div>
            <div className="my-auto py-8">{renderSlotBox(block.headlineSlotId, { className: "text-3xl font-bold", darkTheme: true })}</div>
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/15">
              {renderSlotBox(block.preparedBySlotId, { className: "bg-white/5 rounded-lg p-2", darkTheme: true })}
              {renderSlotBox(block.preparedForSlotId, { className: "bg-white/5 rounded-lg p-2", darkTheme: true })}
            </div>
          </div>
        );

      case "section-block":
        return (
          <div className="space-y-3">
            {renderSlotBox(block.headingSlotId)}
            {renderSlotBox(block.bodySlotId)}
          </div>
        );

      case "columns-grid": {
        const cardClass =
          block.cardStyle === "plain" ? "min-w-0 bg-transparent p-0" : "min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5";
        return (
          <div
            className={`grid ${block.cardStyle === "plain" ? "gap-6" : "gap-4"} items-start w-full`}
            style={{ gridTemplateColumns: block.widths.map((w) => (w.endsWith("fr") ? `minmax(0, ${w})` : w)).join(" ") }}
          >
            {block.columns
              ? block.columns.map((col, cIdx) => (
                  <div key={cIdx} className={cardClass}>
                    {col.image ? (
                      <div className={`flex py-1 ${col.image.align === "right" ? "justify-end" : col.image.align === "center" ? "justify-center" : "justify-start"}`}>
                        <img
                          src={col.image.src}
                          alt={col.image.alt || "Image"}
                          draggable={false}
                          style={{
                            width: col.image.width || "auto",
                            height: col.image.height || "auto",
                            maxHeight: col.image.maxHeight || "90px",
                            objectFit: col.image.objectFit || "contain",
                          }}
                        />
                      </div>
                    ) : col.slotId ? (
                      renderSlotBox(col.slotId)
                    ) : null}
                  </div>
                ))
              : block.slotIds?.map((sid) => (
                  <div key={sid} className={cardClass}>
                    {renderSlotBox(sid)}
                  </div>
                ))}
          </div>
        );
      }

      case "structured-table":
      case "table":
        return (
          <InteractiveTable
            table={block}
            borderRules={block.borderRules}
            headerStyle={block.headerStyle}
            cellPadding={block.cellPadding}
            editable={editable}
            selectedSlotId={selectedSlotId}
            onSelectSlot={onSelectSlot}
            onCommand={(cmd) => onTableCommand?.(page.pageId, block.blockId, null, cmd)}
            onDeleteTable={() => onDeleteBlock(page.pageId, block.blockId)}
            onSelectionChange={tableSelectionHandler(block.blockId, null)}
            gripDragProps={block.frame ? undefined : blockDragProps(block)}
            renderCell={(cell, { hAlignClass }) => cellSlot(cell, hAlignClass)}
            footer={block.footerSummary && renderSummary(block.footerSummary, "mt-3")}
          />
        );

      case "summary-list":
        return renderSummary(block, "my-2");

      case "text":
        return renderSlotBox(block.slotId, {
          className: block.align === "right" ? "text-right" : block.align === "center" ? "text-center" : "",
        });

      case "fillable-group":
        return (
          <div className="rounded-lg border-2 border-dashed border-amber-400/80 bg-amber-50/30 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-amber-900">📌 {block.title}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold border border-amber-300">
                👤 담당: {block.assigneeName}
              </span>
            </div>
            {renderSlotBox(block.slotId)}
          </div>
        );
    }
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

  const renderFramedOrFlowBlock = (block: LayoutBlock, bIdx: number) => {
    const isTable = block.kind === "structured-table" || block.kind === "table" || block.kind === "composite-form-frame";
    const frame = block.frame;
    return (
      <BlockFrame
        editable={editable}
        hasOwnGrip={isTable && !frame}
        locked={isBlockLocked(block, slots)}
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
      >
        {renderBlockBody(block)}
      </BlockFrame>
    );
  };

  return (
    <section id={`vdoc-page-${page.pageId}`} onClick={() => onSelectPage(page.pageId)} className="max-w-[820px] mx-auto">
      {/* A4 sheet: 794 × 1123 px at 96 dpi. The ring does not take layout space, so frames map 1:1. */}
      <div
        className="relative bg-white rounded-xs shadow-lg ring-1 ring-slate-200/90 w-full max-w-[794px] min-h-[1123px] mx-auto flex flex-col justify-between"
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
            return (
              <div key={block.blockId} className={draggingBlockId === block.blockId ? "opacity-40" : undefined}>
                {renderFramedOrFlowBlock(block, bIdx)}
              </div>
            );
          })}
        </div>

        {/* Fixed-position blocks, placed by their frame in sheet coordinates. */}
        {page.blocks.map((block, bIdx) =>
          block.frame ? (
            <div
              key={block.blockId}
              className="absolute"
              style={{ left: block.frame.x, top: block.frame.y, width: block.frame.w, height: block.frame.h }}
            >
              {renderFramedOrFlowBlock(block, bIdx)}
            </div>
          ) : null
        )}

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
