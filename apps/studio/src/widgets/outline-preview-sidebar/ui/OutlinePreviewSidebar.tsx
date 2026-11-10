import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpLeft,
  BookOpen,
  ChevronLeft,
  FolderTree,
  ChevronsDownUp,
  ChevronsUpDown,
  FilePlus2,
  FileUp,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";

import { PROJECT_ROOT_CRUMB_ID, type OutlinerNode, type WorkbenchPhase } from "@vibe/vdoc-schema";
import type { PagePendingState } from "@vibe/slot-canvas";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { SIDEBAR_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachable, outlineNodeRef, useAttachPickStore, withPicked } from "@/features/ai-workspace";
import {
  isDocumentTargetNode,
  isEditableOutlineNode,
  isPageTargetNode,
  useOutlineNodeEditing,
} from "@/features/edit-outline";
import {
  PagePickerModal,
  TEMPLATE_SOURCE_REGISTRY,
  useInsertTemplatePages,
  type TemplateSourceKind,
} from "@/features/insert-template-pages";
import { usePageMutations } from "@/features/mutate-document-pages";
import { resolvePeekTarget, usePeekTrigger, type PeekHandlers } from "@/features/peek-page";
import { useFractalZoomNavigation, useOutlineSelector } from "@/features/zoom-hierarchy";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail, EmptyStateCard } from "@/shared/ui";

import { OutlineNodeRow, outlineNodeTargetId } from "./OutlineNodeRow";
import { ReferenceDeckSection } from "./ReferenceDeckSection";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";
import { ReferenceManagerWidget } from "@/widgets/vdoc-page-canvas";

const headerButton = "p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors";
const menuItem = "w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer";

const leftTabClass = (active: boolean, activeTone: string) =>
  `px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 text-xs ${
    active ? `bg-white ${activeTone} shadow-2xs font-bold` : "text-slate-500 hover:text-slate-700"
  }`;

/** 좌측 사이드바: 활성 도구 탭에 따라 아웃라이너 · 변경안 검토 · 템플릿 허브를 보여준다. */
export const OutlinePreviewSidebar: React.FC = () => {
  // 문서 객체를 구독하면 타이핑마다 사이드바 전체가 다시 그려진다. ID 만 본다.
  const activeDocId = useStudioDocumentStore((s) => selectActiveDocument(s)?.docId);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const sidebarWidth = useWorkspaceLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceLayoutStore((s) => s.setSidebarWidth);
  const resetSidebarWidth = useWorkspaceLayoutStore((s) => s.resetSidebarWidth);
  const activeActivityTab = useWorkspaceLayoutStore((s) => s.activeActivityTab);
  const leftPanelTab = useWorkspaceLayoutStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useWorkspaceLayoutStore((s) => s.setLeftPanelTab);
  const refPlacement = useWorkspaceLayoutStore((s) => s.refPlacement);
  const { onResizeStart } = useDragResize({ axis: "x", size: sidebarWidth, onResize: setSidebarWidth });
  const visibleNodeCount = useOutlineSelector((p) => p.visibleNodes.length);

  if (!activeDocId) return null;

  if (!leftSidebarOpen) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Outline & References"
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
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 상단 탭 바: 아웃라이너 ↔ 레퍼런스 매니저 */}
          <div className="px-2 py-1.5 bg-slate-100/90 border-b border-slate-200/90 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="left-tab-outliner"
                onClick={() => setLeftPanelTab("outliner")}
                className={leftTabClass(leftPanelTab === "outliner", "text-sky-900")}
              >
                <FolderTree className="w-3.5 h-3.5 text-sky-600" />
                <span>아웃라이너</span>
              </button>
              {refPlacement !== "split" && (
                <button
                  type="button"
                  data-testid="left-tab-reference-manager"
                  onClick={() => setLeftPanelTab("reference-manager")}
                  className={leftTabClass(leftPanelTab === "reference-manager", "text-amber-900")}
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>레퍼런스</span>
                </button>
              )}
            </div>
            <button
              type="button"
              data-testid="collapse-left-sidebar-btn"
              onClick={() => setLeftSidebarOpen(false)}
              className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="좌측 패널 접기"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {leftPanelTab === "outliner" ? (
            <OutlineExplorer activeDocId={activeDocId} />
          ) : (
            <ReferenceManagerWidget isSplit={false} />
          )}
        </div>
      )}
    </aside>
  );
};

/** 아웃라이너 본체: 머리말 · 빠른 필터 · 줌아웃 배너 · 노드 트리. */
const OutlineExplorer: React.FC<{ activeDocId: string }> = ({ activeDocId }) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
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
  const highlightedEntityId = useWorkspaceSessionStore((s) => s.highlightedEntityId);
  const pickedOutline = useAttachPickStore((s) => s.picked.outline);
  const pickAnchor = React.useRef<string | null>(null);

  const [renaming, setRenaming] = useState<{ nodeId: string; initialTitle: string } | null>(null);
  const [addPageMenu, setAddPageMenu] = useState<{ docId: string; top: number; left: number } | null>(null);
  const addPageMenuRef = useRef<HTMLDivElement>(null);

  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const docPageCountKey = useStudioDocumentStore((s) => s.docs.map((d) => `${d.docId}:${d.pages.length}`).join("|"));
  const pageCountsByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const part of docPageCountKey.split("|")) {
      if (!part) continue;
      const sep = part.lastIndexOf(":");
      if (sep > 0) map.set(part.slice(0, sep), Number(part.slice(sep + 1)) || 0);
    }
    return map;
  }, [docPageCountKey]);

  const pageStatesByPageId = usePdfScaffoldJobStore((s) => s.pageStatesByPageId);
  const pageMutations = usePageMutations();
  const templateInsert = useInsertTemplatePages(
    (docId, sourceDoc, pageIds, label) => {
      pageMutations.importTemplatePages(docId, sourceDoc, pageIds, { label });
    },
    { onReservePdfPlaceholders: pageMutations.reservePdfPlaceholderPages }
  );

  useEffect(() => {
    if (!addPageMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!addPageMenuRef.current?.contains(e.target as Node)) setAddPageMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddPageMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [addPageMenu]);

  const startRename = (node: OutlinerNode) => {
    let initialTitle = node.title;
    if (isPageTargetNode(node) && node.nodeId.startsWith("auto-page-") && node.targetPageId) {
      const docId = node.targetDocId || activeDocId;
      const page = useStudioDocumentStore
        .getState()
        .docs.find((d) => d.docId === docId)
        ?.pages.find((p) => p.pageId === node.targetPageId);
      if (page) initialTitle = page.pageLabel;
    }
    setRenaming({ nodeId: node.nodeId, initialTitle });
  };

  const commitRename = (node: OutlinerNode, nextTitle: string) => {
    setRenaming(null);
    if (isPageTargetNode(node) && node.targetPageId) {
      void pageMutations.renamePage(node.targetDocId || activeDocId, node.targetPageId, nextTitle);
      return;
    }
    if (isEditableOutlineNode(node, useWorkspaceSessionStore.getState().currentPhase)) {
      void useProjectStore.getState().renameOutlineNodeImmediate(node.nodeId, nextTitle);
    }
  };

  const openAddPageMenuForNode = (node: OutlinerNode, anchorEl: HTMLElement) => {
    const docId = node.targetDocId || activeDocId;
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - 190));
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - 260));
    setAddPageMenu({ docId, top, left });
  };

  const handleTemplateSourcePick = (kind: TemplateSourceKind, docId: string) => {
    setAddPageMenu(null);
    if (kind === "blank") {
      const nextNum = (pageCountsByDocId.get(docId) ?? 0) + 1;
      templateInsert.insertBasicPage(docId, `새 페이지 ${nextNum}`);
    } else if (kind === "pdf") {
      templateInsert.triggerPdfPick(docId);
    } else if (kind === "catalog") {
      void templateInsert.openCatalogBrowser(docId);
    }
  };

  const { projection, handleBulletZoomIn, handleSelectOutlineNode, handleBreadcrumbClick, handleZoomOutOneLevel } =
    useFractalZoomNavigation();
  const editing = useOutlineNodeEditing(activeDocId, {
    onStartRename: startRename,
    onRemovePage: pageMutations.removePage,
  });
  const peekTrigger = usePeekTrigger();

  const allParentIds = projection.allNodes.filter((n) => projection.hasChildrenMap[n.nodeId]).map((n) => n.nodeId);
  const isAnyCollapsed = collapsedNodeIds.length > 0;
  const addNode = () => void editing.addRootNode(projection.allNodes.length);
  const closeMenuAfter = (fn: () => void) => () => {
    fn();
    setMoreMenuOpen(false);
  };

  const isHighlighted = (node: OutlinerNode) =>
    (hoveredTargetId !== null &&
      [node.targetSlotId, node.targetBlockId, node.targetPageId, node.nodeId].includes(hoveredTargetId)) ||
    // AI 칩 호버는 정확히 그 대상을 가리키는 노드만
    (highlightedEntityId !== null && (outlineNodeTargetId(node) === highlightedEntityId || node.nodeId === highlightedEntityId));

  /** Ctrl/⌘+클릭: 첨부 묶음에 넣고 빼기 · Shift+클릭: 범위로 고르기 · 그냥 클릭: 묶음 해제 후 선택. */
  const pickOrSelect = (e: React.MouseEvent, node: OutlinerNode) => {
    const picks = useAttachPickStore.getState();
    if (e.ctrlKey || e.metaKey) {
      picks.togglePick("outline", outlineNodeRef(node));
      pickAnchor.current = node.nodeId;
      return true;
    }
    if (e.shiftKey) {
      const nodes = projection.visibleNodes;
      const from = nodes.findIndex((n) => n.nodeId === (pickAnchor.current ?? selectedOutlinerNodeId));
      const to = nodes.findIndex((n) => n.nodeId === node.nodeId);
      if (from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from];
        picks.setPicks("outline", nodes.slice(a, b + 1).map(outlineNodeRef));
        window.getSelection()?.removeAllRanges();
        return true;
      }
    }
    if (picks.picked.outline?.length) picks.clearPicks("outline");
    pickAnchor.current = node.nodeId;
    return false;
  };

  // 줄마다 새 콜백을 만들면 메모된 줄이 매번 다시 그려진다. 최신 핸들러를 읽는 고정 참조 하나를 넘긴다
  // (최신 핸들러는 커밋 뒤에 갱신하고, 이벤트에서만 읽는다).
  type RowHandlers = Omit<OutlineRowActions, "peek">;
  const handlers: RowHandlers = {
    select: (e, node) => {
      if (pickOrSelect(e, node)) return;
      handleSelectOutlineNode(node);
      setPreviewDocId(null);
    },
    keyDown: (e, node) => editing.handleNodeKeyDown(e, node),
    hover: (node, hovering) => setHoveredTargetId(hovering ? outlineNodeTargetId(node) : null),
    toggleCollapse: (node) => toggleNodeCollapse(node.nodeId),
    zoomIn: (node) => handleBulletZoomIn(node),
    move: (node, direction) => void editing.moveNode(node, direction),
    remove: (node) => void editing.deleteNode(node),
    openAddPageMenu: openAddPageMenuForNode,
    startRename,
    commitRename,
    cancelRename: () => setRenaming(null),
    duplicatePage: (node) => {
      if (node.targetPageId) pageMutations.duplicatePage(node.targetDocId || activeDocId, node.targetPageId);
    },
    deletePage: (node) => {
      if (!node.targetPageId) return;
      usePdfScaffoldJobStore.getState().clearPageState(node.targetPageId);
      pageMutations.removePage(node.targetDocId || activeDocId, node.targetPageId);
    },
  };
  const latest = React.useRef(handlers);
  React.useLayoutEffect(() => {
    latest.current = handlers;
  });
  const rowActions = React.useMemo<OutlineRowActions>(
    () => ({
      select: (e, node) => latest.current.select(e, node),
      keyDown: (e, node) => latest.current.keyDown(e, node),
      hover: (node, hovering) => latest.current.hover(node, hovering),
      toggleCollapse: (node) => latest.current.toggleCollapse(node),
      zoomIn: (node) => latest.current.zoomIn(node),
      move: (node, direction) => latest.current.move(node, direction),
      remove: (node) => latest.current.remove(node),
      openAddPageMenu: (node, anchorEl) => latest.current.openAddPageMenu(node, anchorEl),
      startRename: (node) => latest.current.startRename(node),
      commitRename: (node, nextTitle) => latest.current.commitRename(node, nextTitle),
      cancelRename: () => latest.current.cancelRename(),
      duplicatePage: (node) => latest.current.duplicatePage(node),
      deletePage: (node) => latest.current.deletePage(node),
      // 피크 대상(문서 · 첫 페이지)은 마우스 이벤트 순간에 스토어에서 읽는다.
      peek: (node) =>
        peekTrigger(() => {
          const docs = useStudioDocumentStore.getState();
          return resolvePeekTarget(docs.docs, node.targetDocId || selectActiveDocument(docs)?.docId, node.targetPageId);
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- peekTrigger 는 고정된 스토어 동작(hover)만 쓴다
    []
  );

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
            secondaryActionLabel={currentPhase !== "drafting" ? "+ 새 노드 추가" : undefined}
            onSecondaryAction={currentPhase !== "drafting" ? addNode : undefined}
          />
        ) : (
          projection.visibleNodes.map((node) => {
            const docId = node.targetDocId || activeDocId;
            const pendingState =
              node.zoomLevel === "page" && !node.targetBlockId && node.targetPageId
                ? (pageStatesByPageId[node.targetPageId] ?? null)
                : null;
            return (
              <OutlineTreeRow
                key={node.nodeId}
                node={node}
                phase={currentPhase}
                pageCount={pageCountsByDocId.get(docId) ?? 0}
                isSelected={selectedOutlinerNodeId === node.nodeId || projection.rootNodeId === node.nodeId}
                isHighlighted={isHighlighted(node)}
                isPicked={Boolean(pickedOutline?.some((r) => r.id === outlineNodeTargetId(node) || r.id === node.nodeId))}
                hasChildren={Boolean(projection.hasChildrenMap[node.nodeId])}
                isCollapsed={collapsedNodeIds.includes(node.nodeId)}
                pendingState={pendingState}
                renamingInitialTitle={renaming?.nodeId === node.nodeId ? renaming.initialTitle : undefined}
                actions={rowActions}
              />
            );
          })
        )}

        {currentPhase !== "drafting" && (
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
        )}
      </div>

      <input
        ref={templateInsert.pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        data-testid="outline-pdf-template-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void templateInsert.handlePdfFileSelected(file);
        }}
      />

      {addPageMenu && (
        <div
          ref={addPageMenuRef}
          data-testid="add-page-source-menu"
          style={{ top: `${addPageMenu.top}px`, left: `${addPageMenu.left}px` }}
          className="fixed z-[110] w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 text-xs space-y-1"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">페이지 추가 출처</div>
          {TEMPLATE_SOURCE_REGISTRY.map((src) => {
            const Icon = src.kind === "blank" ? FilePlus2 : src.kind === "pdf" ? FileUp : Layers;
            return (
              <button
                key={src.kind}
                type="button"
                data-testid={`add-page-source-${src.kind}`}
                onClick={() => handleTemplateSourcePick(src.kind, addPageMenu.docId)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-slate-700 hover:text-emerald-950 flex items-start gap-2 cursor-pointer transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-[11px]">{src.label}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{src.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PagePickerModal
        pagePicker={templateInsert.pagePicker}
        pdfPreviewPicker={templateInsert.pdfPreviewPicker}
        catalogBrowser={templateInsert.catalogBrowser}
        loadingMessage={templateInsert.loadingMessage}
        error={templateInsert.error}
        onDismissError={templateInsert.dismissError}
        onSelectCatalog={templateInsert.selectCatalogTemplate}
        onConfirmPages={templateInsert.confirmSelectedPages}
        onConfirmPdfPages={templateInsert.confirmPdfPages}
        onClose={templateInsert.closeModals}
      />
    </>
  );
};

interface OutlineRowActions {
  select: (e: React.MouseEvent, node: OutlinerNode) => void;
  keyDown: (e: React.KeyboardEvent, node: OutlinerNode) => void;
  hover: (node: OutlinerNode, hovering: boolean) => void;
  toggleCollapse: (node: OutlinerNode) => void;
  zoomIn: (node: OutlinerNode) => void;
  move: (node: OutlinerNode, direction: -1 | 1) => void;
  remove: (node: OutlinerNode) => void;
  openAddPageMenu: (node: OutlinerNode, anchorEl: HTMLElement) => void;
  startRename: (node: OutlinerNode) => void;
  commitRename: (node: OutlinerNode, nextTitle: string) => void;
  cancelRename: () => void;
  duplicatePage: (node: OutlinerNode) => void;
  deletePage: (node: OutlinerNode) => void;
  /** 피크 핸들러 — 문서 목록은 호버 순간에 읽는다 (문서 구독으로 트리 전체가 다시 그려지지 않게). */
  peek: (node: OutlinerNode) => PeekHandlers;
}

interface OutlineTreeRowProps {
  node: OutlinerNode;
  phase: WorkbenchPhase;
  pageCount: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isPicked: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  pendingState?: PagePendingState | null;
  renamingInitialTitle?: string;
  actions: OutlineRowActions;
}

/**
 * 메모된 아웃라인 줄. `node` 는 투영이 구조 공유로 유지하므로(`useOutlineProjection`) 타이핑 중에는
 * 내용이 바뀐 줄만 다시 그린다. 핸들러는 마우스가 올라올 때 만들어지는 피크 핸들러를 빼고 모두 고정이다.
 */
const OutlineTreeRow = React.memo<OutlineTreeRowProps>(function OutlineTreeRow({
  node,
  phase,
  pageCount,
  isSelected,
  isHighlighted,
  isPicked,
  hasChildren,
  isCollapsed,
  pendingState = null,
  renamingInitialTitle,
  actions,
}) {
  const isBusyPending = pendingState?.status === "queued" || pendingState?.status === "running";
  const handlers = React.useMemo(
    () => ({
      attachProps: attachable(() => withPicked("outline", outlineNodeRef(node))),
      peekHandlers: actions.peek(node),
      onSelect: (e: React.MouseEvent) => actions.select(e, node),
      onKeyDown: (e: React.KeyboardEvent) => actions.keyDown(e, node),
      onHoverChange: (hovering: boolean) => actions.hover(node, hovering),
      onToggleCollapse: () => actions.toggleCollapse(node),
      onZoomIn: () => actions.zoomIn(node),
      onMove: (direction: -1 | 1) => actions.move(node, direction),
      onDelete: () => actions.remove(node),
      onOpenAddPageMenu: (anchorEl: HTMLElement) => actions.openAddPageMenu(node, anchorEl),
      onStartRename: () => actions.startRename(node),
      onCommitRename: (nextTitle: string) => actions.commitRename(node, nextTitle),
      onCancelRename: () => actions.cancelRename(),
      onDuplicatePage: () => actions.duplicatePage(node),
      onDeletePage: () => actions.deletePage(node),
    }),
    [node, actions]
  );
  return (
    <OutlineNodeRow
      node={node}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      isPicked={isPicked}
      hasChildren={hasChildren}
      isCollapsed={isCollapsed}
      editable={isEditableOutlineNode(node, phase)}
      canAddPage={isDocumentTargetNode(node)}
      canManagePage={isPageTargetNode(node)}
      canDeletePage={pageCount > 1 && !isBusyPending}
      pendingState={pendingState}
      renamingInitialTitle={renamingInitialTitle}
      {...handlers}
    />
  );
});
