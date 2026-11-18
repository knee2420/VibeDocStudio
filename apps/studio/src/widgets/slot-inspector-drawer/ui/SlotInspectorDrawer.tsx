import React from "react";
import { ChevronRight, FolderTree, Settings, Sliders, Sparkles } from "lucide-react";

import { findBlock, type ImageBlockDef } from "@vibe/vdoc-schema";

import { SlotMetadataCard, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { RIGHT_SIDEBAR_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { StudioAgentSettingsButton } from "@/features/agent-settings";
import { AiComposerView } from "@/features/ai-composer";
import { SlotBackdataSection } from "@/features/bind-slot-backdata";
import { RevisionTimeline } from "@/features/document-revisions";
import { runFillSlot } from "@/features/fill-slots";
import { SlotPlainTextEditorCard, SlotTypographyCard, useSlotContentActions } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail } from "@/shared/ui";
import { ResourceManagerWidget } from "@/widgets/resource-manager";

import { ImageInspectorCard } from "./ImageInspectorCard";


/** 우측 작업 패널: AI Composer(기본) · 인스펙터 · 리소스 매니저. */
export const SlotInspectorDrawer: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const toggleComposerForSlot = useSlotSelectionStore((s) => s.toggleComposerForSlot);
  const rightSidebarOpen = useWorkspaceLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);
  const rightSidebarWidth = useWorkspaceLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useWorkspaceLayoutStore((s) => s.setRightSidebarWidth);
  const resetRightSidebarWidth = useWorkspaceLayoutStore((s) => s.resetRightSidebarWidth);
  const viewMode = useWorkspaceLayoutStore((s) => s.rightPanelTab);
  const setViewMode = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const rmPlacement = useWorkspaceLayoutStore((s) => s.rmPlacement);

  const { isResizing, onResizeStart } = useDragResize({
    axis: "x-left",
    size: rightSidebarWidth,
    onResize: setRightSidebarWidth,
  });

  const { toggleSlotLock } = useSlotContentActions();
  const { updateBlock, deleteBlock } = useMutateCanvasBlocks();
  const { isAiStreaming } = useStageAiChanges();

  // Composer 는 받는 값이 없으니 한 번 만든 그대로 쓴다 — 패널 열고 닫기 · 글자 입력으로 이 패널이 다시 그려질 때
  // 대화 기록 전체가 따라 다시 그려지지 않게.
  const composerView = React.useMemo(
    () => (
      <AiComposerView
        headerActions={
          <StudioAgentSettingsButton className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer inline-flex">
            <Settings className="w-4 h-4" />
          </StudioAgentSettingsButton>
        }
      />
    ),
    [],
  );

  if (!doc) return null;

  const selectedSlot = selectedSlotId ? doc.slots[selectedSlotId] : undefined;
  const selectedBlock = selectedBlockId ? findBlock(doc, selectedBlockId) : null;

  // 접어도 패널은 그대로 두고 숨기기만 한다 — 펼 때마다 Composer 대화 · 탭 내용을 처음부터 다시 그리지 않게.
  return (
    <>
    {!rightSidebarOpen && (
      <CollapsedPanelRail
        side="right"
        label="AI Composer · 작업 도구"
        badgeCount={Object.keys(doc.backdata).length}
        tone="purple"
        onExpand={() => setRightSidebarOpen(true)}
        testId="right-sidebar-collapsed-rail"
      />
    )}
    <aside
      data-testid={rightSidebarOpen ? "slot-inspector-drawer" : undefined}
      aria-hidden={!rightSidebarOpen || undefined}
      style={{ width: `${rightSidebarWidth}px` }}
      className={`bg-white border-l border-[#e6e6e6] ${rightSidebarOpen ? "flex" : "hidden"} flex-col shrink-0 select-none relative z-10 min-h-0 ${
        isResizing ? "transition-none" : "transition-[width] duration-75"
      }`}
    >
      <div
        data-testid="right-sidebar-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetRightSidebarWidth}
        title={`드래그하여 너비 조절 · 더블클릭 시 기본 너비(${RIGHT_SIDEBAR_WIDTH.default}px) 복원`}
        className="absolute -left-1 top-0 bottom-0 w-2 hover:w-2.5 cursor-col-resize hover:bg-slate-400/40 active:bg-slate-500/60 transition-all z-30"
      />

      {/* 피그마 디자인 패널 머리처럼 글자 탭 (기능 · 탭 구성은 그대로) */}
      <div className="fig-panel h-10 pl-2 pr-2 border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
        <div role="tablist" className="flex items-center">
          <button
            type="button"
            role="tab"
            data-testid="tab-view-composer"
            aria-selected={viewMode === "composer"}
            onClick={() => setViewMode("composer")}
            className="fig-tab gap-1"
          >
            <Sparkles className="w-3 h-3" />
            AI Composer
          </button>
          {rmPlacement !== "between-split" && (
            <button
              type="button"
              role="tab"
              data-testid="tab-view-resource-manager"
              aria-selected={viewMode === "resource-manager"}
              onClick={() => setViewMode("resource-manager")}
              className="fig-tab gap-1"
            >
              <FolderTree className="w-3 h-3" />
              리소스
            </button>
          )}
          <button
            type="button"
            role="tab"
            data-testid="tab-view-inspector"
            aria-selected={viewMode === "inspector"}
            onClick={() => setViewMode("inspector")}
            className="fig-tab gap-1"
          >
            <Sliders className="w-3 h-3" />
            인스펙터
            {selectedSlot && <span className="w-1.5 h-1.5 rounded-full bg-[#0d99ff]" title="선택한 슬롯이 있습니다" />}
          </button>
        </div>

        <button
          type="button"
          data-testid="collapse-right-sidebar-btn"
          onClick={() => setRightSidebarOpen(false)}
          className="fig-icon-btn"
          title="우측 패널 접기"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {viewMode === "composer" && (
        <div className="flex-1 min-h-0">{composerView}</div>
      )}

      {viewMode === "resource-manager" && rmPlacement !== "between-split" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ResourceManagerWidget />
        </div>
      )}

      {viewMode === "inspector" &&
        (selectedSlot || selectedBlock ? (
          <div className="fig-panel flex-1 overflow-y-auto" data-testid="figma-inspector">
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
                <SlotMetadataCard slot={selectedSlot} onToggleLock={toggleSlotLock} onToggleComposer={toggleComposerForSlot} />

                <div className="fig-dsec" data-testid="slot-fill-section">
                  <div className="fig-dsec-head">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[#9747ff]" />
                      근거로 채우기
                      <span className="fig-mono font-normal text-black/40">fill.slot</span>
                    </span>
                  </div>
                  <p className="fig-desc">
                    이 칸의 근거(연결된 자료 · 이웃 칸 근거 · RM 고정 자료 · 열린 참조 문서, 부족하면 지식 덱 추천)만으로 쓰고,
                    문장마다 출처를 답니다. 결과는 캔버스 자리에서 diff 로 검토합니다.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="ground-cite-btn"
                      disabled={isAiStreaming || !selectedSlot.content.trim()}
                      onClick={() => void runFillSlot(selectedSlot.slotId, { harnessId: "ground.cite", docId: doc.docId })}
                      className="fig-btn"
                      title="본문은 그대로 두고, 근거가 있는 문장에 출처 표식만 붙인다"
                    >
                      출처 달기
                    </button>
                    <button
                      type="button"
                      data-testid="stage-slot-ai-draft-btn"
                      disabled={isAiStreaming}
                      onClick={() => void runFillSlot(selectedSlot.slotId, { docId: doc.docId })}
                      className="fig-btn fig-btn-primary"
                    >
                      {isAiStreaming ? "AI 작성 중…" : "근거로 채우기"}
                    </button>
                  </div>
                </div>

                <SlotTypographyCard slot={selectedSlot} />
                <SlotPlainTextEditorCard key={selectedSlot.slotId} slot={selectedSlot} />
                <SlotBackdataSection doc={doc} slot={selectedSlot} />
                <div className="fig-dsec !border-b-0 pt-3">
                  <RevisionTimeline docId={doc.docId} slotId={selectedSlot.slotId} limit={10} title="이 칸의 기록 (누가 썼나)" />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="fig-panel flex-1 flex flex-col items-center justify-center px-8 text-center">
            <Sliders className="w-5 h-5 text-black/30 mb-2" />
            <p className="font-semibold">선택한 슬롯 · 블록이 없습니다</p>
            <p className="fig-desc mt-1 max-w-[240px]">
              캔버스에서 슬롯이나 블록을 클릭하면 텍스트 서식 · 내용 · 백데이터가 여기에 표시됩니다.
            </p>
          </div>
        ))}
    </aside>
    </>
  );
};
