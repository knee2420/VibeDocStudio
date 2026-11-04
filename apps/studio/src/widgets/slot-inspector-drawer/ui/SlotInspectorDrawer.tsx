import React, { useState } from "react";
import { Boxes, ChevronRight, Sliders, Sparkles, Wrench } from "lucide-react";

import { findBlock, type ImageBlockDef } from "@vibe/vdoc-schema";

import { SlotMetadataCard, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { SlotBackdataSection } from "@/features/bind-slot-backdata";
import { SlotPlainTextEditorCard, SlotTypographyCard, useSlotContentActions } from "@/features/edit-slot-richtext";
import { BlockInsertionPalette, useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { CollapsedPanelRail } from "@/shared/ui";

import { ImageInspectorCard } from "./ImageInspectorCard";

type RightSidebarViewMode = "blockbox" | "inspector";

const BLOCK_GUIDE = [
  ["텍스트 섹션", "제목과 본문 슬롯이 결합된 기본 문서 블록"],
  ["구조화 표", "다단 헤더와 데이터 행을 자유롭게 추가하는 표"],
  ["2단 그리드", "5:5 비율로 좌우 정보를 나란히 배치하는 그리드"],
  ["할당형 필드", "서명, 날인, 결재, 상태 체크를 위한 전용 슬롯"],
] as const;

const tabClass = (active: boolean, activeTone: string) =>
  `px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
    active ? `bg-white ${activeTone} shadow-2xs font-bold` : "text-slate-500 hover:text-slate-700"
  }`;

/** 우측 작업 도구: 블록 박스(끼워 넣기)와 선택한 슬롯 · 블록의 속성 인스펙터. */
export const SlotInspectorDrawer: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const rightSidebarOpen = useWorkspaceLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);

  const { toggleSlotLock } = useSlotContentActions();
  const { updateBlock, deleteBlock } = useMutateCanvasBlocks();
  const { stageSlotAiDraft, isAiStreaming } = useStageAiChanges();

  // 사용자가 탭을 직접 고르기 전에는 선택이 있으면 인스펙터, 없으면 블록 박스를 보여준다.
  const [userTab, setUserTab] = useState<RightSidebarViewMode | null>(null);
  const viewMode: RightSidebarViewMode = userTab ?? (selectedSlotId || selectedBlockId ? "inspector" : "blockbox");

  if (!doc) return null;

  const selectedSlot = selectedSlotId ? doc.slots[selectedSlotId] : undefined;
  const selectedBlock = selectedBlockId ? findBlock(doc, selectedBlockId) : null;

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
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-semibold">
          <button
            type="button"
            data-testid="tab-view-blockbox"
            onClick={() => setUserTab("blockbox")}
            className={tabClass(viewMode === "blockbox", "text-emerald-900")}
          >
            <Boxes className="w-3.5 h-3.5 text-emerald-600" />
            <span>블록 박스 (BlockBox)</span>
          </button>
          <button
            type="button"
            data-testid="tab-view-inspector"
            onClick={() => setUserTab("inspector")}
            className={tabClass(viewMode === "inspector", "text-blue-900")}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>속성 인스펙터</span>
            {selectedSlot && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />}
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

      {viewMode === "blockbox" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                작업 도구함 (Toolbox)
              </span>
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[170px]">{doc.title}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">블록 박스 (BlockBox)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              원하는 블록을 캔버스 위로 직접 <strong>끌어다 놓거나(Drag & Drop)</strong>, 클릭하여 현재 페이지 끝에 추가하세요.
            </p>
          </div>

          <BlockInsertionPalette targetPageId={activePageId || doc.pages[0]?.pageId || ""} showHeader={false} />

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-500" />
              <span>블록 도구 가이드</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-500 leading-normal">
              {BLOCK_GUIDE.map(([name, desc]) => (
                <li key={name}>
                  <strong className="text-slate-700">{name}</strong>: {desc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {viewMode === "inspector" &&
        (selectedSlot || selectedBlock ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {selectedBlock?.block.kind === "image" && (
              <ImageInspectorCard
                key={selectedBlock.block.blockId}
                pageId={selectedBlock.pageId}
                block={selectedBlock.block as ImageBlockDef}
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
                      AI 슬롯 초안 스테이징
                    </span>
                    <button
                      type="button"
                      data-testid="stage-slot-ai-draft-btn"
                      disabled={isAiStreaming}
                      onClick={() => void stageSlotAiDraft(doc, selectedSlot)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-wait"
                    >
                      {isAiStreaming ? "AI 작성 중…" : "+ AI 초안 생성"}
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-800">
                    연결된 백데이터로 AI 초안을 만들어, 본문을 바로 덮어쓰지 않고 하단 Staged 대기열에 올립니다.
                  </p>
                </div>

                <SlotMetadataCard slot={selectedSlot} onToggleLock={toggleSlotLock} onToggleComposer={toggleComposerForSlot} />
                <SlotTypographyCard slot={selectedSlot} />
                <SlotPlainTextEditorCard key={selectedSlot.slotId} slot={selectedSlot} />
                <SlotBackdataSection doc={doc} slot={selectedSlot} />
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Sliders className="w-6 h-6" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 mb-1">선택된 슬롯 또는 블록이 없습니다</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed max-w-[240px] mb-4">
              중앙 캔버스에서 편집할 슬롯이나 블록을 클릭하면 타이포그래피 제약 및 백데이터 서랍이 표시됩니다.
            </p>
            <button
              type="button"
              onClick={() => setUserTab("blockbox")}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>블록 박스 (BlockBox) 열기</span>
            </button>
          </div>
        ))}
    </aside>
  );
};
