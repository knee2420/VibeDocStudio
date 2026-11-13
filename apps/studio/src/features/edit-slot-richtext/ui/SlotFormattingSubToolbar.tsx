import React, { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpDown,
  Bold,
  Braces,
  Eye,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Minus,
  PaintBucket,
  Paperclip,
  PenLine,
  Plus,
  Redo2,
  Sparkles,
  Strikethrough,
  Table,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import {
  DEFAULT_FONT_SIZE_PT,
  FONT_PRESETS,
  LINE_HEIGHT_PRESETS,
  MAX_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
  pxToPt,
  useActiveSlotEditorStore,
} from "@vibe/slot-editor";
import { TABLE_LINE_STYLES, type TableCommand } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useHistoryStore } from "@/shared/lib";

import { useTableEditTarget } from "../model/useTableEditTarget";
import { BlockControlsGroup } from "./BlockControlsGroup";
import {
  BORDER_MODES,
  BorderModeIcon,
  ColorPalette,
  ToolButton,
  ToolDivider,
  ToolPopover,
  useEditorTick,
} from "./toolbar-parts";

type Editor = NonNullable<ReturnType<typeof useActiveSlotEditorStore.getState>["activeEditor"]>;

export interface SlotFormattingSubToolbarProps {
  onTableCommand?: (pageId: string, blockId: string, sectionId: string | null, cmd: TableCommand) => void;
  phaseStepper?: React.ReactNode;
  showFormattingControls?: boolean;
}

/** Runs `fn` on the selection, or on the whole slot when the caret has no selection. */
function onSelectionOrSlot(editor: Editor, fn: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) {
  const { empty, from, to } = editor.state.selection;
  if (!empty) {
    fn(editor.chain().focus()).run();
    return;
  }
  fn(editor.chain().focus().setTextSelection({ from: 0, to: editor.state.doc.content.size }))
    .setTextSelection({ from, to })
    .run();
}

function currentFontSizePt(editor: Editor | null): number {
  if (!editor) return DEFAULT_FONT_SIZE_PT;
  const attr = editor.getAttributes("textStyle").fontSize as string | undefined;
  if (attr?.endsWith("pt")) return parseFloat(attr);
  if (attr?.endsWith("px")) return pxToPt(parseFloat(attr));
  try {
    const node = editor.view.domAtPos(editor.state.selection.from).node;
    const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    if (el) return pxToPt(parseFloat(getComputedStyle(el).fontSize));
  } catch {
    // view not mounted yet
  }
  return DEFAULT_FONT_SIZE_PT;
}

/**
 * yesform-parity formatting toolbar. Context-aware: inside a table cell it leads with
 * 표 편집 (borders, line colour, line style) and 칸 배경색, like editor.yesform.com.
 */
export const SlotFormattingSubToolbar: React.FC<SlotFormattingSubToolbarProps> = ({
  onTableCommand,
  phaseStepper,
  showFormattingControls = true,
}) => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const mode = useStudioDocumentStore((s) => s.mode);
  const toggleMode = useStudioDocumentStore((s) => s.toggleMode);
  const undoHistory = useHistoryStore((s) => s.undo);
  const redoHistory = useHistoryStore((s) => s.redo);
  const canUndoDoc = useHistoryStore((s) => s.past.length > 0);
  const canRedoDoc = useHistoryStore((s) => s.future.length > 0);
  const activeEditor = useActiveSlotEditorStore((s) => s.activeEditor);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);

  useEditorTick(activeEditor);

  const [lineColor, setLineColor] = useState("#000000");
  const [lineStyle, setLineStyle] = useState("solid");
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");

  const currentSlot = selectedSlotId ? doc?.slots[selectedSlotId] : undefined;
  const firstVariable = Object.keys(doc?.variables ?? {})[0] ?? null;
  const editor = activeEditor && !activeEditor.isDestroyed ? activeEditor : null;
  const editable = mode === "Editing" && Boolean(editor?.isEditable);

  const tableTarget = useTableEditTarget();
  const runTable = (cmd: TableCommand) =>
    tableTarget && onTableCommand?.(tableTarget.pageId, tableTarget.blockId, tableTarget.sectionId, cmd);
  const lineCss = () => {
    const style = TABLE_LINE_STYLES.find((l) => l.id === lineStyle) ?? TABLE_LINE_STYLES[1];
    return style.css === "hidden" ? "hidden" : `${style.css} ${lineColor}`;
  };

  // 슬롯 편집기가 되돌릴 것이 없으면 공용 이력(블록 이동 · 표 편집 · 잠금 등)을 되돌린다.
  // Ctrl+Z 단축키는 command-bus 의 전역 처리기 하나만 담당한다.
  const undo = () => (editor?.can().undo() ? editor.chain().focus().undo().run() : void undoHistory());
  const redo = () => (editor?.can().redo() ? editor.chain().focus().redo().run() : void redoHistory());

  const sizePt = currentFontSizePt(editor);
  const setSize = (pt: number) => {
    if (!editor) return;
    const clamped = Math.min(MAX_FONT_SIZE_PT, Math.max(MIN_FONT_SIZE_PT, pt));
    onSelectionOrSlot(editor, (c) => c.setFontSize(`${clamped}pt`));
  };
  const fontFamily = (editor?.getAttributes("textStyle").fontFamily as string | undefined) ?? null;
  const fontLabel = FONT_PRESETS.find((f) => f.family === fontFamily)?.label ?? "맑은 고딕";
  const textColor = (editor?.getAttributes("textStyle").color as string | undefined) ?? null;
  const highlight = (editor?.getAttributes("highlight").color as string | undefined) ?? null;
  const align = (["center", "right"] as const).find((a) => editor?.isActive({ textAlign: a })) ?? "left";
  const AlignIcon = align === "center" ? AlignCenter : align === "right" ? AlignRight : AlignLeft;
  const inList = Boolean(editor?.isActive("bulletList") || editor?.isActive("orderedList"));
  const indentLevel = (editor?.getAttributes("paragraph").indent as number | undefined) ?? 0;

  return (
    <div
      data-keep-table-selection
      className="h-12 bg-white border-b border-slate-200 px-3 flex items-center justify-between text-xs shrink-0 z-10 gap-3"
    >
      <div className="flex min-w-0 items-center gap-[5px] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={toggleMode}
          className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 h-8 rounded-md font-semibold transition cursor-pointer ${
            mode === "Editing"
              ? "bg-emerald-50 text-[#248567] border border-emerald-200"
              : "bg-slate-100 text-slate-700 border border-slate-300"
          }`}
        >
          {mode === "Editing" ? (
            <>
              <PenLine className="w-3.5 h-3.5" /> 편집
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" /> 보기
            </>
          )}
        </button>

        <ToolDivider />
        <ToolButton title="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!editor?.can().undo() && !canUndoDoc}>
          <Undo2 className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="다시 실행 (Ctrl+Y)" onClick={redo} disabled={!editor?.can().redo() && !canRedoDoc}>
          <Redo2 className="w-4 h-4" />
        </ToolButton>
        <ToolDivider />

        {phaseStepper && (
          <>
            <div className="shrink-0">{phaseStepper}</div>
            {showFormattingControls && <ToolDivider />}
          </>
        )}

        {showFormattingControls && (
          <>
        <BlockControlsGroup />
        {tableTarget && mode === "Editing" && (
          <>
            <ToolPopover title="표 편집" trigger={<Table className="w-4 h-4" />} width={300}>
              {() => (
                <div className="flex gap-2">
                  <div className="grid grid-cols-5 gap-0.5">
                    {BORDER_MODES.map((b) => (
                      <ToolButton key={b.mode} title={b.label} onClick={() => runTable({ type: "setBorders", range: tableTarget.range, mode: b.mode, line: lineCss() })}>
                        <BorderModeIcon mode={b.mode} />
                      </ToolButton>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1 border-l border-slate-200 pl-2">
                    <ToolPopover
                      title="표 선 색"
                      trigger={
                        <span className="flex flex-col items-center">
                          <PenLine className="w-3.5 h-3.5" />
                          <span className="mt-0.5 h-1 w-4" style={{ backgroundColor: lineColor }} />
                        </span>
                      }
                    >
                      {(close) => <ColorPalette value={lineColor} onPick={(c) => { if (c) setLineColor(c); close(); }} />}
                    </ToolPopover>
                    <ToolPopover title="표 선 종류" trigger={<ArrowUpDown className="w-4 h-4 rotate-90" />} width={300}>
                      {(close) => (
                        <div className="grid grid-cols-4 gap-1">
                          {TABLE_LINE_STYLES.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              title={l.label}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setLineStyle(l.id); close(); }}
                              className={`flex h-9 items-center justify-center rounded border px-2 cursor-pointer hover:bg-neutral-50 ${lineStyle === l.id ? "border-[#0472e3]" : "border-[#eaeaea]"}`}
                            >
                              <span className="block w-full" style={{ borderTop: l.css === "hidden" ? "1px dashed #cbd5e1" : `${l.css} #1f2937` }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </ToolPopover>
                  </div>
                </div>
              )}
            </ToolPopover>
            <ToolPopover title="칸 배경색" trigger={<PaintBucket className="w-4 h-4" />}>
              {(close) => (
                <ColorPalette
                  value={tableTarget.table.rows.flatMap((r) => r.cells).find((c) => c.slotId === selectedSlotId)?.backgroundColor ?? null}
                  allowNone
                  onPick={(c) => { runTable({ type: "setCellBackground", range: tableTarget.range, color: c }); close(); }}
                />
              )}
            </ToolPopover>
            <ToolDivider />
          </>
        )}

        <ToolPopover title="글꼴" disabled={!editable} caret width={168} trigger={<span className="w-[78px] truncate text-left text-[13px]">{fontLabel}</span>}>
          {(close) => (
            <div className="max-h-[420px] overflow-y-auto">
              {FONT_PRESETS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (editor) onSelectionOrSlot(editor, (ch) => ch.setFontFamily(f.family)); close(); }}
                  className={`block w-full rounded px-2 py-1.5 text-left text-[14px] hover:bg-neutral-100 cursor-pointer ${fontLabel === f.label ? "bg-[#f3f3f3]" : ""}`}
                  style={{ fontFamily: f.family }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </ToolPopover>

        <ToolButton title="글자 작게" disabled={!editable} onClick={() => setSize(sizePt - 1)}>
          <Minus className="w-3.5 h-3.5" />
        </ToolButton>
        <input
          aria-label="글자 크기 (pt)"
          disabled={!editable}
          value={sizeDraft ?? String(sizePt)}
          onFocus={(e) => { setSizeDraft(String(sizePt)); e.target.select(); }}
          onChange={(e) => setSizeDraft(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => setSizeDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseFloat(sizeDraft ?? "");
              if (Number.isFinite(n)) setSize(n);
              setSizeDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 w-10 shrink-0 rounded-[6px] border border-gray-200 bg-transparent text-center text-[13px] text-gray-800 focus:outline-none disabled:opacity-40"
        />
        <ToolButton title="글자 크게" disabled={!editable} onClick={() => setSize(sizePt + 1)}>
          <Plus className="w-3.5 h-3.5" />
        </ToolButton>

        <ToolPopover
          title="글자 색"
          disabled={!editable}
          trigger={
            <span className="flex flex-col items-center leading-none">
              <span className="text-[14px] font-medium">A</span>
              <span className="mt-0.5 h-1 w-4" style={{ backgroundColor: textColor ?? "#000000" }} />
            </span>
          }
        >
          {(close) => (
            <ColorPalette
              value={textColor}
              allowNone
              onPick={(c) => { if (editor) onSelectionOrSlot(editor, (ch) => (c ? ch.setColor(c) : ch.unsetColor())); close(); }}
            />
          )}
        </ToolPopover>
        <ToolPopover
          title="형광펜 색"
          disabled={!editable}
          trigger={
            <span className="flex flex-col items-center leading-none">
              <Highlighter className="w-3.5 h-3.5" />
              <span className="mt-0.5 h-1 w-4 border border-[#e5e5e5]" style={{ backgroundColor: highlight ?? "#ffffff" }} />
            </span>
          }
        >
          {(close) => (
            <ColorPalette
              value={highlight}
              allowNone
              onPick={(c) => { if (editor) onSelectionOrSlot(editor, (ch) => (c ? ch.setHighlight({ color: c }) : ch.unsetHighlight())); close(); }}
            />
          )}
        </ToolPopover>

        <ToolDivider />
        <ToolButton title="굵게 (Ctrl+B)" disabled={!editable} active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="기울임 (Ctrl+I)" disabled={!editable} active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="밑줄 (Ctrl+U)" disabled={!editable} active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="취소선" disabled={!editable} active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-4 h-4" />
        </ToolButton>

        <ToolDivider />
        <ToolPopover title="정렬" disabled={!editable} trigger={<AlignIcon className="w-4 h-4" />}>
          {(close) => (
            <div className="flex gap-0.5">
              {([["left", AlignLeft, "왼쪽 정렬"], ["center", AlignCenter, "가운데 정렬"], ["right", AlignRight, "오른쪽 정렬"]] as const).map(([a, Icon, label]) => (
                <ToolButton key={a} title={label} active={align === a} onClick={() => { editor?.chain().focus().setTextAlign(a).run(); close(); }}>
                  <Icon className="w-4 h-4" />
                </ToolButton>
              ))}
            </div>
          )}
        </ToolPopover>
        <ToolPopover title="줄간격" disabled={!editable} trigger={<ArrowUpDown className="w-4 h-4" />} width={160}>
          {(close) => (
            <div>
              <div className="mb-1 text-[11px] text-slate-500">줄 간격</div>
              <div className="flex gap-1">
                {LINE_HEIGHT_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { editor?.chain().focus().setLineHeight(v).run(); close(); }}
                    className="h-8 flex-1 rounded border border-[#eaeaea] text-[12px] hover:bg-neutral-100 cursor-pointer"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="mt-2 mb-1 text-[11px] text-slate-500">직접 입력</div>
              <input
                aria-label="줄 간격 직접 입력"
                placeholder="예: 1.8"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (Number.isFinite(v) && v > 0) editor?.chain().focus().setLineHeight(String(v)).run();
                  close();
                }}
                className="h-8 w-full rounded border border-[#eaeaea] px-2 text-[12px] outline-none focus:border-[#0472e3]"
              />
            </div>
          )}
        </ToolPopover>
        <ToolButton
          title="들여쓰기"
          disabled={!editable}
          onClick={() => (inList ? editor?.chain().focus().sinkListItem("listItem").run() : editor?.chain().focus().indent().run())}
        >
          <IndentIncrease className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          title="내어쓰기"
          disabled={!editable || (!inList && indentLevel === 0)}
          onClick={() => (inList ? editor?.chain().focus().liftListItem("listItem").run() : editor?.chain().focus().outdent().run())}
        >
          <IndentDecrease className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="번호 목록" disabled={!editable} active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </ToolButton>
        <ToolButton title="글머리 목록" disabled={!editable} active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </ToolButton>
        <ToolPopover title="링크" disabled={!editable} active={editor?.isActive("link")} trigger={<Link2 className="w-4 h-4" />} width={300}>
          {(close) => {
            const apply = () => {
              const href = linkDraft.trim();
              if (!href) {
                editor?.chain().focus().extendMarkRange("link").unsetLink().run();
              } else {
                editor?.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|tel:)/.test(href) ? href : `https://${href}` }).run();
              }
              setLinkDraft("");
              close();
            };
            return (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  aria-label="링크 주소"
                  placeholder="https://example.com"
                  defaultValue={(editor?.getAttributes("link").href as string | undefined) ?? ""}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && apply()}
                  className="h-8 flex-1 rounded border border-[#eaeaea] px-2 text-[12px] outline-none focus:border-[#0472e3]"
                />
                <button type="button" onClick={apply} className="h-8 rounded bg-[#0472e3] px-3 text-[12px] font-semibold text-white hover:bg-[#0363c7] cursor-pointer">
                  확인
                </button>
              </div>
            );
          }}
        </ToolPopover>

        <ToolDivider />
        <ToolButton
          title={firstVariable ? `변수 칩 삽입 (${firstVariable})` : "이 문서에 정의된 변수가 없습니다"}
          disabled={!editable || !firstVariable}
          onClick={() => {
            if (!firstVariable) return;
            editor?.chain().focus().insertContent({ type: "variableChip", attrs: { variableName: firstVariable } }).run();
          }}
          className="gap-1 px-2 text-[12px] text-amber-900"
        >
          <Braces className="w-3.5 h-3.5" /> 변수
        </ToolButton>
          </>
        )}
      </div>

      {currentSlot && (
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-600">
          {currentSlot.constraints?.locked && <Lock className="w-3 h-3 text-amber-500" />}
          <span className="max-w-[180px] truncate font-medium text-slate-800" title={currentSlot.slotId}>
            {currentSlot.label}
          </span>
          {currentSlot.backDataRefs.length > 0 && (
            <button
              type="button"
              onClick={() => openRightPanel("inspector")}
              title="연결된 백데이터 원문 보기"
              className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-semibold hover:bg-slate-200 cursor-pointer"
            >
              <Paperclip className="w-3 h-3" />
              {currentSlot.backDataRefs.length}
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleComposerForSlot(currentSlot.slotId)}
            title="이 슬롯에 AI Composer 열기 (Ctrl+K)"
            className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-1 font-semibold text-slate-950 hover:bg-amber-300 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" /> AI Composer
          </button>
        </div>
      )}
    </div>
  );
};
