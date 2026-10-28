import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { VariableChipNode, StampChipNode } from "./variable-node";
import { useActiveSlotEditorStore } from "./active-editor-store";

export interface SlotRichTextEditorProps {
  slotId: string;
  content: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  onSelectSlot?: (slotId: string) => void;
  onChangeContent?: (slotId: string, html: string) => void;
}

/**
 * Isolated Rich-Text Editor mounted inside each `slotId` (WYSIWYG inside WYSIWYM).
 * Mirrors PandaDoc Kolas Editor's `[textbox]` per-slot architecture & Maily.to's Tiptap extensions.
 */
export const SlotRichTextEditor: React.FC<SlotRichTextEditorProps> = ({
  slotId,
  content,
  readOnly = false,
  placeholder = "클릭하여 입력하거나 ✨ AI Composer로 채우기...",
  className = "",
  onSelectSlot,
  onChangeContent,
}) => {
  const setActiveSlotEditor = useActiveSlotEditorStore(
    (s) => s.setActiveSlotEditor
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder,
      }),
      VariableChipNode,
      StampChipNode,
    ],
    content,
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
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (content !== currentHtml && !editor.isFocused) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectSlot?.(slotId);
        if (editor) {
          setActiveSlotEditor(slotId, editor);
        }
      }}
      className={`vdoc-slot-editor prose prose-sm max-w-none focus:outline-none ${className}`}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

