import React from "react";
import {
  GripVertical,
  Sparkles,
  Paperclip,
  Lock,
  Trash2,
  ArrowUp,
  ArrowDown,
  PenLine,
} from "lucide-react";

import type {
  VDocPage,
  VDocSlot,
  BackdataChunk,
} from "@vibe/vdoc-schema";
import { SlotRichTextEditor } from "@vibe/slot-editor";

export interface VDocPageSheetProps {
  docTitle: string;
  totalPages: number;
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
  renderInlineComposer?: (
    slot: VDocSlot,
    boundChunks: BackdataChunk[]
  ) => React.ReactNode;
}

/**
 * Host-independent `.vdoc` Physical Page & 2D LayoutBlock Renderer (`@vibe/slot-canvas`).
 * Renders the 4-layer PandaDoc Kolas Editor Page Anatomy + 7 LayoutBlock kinds (`form-title`, `composite-form-frame`, etc.).
 */
export const VDocPageSheet: React.FC<VDocPageSheetProps> = ({
  docTitle,
  totalPages,
  page,
  slots,
  backdata,
  mode,
  selectedSlotId,
  composerOpenSlotId,
  onSelectPage,
  onSelectSlot,
  onToggleComposerForSlot,
  onOpenBackdataDrawer,
  onUpdateSlotContent,
  onMoveBlock,
  onDeleteBlock,
  renderInlineComposer,
}) => {
  const renderSlotBox = (
    slotId: string,
    extraClass = "",
    darkTheme = false,
    compact = false
  ) => {
    const slot = slots[slotId];
    if (!slot) return null;
    const isSelected = selectedSlotId === slotId;
    const isComposerOpen = composerOpenSlotId === slotId;
    const isLocked =
      mode === "Viewing" ||
      Boolean(slot.constraints?.locked) ||
      slot.role === "boilerplate";
    const boundCount = slot.backDataRefs.length;
    const slotChunks = slot.backDataRefs
      .map((cid) => backdata[cid])
      .filter(Boolean);

    return (
      <div
        key={slotId}
        onClick={(e) => {
          e.stopPropagation();
          onSelectSlot(slotId);
        }}
        className={`group/slot relative min-w-0 rounded-md transition-all ${
          isSelected
            ? "ring-2 ring-[#248567] bg-emerald-50/25"
            : "hover:ring-1 hover:ring-[#248567]/60"
        } ${extraClass}`}
      >
        {mode === "Editing" && (
          <div
            className={`absolute -top-6 left-0 z-20 flex items-center justify-between gap-2 px-2 py-0.5 text-[11px] rounded-t-md shadow-xs whitespace-nowrap transition-opacity ${
              isSelected
                ? "opacity-100 bg-[#248567] text-white"
                : "opacity-0 pointer-events-none group-hover/slot:opacity-100 group-hover/slot:pointer-events-auto bg-slate-800/95 text-slate-100"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {slot.constraints?.locked ? (
                <Lock className="w-3 h-3 text-amber-300 shrink-0" />
              ) : (
                <PenLine className="w-3 h-3 shrink-0" />
              )}
              <span className="font-medium">{slot.label}</span>
              <code className="text-[10px] opacity-75">({slot.slotId})</code>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {boundCount > 0 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenBackdataDrawer(slotId);
                  }}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-white/20 text-white text-[10px] font-semibold cursor-pointer hover:bg-white/30"
                  title="연결된 백데이터 원문 보기"
                >
                  <Paperclip className="w-2.5 h-2.5" />
                  {boundCount}
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComposerForSlot(slotId);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[10px] transition cursor-pointer"
                title="이 슬롯에 부착형 AI Composer 열기 (Ctrl+K)"
              >
                <Sparkles className="w-2.5 h-2.5" />
                AI Composer
              </button>
            </div>
          </div>
        )}

        <div
          className={`${
            compact ? "px-1 py-0.5 leading-snug" : "px-3 py-2 leading-relaxed"
          } ${
            extraClass.includes("text-")
              ? ""
              : compact
                ? "text-[12.5px]"
                : "text-sm"
          } min-w-0 break-words ${darkTheme ? "text-white" : "text-slate-900"}`}
        >
          <SlotRichTextEditor
            slotId={slotId}
            content={slot.content}
            readOnly={isLocked}
            placeholder={slot.constraints?.placeholder}
            onSelectSlot={onSelectSlot}
            onChangeContent={onUpdateSlotContent}
          />
        </div>

        {isComposerOpen && mode === "Editing" && renderInlineComposer && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-30 px-2 pb-2 min-w-[480px] max-w-[680px]"
          >
            {renderInlineComposer(slot, slotChunks)}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      id={`vdoc-page-${page.pageId}`}
      onClick={() => onSelectPage(page.pageId)}
      className="max-w-[820px] mx-auto"
    >
      {/* PandaDoc Page Meta Header (`Title · Page 1 of N · Label`) */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-2 select-none">
        <span className="font-medium text-slate-600">{docTitle}</span>
        <span>·</span>
        <span>
          Page {page.pageNumber} of {totalPages}
        </span>
        <span>·</span>
        <span>{page.pageLabel}</span>
      </div>

      {/* Physical Page Sheet */}
      <div className="bg-white rounded-sm shadow-md border border-slate-200/90 min-h-[880px] flex flex-col justify-between">
        {/* Layer 1: Document's header toggle area */}
        {!page.hideHeaderFooter && (
          <div className="px-10 pt-6 pb-3 border-b border-dashed border-slate-200 bg-slate-50/40">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 select-none">
              Document's header toggle area
            </div>
            {renderSlotBox(page.headerSlotId, "text-xs text-slate-500")}
          </div>
        )}

        {/* Layer 2: Page content area (2D Layout Blocks & Isolated Slots) */}
        <div
          className={`${
            page.hideHeaderFooter
              ? "px-14 pt-12 pb-12 space-y-5"
              : "px-10 py-6 space-y-6"
          } flex-1`}
        >
          {page.blocks.map((block, bIdx) => (
            <div
              key={block.blockId}
              className="group/block relative rounded-lg border border-transparent hover:border-slate-300/80 p-1 transition-all"
            >
              {mode === "Editing" && (
                <div className="opacity-0 pointer-events-none group-hover/block:opacity-100 group-hover/block:pointer-events-auto transition-opacity absolute -top-3.5 right-2 z-10 flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-100 shadow-sm select-none">
                  <div className="flex items-center gap-1.5 font-medium">
                    <GripVertical className="w-3 h-3 text-slate-300" />
                    <span>{block.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/15 text-emerald-300">
                      {block.kind}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 pl-1 border-l border-white/20">
                    <button
                      type="button"
                      onClick={() => onMoveBlock(page.pageId, bIdx, -1)}
                      disabled={bIdx === 0}
                      className="p-0.5 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                      title="블록 위로 이동"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveBlock(page.pageId, bIdx, 1)}
                      disabled={bIdx === page.blocks.length - 1}
                      className="p-0.5 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                      title="블록 아래로 이동"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBlock(page.pageId, block.blockId)}
                      className="p-0.5 rounded hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                      title="블록 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {block.kind === "form-title" && (
                <div className="flex flex-col items-center justify-center pt-1 pb-3">
                  <div
                    className="text-center font-bold text-slate-950"
                    style={{
                      letterSpacing: block.letterSpacing || "0.35em",
                    }}
                  >
                    {renderSlotBox(
                      block.slotId,
                      "text-center text-[24px] font-bold",
                      false,
                      true
                    )}
                  </div>
                  <div
                    className="bg-slate-950 mt-1"
                    style={{
                      width: block.underlineWidth || "286px",
                      height: block.underlineThickness || "2px",
                    }}
                  />
                </div>
              )}

              {block.kind === "composite-form-frame" && (
                <div
                  className="bg-white border-slate-950"
                  style={{
                    borderWidth: block.outerBorderWidth || "2px",
                    borderStyle: "solid",
                  }}
                >
                  {block.sections.map((sec, sIdx) => {
                    const isLastSec = sIdx === block.sections.length - 1;
                    const secBottomClass = isLastSec
                      ? ""
                      : sec.bottomBorderThick
                        ? "border-b-2 border-slate-950"
                        : "border-b border-slate-800";

                    return (
                      <div key={sec.sectionId} className={secBottomClass}>
                        <table className="w-full border-collapse table-fixed">
                          <colgroup>
                            {sec.columnWidths.map((w, i) => (
                              <col key={i} style={{ width: w }} />
                            ))}
                          </colgroup>
                          <tbody>
                            {sec.rows.map((row) => (
                              <tr
                                key={row.rowId}
                                style={
                                  row.height ? { height: row.height } : undefined
                                }
                                className="border-b border-slate-800 last:border-b-0"
                              >
                                {row.cells.map((cell) => {
                                  const vAlignClass =
                                    cell.vAlign === "middle"
                                      ? "align-middle"
                                      : cell.vAlign === "bottom"
                                        ? "align-bottom"
                                        : "align-top";
                                  const hAlignClass =
                                    cell.hAlign === "center"
                                      ? "text-center"
                                      : cell.hAlign === "right"
                                        ? "text-right"
                                        : "text-left";
                                  return (
                                    <td
                                      key={cell.cellId}
                                      colSpan={cell.colSpan}
                                      rowSpan={cell.rowSpan}
                                      style={{
                                        padding: cell.padding,
                                        letterSpacing: cell.letterSpacing,
                                      }}
                                      className={`border-r border-slate-800 last:border-r-0 ${vAlignClass} ${hAlignClass} ${
                                        cell.isHeader && !cell.whiteHeader
                                          ? "bg-slate-100/90 font-semibold"
                                          : "bg-white"
                                      }`}
                                    >
                                      {renderSlotBox(
                                        cell.slotId,
                                        "",
                                        false,
                                        Boolean(cell.compact || cell.padding)
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}

              {block.kind === "cover-banner" && (
                <div className="rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-8 min-h-[540px] flex flex-col justify-between shadow-inner">
                  <div className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
                    PandaDoc Kolas Cover Container · WYSIWYM
                  </div>

                  <div className="my-auto py-8">
                    {renderSlotBox(
                      block.headlineSlotId,
                      "text-3xl font-bold",
                      true
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/15">
                    {renderSlotBox(
                      block.preparedBySlotId,
                      "bg-white/5 rounded-lg p-2",
                      true
                    )}
                    {renderSlotBox(
                      block.preparedForSlotId,
                      "bg-white/5 rounded-lg p-2",
                      true
                    )}
                  </div>
                </div>
              )}

              {block.kind === "section-block" && (
                <div className="space-y-3">
                  {renderSlotBox(block.headingSlotId)}
                  {renderSlotBox(block.bodySlotId)}
                </div>
              )}

              {block.kind === "columns-grid" && (
                <div
                  className="grid gap-4 items-stretch w-full"
                  style={{
                    gridTemplateColumns: block.widths
                      .map((w) => (w.endsWith("fr") ? `minmax(0, ${w})` : w))
                      .join(" "),
                  }}
                >
                  {block.slotIds.map((sid) => (
                    <div
                      key={sid}
                      className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5"
                    >
                      {renderSlotBox(sid)}
                    </div>
                  ))}
                </div>
              )}

              {block.kind === "structured-table" && (
                <div className="rounded-lg border border-slate-300 bg-white">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      {block.columnWidths.map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <tbody>
                      {block.rows.map((row) => (
                        <tr
                          key={row.rowId}
                          className="border-b border-slate-200 last:border-b-0"
                        >
                          {row.cells.map((cell) => (
                            <td
                              key={cell.cellId}
                              colSpan={cell.colSpan}
                              rowSpan={cell.rowSpan}
                              className={`border-r border-slate-200 last:border-r-0 align-top p-1.5 ${
                                cell.isHeader
                                  ? "bg-slate-100/90 font-semibold"
                                  : "bg-white"
                              }`}
                            >
                              {renderSlotBox(cell.slotId)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {block.kind === "fillable-group" && (
                <div className="rounded-lg border-2 border-dashed border-amber-400/80 bg-amber-50/30 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-amber-900">
                      📌 {block.title}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold border border-amber-300">
                      👤 담당: {block.assigneeName}
                    </span>
                  </div>
                  {renderSlotBox(block.slotId)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Layer 3: Document's footer toggle area */}
        {!page.hideHeaderFooter && (
          <div className="px-10 py-3 border-t border-dashed border-slate-200 bg-slate-50/40">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 select-none">
              Document's footer toggle area
            </div>
            {renderSlotBox(page.footerSlotId, "text-xs text-slate-500")}
          </div>
        )}
      </div>

      {/* Layer 4: Estimated automatic page break on PDF */}
      <div className="flex items-center gap-3 my-4 text-[11px] text-slate-400 select-none">
        <div className="flex-1 border-t border-dashed border-slate-300" />
        <span>PDF page break · Page {page.pageNumber}</span>
        <div className="flex-1 border-t border-dashed border-slate-300" />
      </div>
    </section>
  );
};

