import React, { useState, useEffect } from "react";
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
  Plus,
  GripVertical,
  Sparkles,
  Paperclip,
  Lock,
  Unlock,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileDown,
  FileUp,
  Database,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Table as TableIcon,
  FileText,
  UserCheck,
  Braces,
  Eye,
  PenLine,
} from "lucide-react";
import type {
  VDocDocument,
  VDocSlot,
  LayoutBlock,
  BackdataChunk,
} from "@vibe/vdoc-schema";
import {
  SlotRichTextEditor,
  useActiveSlotEditorStore,
} from "@vibe/slot-editor";
import { ComponentAttachedComposer } from "@vibe/ai-composer";

export interface VibeDocStudioShellProps {
  documents: VDocDocument[];
  initialDocId?: string;
}

export const VibeDocStudioShell: React.FC<VibeDocStudioShellProps> = ({
  documents: initialDocs,
  initialDocId,
}) => {
  const [docs, setDocs] = useState<VDocDocument[]>(initialDocs);
  const [activeDocId, setActiveDocId] = useState<string>(
    initialDocId || initialDocs[0]?.docId || ""
  );

  useEffect(() => {
    setDocs(initialDocs);
  }, [initialDocs]);

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];

  const [mode, setMode] = useState<"Editing" | "Viewing">("Editing");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activePageId, setActivePageId] = useState<string>(
    doc?.pages[0]?.pageId || ""
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    Object.values(doc?.slots || {}).find((s) => s.role !== "boilerplate")
      ?.slotId ||
      Object.keys(doc?.slots || {})[0] ||
      null
  );
  const [composerOpenSlotId, setComposerOpenSlotId] = useState<string | null>(
    null
  );
  const [newBackdataTitle, setNewBackdataTitle] = useState("");
  const [newBackdataExcerpt, setNewBackdataExcerpt] = useState("");
  const [showAddBackdataForm, setShowAddBackdataForm] = useState(false);

  const activeEditor = useActiveSlotEditorStore((s) => s.activeEditor);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (selectedSlotId) {
          setComposerOpenSlotId((prev) =>
            prev === selectedSlotId ? null : selectedSlotId
          );
        }
      } else if (e.key === "Escape") {
        setComposerOpenSlotId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSlotId]);

  const updateCurrentDoc = (updater: (prev: VDocDocument) => VDocDocument) => {
    setDocs((prevDocs) =>
      prevDocs.map((d) => (d.docId === doc.docId ? updater(d) : d))
    );
  };

  const handleUpdateSlotContent = (slotId: string, html: string) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      slots: {
        ...prev.slots,
        [slotId]: {
          ...prev.slots[slotId],
          content: html,
        },
      },
    }));
  };

  const handleToggleSlotLock = (slotId: string) => {
    updateCurrentDoc((prev) => {
      const slot = prev.slots[slotId];
      if (!slot) return prev;
      const isLocked = Boolean(slot.constraints?.locked);
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...slot,
            role: isLocked ? "editable-slot" : "boilerplate",
            constraints: {
              ...slot.constraints,
              locked: !isLocked,
            },
          },
        },
      };
    });
  };

  const handleToggleBackdataRef = (slotId: string, chunkId: string) => {
    updateCurrentDoc((prev) => {
      const slot = prev.slots[slotId];
      if (!slot) return prev;
      const exists = slot.backDataRefs.includes(chunkId);
      const nextRefs = exists
        ? slot.backDataRefs.filter((id) => id !== chunkId)
        : [...slot.backDataRefs, chunkId];
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...slot,
            backDataRefs: nextRefs,
          },
        },
      };
    });
  };

  const handleAddBackdataChunk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBackdataTitle.trim() || !newBackdataExcerpt.trim()) return;
    const chunkId = `bd_custom_${Date.now().toString(36)}`;
    const newChunk: BackdataChunk = {
      chunkId,
      sourceTitle: newBackdataTitle.trim(),
      sourceType: "markdown",
      excerpt: newBackdataExcerpt.trim(),
      updatedAt: new Date().toISOString().slice(0, 10),
      tags: ["수동임포트", "백데이터"],
    };

    updateCurrentDoc((prev) => {
      const nextSlots = { ...prev.slots };
      if (selectedSlotId && nextSlots[selectedSlotId]) {
        nextSlots[selectedSlotId] = {
          ...nextSlots[selectedSlotId],
          backDataRefs: [...nextSlots[selectedSlotId].backDataRefs, chunkId],
        };
      }
      return {
        ...prev,
        backdata: {
          ...prev.backdata,
          [chunkId]: newChunk,
        },
        slots: nextSlots,
      };
    });

    setNewBackdataTitle("");
    setNewBackdataExcerpt("");
    setShowAddBackdataForm(false);
  };

  const handleMoveBlock = (
    pageId: string,
    blockIndex: number,
    direction: -1 | 1
  ) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => {
        if (p.pageId !== pageId) return p;
        const targetIndex = blockIndex + direction;
        if (targetIndex < 0 || targetIndex >= p.blocks.length) return p;
        const nextBlocks = [...p.blocks];
        const [moved] = nextBlocks.splice(blockIndex, 1);
        nextBlocks.splice(targetIndex, 0, moved);
        return { ...p, blocks: nextBlocks };
      }),
    }));
  };

  const handleDeleteBlock = (pageId: string, blockId: string) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.pageId === pageId
          ? { ...p, blocks: p.blocks.filter((b) => b.blockId !== blockId) }
          : p
      ),
    }));
  };

  const handleAddBlockToPage = (
    pageId: string,
    kind: "columns-grid" | "structured-table" | "section-block" | "fillable-group"
  ) => {
    const suffix = Date.now().toString(36);
    updateCurrentDoc((prev) => {
      const nextSlots: Record<string, VDocSlot> = { ...prev.slots };
      let newBlock: LayoutBlock;

      if (kind === "columns-grid") {
        const s1 = `slot_col1_${suffix}`;
        const s2 = `slot_col2_${suffix}`;
        nextSlots[s1] = {
          slotId: s1,
          label: "좌측 컬럼 슬롯",
          role: "editable-slot",
          content: "<p><strong>좌측 구획</strong><br/>내용을 입력하거나 ✨ AI로 채우세요.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        nextSlots[s2] = {
          slotId: s2,
          label: "우측 컬럼 슬롯",
          role: "editable-slot",
          content: "<p><strong>우측 구획</strong><br/>레이아웃이 절대 무너지지 않는 독립 슬롯입니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_cols_${suffix}`,
          kind: "columns-grid",
          title: "2단 비교 그리드 컨테이너",
          widths: ["1fr", "1fr"],
          slotIds: [s1, s2],
        };
        setSelectedSlotId(s1);
      } else if (kind === "structured-table") {
        const h1 = `slot_th1_${suffix}`;
        const h2 = `slot_th2_${suffix}`;
        const c1 = `slot_tc1_${suffix}`;
        const c2 = `slot_tc2_${suffix}`;
        nextSlots[h1] = {
          slotId: h1,
          label: "표 헤더 1",
          role: "boilerplate",
          content: "<p><strong>구분 항목</strong></p>",
          constraints: { locked: true },
          backDataRefs: [],
        };
        nextSlots[h2] = {
          slotId: h2,
          label: "표 헤더 2",
          role: "boilerplate",
          content: "<p><strong>세부 내역 슬롯</strong></p>",
          constraints: { locked: true },
          backDataRefs: [],
        };
        nextSlots[c1] = {
          slotId: c1,
          label: "표 1행 1열 슬롯",
          role: "editable-slot",
          content: "<p>안건 A</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        nextSlots[c2] = {
          slotId: c2,
          label: "표 1행 2열 슬롯",
          role: "editable-slot",
          content: "<p>각 셀마다 독립된 Tiptap 슬롯이 작동합니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_tbl_${suffix}`,
          kind: "structured-table",
          title: "정밀 격자 표 (셀 단위 독립 슬롯)",
          columnWidths: ["32%", "68%"],
          rows: [
            {
              rowId: `r_h_${suffix}`,
              cells: [
                { cellId: `ch1_${suffix}`, slotId: h1, isHeader: true },
                { cellId: `ch2_${suffix}`, slotId: h2, isHeader: true },
              ],
            },
            {
              rowId: `r_1_${suffix}`,
              cells: [
                { cellId: `cc1_${suffix}`, slotId: c1 },
                { cellId: `cc2_${suffix}`, slotId: c2 },
              ],
            },
          ],
        };
        setSelectedSlotId(c2);
      } else if (kind === "fillable-group") {
        const sid = `slot_fill_${suffix}`;
        nextSlots[sid] = {
          slotId: sid,
          label: "할당형 입력 슬롯",
          role: "fillable-field",
          assignee: "서민규 서",
          content: "<p>담당자 및 백데이터가 바인딩된 전용 슬롯입니다.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_fill_${suffix}`,
          kind: "fillable-group",
          title: "할당형 핵심 요약 필드",
          slotId: sid,
          assigneeName: "서민규 서",
          fieldType: "text-area",
        };
        setSelectedSlotId(sid);
      } else {
        const hId = `slot_sec_h_${suffix}`;
        const bId = `slot_sec_b_${suffix}`;
        nextSlots[hId] = {
          slotId: hId,
          label: "섹션 제목 슬롯",
          role: "boilerplate",
          content: "<h2>새로운 섹션 제목</h2>",
          backDataRefs: [],
        };
        nextSlots[bId] = {
          slotId: bId,
          label: "섹션 본문 슬롯",
          role: "editable-slot",
          content: "<p>클릭하여 본문을 편집하거나 <code>Ctrl+K</code>로 AI Composer를 호출하세요.</p>",
          backDataRefs: Object.keys(prev.backdata).slice(0, 1),
        };
        newBlock = {
          blockId: `blk_sec_${suffix}`,
          kind: "section-block",
          title: "표준 문서 섹션 블록",
          headingSlotId: hId,
          bodySlotId: bId,
        };
        setSelectedSlotId(bId);
      }

      return {
        ...prev,
        slots: nextSlots,
        pages: prev.pages.map((p) =>
          p.pageId === pageId ? { ...p, blocks: [...p.blocks, newBlock] } : p
        ),
      };
    });
  };

  const handleExportVDoc = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/\s+/g, "_")}.vdoc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportVDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as VDocDocument;
        if (parsed.docId && parsed.pages && parsed.slots) {
          setDocs((prev) => {
            const exists = prev.some((d) => d.docId === parsed.docId);
            return exists
              ? prev.map((d) => (d.docId === parsed.docId ? parsed : d))
              : [...prev, parsed];
          });
          setActiveDocId(parsed.docId);
          setActivePageId(parsed.pages[0]?.pageId || "");
        }
      } catch {
        alert("유효한 .vdoc (JSON) 문서 파일이 아닙니다.");
      }
    };
    reader.readAsText(file);
  };

  const selectedSlot: VDocSlot | undefined = selectedSlotId
    ? doc.slots[selectedSlotId]
    : undefined;
  const selectedSlotChunks: BackdataChunk[] = (
    selectedSlot?.backDataRefs || []
  )
    .map((id) => doc.backdata[id])
    .filter(Boolean);

  const renderSlotBox = (
    slotId: string,
    extraClass = "",
    darkTheme = false,
    compact = false
  ) => {
    const slot = doc.slots[slotId];
    if (!slot) return null;
    const isSelected = selectedSlotId === slotId;
    const isComposerOpen = composerOpenSlotId === slotId;
    const isLocked =
      mode === "Viewing" ||
      Boolean(slot.constraints?.locked) ||
      slot.role === "boilerplate";
    const boundCount = slot.backDataRefs.length;
    const slotChunks = slot.backDataRefs
      .map((cid) => doc.backdata[cid])
      .filter(Boolean);

    return (
      <div
        key={slotId}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedSlotId(slotId);
        }}
        className={`group/slot relative min-w-0 rounded-md transition-all ${
          isSelected
            ? "ring-2 ring-[#248567] bg-emerald-50/25"
            : "hover:ring-1 hover:ring-[#248567]/60"
        } ${extraClass}`}
      >
        {/* PandaDoc Kolas Editor Floating Green Selection Pill + AI Composer Trigger */}
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
                    setSelectedSlotId(slotId);
                    setRightSidebarOpen(true);
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
                  setSelectedSlotId(slotId);
                  setComposerOpenSlotId(isComposerOpen ? null : slotId);
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

        {/* Inner Isolated Tiptap WYSIWYG Editor */}
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
            onSelectSlot={(sid) => setSelectedSlotId(sid)}
            onChangeContent={handleUpdateSlotContent}
          />
        </div>

        {/* Component-Attached Inline Floating AI Composer */}
        {isComposerOpen && mode === "Editing" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-30 px-2 pb-2 min-w-[480px] max-w-[680px]"
          >
            <ComponentAttachedComposer
              targetSlot={slot}
              boundChunks={slotChunks}
              onApplySlotContent={handleUpdateSlotContent}
              onOpenBackdataDrawer={() => setRightSidebarOpen(true)}
              onClose={() => setComposerOpenSlotId(null)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f5f7] text-slate-900 overflow-hidden select-none">
      {/* =====================================================================
          1. TOP HEADER BAR (Dissected PandaDoc Kolas Editor Top Bar + VDoc Controls)
         ===================================================================== */}
      <header className="h-13 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#248567] text-white font-bold flex items-center justify-center text-sm shadow-xs">
            V
          </div>

          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={doc.title}
                onChange={(e) =>
                  updateCurrentDoc((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                className="w-80 sm:w-96 font-semibold text-sm text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-[#248567] rounded px-1.5 py-0.5 outline-none"
              />
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-slate-100 text-slate-600 font-medium">
                {doc.totalValueText || "$0.00"}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-emerald-50 text-[#248567] font-medium border border-emerald-200">
                ● {doc.status}
              </span>
            </div>

            {/* Menu Bar + Document Template Switcher */}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span className="font-medium text-slate-700">문서 전환:</span>
              {docs.map((d) => (
                <button
                  key={d.docId}
                  type="button"
                  onClick={() => {
                    setActiveDocId(d.docId);
                    setActivePageId(d.pages[0]?.pageId || "");
                    const firstEditable =
                      Object.values(d.slots).find(
                        (s) => s.role !== "boilerplate"
                      )?.slotId ||
                      Object.keys(d.slots)[0] ||
                      null;
                    setSelectedSlotId(firstEditable);
                    setComposerOpenSlotId(null);
                  }}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    d.docId === doc.docId
                      ? "bg-slate-900 text-white font-medium"
                      : "hover:bg-slate-100 text-slate-600"
                  }`}
                >
                  {d.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Actions: Dual Import + .vdoc Export */}
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition">
            <FileUp className="w-3.5 h-3.5 text-[#248567]" />
            .vdoc 열기 (양식 임포트)
            <input
              type="file"
              accept=".vdoc,.json"
              onChange={handleImportVDocFile}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setRightSidebarOpen(true);
              setShowAddBackdataForm(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-xs font-medium text-indigo-900 cursor-pointer transition"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />+ 백데이터 원문 임포트
          </button>

          <button
            type="button"
            onClick={handleExportVDoc}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-semibold shadow-xs cursor-pointer transition"
          >
            <FileDown className="w-3.5 h-3.5" />
            .vdoc 저장
          </button>
        </div>
      </header>

      {/* =====================================================================
          2. FORMATTING SUB-TOOLBAR (PandaDoc Kolas Editor Toolbar + Variable Chip Injector)
         ===================================================================== */}
      <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between text-xs shrink-0 z-10">
        <div className="flex items-center gap-2">
          {/* Editing / Viewing Mode Switcher */}
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === "Editing" ? "Viewing" : "Editing"))
            }
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

          {/* Undo / Redo */}
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

          {/* Rich Text Formatting Controls bound to the currently focused Slot's Tiptap Editor */}
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
            onClick={() =>
              activeEditor?.chain().focus().toggleUnderline().run()
            }
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

          {/* Variable Chip Insertion (`Maily.to` + PandaDoc `[Sender.Company]`) */}
          <button
            type="button"
            onClick={() => {
              const firstVar =
                Object.keys(doc.variables)[0] || "Sender.Company";
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

        {/* Shortcut Hint */}
        <div className="text-[11px] text-slate-500 flex items-center gap-2">
          <span>
            단축키: 슬롯 선택 후 <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-mono">Ctrl + K</kbd> = 컴포넌트 부착형 AI Composer
          </span>
        </div>
      </div>

      {/* =====================================================================
          3. THREE-PANE WORKSPACE (Left Preview · Center Page/Grid Canvas · Right Context Inspector)
         ===================================================================== */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* -------------------------------------------------------------------
            LEFT SIDEBAR: PandaDoc `Document preview` + Block Palette
           ------------------------------------------------------------------- */}
        {leftSidebarOpen ? (
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Document preview
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Document · {doc.pages.length} pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                title="좌측 패널 접기"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Page Thumbnail List */}
            <div className="p-3 space-y-2 overflow-y-auto flex-1">
              {doc.pages.map((p) => {
                const isActive = p.pageId === activePageId;
                return (
                  <div
                    key={p.pageId}
                    onClick={() => {
                      setActivePageId(p.pageId);
                      document
                        .getElementById(`vdoc-page-${p.pageId}`)
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`group flex items-center gap-3 p-2 rounded-lg border transition cursor-pointer ${
                      isActive
                        ? "border-l-4 border-l-[#248567] border-slate-200 bg-emerald-50/40"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {/* Mini Visual Page Thumbnail Mirror */}
                    <div className="w-11 h-14 rounded bg-white border border-slate-300 shadow-2xs p-1 flex flex-col justify-between shrink-0 overflow-hidden">
                      <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
                      <div className="space-y-0.5">
                        <div className="h-1 w-4/5 bg-emerald-500/40 rounded-xs" />
                        <div className="h-1 w-full bg-slate-200 rounded-xs" />
                        <div className="grid grid-cols-2 gap-0.5">
                          <div className="h-2 bg-slate-100 border border-slate-200 rounded-xs" />
                          <div className="h-2 bg-slate-100 border border-slate-200 rounded-xs" />
                        </div>
                      </div>
                      <div className="h-1 w-1/2 bg-slate-200 rounded-xs" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800">
                        {p.pageNumber} · Page
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {p.pageLabel}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        블록 {p.blocks.length}개
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* WYSIWYM Layout Block Insertion Palette (`Puck` Component Drawer) */}
            {mode === "Editing" && (
              <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-700 mb-1">
                  + 현재 페이지에 레이아웃 블록 추가
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddBlockToPage(
                        activePageId || doc.pages[0].pageId,
                        "columns-grid"
                      )
                    }
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
                  >
                    <Columns2 className="w-3.5 h-3.5 text-[#248567]" />
                    2단 그리드
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddBlockToPage(
                        activePageId || doc.pages[0].pageId,
                        "structured-table"
                      )
                    }
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
                  >
                    <TableIcon className="w-3.5 h-3.5 text-[#248567]" />
                    정밀 표(Table)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddBlockToPage(
                        activePageId || doc.pages[0].pageId,
                        "section-block"
                      )
                    }
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#248567]" />
                    문서 섹션
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddBlockToPage(
                        activePageId || doc.pages[0].pageId,
                        "fillable-group"
                      )
                    }
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#248567] text-[11px] font-medium text-slate-700 transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#248567]" />
                    할당형 슬롯
                  </button>
                </div>
              </div>
            )}
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setLeftSidebarOpen(true)}
            className="absolute left-3 top-3 z-20 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
            title="좌측 Document preview 열기"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* -------------------------------------------------------------------
            CENTER CANVAS: PandaDoc Multi-Page + WYSIWYM Grid + WYSIWYG Slots
           ------------------------------------------------------------------- */}
        <main
          onClick={() => setComposerOpenSlotId(null)}
          className="flex-1 overflow-y-auto px-8 py-6 space-y-8 select-text"
        >
          {doc.pages.map((page) => (
            <section
              key={page.pageId}
              id={`vdoc-page-${page.pageId}`}
              onClick={() => setActivePageId(page.pageId)}
              className="max-w-[820px] mx-auto"
            >
              {/* PandaDoc Page Meta Header (`Title · Page 1 of N · Label`) */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-2 select-none">
                <span className="font-medium text-slate-600">{doc.title}</span>
                <span>·</span>
                <span>
                  Page {page.pageNumber} of {doc.pages.length}
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
                      {/* Block Handle & Reorder Bar (`⋮⋮`, `↑`, `↓`, `🗑️`) */}
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
                              onClick={() =>
                                handleMoveBlock(page.pageId, bIdx, -1)
                              }
                              disabled={bIdx === 0}
                              className="p-0.5 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                              title="블록 위로 이동"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveBlock(page.pageId, bIdx, 1)
                              }
                              disabled={bIdx === page.blocks.length - 1}
                              className="p-0.5 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                              title="블록 아래로 이동"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteBlock(page.pageId, block.blockId)
                              }
                              className="p-0.5 rounded hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                              title="블록 삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Render by LayoutBlock kind */}
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
                            const isLastSec =
                              sIdx === block.sections.length - 1;
                            const secBottomClass = isLastSec
                              ? ""
                              : sec.bottomBorderThick
                                ? "border-b-2 border-slate-950"
                                : "border-b border-slate-800";

                            return (
                              <div
                                key={sec.sectionId}
                                className={secBottomClass}
                              >
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
                                          row.height
                                            ? { height: row.height }
                                            : undefined
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
                                                letterSpacing:
                                                  cell.letterSpacing,
                                              }}
                                              className={`border-r border-slate-800 last:border-r-0 ${vAlignClass} ${hAlignClass} ${
                                                cell.isHeader &&
                                                !cell.whiteHeader
                                                  ? "bg-slate-100/90 font-semibold"
                                                  : "bg-white"
                                              }`}
                                            >
                                              {renderSlotBox(
                                                cell.slotId,
                                                "",
                                                false,
                                                Boolean(
                                                  cell.compact || cell.padding
                                                )
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
                              .map((w) =>
                                w.endsWith("fr") ? `minmax(0, ${w})` : w
                              )
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
          ))}
        </main>

        {/* -------------------------------------------------------------------
            RIGHT SIDEBAR: Slot Context Inspector & Backdata Reference Drawer
            (Unlike PandaDoc's static panel, immediately switches to the clicked Slot!)
           ------------------------------------------------------------------- */}
        {rightSidebarOpen ? (
          <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 select-none">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Slot Inspector & 백데이터 서랍
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  선택한 슬롯의 제약 조건 및 근거 원문(Grounding)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRightSidebarOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                title="우측 패널 접기"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedSlot ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* 1. Selected Slot Metadata & Constraints */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#248567] text-[11px] font-bold">
                      {selectedSlot.role}
                    </span>
                    <code className="text-[11px] text-slate-500">
                      {selectedSlot.slotId}
                    </code>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">
                      선택된 슬롯 이름
                    </label>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {selectedSlot.label}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleToggleSlotLock(selectedSlot.slotId)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition cursor-pointer ${
                        selectedSlot.constraints?.locked
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {selectedSlot.constraints?.locked ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" /> 고정 틀 잠금됨
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-slate-500 shrink-0" /> 가변 슬롯 (편집 가능)
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setComposerOpenSlotId((prev) =>
                          prev === selectedSlot.slotId
                            ? null
                            : selectedSlot.slotId
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      슬롯에 AI 호출
                    </button>
                  </div>
                </div>

                {/* 2. Bound Backdata Chunks for This Slot (`GSV-B3`) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-600" />이 슬롯에 연결된 백데이터 ({selectedSlotChunks.length}건)
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAddBackdataForm((prev) => !prev)
                      }
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      + 새 백데이터 추가
                    </button>
                  </div>

                  {showAddBackdataForm && (
                    <form
                      onSubmit={handleAddBackdataChunk}
                      className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2"
                    >
                      <div className="text-[11px] font-bold text-indigo-950">
                        새 원천 자료(녹취록·MD·메모) 조각 등록
                      </div>
                      <input
                        type="text"
                        value={newBackdataTitle}
                        onChange={(e) => setNewBackdataTitle(e.target.value)}
                        placeholder="출처 파일명 (예: 10월_임원회의_녹취록.md)"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs outline-none"
                      />
                      <textarea
                        rows={3}
                        value={newBackdataExcerpt}
                        onChange={(e) => setNewBackdataExcerpt(e.target.value)}
                        placeholder="이 슬롯의 근거가 되는 원문 발췌 내용을 붙여넣으세요..."
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs outline-none select-text"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowAddBackdataForm(false)}
                          className="px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-white cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          등록 및 현재 슬롯에 바인딩
                        </button>
                      </div>
                    </form>
                  )}

                  {selectedSlotChunks.length > 0 ? (
                    <div className="space-y-2">
                      {selectedSlotChunks.map((chunk) => (
                        <div
                          key={chunk.chunkId}
                          className="p-3 rounded-xl bg-indigo-50/40 border border-indigo-200/80 space-y-1.5 select-text"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-indigo-950 truncate">
                              📄 {chunk.sourceTitle}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold uppercase">
                              {chunk.sourceType}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {chunk.excerpt}
                          </p>
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            {chunk.tags.map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded bg-white border border-indigo-100 text-[10px] text-indigo-600"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                      연결된 백데이터가 없습니다. 아래 전체 백데이터 보관함에서 클릭해 바인딩하세요.
                    </div>
                  )}
                </div>

                {/* 3. All Document Backdata Pool (1-Click Bind / Unbind) */}
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-slate-700">
                    📚 문서 전체 백데이터 풀 (클릭하여 현재 슬롯에 연결/해제)
                  </h4>
                  <div className="space-y-1.5">
                    {Object.values(doc.backdata).map((chunk) => {
                      const isBound = selectedSlot.backDataRefs.includes(
                        chunk.chunkId
                      );
                      return (
                        <button
                          key={chunk.chunkId}
                          type="button"
                          onClick={() =>
                            handleToggleBackdataRef(
                              selectedSlot.slotId,
                              chunk.chunkId
                            )
                          }
                          className={`w-full text-left p-2.5 rounded-lg border text-xs transition cursor-pointer ${
                            isBound
                              ? "border-indigo-400 bg-indigo-50/60 text-indigo-950"
                              : "border-slate-200 hover:bg-slate-50 text-slate-600"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 font-semibold">
                            <span className="truncate">{chunk.sourceTitle}</span>
                            <span
                              className={`shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded ${
                                isBound
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {isBound ? "✓ 연결됨" : "+ 연결"}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                            {chunk.excerpt}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">
                중앙 캔버스에서 슬롯을 클릭하면 해당 슬롯의 백데이터와 제약 설정이 즉시 표시됩니다.
              </div>
            )}
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setRightSidebarOpen(true)}
            className="absolute right-3 top-3 z-20 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
            title="우측 Slot Inspector & 백데이터 서랍 열기"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

