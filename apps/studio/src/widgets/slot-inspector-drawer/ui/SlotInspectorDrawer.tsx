import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Edit3,
  RotateCcw,
  Sparkles,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

import type { BackdataChunk, SlotConstraints, VDocSlot } from "@vibe/vdoc-schema";

import { BackdataChunkCard } from "@/entities/backdata-chunk";
import { SlotMetadataCard, useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  AddBackdataChunkForm,
  useBindSlotBackdata,
} from "@/features/bind-slot-backdata";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import type { ImageBlockDef } from "@vibe/vdoc-schema";
import { ImageInspectorCard } from "./ImageInspectorCard";

interface SlotTypographyCardProps {
  slot: VDocSlot;
  onUpdateConstraints: (
    slotId: string,
    constraints: Partial<SlotConstraints>
  ) => void;
}

const SlotTypographyCard: React.FC<SlotTypographyCardProps> = ({
  slot,
  onUpdateConstraints,
}) => {
  const currentFontSize = slot.constraints?.fontSize || "13px";
  const currentLineHeight = slot.constraints?.lineHeight || "1.35";
  const currentAlign = slot.constraints?.align || "left";
  const currentColor = slot.constraints?.color || "#383838";
  const currentWeight = slot.constraints?.fontWeight || "normal";

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-blue-600" />
          타이포그래피 및 스타일 제약
        </h4>
        <span className="text-[10px] text-slate-400 font-mono">
          {currentFontSize} / {currentLineHeight}
        </span>
      </div>

      {/* Font Size */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-600 flex items-center justify-between">
          <span>글자 크기 (Font Size)</span>
          <span className="text-slate-400 font-mono text-[10px]">
            {currentFontSize}
          </span>
        </label>
        <div className="flex flex-wrap gap-1">
          {["9pt", "10pt", "12.5px", "14px", "18px", "22px", "26px"].map(
            (sz) => (
              <button
                key={sz}
                type="button"
                onClick={() =>
                  onUpdateConstraints(slot.slotId, { fontSize: sz })
                }
                className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition ${
                  currentFontSize === sz
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {sz}
              </button>
            )
          )}
        </div>
      </div>

      {/* Line Height */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-600 flex items-center justify-between">
          <span>줄간격 / 행간 (Line Height)</span>
          <span className="text-slate-400 font-mono text-[10px]">
            {currentLineHeight}
          </span>
        </label>
        <div className="flex gap-1">
          {[
            { label: "1.0", val: "1.0" },
            { label: "1.2", val: "1.2" },
            { label: "1.35", val: "1.35" },
            { label: "1.5", val: "1.5" },
            { label: "1.75", val: "1.75" },
          ].map((lh) => (
            <button
              key={lh.val}
              type="button"
              onClick={() =>
                onUpdateConstraints(slot.slotId, { lineHeight: lh.val })
              }
              className={`flex-1 py-0.5 rounded text-[11px] font-medium border text-center cursor-pointer transition ${
                currentLineHeight === lh.val
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {lh.label}
            </button>
          ))}
        </div>
      </div>

      {/* Align & Font Weight */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
        <div>
          <label className="text-[11px] font-medium text-slate-600 block mb-1">
            정렬
          </label>
          <div className="flex rounded border border-slate-200 bg-white overflow-hidden">
            {[
              { id: "left", icon: AlignLeft },
              { id: "center", icon: AlignCenter },
              { id: "right", icon: AlignRight },
            ].map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  onUpdateConstraints(slot.slotId, {
                    align: id as "left" | "center" | "right",
                  })
                }
                className={`flex-1 p-1 flex items-center justify-center cursor-pointer transition ${
                  currentAlign === id
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-600 block mb-1">
            굵기 (Weight)
          </label>
          <select
            value={currentWeight}
            onChange={(e) =>
              onUpdateConstraints(slot.slotId, { fontWeight: e.target.value })
            }
            className="w-full text-xs bg-white border border-slate-200 rounded p-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="normal">Normal (400)</option>
            <option value="500">Medium (500)</option>
            <option value="600">Semibold (600)</option>
            <option value="700">Bold (700)</option>
          </select>
        </div>
      </div>

      {/* Color Presets */}
      <div className="pt-1 border-t border-slate-200/80">
        <label className="text-[11px] font-medium text-slate-600 block mb-1">
          텍스트 색상 (Color)
        </label>
        <div className="flex items-center gap-1.5">
          {[
            { label: "블랙", val: "#0f172a", bg: "bg-slate-900" },
            { label: "다크그레이", val: "#383838", bg: "bg-neutral-700" },
            { label: "인보이스 블루", val: "#336699", bg: "bg-[#336699]" },
            { label: "뮤트", val: "#64748b", bg: "bg-slate-500" },
            { label: "에메랄드", val: "#047857", bg: "bg-emerald-700" },
          ].map((c) => (
            <button
              key={c.val}
              type="button"
              onClick={() => onUpdateConstraints(slot.slotId, { color: c.val })}
              title={`${c.label} (${c.val})`}
              className={`w-4 h-4 rounded-full ${c.bg} cursor-pointer transition hover:scale-125 ${
                currentColor === c.val ? "ring-2 ring-blue-500 ring-offset-1" : ""
              }`}
            />
          ))}
          <input
            type="text"
            value={currentColor}
            onChange={(e) =>
              onUpdateConstraints(slot.slotId, { color: e.target.value })
            }
            className="ml-auto w-20 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
};

interface SlotLiveEditorCardProps {
  slot: VDocSlot;
  onUpdateContent: (slotId: string, html: string) => void;
  onResetEdit: (slotId: string) => void;
  onOpenComposer: (slotId: string) => void;
}

const SlotLiveEditorCard: React.FC<SlotLiveEditorCardProps> = ({
  slot,
  onUpdateContent,
  onResetEdit,
  onOpenComposer,
}) => {
  const [prevSlotId, setPrevSlotId] = useState(slot.slotId);
  const [localText, setLocalText] = useState(() =>
    slot.content.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim()
  );

  if (slot.slotId !== prevSlotId) {
    setPrevSlotId(slot.slotId);
    setLocalText(
      slot.content.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim()
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    setLocalText(nextVal);
    onUpdateContent(slot.slotId, `<p>${nextVal.replace(/\n/g, "<br/>")}</p>`);
  };

  const isLocked = Boolean(slot.constraints?.locked);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
          슬롯 본문 실시간 편집
        </h4>
        <div className="flex items-center gap-1.5">
          {slot.isEdited && (
            <button
              type="button"
              onClick={() => onResetEdit(slot.slotId)}
              className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
              title="원천 조판 서식으로 복원"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              원문 복원
            </button>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
            🟢 실시간 동기화
          </span>
        </div>
      </div>

      <textarea
        rows={5}
        value={localText}
        onChange={handleChange}
        disabled={isLocked}
        placeholder="슬롯 내용을 입력하세요..."
        className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
      />

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>
          글자 수: <strong className="text-slate-700">{localText.length}</strong>자
        </span>
        <button
          type="button"
          onClick={() => onOpenComposer(slot.slotId)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          AI 컴포저 호출 (Ctrl+K)
        </button>
      </div>
    </div>
  );
};

export const SlotInspectorDrawer: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const rightSidebarOpen = useSlotSelectionStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );
  const showAddBackdataForm = useSlotSelectionStore(
    (s) => s.showAddBackdataForm
  );
  const setShowAddBackdataForm = useSlotSelectionStore(
    (s) => s.setShowAddBackdataForm
  );
  const toggleComposerForSlot = useSlotSelectionStore(
    (s) => s.toggleComposerForSlot
  );

  const {
    toggleSlotLock,
    updateSlotContent,
    resetSlotEdit,
    updateSlotConstraints,
  } = useSlotContentActions();
  const { toggleBackdataRef } = useBindSlotBackdata();
  const { updateBlock, deleteBlock } = useMutateCanvasBlocks();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];

  const selectedBlockInfo = React.useMemo(() => {
    if (!doc || !selectedBlockId) return null;
    for (const page of doc.pages) {
      const blk = page.blocks.find((b) => b.blockId === selectedBlockId);
      if (blk) return { pageId: page.pageId, block: blk };
    }
    return null;
  }, [doc, selectedBlockId]);

  if (!doc) return null;

  const selectedSlot: VDocSlot | undefined = selectedSlotId
    ? doc.slots[selectedSlotId]
    : undefined;
  const selectedSlotChunks: BackdataChunk[] = (
    selectedSlot?.backDataRefs || []
  )
    .map((id) => doc.backdata[id])
    .filter(Boolean);

  if (!rightSidebarOpen) {
    return (
      <button
        type="button"
        onClick={() => setRightSidebarOpen(true)}
        className="absolute right-3 top-3 z-20 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
        title="우측 Slot Inspector & 백데이터 서랍 열기"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    );
  }

  return (
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

      {(selectedSlot || selectedBlockInfo) ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {selectedBlockInfo && selectedBlockInfo.block.kind === "image" && (
            <ImageInspectorCard
              key={selectedBlockInfo.block.blockId}
              pageId={selectedBlockInfo.pageId}
              block={selectedBlockInfo.block as ImageBlockDef}
              onUpdateBlock={updateBlock}
              onDeleteBlock={deleteBlock}
            />
          )}

          {selectedSlot && (
            <>
              <SlotMetadataCard
            slot={selectedSlot}
            onToggleLock={toggleSlotLock}
            onToggleComposer={toggleComposerForSlot}
          />

          <SlotTypographyCard
            key={`typo-${selectedSlot.slotId}`}
            slot={selectedSlot}
            onUpdateConstraints={updateSlotConstraints}
          />

          <SlotLiveEditorCard
            key={selectedSlot.slotId}
            slot={selectedSlot}
            onUpdateContent={updateSlotContent}
            onResetEdit={resetSlotEdit}
            onOpenComposer={toggleComposerForSlot}
          />

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-600" />이 슬롯에
                연결된 백데이터 ({selectedSlotChunks.length}건)
              </h4>
              <button
                type="button"
                onClick={() => setShowAddBackdataForm(!showAddBackdataForm)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                + 새 백데이터 추가
              </button>
            </div>

            {showAddBackdataForm && <AddBackdataChunkForm />}

            {selectedSlotChunks.length > 0 ? (
              <div className="space-y-2">
                {selectedSlotChunks.map((chunk) => (
                  <BackdataChunkCard key={chunk.chunkId} chunk={chunk} />
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                연결된 백데이터가 없습니다. 아래 전체 백데이터 보관함에서 클릭해
                바인딩하세요.
              </div>
            )}
          </div>

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
                      toggleBackdataRef(selectedSlot.slotId, chunk.chunkId)
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
            </>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-400">
          중앙 캔버스에서 슬롯을 클릭하면 해당 슬롯의 백데이터와 제약 설정이
          즉시 표시됩니다.
        </div>
      )}
    </aside>
  );
};

