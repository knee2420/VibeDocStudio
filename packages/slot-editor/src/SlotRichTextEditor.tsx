import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import { FileText, Languages, MessageSquareText, SpellCheck, Wand2 } from "lucide-react";

import { VariableChipNode, StampChipNode } from "./variable-node";
import { BlockStyle, FontSize, FontWeight, LetterSpacing, LineHeight, Indent } from "./format-extensions";
import { normalizeLegacyHtml } from "./legacy-html";
import { useActiveSlotEditorStore } from "./active-editor-store";

/** Actions of the floating bar shown over a text selection (yesform `AI 제안 · 요약 · 번역 · 문법 수정 · 톤 수정`). */
export type SlotAiAction = "expand" | "summarize" | "translate" | "grammar" | "tone";

export const SLOT_AI_ACTIONS: { action: SlotAiAction; label: string; title: string; icon: React.ReactNode }[] = [
  { action: "summarize", label: "요약", title: "텍스트를 간결하게 요약", icon: <FileText className="w-3.5 h-3.5" /> },
  { action: "translate", label: "번역", title: "영어로 번역", icon: <Languages className="w-3.5 h-3.5" /> },
  { action: "grammar", label: "문법 수정", title: "문법과 맞춤법 수정", icon: <SpellCheck className="w-3.5 h-3.5" /> },
  { action: "tone", label: "톤 수정", title: "더 자연스럽고 전문적인 어투로 수정", icon: <MessageSquareText className="w-3.5 h-3.5" /> },
];

export interface SlotRichTextEditorProps {
  slotId: string;
  content: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  onSelectSlot?: (slotId: string) => void;
  onChangeContent?: (slotId: string, html: string) => void;
  onAiAction?: (slotId: string, action: SlotAiAction, selectedText: string) => void;
}

interface BubbleState {
  left: number;
  top: number;
  text: string;
}

/**
 * Isolated rich-text editor mounted inside each `slotId` (WYSIWYG inside WYSIWYM).
 * Carries the yesform formatting set (font, pt size, color, highlight, link, line height, indent).
 */
export const SlotRichTextEditor: React.FC<SlotRichTextEditorProps> = ({
  slotId,
  content,
  readOnly = false,
  placeholder = "",
  className = "",
  onSelectSlot,
  onChangeContent,
  onAiAction,
}) => {
  const setActiveSlotEditor = useActiveSlotEditorStore((s) => s.setActiveSlotEditor);
  const [bubble, setBubble] = useState<BubbleState | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        dropcursor: { color: "#3b82f6", width: 2 },
        history: { depth: 20, newGroupDelay: 500 },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      FontWeight,
      LetterSpacing,
      LineHeight,
      Indent,
      BlockStyle,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
      VariableChipNode,
      StampChipNode,
    ],
    content: normalizeLegacyHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        spellcheck: "false",
        class: "vdoc-tiptap-slot focus:outline-none min-h-[1.25rem]",
      },
    },
    onFocus: ({ editor: ed }) => {
      setActiveSlotEditor(slotId, ed);
      onSelectSlot?.(slotId);
    },
    onUpdate: ({ editor: ed }) => {
      onChangeContent?.(slotId, ed.getHTML());
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      if (empty || !ed.isEditable || !onAiAction) {
        setBubble(null);
        return;
      }
      const end = ed.view.coordsAtPos(to);
      const start = ed.view.coordsAtPos(from);
      setBubble({ left: Math.min(start.left, end.left), top: Math.max(start.bottom, end.bottom) + 8, text: ed.state.doc.textBetween(from, to, " ") });
    },
    onBlur: () => {
      // Let a click on the bubble land before it disappears.
      window.setTimeout(() => setBubble(null), 150);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeLegacyHtml(content);
    if (normalized !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(normalized, false);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!bubble) return;
    const hide = () => setBubble(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [bubble]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectSlot?.(slotId);
        if (editor) setActiveSlotEditor(slotId, editor);
      }}
      className={`vdoc-slot-editor max-w-none focus:outline-none ${className}`}
    >
      <EditorContent editor={editor} />
      {bubble &&
        onAiAction &&
        createPortal(
          <div
            data-keep-table-selection
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-[1000] flex items-center gap-1 rounded-lg border border-[#eaeaea] bg-white p-1 shadow-[0px_4px_12px_0px_rgba(47,44,44,0.1)]"
            style={{ left: bubble.left, top: bubble.top }}
          >
            <button
              type="button"
              title="더 상세하게 확장"
              onClick={() => {
                onAiAction(slotId, "expand", bubble.text);
                setBubble(null);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0472e3] px-2 text-[12px] font-semibold text-white hover:bg-[#0363c7] cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" /> AI 제안
            </button>
            {SLOT_AI_ACTIONS.map((a) => (
              <button
                key={a.action}
                type="button"
                title={a.title}
                onClick={() => {
                  onAiAction(slotId, a.action, bubble.text);
                  setBubble(null);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer"
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
