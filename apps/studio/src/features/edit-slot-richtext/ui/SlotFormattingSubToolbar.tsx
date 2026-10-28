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

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useSlotContentActions } from "../model/useSlotContentActions";

export const SlotFormattingSubToolbar: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const mode = useStudioDocumentStore((s) => s.mode);
  const toggleMode = useStudioDocumentStore((s) => s.toggleMode);
  const activeEditor = useActiveSlotEditorStore((s) => s.activeEditor);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const { updateSlotConstraints } = useSlotContentActions();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  const currentSlot = selectedSlotId ? doc?.slots[selectedSlotId] : undefined;

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

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

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

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Font Size Control */}
        <div className="flex items-center gap-1 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50">
          <span className="text-[10px] text-slate-400 font-medium select-none">크기</span>
          <select
            aria-label="글자 크기"
            disabled={!selectedSlotId}
            value={currentSlot?.constraints?.fontSize || "13px"}
            onChange={(e) => {
              if (selectedSlotId) {
                updateSlotConstraints(selectedSlotId, { fontSize: e.target.value });
              }
            }}
            className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none cursor-pointer disabled:opacity-40"
          >
            <option value="9pt">9pt</option>
            <option value="10pt">10pt</option>
            <option value="11pt">11pt</option>
            <option value="12pt">12pt</option>
            <option value="12.5px">12.5px</option>
            <option value="13px">13px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
            <option value="18px">18px</option>
            <option value="22px">22px</option>
            <option value="26px">26px</option>
            <option value="29.33px">29.33px (22pt)</option>
            <option value="36px">36px</option>
          </select>
        </div>

        {/* Line Height Control */}
        <div className="flex items-center gap-1 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50">
          <span className="text-[10px] text-slate-400 font-medium select-none">행간</span>
          <select
            aria-label="줄간격 (행간)"
            disabled={!selectedSlotId}
            value={currentSlot?.constraints?.lineHeight || "1.35"}
            onChange={(e) => {
              if (selectedSlotId) {
                updateSlotConstraints(selectedSlotId, { lineHeight: e.target.value });
              }
            }}
            className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none cursor-pointer disabled:opacity-40"
          >
            <option value="1.0">1.0 (밀착)</option>
            <option value="1.2">1.2 (타이트)</option>
            <option value="1.35">1.35 (기본)</option>
            <option value="1.5">1.5 (보통)</option>
            <option value="1.75">1.75 (넓게)</option>
            <option value="2.0">2.0 (두 배)</option>
          </select>
        </div>

        {/* Text Color Presets */}
        <div className="flex items-center gap-1.5 border border-slate-200 rounded px-2 py-0.5 bg-slate-50">
          <span className="text-[10px] text-slate-400 font-medium select-none">색상</span>
          <div className="flex items-center gap-1">
            {[
              { label: "블랙", value: "#0f172a", bg: "bg-slate-900" },
              { label: "다크그레이", value: "#383838", bg: "bg-neutral-700" },
              { label: "헤더블루", value: "#336699", bg: "bg-[#336699]" },
              { label: "뮤트", value: "#64748b", bg: "bg-slate-500" },
            ].map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={!selectedSlotId}
                onClick={() => {
                  if (selectedSlotId) {
                    updateSlotConstraints(selectedSlotId, { color: c.value });
                  }
                }}
                title={`${c.label} (${c.value})`}
                className={`w-3.5 h-3.5 rounded-full ${c.bg} transition-transform hover:scale-125 disabled:opacity-40 cursor-pointer ${
                  currentSlot?.constraints?.color === c.value ? "ring-2 ring-emerald-500 ring-offset-1" : ""
                }`}
              />
            ))}
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

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

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        <button
          type="button"
          onClick={() => {
            activeEditor?.chain().focus().setTextAlign("left").run();
            if (selectedSlotId) {
              updateSlotConstraints(selectedSlotId, { align: "left" });
            }
          }}
          className={`p-1.5 rounded hover:bg-slate-100 cursor-pointer ${
            currentSlot?.constraints?.align === "left" || (!currentSlot?.constraints?.align && "text-emerald-700 bg-emerald-50")
          }`}
          title="왼쪽 정렬"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            activeEditor?.chain().focus().setTextAlign("center").run();
            if (selectedSlotId) {
              updateSlotConstraints(selectedSlotId, { align: "center" });
            }
          }}
          className={`p-1.5 rounded hover:bg-slate-100 cursor-pointer ${
            currentSlot?.constraints?.align === "center" ? "text-emerald-700 bg-emerald-50" : "text-slate-700"
          }`}
          title="가운데 정렬"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            activeEditor?.chain().focus().setTextAlign("right").run();
            if (selectedSlotId) {
              updateSlotConstraints(selectedSlotId, { align: "right" });
            }
          }}
          className={`p-1.5 rounded hover:bg-slate-100 cursor-pointer ${
            currentSlot?.constraints?.align === "right" ? "text-emerald-700 bg-emerald-50" : "text-slate-700"
          }`}
          title="오른쪽 정렬"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

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

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

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

