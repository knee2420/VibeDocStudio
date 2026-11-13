import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronsDownUp, ChevronsUpDown, Layers, MoreHorizontal, Search, X } from "lucide-react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

import { usePopoverDismiss } from "../lib/usePopoverDismiss";
import {
  filterLayerNodes,
  minDepth,
  normalizeQuery,
  parentIdsWithin,
  selectAllModeNodes,
  selectPageLayerNodes,
} from "../model/outlineSections";
import { useLayerFlags } from "../model/useLayerFlags";
import { useRowSelection } from "../model/useRowSelection";
import { useFigmaDiffStatusMap } from "../model/useFigmaDiffStatus";
import { OutlineNodeRow } from "./OutlineNodeRow";
import { AddNodeButton, type SectionProps } from "./outlineSectionParts";

/**
 * Elements 구역 (피그마 `레이어`): 활성 페이지의 블록 · 슬롯 (All 모드에서는 줌 범위 전체 트리).
 * 검색 · 접힘 · 줌을 반영하고, 캔버스의 단일 · 다중 선택을 그대로 하늘색으로 보여준다.
 */
export const ElementsSection: React.FC<
  SectionProps & {
    isAllMode: boolean;
    allNodes: OutlinerNode[];
    scopedNodes: OutlinerNode[];
    hasChildrenMap: Record<string, boolean>;
    rootNodeId: string;
    onAddNode?: () => void;
  }
> = ({
  activeDocId,
  actions,
  phase,
  renaming,
  reportOrder,
  isAllMode,
  allNodes,
  scopedNodes,
  hasChildrenMap,
  rootNodeId,
  onAddNode,
}) => {
  const rawQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const setQuery = useWorkspaceSessionStore((s) => s.setQuickFilterQuery);
  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const setNodesCollapsed = useWorkspaceSessionStore((s) => s.setNodesCollapsed);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const activePageLabel = useStudioDocumentStore(
    (s) => s.docs.find((d) => d.docId === activeDocId)?.pages.find((p) => p.pageId === s.activePageId)?.pageLabel ?? ""
  );
  const query = normalizeQuery(rawQuery);

  // 검색 · 접힘 전의 구역 범위. `모두 접기 · 펴기` 는 이 범위 안의 노드만 건드린다 (Documents & Pages 구역 문서 접힘은 그대로).
  const baseNodes = useMemo(
    () =>
      isAllMode ? scopedNodes : selectPageLayerNodes(allNodes, { docId: activeDocId, pageId: activePageId, zoomRootId: rootNodeId }),
    [isAllMode, scopedNodes, allNodes, activeDocId, activePageId, rootNodeId]
  );
  const nodes = useMemo(
    () => (isAllMode ? selectAllModeNodes(baseNodes, query, collapsedNodeIds) : filterLayerNodes(baseNodes, query, collapsedNodeIds)),
    [isAllMode, baseNodes, query, collapsedNodeIds]
  );
  const depthOffset = useMemo(() => minDepth(baseNodes), [baseNodes]);
  const parentIds = useMemo(() => parentIdsWithin(baseNodes, hasChildrenMap), [baseNodes, hasChildrenMap]);
  const isAnyCollapsed = useMemo(() => {
    const collapsed = new Set(collapsedNodeIds);
    return parentIds.some((id) => collapsed.has(id));
  }, [parentIds, collapsedNodeIds]);
  const selection = useRowSelection(nodes);
  const { lockSlotIds, hidden } = useLayerFlags(baseNodes, nodes);
  const diffStatusMap = useFigmaDiffStatusMap(allNodes);
  useLayoutEffect(() => reportOrder(nodes), [nodes, reportOrder]);

  // 캔버스에서 고른 엘리먼트로 목록 밖이면 보이도록 스크롤 (피그마처럼). 이미 보이면 움직이지 않는다.
  const treeRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const firstSelectedId = useMemo(() => {
    for (const [id, state] of selection) if (state === "on") return id;
    return null;
  }, [selection]);
  useEffect(() => {
    if (!firstSelectedId) return;
    treeRef.current?.querySelector(`[data-node-id="${CSS.escape(firstSelectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [firstSelectedId]);

  // VS Code / Antigravity Sticky Scroll: 통합 트리(All Mode)에서 스크롤 시 현재 문서·페이지 행까지만 상단 고정
  const ROW_HEIGHT = 27;
  const stickyTrails = useMemo(() => {
    if (!isAllMode || nodes.length === 0) return [] as Array<Array<{ node: OutlinerNode; index: number }>>;
    let currentDoc: { node: OutlinerNode; index: number } | null = null;
    let currentPage: { node: OutlinerNode; index: number } | null = null;
    return nodes.map((node, index) => {
      if (node.zoomLevel === "document") {
        currentDoc = { node, index };
        currentPage = null;
        return [];
      }
      if (node.zoomLevel === "page" && !node.targetBlockId) {
        currentPage = { node, index };
        return currentDoc ? [currentDoc] : [];
      }
      if (currentDoc && node.depth <= currentDoc.node.depth) {
        currentDoc = null;
        currentPage = null;
      } else if (currentPage && node.depth <= currentPage.node.depth) {
        currentPage = null;
      }
      const trail: Array<{ node: OutlinerNode; index: number }> = [];
      if (currentDoc) trail.push(currentDoc);
      if (currentPage) trail.push(currentPage);
      return trail;
    });
  }, [isAllMode, nodes]);

  const stickyNodes = useMemo(() => {
    if (!isAllMode || scrollTop <= 2 || nodes.length === 0) return [] as OutlinerNode[];
    let k = 0;
    let resolved: OutlinerNode[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const targetIdx = Math.min(nodes.length - 1, Math.floor((scrollTop + k * ROW_HEIGHT + 2) / ROW_HEIGHT));
      const trail = stickyTrails[targetIdx] ?? [];
      const next: OutlinerNode[] = [];
      for (const item of trail) {
        const slotTop = item.index * ROW_HEIGHT;
        if (scrollTop > slotTop + 2) {
          next.push(item.node);
        }
      }
      resolved = next;
      if (next.length === k) break;
      k = next.length;
    }
    return resolved;
  }, [isAllMode, scrollTop, nodes, stickyTrails]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(menuRef, menuOpen, () => setMenuOpen(false));
  const setAllCollapsed = (collapsed: boolean) => {
    setNodesCollapsed(parentIds, collapsed);
    setMenuOpen(false);
  };

  return (
    <>
      <div className="fig-section-header">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0">{isAllMode ? "All Outline" : "Elements"}</span>
          {!isAllMode && activePageLabel && (
            <span className="fig-section-meta truncate" title={activePageLabel}>
              {activePageLabel}
            </span>
          )}
        </div>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            data-testid="toggle-collapse-all-btn"
            disabled={parentIds.length === 0}
            onClick={() => setNodesCollapsed(parentIds, !isAnyCollapsed)}
            title={isAnyCollapsed ? "모두 펼치기" : "모두 접기"}
            className="fig-icon-btn"
          >
            {isAnyCollapsed ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
          </button>

          <div className="relative" ref={menuRef}>
            <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} title="더보기" className="fig-icon-btn">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="fig-menu absolute right-0 top-7 z-40 w-48">
                <button
                  type="button"
                  onClick={() => {
                    useWorkspaceLayoutStore.getState().setActiveActivityTab("template-hub");
                    setMenuOpen(false);
                  }}
                  className="fig-menu-item"
                >
                  <BookOpen className="w-3 h-3" />
                  서식·템플릿 허브 열기
                </button>
                <button type="button" onClick={() => setAllCollapsed(false)} className="fig-menu-item">
                  <ChevronsUpDown className="w-3 h-3" />
                  모든 엘리먼트 펼치기
                </button>
                <button type="button" onClick={() => setAllCollapsed(true)} className="fig-menu-item">
                  <ChevronsDownUp className="w-3 h-3" />
                  모든 엘리먼트 접기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <label className="fig-search shrink-0">
        <Search className="w-3 h-3 shrink-0" />
        <input
          type="text"
          data-testid="outliner-quick-filter-input"
          value={rawQuery}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isAllMode ? "Search all nodes..." : "Search elements..."}
        />
        {rawQuery && (
          <button type="button" data-testid="clear-quick-filter-btn" onClick={() => setQuery("")} title="검색 지우기" className="fig-icon-btn !w-4 !h-4">
            <X className="w-3 h-3" />
          </button>
        )}
      </label>

      <div
        ref={treeRef}
        role="tree"
        aria-label={isAllMode ? "Project All Tree" : "Elements Tree"}
        aria-multiselectable
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="pb-2 overflow-y-auto overflow-x-hidden flex-1 min-h-0 relative"
      >
        {stickyNodes.length > 0 && (
          <div
            data-testid="outline-sticky-scroll"
            style={{ marginBottom: -(stickyNodes.length * ROW_HEIGHT) }}
            className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 shadow-[0_2px_6px_rgba(15,23,42,0.06)]"
          >
            {stickyNodes.map((node) => (
              <OutlineNodeRow
                key={`sticky-${node.nodeId}`}
                node={node}
                actions={actions}
                phase={phase}
                fallbackDocId={activeDocId}
                depthOffset={depthOffset}
                sel={selection.get(node.nodeId)}
                hasChildren={Boolean(hasChildrenMap[node.nodeId])}
                renamingInitialTitle={renaming?.nodeId === node.nodeId ? renaming.initialTitle : undefined}
                lockSlotIds={lockSlotIds.get(node.nodeId)}
                hidden={hidden.get(node.nodeId)}
                diffState={diffStatusMap[node.nodeId]}
              />
            ))}
          </div>
        )}
        {nodes.length === 0 ? (
          <div data-testid={query ? "outliner-empty-filter-state" : "outliner-empty-state"} className="px-4 py-8 text-center text-black/50">
            <Layers className="w-6 h-6 mx-auto mb-2 text-black/20" strokeWidth={1.5} />
            {query ? (
              <>
                <p className="text-black/90 font-medium">일치하는 엘리먼트가 없습니다</p>
                <p className="mt-0.5">"{rawQuery.trim()}"</p>
                <button type="button" onClick={() => setQuery("")} className="mt-2 text-[#0d99ff] hover:underline">
                  검색 지우기
                </button>
              </>
            ) : (
              <>
                <p className="text-black/90 font-medium">{isAllMode ? "표시할 노드가 없습니다" : "이 페이지에 엘리먼트가 없습니다"}</p>
                <p className="mt-0.5">캔버스에서 블록을 만들거나 Assets 탭을 확인하세요.</p>
              </>
            )}
          </div>
        ) : (
          nodes.map((node) => (
            <OutlineNodeRow
              key={node.nodeId}
              node={node}
              actions={actions}
              phase={phase}
              fallbackDocId={activeDocId}
              depthOffset={depthOffset}
              sel={selection.get(node.nodeId)}
              hasChildren={Boolean(hasChildrenMap[node.nodeId])}
              renamingInitialTitle={renaming?.nodeId === node.nodeId ? renaming.initialTitle : undefined}
              lockSlotIds={lockSlotIds.get(node.nodeId)}
              hidden={hidden.get(node.nodeId)}
              diffState={diffStatusMap[node.nodeId]}
            />
          ))
        )}

        {onAddNode && <AddNodeButton onClick={onAddNode} />}
      </div>
    </>
  );
};
