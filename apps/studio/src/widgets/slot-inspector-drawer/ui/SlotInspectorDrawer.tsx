import React, { useState } from "react";
import {
  ChevronRight,
  Paperclip,
  Edit3,
  RotateCcw,
  Sparkles,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Boxes,
  Sliders,
  Wrench,
} from "lucide-react";

import type {
  BackdataChunk,
  ImageBlockDef,
  SlotConstraints,
  VDocSlot,
} from "@vibe/vdoc-schema";

import { BackdataChunkCard } from "@/entities/backdata-chunk";
import { SlotMetadataCard, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  AddBackdataChunkForm,
  useBindSlotBackdata,
} from "@/features/bind-slot-backdata";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import {
  BlockInsertionPalette,
  useMutateCanvasBlocks,
} from "@/features/mutate-canvas-blocks";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { CollapsedPanelRail } from "@/shared/ui";

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

export type RightSidebarViewMode = "blockbox" | "inspector";

export const SlotInspectorDrawer: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);

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

  const [userTab, setUserTab] = useState<RightSidebarViewMode | null>(null);
  const viewMode: RightSidebarViewMode =
    userTab ?? (selectedSlotId || selectedBlockId ? "inspector" : "blockbox");

  const setViewMode = (mode: RightSidebarViewMode) => {
    setUserTab(mode);
  };

  const {
    toggleSlotLock,
    updateSlotContent,
    resetSlotEdit,
    updateSlotConstraints,
  } = useSlotContentActions();
  const { toggleBackdataRef } = useBindSlotBackdata();
  const { updateBlock, deleteBlock } = useMutateCanvasBlocks();
  const { stageSlotHtmlDiff } = useStageAiChanges();


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
      <CollapsedPanelRail
        side="right"
        label="작업 도구 (BlockBox & Inspector)"
        badgeCount={Object.keys(doc.backdata).length}
        onExpand={() => setRightSidebarOpen(true)}
        testId="right-sidebar-collapsed-rail"
      />
    );
  }

  return (
    <aside
      data-testid="slot-inspector-drawer"
      className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 select-none"
    >
      {/* Top Header - View Mode Selector Tabs (Toolbox vs Inspector) */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-semibold">
          <button
            type="button"
            data-testid="tab-view-blockbox"
            onClick={() => setViewMode("blockbox")}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "blockbox"
                ? "bg-white text-emerald-900 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-emerald-600" />
            <span>블록 박스 (BlockBox)</span>
          </button>

          <button
            type="button"
            data-testid="tab-view-inspector"
            onClick={() => setViewMode("inspector")}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "inspector"
                ? "bg-white text-blue-900 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>속성 인스펙터</span>
            {selectedSlot && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />
            )}
          </button>
        </div>

        <button
          type="button"
          data-testid="collapse-right-sidebar-btn"
          onClick={() => setRightSidebarOpen(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer ml-1"
          title="우측 패널 접기"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mode 1: BlockBox (Toolbox View) */}
      {viewMode === "blockbox" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                작업 도구함 (Toolbox)
              </span>
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[170px]">
                {doc.title}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              블록 박스 (BlockBox)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              원하는 블록을 캔버스 위로 직접 <strong>끌어다 놓거나(Drag & Drop)</strong>, 클릭하여 현재 페이지 끝에 추가하세요.
            </p>
          </div>

          <BlockInsertionPalette
            targetPageId={activePageId || doc.pages[0]?.pageId || ""}
            showHeader={false}
          />

          {/* 블록 조판 안내 팁 카드 */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-500" />
              <span>블록 도구 가이드</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-500 leading-normal">
              <li>
                <strong className="text-slate-700">텍스트 섹션</strong>: 제목과 본문 슬롯이 결합된 기본 문서 블록
              </li>
              <li>
                <strong className="text-slate-700">구조화 표</strong>: 다단 헤더와 데이터 행을 자유롭게 추가하는 표
              </li>
              <li>
                <strong className="text-slate-700">2단 그리드</strong>: 5:5 비율로 좌우 정보를 나란히 배치하는 그리드
              </li>
              <li>
                <strong className="text-slate-700">할당형 필드</strong>: 서명, 날인, 결재, 상태 체크를 위한 전용 슬롯
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Mode 2: Inspector (Properties View) */}
      {viewMode === "inspector" && (
        <>
          {selectedSlot || selectedBlockInfo ? (
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
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    인메모리 AI 슬롯 초안 스테이징
                  </span>
                  <button
                    type="button"
                    data-testid="stage-slot-ai-draft-btn"
                    onClick={() =>
                      stageSlotHtmlDiff({
                        slotId: selectedSlot.slotId,
                        slotLabel: selectedSlot.label,
                        beforeHtml: selectedSlot.content,
                        afterHtml: `<p><strong>[✨ AI 근거 기반 정밀 초안]</strong> ${
                          selectedSlotChunks[0]?.excerpt ||
                          "참조 레퍼런스 및 연결된 백데이터를 종합하여 작성된 표준 조항입니다."
                        }</p>`,
                        sourceRefIds: selectedSlot.backDataRefs,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shadow-2xs"
                  >
                    + Staged Diff 생성
                  </button>
                </div>
                <p className="text-[10px] text-amber-800">
                  본문을 즉시 덮어쓰지 않고 하단 Staged 대기열에 올려 [수락/폐기]를 거칩니다.
                </p>
              </div>

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
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Sliders className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-slate-800 mb-1">
            선택된 슬롯 또는 블록이 없습니다
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-[240px] mb-4">
            중앙 캔버스에서 편집할 슬롯이나 블록을 클릭하면 타이포그래피 제약 및 백데이터 서랍이 표시됩니다.
          </p>
          <button
            type="button"
            onClick={() => setViewMode("blockbox")}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>블록 박스 (BlockBox) 열기</span>
          </button>
        </div>
      )}
    </>
  )}
    </aside>
  );
};
