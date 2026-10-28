import React from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Braces,
  Eye,
  PenLine,
} from "lucide-react";

import { useActiveSlotEditorStore } from "@vibe/slot-editor";

import { useStudioDocumentStore } from "@/entities/vdoc-document";

export const SlotFormattingSubToolbar: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const mode = useStudioDocumentStore((s) => s.mode);
  const toggleMode = useStudioDocumentStore((s) => s.toggleMode);
  const activeEditor = useActiveSlotEditorStore((s) => s.activeEditor);

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];

  return (
    <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between text-xs shrink-0 z-10">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMode}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
            mode === "Editing"
              ? "bg-emerald-50 text-[#248567] border border-emerald-200"
              : "bg-slate-100 text-slate-700 border border-slate-300"
          }`}
        >
          {mode === "Editing" ? (
            <>
              <PenLine className="w-3.5 h-3.5" /> Editing ▾
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" /> Viewing (읽기 전용) ▾
            </>
          )}
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() => activeEditor?.chain().focus().undo().run()}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
          title="실행 취소 (Undo)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => activeEditor?.chain().focus().redo().run()}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
          title="다시 실행 (Redo)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600 font-medium">
          100%
        </span>
        <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600">
          IBM Plex Sans
        </span>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() => activeEditor?.chain().focus().toggleBold().run()}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="굵게 (Bold)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => activeEditor?.chain().focus().toggleItalic().run()}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="기울임 (Italic)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="밑줄 (Underline)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() =>
            activeEditor?.chain().focus().setTextAlign("left").run()
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="왼쪽 정렬"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            activeEditor?.chain().focus().setTextAlign("center").run()
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="가운데 정렬"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            activeEditor?.chain().focus().setTextAlign("right").run()
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="오른쪽 정렬"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() =>
            activeEditor?.chain().focus().toggleBulletList().run()
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="글머리 기호 목록"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            activeEditor?.chain().focus().toggleOrderedList().run()
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="번호 매기기 목록"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() => {
            const firstVar =
              Object.keys(doc?.variables || {})[0] || "Sender.Company";
            activeEditor
              ?.chain()
              .focus()
              .insertContent({
                type: "variableChip",
                attrs: { variableName: firstVar },
              })
              .run();
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-medium cursor-pointer transition"
        >
          <Braces className="w-3 h-3" />+ 변수 칩 삽입
        </button>
      </div>

      <div className="text-[11px] text-slate-500 flex items-center gap-2">
        <span>
          단축키: 슬롯 선택 후{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-mono">
            Ctrl + K
          </kbd>{" "}
          = 컴포넌트 부착형 AI Composer
        </span>
      </div>
    </div>
  );
};

