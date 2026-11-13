import React from "react";
import { ChevronLeft } from "lucide-react";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { SIDEBAR_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useOutlineSelector } from "@/features/zoom-hierarchy";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail } from "@/shared/ui";
import { ReferenceManagerWidget } from "@/widgets/vdoc-page-canvas";

import { FigmaAssetsSidebarPanel } from "./FigmaAssetsSidebarPanel";
import { OutlineExplorer } from "./OutlineExplorer";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";

/**
 * 좌측 사이드바: 최좌측 액티비티 바 탭(Layers · Source Control · Assets · Reference · Template Hub)에 따라 패널을 전환한다.
 */
export const OutlinePreviewSidebar: React.FC = () => {
  // 문서 객체를 구독하면 타이핑마다 사이드바 전체가 다시 그려진다. ID 만 본다.
  const activeDocId = useStudioDocumentStore((s) => selectActiveDocument(s)?.docId);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const sidebarWidth = useWorkspaceLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceLayoutStore((s) => s.setSidebarWidth);
  const resetSidebarWidth = useWorkspaceLayoutStore((s) => s.resetSidebarWidth);
  const activeActivityTab = useWorkspaceLayoutStore((s) => s.activeActivityTab);
  const { onResizeStart } = useDragResize({ axis: "x", size: sidebarWidth, onResize: setSidebarWidth });
  const visibleNodeCount = useOutlineSelector((p) => p.visibleNodes.length);

  if (!activeDocId) return null;

  if (!leftSidebarOpen) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Documents & Elements"
        badgeCount={visibleNodeCount}
        tone="sky"
        onExpand={() => setLeftSidebarOpen(true)}
        testId="left-sidebar-collapsed-rail"
      />
    );
  }

  return (
    <aside
      data-testid="project-outliner-sidebar"
      style={{ width: `${sidebarWidth}px` }}
      className="fig-panel relative bg-white border-r border-[var(--fig-border)] flex flex-col shrink-0 select-none overflow-hidden"
    >
      <div
        data-testid="sidebar-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetSidebarWidth}
        title={`드래그하여 너비 조절 · 더블클릭 시 기본 너비(${SIDEBAR_WIDTH.default}px) 복원`}
        className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2 cursor-col-resize hover:bg-[#0d99ff]/30 active:bg-[#0d99ff]/50 transition-all z-30"
      />

      {activeActivityTab === "source-control" ? (
        <SourceControlSidebarPanel />
      ) : activeActivityTab === "template-hub" ? (
        <TemplateHubSidebarPanel />
      ) : activeActivityTab === "assets" ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="h-10 pl-3 pr-2 border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-slate-800">Assets</span>
            <button
              type="button"
              data-testid="collapse-left-sidebar-btn"
              onClick={() => setLeftSidebarOpen(false)}
              className="fig-icon-btn"
              title="좌측 패널 접기"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <FigmaAssetsSidebarPanel />
        </div>
      ) : activeActivityTab === "reference" ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="h-10 pl-3 pr-2 border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-slate-800">Reference</span>
            <button
              type="button"
              data-testid="collapse-left-sidebar-btn"
              onClick={() => setLeftSidebarOpen(false)}
              className="fig-icon-btn"
              title="좌측 패널 접기"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <ReferenceManagerWidget isSplit={false} />
        </div>
      ) : (
        <OutlineExplorer activeDocId={activeDocId} />
      )}
    </aside>
  );
};
