import React, { useState } from "react";
import {
  ArrowUpLeft,
  BookOpen,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";

import { PROJECT_ROOT_CRUMB_ID, type OutlinerNode } from "@vibe/vdoc-schema";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { SIDEBAR_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { isEditableOutlineNode, useOutlineNodeEditing } from "@/features/edit-outline";
import { resolvePeekTarget, usePeekTrigger } from "@/features/peek-page";
import { useFractalZoomNavigation } from "@/features/zoom-hierarchy";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail, EmptyStateCard } from "@/shared/ui";

import { OutlineNodeRow, outlineNodeTargetId } from "./OutlineNodeRow";
import { ReferenceDeckSection } from "./ReferenceDeckSection";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";

const headerButton = "p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors";
const menuItem = "w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer";

/** 좌측 사이드바: 활성 도구 탭에 따라 아웃라이너 · 변경안 검토 · 템플릿 허브를 보여준다. */
export const OutlinePreviewSidebar: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const sidebarWidth = useWorkspaceLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceLayoutStore((s) => s.setSidebarWidth);
  const resetSidebarWidth = useWorkspaceLayoutStore((s) => s.resetSidebarWidth);
  const activeActivityTab = useWorkspaceLayoutStore((s) => s.activeActivityTab);
  const { onResizeStart } = useDragResize({ axis: "x", size: sidebarWidth, onResize: setSidebarWidth });
  const { projection } = useFractalZoomNavigation();

  if (!doc) return null;

  if (!leftSidebarOpen) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Outline & References"
        badgeCount={projection.visibleNodes.length}
        onExpand={() => setLeftSidebarOpen(true)}
        testId="left-sidebar-collapsed-rail"
      />
    );
  }

  return (
    <aside
      data-testid="project-outliner-sidebar"
      style={{ width: `${sidebarWidth}px` }}
      className="relative bg-[#fafafa] border-r border-slate-200/90 flex flex-col shrink-0 select-none overflow-hidden transition-[width] duration-75 text-slate-700"
    >
      <div
        data-testid="sidebar-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetSidebarWidth}
        title={`드래그하여 너비 조절 · 더블클릭 시 기본 너비(${SIDEBAR_WIDTH.default}px) 복원`}
        className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2 cursor-col-resize hover:bg-slate-400/40 active:bg-slate-500/60 transition-all z-30"
      />

      {activeActivityTab === "source-control" ? (
        <SourceControlSidebarPanel />
      ) : activeActivityTab === "template-hub" ? (
        <TemplateHubSidebarPanel />
      ) : (
        <>
          <OutlineExplorer activeDocId={doc.docId} />
          <ReferenceDeckSection />
        </>
      )}
    </aside>
  );
};

/** 아웃라이너 본체: 머리말 · 빠른 필터 · 줌아웃 배너 · 노드 트리. */
const OutlineExplorer: React.FC<{ activeDocId: string }> = ({ activeDocId }) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const docs = useStudioDocumentStore((s) => s.docs);
  const setActiveActivityTab = useWorkspaceLayoutStore((s) => s.setActiveActivityTab);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const pagePreviewOpen = useWorkspaceLayoutStore((s) => s.pagePreviewOpen);
  const togglePagePreview = useWorkspaceLayoutStore((s) => s.togglePagePreview);

  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const toggleNodeCollapse = useWorkspaceSessionStore((s) => s.toggleNodeCollapse);
  const collapseAllNodes = useWorkspaceSessionStore((s) => s.collapseAllNodes);
  const expandAllNodes = useWorkspaceSessionStore((s) => s.expandAllNodes);
  const hoveredTargetId = useWorkspaceSessionStore((s) => s.hoveredOutlineTargetId);
  const setHoveredTargetId = useWorkspaceSessionStore((s) => s.setHoveredOutlineTargetId);
  const selectedOutlinerNodeId = useWorkspaceSessionStore((s) => s.selectedOutlinerNodeId);
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const setQuickFilterQuery = useWorkspaceSessionStore((s) => s.setQuickFilterQuery);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);

  const { projection, handleBulletZoomIn, handleSelectOutlineNode, handleBreadcrumbClick, handleZoomOutOneLevel } =
    useFractalZoomNavigation();
  const editing = useOutlineNodeEditing(activeDocId);
  const peekTrigger = usePeekTrigger();

  const allParentIds = projection.allNodes.filter((n) => projection.hasChildrenMap[n.nodeId]).map((n) => n.nodeId);
  const isAnyCollapsed = collapsedNodeIds.length > 0;
  const addNode = () => void editing.addRootNode(projection.allNodes.length);
  const closeMenuAfter = (fn: () => void) => () => {
    fn();
    setMoreMenuOpen(false);
  };

  const isHighlighted = (node: OutlinerNode) =>
    hoveredTargetId !== null &&
    [node.targetSlotId, node.targetBlockId, node.targetPageId, node.nodeId].includes(hoveredTargetId);

  return (
    <>
      <div className="px-3 py-2 flex items-center justify-between gap-1.5 shrink-0 bg-white border-b border-slate-200/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold text-slate-800 tracking-tight truncate">Home</span>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">({projection.visibleNodes.length})</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="pageview-toggle-btn"
            onClick={togglePagePreview}
            title={pagePreviewOpen ? "페이지 프리뷰 패널 닫기" : "페이지 프리뷰 패널(Document preview) 열기"}
            className={`p-1 rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] font-semibold ${
              pagePreviewOpen
                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 font-bold px-1.5 shadow-2xs"
                : "hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 border border-transparent"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-current" />
            {pagePreviewOpen && <span className="text-[10px]">Preview</span>}
          </button>

          <button
            type="button"
            data-testid="toggle-collapse-all-btn"
            onClick={() => (isAnyCollapsed ? expandAllNodes() : collapseAllNodes(allParentIds))}
            title={isAnyCollapsed ? "모두 펼치기" : "모두 접기"}
            className={headerButton}
          >
            {isAnyCollapsed ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
          </button>

          <div className="relative">
            <button type="button" onClick={() => setMoreMenuOpen(!moreMenuOpen)} title="더보기" className={headerButton}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-6 z-40 w-44 rounded-lg bg-white border border-slate-200 shadow-lg p-1 text-xs space-y-0.5">
                <button type="button" onClick={closeMenuAfter(() => setActiveActivityTab("template-hub"))} className={menuItem}>
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  서식·템플릿 허브 열기
                </button>
                <button type="button" onClick={closeMenuAfter(expandAllNodes)} className={menuItem}>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                  모든 노드 펼치기
                </button>
                <button type="button" onClick={closeMenuAfter(() => collapseAllNodes(allParentIds))} className={menuItem}>
                  <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                  모든 노드 접기
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="collapse-left-sidebar-btn"
            onClick={() => setLeftSidebarOpen(false)}
            className={headerButton}
            title="사이드바 접기"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-2.5 py-1.5 bg-white/40 border-b border-slate-200/40 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
          <input
            type="text"
            data-testid="outliner-quick-filter-input"
            value={quickFilterQuery}
            onChange={(e) => setQuickFilterQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-7 pr-6 py-1 rounded-md bg-slate-100/70 hover:bg-slate-100 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 border border-transparent focus:border-slate-300 focus:outline-none transition-colors"
          />
          {quickFilterQuery && (
            <button
              type="button"
              data-testid="clear-quick-filter-btn"
              onClick={() => setQuickFilterQuery("")}
              title="검색 지우기"
              className="absolute right-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {projection.rootNodeId !== PROJECT_ROOT_CRUMB_ID && projection.activeZoomLevel !== "project" && (
        <div className="px-2 py-1 bg-slate-100/80 border-b border-slate-200/60 flex items-center justify-between text-xs text-slate-700 shrink-0">
          <button
            type="button"
            data-testid="outliner-zoom-out-btn"
            onClick={handleZoomOutOneLevel}
            className="flex items-center gap-1 font-medium hover:text-slate-900 cursor-pointer truncate max-w-[80%]"
            title="상위로 Zoom-Out (Alt+Up)"
          >
            <ArrowUpLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{projection.parentZoomTitle || "Home"} (Zoom Out)</span>
          </button>
          <button
            type="button"
            data-testid="outliner-zoom-root-btn"
            onClick={() => handleBreadcrumbClick(PROJECT_ROOT_CRUMB_ID)}
            className="text-[11px] text-slate-500 hover:text-slate-800 font-medium cursor-pointer shrink-0 ml-1"
            title="최상위 Home 복귀"
          >
            Home
          </button>
        </div>
      )}

      <div
        role="tree"
        aria-label="Workflowy Outliner Tree"
        className="p-1.5 space-y-0.5 overflow-y-auto overflow-x-hidden flex-1 min-h-0"
      >
        {projection.visibleNodes.length === 0 ? (
          <EmptyStateCard
            testId="outliner-empty-filter-state"
            title="검색된 노드가 없습니다"
            description={`"${quickFilterQuery}"에 일치하는 항목이 없습니다.`}
            actionLabel="필터 초기화"
            onAction={() => setQuickFilterQuery("")}
            secondaryActionLabel="+ 새 노드 추가"
            onSecondaryAction={addNode}
          />
        ) : (
          projection.visibleNodes.map((node) => (
            <OutlineNodeRow
              key={node.nodeId}
              node={node}
              isSelected={selectedOutlinerNodeId === node.nodeId || projection.rootNodeId === node.nodeId}
              isHighlighted={isHighlighted(node)}
              hasChildren={Boolean(projection.hasChildrenMap[node.nodeId])}
              isCollapsed={collapsedNodeIds.includes(node.nodeId)}
              editable={isEditableOutlineNode(node)}
              peekHandlers={peekTrigger(resolvePeekTarget(docs, node.targetDocId || activeDocId, node.targetPageId))}
              onSelect={() => {
                handleSelectOutlineNode(node);
                setPreviewDocId(null);
              }}
              onKeyDown={(e) => editing.handleNodeKeyDown(e, node)}
              onHoverChange={(hovering) => setHoveredTargetId(hovering ? outlineNodeTargetId(node) : null)}
              onToggleCollapse={() => toggleNodeCollapse(node.nodeId)}
              onZoomIn={() => handleBulletZoomIn(node)}
              onMove={(direction) => void editing.moveNode(node.nodeId, direction)}
              onDelete={() => void editing.deleteNode(node.nodeId)}
            />
          ))
        )}

        <div className="p-2 pt-3 shrink-0 flex items-center justify-center">
          <button
            type="button"
            data-testid="add-outline-node-btn"
            onClick={addNode}
            className="w-full py-1.5 px-4 rounded-full bg-slate-200/60 hover:bg-slate-200 active:bg-slate-300/70 text-slate-600 hover:text-slate-800 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New node</span>
          </button>
        </div>
      </div>
    </>
  );
};
