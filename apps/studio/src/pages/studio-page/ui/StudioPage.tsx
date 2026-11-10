import React from "react";

import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useComposerDocBinding } from "@/features/ai-composer";
import { AiAttachLayer, registerWorkspaceAi, useAiScopeLiveSync } from "@/features/ai-workspace";
import { registerCitationNavigation, registerEvidenceFocusAi, useEvidenceFocusSync, useEvidenceStaleCheck } from "@/features/evidence-focus";
import { GlobalUndoToastHost, useGlobalStudioShortcuts } from "@/features/command-bus";
import { registerSlotAiActions } from "@/features/compose-slot-ai";
import { DeckCardPreview, registerKnowledgeDeckAi, useKnowledgeDeckBootstrap } from "@/features/knowledge-deck-ai";
import { SlotFormattingSubToolbar } from "@/features/edit-slot-richtext";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
import { usePdfScaffoldSync } from "@/features/mutate-document-pages";
import { HoverPagePeekCard } from "@/features/peek-page";
import { useWorkspaceBootstrap, useWorkspaceUrlSync } from "@/features/workspace-persistence";
import { useZoomHierarchySync } from "@/features/zoom-hierarchy";
import { DocumentPreviewPanel, OutlinePreviewSidebar } from "@/widgets/outline-preview-sidebar";
import { ResourceManagerSplitViewport, ResourcePreviewHost } from "@/widgets/resource-manager";
import { SlotInspectorDrawer } from "@/widgets/slot-inspector-drawer";
import { StudioActivityBar } from "@/widgets/studio-activity-bar";
import { StudioTopRibbon } from "@/widgets/studio-top-ribbon";
import { VDocPageCanvas } from "@/widgets/vdoc-page-canvas";

/** 전역 부작용(URL · 단축키 · 줌 위계)은 여기서 한 번씩만 건다. */
const StudioWorkspace: React.FC = () => {
  const blocks = useMutateCanvasBlocks();
  useWorkspaceUrlSync();
  useGlobalStudioShortcuts({
    onCopySelectedBlock: blocks.copySelectedBlock,
    onPasteBlock: () => blocks.pasteBlock(),
    onDeleteSelectedBlock: blocks.deleteSelectedBlock,
  });
  useZoomHierarchySync();
  usePdfScaffoldSync();
  useKnowledgeDeckBootstrap();
  useEvidenceFocusSync();
  useEvidenceStaleCheck();
  useComposerDocBinding();
  useAiScopeLiveSync();
  // AI 런타임 확장 지점: 기능마다 도구 · 컨텍스트 · 액션을 등록한다 (Composer · 인라인 공용).
  React.useEffect(() => {
    const offs = [registerWorkspaceAi(), registerSlotAiActions(), registerKnowledgeDeckAi(), registerCitationNavigation(), registerEvidenceFocusAi()];
    return () => offs.forEach((off) => off());
  }, []);

  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f5f7] text-slate-900 overflow-hidden select-none">
      <StudioTopRibbon />

      <div className="flex-1 flex overflow-hidden relative">
        <StudioActivityBar />
        <DocumentPreviewPanel />

        {/* 중앙 에디터 작업 공간: 상단 서식 툴바 + (좌측 아웃라이너 | 중앙 캔버스) */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {currentPhase === "drafting" && (
            <SlotFormattingSubToolbar onTableCommand={blocks.runTableCommand} />
          )}

          <div className="flex-1 flex overflow-hidden relative">
            <OutlinePreviewSidebar />
            <VDocPageCanvas />
          </div>
        </div>

        {/* 에디터 캔버스와 Composer 사이에 도킹되는 원문 뷰어 스플릿 패널 */}
        <DeckCardPreview />

        {/* 에디터 우측에 도킹되는 독립 Resource Manager 스플릿 패널 */}
        <ResourceManagerSplitViewport />

        <SlotInspectorDrawer />
      </div>

      <GlobalUndoToastHost />
      <HoverPagePeekCard />
      <AiAttachLayer />
      <ResourcePreviewHost />
    </div>
  );
};

/** 서버(원장)에서 작업 공간을 불러온 뒤에만 스튜디오를 그린다. */
export const StudioPage: React.FC = () => {
  const { status, error, retry } = useWorkspaceBootstrap();

  if (status === "ready") return <StudioWorkspace />;

  return (
    <div
      data-testid="workspace-boot-screen"
      className="h-screen w-screen flex items-center justify-center bg-[#f4f5f7] text-slate-700"
    >
      {status === "loading" ? (
        <p className="text-sm font-medium">작업 공간을 불러오는 중…</p>
      ) : (
        <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
          <p className="text-sm font-semibold text-rose-700">작업 공간을 불러오지 못했습니다.</p>
          <p className="text-xs text-slate-500 break-all">{error}</p>
          <p className="text-xs text-slate-500">API 서버(`pnpm dev:api`, 포트 8090)가 켜져 있는지 확인하세요.</p>
          <button
            type="button"
            onClick={retry}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
};
