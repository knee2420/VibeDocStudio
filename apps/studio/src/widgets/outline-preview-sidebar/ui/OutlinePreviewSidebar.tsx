import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  CircleDot,
  CornerDownRight,
  FileText,
  FolderTree,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { getZoomLevelMeta, type OutlinerNode } from "@vibe/vdoc-schema";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { ProvenanceBadge, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { BlockInsertionPalette } from "@/features/mutate-canvas-blocks";
import { useFractalZoomNavigation } from "@/features/zoom-hierarchy";
import {
  CollapsedPanelRail,
  EmptyStateCard,
  TruncatedLabel,
} from "@/shared/ui";

import { ReferenceDeckSection } from "./ReferenceDeckSection";
import { SourceControlSidebarPanel } from "./SourceControlSidebarPanel";
import { TemplateHubSidebarPanel } from "./TemplateHubSidebarPanel";

export const OutlinePreviewSidebar: React.FC = () => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const doc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const mode = useStudioDocumentStore((s) => s.mode);

  const leftSidebarOpen = useWorkspaceSessionStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceSessionStore((s) => s.setLeftSidebarOpen);

  const activeActivityTab = useWorkspaceSessionStore(
    (s) => s.activeActivityTab
  );
  const setActiveActivityTab = useWorkspaceSessionStore(
    (s) => s.setActiveActivityTab
  );

  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const deleteStorylineNode = useProjectStore((s) => s.deleteStorylineNode);
  const moveStorylineNode = useProjectStore((s) => s.moveStorylineNode);
  const indentOutlinerNode = useProjectStore((s) => s.indentOutlinerNode);

  const selectedOutlinerNodeId = useWorkspaceSessionStore(
    (s) => s.selectedOutlinerNodeId
  );
  const quickFilterQuery = useWorkspaceSessionStore((s) => s.quickFilterQuery);
  const setQuickFilterQuery = useWorkspaceSessionStore(
    (s) => s.setQuickFilterQuery
  );

  const { projection, handleBulletZoomIn, handleSelectOutlineNode } =
    useFractalZoomNavigation();

  if (!doc) return null;

  // Symmetric Collapse <-> Expand Rail
  if (!leftSidebarOpen) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Project Outliner & 참조 덱"
        badgeCount={projection.visibleNodes.length}
        onExpand={() => setLeftSidebarOpen(true)}
        testId="left-sidebar-collapsed-rail"
      />
    );
  }

  const handleAddQuickNode = () => {
    insertStorylineNode(null, {
      title: `신규 아웃라인 섹션 #${projection.allNodes.length + 1}`,
      summary: "Enter/버튼으로 생성된 구조화 아웃라인 노드",
      zoomLevel: "page",
      targetDocId: doc.docId,
    });
  };

  const handleInject100CharStressNode = () => {
    insertStorylineNode(null, {
      title:
        "[100자_장문_오버플로우_검증]_2026년도_전사_클라우드_네이티브_문서_거버넌스_표준화_및_무중단_전환_아키텍처_심의_의결_보고서_최종본_V12_FINAL_REVISED",
      summary:
        "100자 이상의 띄어쓰기 없는 초장문 문자열이 입력되어도 min-w-0 truncate와 title 툴팁으로 레이아웃이 절대 깨지지 않음을 검증합니다.",
      zoomLevel: "page",
      targetDocId: doc.docId,
    });
  };

  const handleNodeKeyDown = (e: React.KeyboardEvent, node: OutlinerNode) => {
    if (e.key === "Enter") {
      e.preventDefault();
      insertStorylineNode(node.parentId, {
        title: `${node.title.slice(0, 18)} (후속 섹션)`,
        summary: "키보드 Enter로 추가된 형제 아웃라인 노드",
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

  return (
    <aside
      data-testid="project-outliner-sidebar"
      className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none overflow-hidden"
    >
      {activeActivityTab === "source-control" ? (
        <SourceControlSidebarPanel />
      ) : activeActivityTab === "template-hub" ? (
        <TemplateHubSidebarPanel />
      ) : (
        <>
          {/* Top Header - Compact IDE Explorer Style */}
          <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-1.5 shrink-0 bg-white">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-[#248567] shrink-0" />
                <h3 className="text-xs font-bold text-slate-900 truncate">
                  아웃라이너
                </h3>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  ({projection.visibleNodes.length})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-testid="add-outline-node-btn"
                onClick={handleAddQuickNode}
                title="신규 아웃라인 노드 추가 (Enter)"
                className="px-1.5 py-0.5 rounded bg-[#248567] hover:bg-[#1d6b52] text-white text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
              <button
                type="button"
                data-testid="stress-100char-node-btn"
                onClick={handleInject100CharStressNode}
                title="100자 초장문 텍스트 말줄임 + 호버 툴팁 검증 노드 삽입"
                className="px-1 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] cursor-pointer"
              >
                100자
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  title="더보기 메뉴"
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-6 z-40 w-48 rounded-lg bg-white border border-slate-200 shadow-xl p-1 text-xs space-y-0.5">
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
                  </div>
                )}
              </div>
              <button
                type="button"
                data-testid="collapse-left-sidebar-btn"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                title="좌측 패널 접기"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Filter Input */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            data-testid="outliner-quick-filter-input"
            value={quickFilterQuery}
            onChange={(e) => setQuickFilterQuery(e.target.value)}
            placeholder="아웃라인 노드·서식 빠른 검색..."
            className="w-full pl-8 pr-7 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#248567]"
          />
          {quickFilterQuery && (
            <button
              type="button"
              data-testid="clear-quick-filter-btn"
              onClick={() => setQuickFilterQuery("")}
              title="검색어 지우기"
              className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Level Fractal Outliner Tree */}
      <div
        role="tree"
        aria-label="프로젝트 4단계 프랙탈 아웃라이너"
        className="p-2.5 space-y-1 overflow-y-auto flex-1"
      >
        {projection.visibleNodes.length === 0 ? (
          <EmptyStateCard
            testId="outliner-empty-filter-state"
            title="조건에 일치하는 아웃라인 노드가 없습니다"
            description={`검색어 "${quickFilterQuery}"에 해당하는 노드를 찾지 못했습니다.`}
            actionLabel="검색 필터 초기화"
            onAction={() => setQuickFilterQuery("")}
            secondaryActionLabel="+ 새 섹션 노드 추가"
            onSecondaryAction={handleAddQuickNode}
          />
        ) : (
          projection.visibleNodes.map((node) => {
            const isSelected = selectedOutlinerNodeId === node.nodeId;
            const isZoomRoot = projection.rootNodeId === node.nodeId;
            const levelMeta = getZoomLevelMeta(node.zoomLevel);
            const indentPx = Math.min(node.depth, 3) * 12;
            const isCustomStoryNode = !node.nodeId.startsWith("auto-");

            return (
              <div
                key={node.nodeId}
                role="treeitem"
                tabIndex={0}
                aria-selected={isSelected}
                data-testid={`outline-node-row-${node.nodeId}`}
                style={{ marginLeft: `${indentPx}px` }}
                onClick={() => handleSelectOutlineNode(node)}
                onKeyDown={(e) => handleNodeKeyDown(e, node)}
                className={`group rounded-lg border p-2 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#248567] ${
                  isSelected || isZoomRoot
                    ? "border-l-4 border-l-[#248567] border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200/80 hover:bg-slate-50 bg-white"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Workflowy-style Bullet Zoom-In Button */}
                  <button
                    type="button"
                    data-testid={`zoom-bullet-${node.nodeId}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulletZoomIn(node);
                    }}
                    title={`${levelMeta.badge} 계층으로 Zoom-In (불릿 클릭)`}
                    className="w-5 h-5 rounded-full hover:bg-emerald-100 text-slate-400 hover:text-[#248567] flex items-center justify-center shrink-0 cursor-pointer transition"
                  >
                    <CircleDot className="w-3.5 h-3.5" />
                  </button>

                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold border shrink-0 ${levelMeta.colorClass}`}
                  >
                    {node.zoomLevel === "project"
                      ? "L1"
                      : node.zoomLevel === "document"
                        ? "L2"
                        : node.zoomLevel === "page"
                          ? "L3"
                          : "L4"}
                  </span>

                  <TruncatedLabel
                    text={node.title}
                    testId={`outline-node-title-${node.nodeId}`}
                    className="text-xs font-semibold text-slate-900 flex-1"
                  />

                  {node.aiStatus === "applied" && (
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                  )}

                  {isCustomStoryNode && node.parentId !== null && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveStorylineNode(node.nodeId, -1);
                        }}
                        title="위로 이동"
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
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
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
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
                        title="노드 삭제 (Ctrl+Z로 복구 가능)"
                        className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Subtitle / Provenance / Template Metadata */}
                <div className="pl-6 mt-1 flex items-center justify-between gap-1.5 flex-wrap">
                  <TruncatedLabel
                    text={node.summary}
                    className="text-[10px] text-slate-500 flex-1"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {node.recommendedTemplateId && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-mono">
                        <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                        {node.recommendedTemplateId}
                      </span>
                    )}
                    <ProvenanceBadge
                      sourceProjectId={node.provenanceSourceProjectId}
                      sourceNodeId={node.provenanceSourceNodeId}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Quick Hint Footer */}
        <div className="pt-1 px-1 flex items-center gap-1 text-[10px] text-slate-400">
          <CornerDownRight className="w-3 h-3 shrink-0" />
          <span>Enter: 형제 추가 · Tab: 깊이 조정 · Delete: 삭제</span>
        </div>
      </div>

      {/* Bottom Accordion: Read-Only Reference Projects Deck (2~3 Reference Projects) */}
      <ReferenceDeckSection />

      {/* Block Insertion Palette in Editing Mode */}
      {mode === "Editing" && (
        <BlockInsertionPalette
          targetPageId={activePageId || doc.pages[0]?.pageId || ""}
        />
      )}
        </>
      )}
    </aside>
  );
};
