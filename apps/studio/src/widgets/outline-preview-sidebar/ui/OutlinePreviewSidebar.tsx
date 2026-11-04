import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  FileText,
  FolderTree,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { type OutlinerNode } from "@vibe/vdoc-schema";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useFractalZoomNavigation } from "@/features/zoom-hierarchy";
import {
  CollapsedPanelRail,
  EmptyStateCard,
} from "@/shared/ui";

import { ReferenceDeckSection } from "./ReferenceDeckSection";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";

/**
 * Workflowy-styled Minimalist Fractal Outliner Sidebar.
 * Clean, borderless rows, triangular disclosure arrows, subtle rounded-pill active states,
 * and bottom `+ New node` pill button.
 */
export const OutlinePreviewSidebar: React.FC = () => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const doc = useStudioDocumentStore(selectActiveDocument);

  const leftSidebarOpen = useWorkspaceSessionStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceSessionStore((s) => s.setLeftSidebarOpen);

  const sidebarWidth = useWorkspaceSessionStore((s) => s.sidebarWidth || 300);
  const setSidebarWidth = useWorkspaceSessionStore((s) => s.setSidebarWidth);

  const activeActivityTab = useWorkspaceSessionStore((s) => s.activeActivityTab);
  const setActiveActivityTab = useWorkspaceSessionStore((s) => s.setActiveActivityTab);

  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const toggleNodeCollapse = useWorkspaceSessionStore((s) => s.toggleNodeCollapse);
  const collapseAllNodes = useWorkspaceSessionStore((s) => s.collapseAllNodes);
  const expandAllNodes = useWorkspaceSessionStore((s) => s.expandAllNodes);

  const hoveredOutlinerNodeId = useWorkspaceSessionStore((s) => s.hoveredOutlinerNodeId);
  const setHoveredOutlinerNodeId = useWorkspaceSessionStore((s) => s.setHoveredOutlinerNodeId);

  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const deleteStorylineNode = useProjectStore((s) => s.deleteStorylineNode);
  const moveStorylineNode = useProjectStore((s) => s.moveStorylineNode);
  const indentOutlinerNode = useProjectStore((s) => s.indentOutlinerNode);

  const selectedOutlinerNodeId = useWorkspaceSessionStore((s) => s.selectedOutlinerNodeId);
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const setQuickFilterQuery = useWorkspaceSessionStore((s) => s.setQuickFilterQuery);

  const {
    projection,
    handleBulletZoomIn,
    handleSelectOutlineNode,
    handleBreadcrumbClick,
    handleZoomOutOneLevel,
  } = useFractalZoomNavigation();

  if (!doc) return null;

  // Symmetric Collapse <-> Expand Rail
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

  // Draggable sidebar resizing
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleAddQuickNode = () => {
    insertStorylineNode(null, {
      title: `신규 노드 #${projection.allNodes.length + 1}`,
      summary: "추가된 아웃라인 노드",
      zoomLevel: "page",
      targetDocId: doc.docId,
    });
  };

  const handleNodeKeyDown = (e: React.KeyboardEvent, node: OutlinerNode) => {
    if (e.key === "Enter") {
      e.preventDefault();
      insertStorylineNode(node.parentId, {
        title: `${node.title.slice(0, 18)} (후속 섹션)`,
        summary: "Enter로 추가된 형제 노드",
        zoomLevel: node.zoomLevel === "project" ? "page" : node.zoomLevel,
        targetDocId: node.targetDocId || doc.docId,
      });
    } else if (e.key === "Tab") {
      e.preventDefault();
      indentOutlinerNode(node.nodeId, e.shiftKey ? -1 : 1);
    } else if (e.key === "Delete" && node.parentId !== null) {
      e.preventDefault();
      deleteStorylineNode(node.nodeId);
    }
  };

  const allParentIds = projection.allNodes
    .filter((n) => projection.hasChildrenMap[n.nodeId])
    .map((n) => n.nodeId);
  const isAnyCollapsed = collapsedNodeIds.length > 0;

  return (
    <aside
      data-testid="project-outliner-sidebar"
      style={{ width: `${sidebarWidth}px` }}
      className="relative bg-[#fafafa] border-r border-slate-200/90 flex flex-col shrink-0 select-none overflow-hidden transition-[width] duration-75 text-slate-700"
    >
      {/* 1) Resizable Drag Handle on Right Border */}
      <div
        data-testid="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setSidebarWidth(300)}
        title="드래그하여 너비 조절 · 더블클릭 시 기본 너비(300px) 복원"
        className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2 cursor-col-resize hover:bg-slate-400/40 active:bg-slate-500/60 transition-all z-30"
      />

      {activeActivityTab === "source-control" ? (
        <SourceControlSidebarPanel />
      ) : activeActivityTab === "template-hub" ? (
        <TemplateHubSidebarPanel />
      ) : (
        <>
          {/* Top Header - Workflowy Minimalist Header */}
          <div className="px-3 py-2 flex items-center justify-between gap-1.5 shrink-0 bg-white/60 border-b border-slate-200/50">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[13px] font-semibold text-slate-800 tracking-tight truncate">
                Home
              </span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                ({projection.visibleNodes.length})
              </span>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {/* Collapse / Expand All Toggle Button */}
              <button
                type="button"
                data-testid="toggle-collapse-all-btn"
                onClick={() => {
                  if (isAnyCollapsed) {
                    expandAllNodes();
                  } else {
                    collapseAllNodes(allParentIds);
                  }
                }}
                title={isAnyCollapsed ? "모두 펼치기" : "모두 접기"}
                className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
              >
                {isAnyCollapsed ? (
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronsDownUp className="w-3.5 h-3.5" />
                )}
              </button>

              {/* More Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  title="더보기"
                  className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-6 z-40 w-44 rounded-lg bg-white border border-slate-200 shadow-lg p-1 text-xs space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveActivityTab("template-hub");
                        setMoreMenuOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                      서식·템플릿 허브 열기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        expandAllNodes();
                        setMoreMenuOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                      모든 노드 펼치기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        collapseAllNodes(allParentIds);
                        setMoreMenuOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                      모든 노드 접기
                    </button>
                  </div>
                )}
              </div>

              {/* Collapse Left Sidebar Panel */}
              <button
                type="button"
                data-testid="collapse-left-sidebar-btn"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                title="사이드바 접기"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Filter Search Bar */}
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

          {/* Zoom-Out Navigation Banner when Zoomed In */}
          {projection.rootNodeId !== "project-root" && projection.activeZoomLevel !== "project" && (
            <div className="px-2 py-1 bg-slate-100/80 border-b border-slate-200/60 flex items-center justify-between text-xs text-slate-700 shrink-0">
              <button
                type="button"
                data-testid="outliner-zoom-out-btn"
                onClick={handleZoomOutOneLevel}
                className="flex items-center gap-1 font-medium hover:text-slate-900 cursor-pointer truncate max-w-[80%]"
                title="상위로 Zoom-Out (Alt+Up)"
              >
                <ArrowUpLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">
                  {projection.parentZoomTitle || "Home"} (Zoom Out)
                </span>
              </button>
              <button
                type="button"
                data-testid="outliner-zoom-root-btn"
                onClick={() => handleBreadcrumbClick("project-root")}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-medium cursor-pointer shrink-0 ml-1"
                title="최상위 Home 복귀"
              >
                Home
              </button>
            </div>
          )}

          {/* Workflowy Tree Rows Container */}
          <div
            role="tree"
            aria-label="Workflowy Outliner Tree"
            className="p-1.5 space-y-0.5 overflow-y-auto overflow-x-hidden flex-1"
          >
            {projection.visibleNodes.length === 0 ? (
              <EmptyStateCard
                testId="outliner-empty-filter-state"
                title="검색된 노드가 없습니다"
                description={`"${quickFilterQuery}"에 일치하는 항목이 없습니다.`}
                actionLabel="필터 초기화"
                onAction={() => setQuickFilterQuery("")}
                secondaryActionLabel="+ 새 노드 추가"
                onSecondaryAction={handleAddQuickNode}
              />
            ) : (
              projection.visibleNodes.map((node) => {
                const isSelected = selectedOutlinerNodeId === node.nodeId;
                const isZoomRoot = projection.rootNodeId === node.nodeId;
                const isCustomStoryNode = !node.nodeId.startsWith("auto-");
                const hasChildren = !!projection.hasChildrenMap[node.nodeId];
                const isCollapsed = collapsedNodeIds.includes(node.nodeId);
                const isHovered =
                  hoveredOutlinerNodeId === node.targetSlotId ||
                  hoveredOutlinerNodeId === node.targetPageId ||
                  hoveredOutlinerNodeId === node.nodeId;

                const indentPadding = Math.min(node.depth, 6) * 16 + 4;

                return (
                  <div
                    key={node.nodeId}
                    role="treeitem"
                    tabIndex={0}
                    aria-selected={isSelected}
                    data-testid={`outline-node-row-${node.nodeId}`}
                    style={{ paddingLeft: `${indentPadding}px` }}
                    onClick={() => handleSelectOutlineNode(node)}
                    onKeyDown={(e) => handleNodeKeyDown(e, node)}
                    onMouseEnter={() =>
                      setHoveredOutlinerNodeId(
                        node.targetSlotId || node.targetPageId || node.nodeId
                      )
                    }
                    onMouseLeave={() => setHoveredOutlinerNodeId(null)}
                    className={`group relative flex items-center gap-1.5 h-7 px-1.5 rounded-md transition-colors cursor-pointer text-[13px] leading-none ${
                      isSelected || isZoomRoot
                        ? "bg-slate-200/80 text-slate-950 font-medium"
                        : isHovered
                          ? "bg-slate-100 text-slate-900"
                          : "hover:bg-slate-100/70 text-slate-700"
                    }`}
                  >
                    {/* Disclosure Arrow (Workflowy triangular ▸ / ▾) */}
                    {hasChildren ? (
                      <button
                        type="button"
                        data-testid={`fold-toggle-${node.nodeId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNodeCollapse(node.nodeId);
                        }}
                        title={isCollapsed ? "펼치기" : "접기"}
                        className="w-3.5 h-3.5 rounded hover:bg-slate-300/50 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3 fill-current" />
                        ) : (
                          <ChevronDown className="w-3 h-3 fill-current" />
                        )}
                      </button>
                    ) : (
                      <span className="w-3.5 h-3.5 shrink-0" />
                    )}

                    {/* Subtle Level / Role Icon */}
                    {node.zoomLevel === "project" ? (
                      <FolderTree className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : node.zoomLevel === "document" ? (
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : node.zoomLevel === "page" && node.targetBlockId ? (
                      <LayoutGrid className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : node.zoomLevel === "page" ? (
                      <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : node.isStatic ? (
                      <span className="w-1.5 h-1.5 rounded-full border border-slate-300 shrink-0 mx-1" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mx-1" />
                    )}

                    {/* Node Title — 고정 텍스트는 회색, 위치로 지은 이름은 ⚠ */}
                    <span
                      data-testid={`outline-node-title-${node.nodeId}`}
                      title={`${node.title}${node.summary ? `\n\n${node.summary}` : ""}${
                        node.nameNeedsReview ? "\n\n⚠ 이름 확인 필요 (라벨을 찾지 못해 위치로 지은 이름)" : ""
                      }`}
                      className={`truncate flex-1 min-w-0 ${node.isStatic ? "text-slate-400" : ""}`}
                    >
                      {node.title}
                    </span>
                    {node.nameNeedsReview && (
                      <span
                        data-testid={`outline-node-review-${node.nodeId}`}
                        title="이름 확인 필요"
                        className="text-[11px] text-amber-500 shrink-0"
                      >
                        ⚠
                      </span>
                    )}

                    {/* Subtle Meta Tag (Workflowy-style #hashtag) */}
                    {node.provenanceSourceProjectId && (
                      <span
                        title={`참조 출처: ${node.provenanceSourceProjectId}`}
                        className="text-[11px] text-blue-500/80 font-mono shrink-0 ml-1 hover:underline"
                      >
                        #참조
                      </span>
                    )}

                    {/* Group Hover Action Buttons */}
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
                      <button
                        type="button"
                        data-testid={`zoom-bullet-${node.nodeId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBulletZoomIn(node);
                        }}
                        title="Zoom-In"
                        className="p-0.5 rounded hover:bg-slate-300/60 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <CircleDot className="w-3 h-3" />
                      </button>
                      {isCustomStoryNode && node.parentId !== null && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStorylineNode(node.nodeId, -1);
                            }}
                            title="위로 이동"
                            className="p-0.5 rounded hover:bg-slate-300/60 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStorylineNode(node.nodeId, 1);
                            }}
                            title="아래로 이동"
                            className="p-0.5 rounded hover:bg-slate-300/60 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-outline-node-${node.nodeId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStorylineNode(node.nodeId);
                            }}
                            title="삭제"
                            className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Workflowy-Style Bottom `+ New node` Button */}
            <div className="p-2 pt-3 shrink-0 flex items-center justify-center">
              <button
                type="button"
                data-testid="add-outline-node-btn"
                onClick={handleAddQuickNode}
                className="w-full py-1.5 px-4 rounded-full bg-slate-200/60 hover:bg-slate-200 active:bg-slate-300/70 text-slate-600 hover:text-slate-800 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New node</span>
              </button>
            </div>
          </div>

          {/* Bottom Accordion: Read-Only Reference Projects Deck */}
          <ReferenceDeckSection />
        </>
      )}
    </aside>
  );
};
