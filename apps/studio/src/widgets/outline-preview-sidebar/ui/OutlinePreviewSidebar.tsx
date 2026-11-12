import React from "react";
import { ChevronLeft } from "lucide-react";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { SIDEBAR_WIDTH, useWorkspaceLayoutStore, type LeftPanelTab } from "@/entities/workspace-layout";
import { useOutlineSelector } from "@/features/zoom-hierarchy";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail } from "@/shared/ui";
import { ReferenceManagerWidget } from "@/widgets/vdoc-page-canvas";

import { FigmaAssetsSidebarPanel } from "./FigmaAssetsSidebarPanel";
import { OutlineExplorer } from "./OutlineExplorer";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";

const TABS: ReadonlyArray<{ id: LeftPanelTab; label: string; testId: string }> = [
  { id: "outliner", label: "Layers", testId: "figma-tab-layers" },
  { id: "assets", label: "Assets", testId: "figma-tab-assets" },
  { id: "reference-manager", label: "Reference", testId: "figma-tab-reference" },
];

/**
 * 좌측 사이드바: 활성 도구 탭에 따라 탐색기(Layers · Assets · Reference) · 변경안 검토 · 템플릿 허브를 보여준다.
 * 탐색기 탭은 레이아웃 스토어(`leftPanelTab`)가 정한다 — AI Composer 의 참조 칩 · 핀 이동이 `reference-manager` 로 연다.
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
  const storedTab = useWorkspaceLayoutStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useWorkspaceLayoutStore((s) => s.setLeftPanelTab);
  const refPlacement = useWorkspaceLayoutStore((s) => s.refPlacement);
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

  // 레퍼런스를 에디터 스플릿으로 띄운 동안에는 탭을 숨기므로 레이어로 돌아간다.
  const tabs = refPlacement === "split" ? TABS.filter((t) => t.id !== "reference-manager") : TABS;
  const activeTab = tabs.some((t) => t.id === storedTab) ? storedTab : "outliner";

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
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="h-10 pl-2 pr-2 border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
            <div role="tablist" className="flex items-center">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  data-testid={tab.testId}
                  onClick={() => setLeftPanelTab(tab.id)}
                  className="fig-tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>

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

          {activeTab === "outliner" ? (
            <OutlineExplorer activeDocId={activeDocId} />
          ) : activeTab === "assets" ? (
            <FigmaAssetsSidebarPanel />
          ) : (
            <ReferenceManagerWidget isSplit={false} />
          )}
        </div>
      )}
    </aside>
  );
};
