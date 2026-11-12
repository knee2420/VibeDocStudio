import React, { useCallback, useRef, useState } from "react";
import { FilePlus2, LayoutGrid, RefreshCw } from "lucide-react";

import { PROJECT_ROOT_CRUMB_ID, type OutlinerNode } from "@vibe/vdoc-schema";

import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { documentLifecycle } from "@/features/manage-documents";
import { useOutlineProjection } from "@/features/zoom-hierarchy";

import { useOutlineRowActions, type RenameState } from "../model/useOutlineRowActions";
import { AddPageFlow, type AddPageFlowHandle } from "./AddPageFlow";
import { NewDocumentFlow, type NewDocumentFlowHandle } from "./NewDocumentMenu";
import { ElementsSection } from "./OutlineElementsSection";
import { DocumentsPagesSection } from "./OutlineDocumentsPagesSection";

/** 아웃라이너 본체: 머리말 · Documents & Pages 구역 · Elements 구역 · 페이지 추가/새 문서 흐름. */
export const OutlineExplorer: React.FC<{ activeDocId: string }> = ({ activeDocId }) => {
  const projection = useOutlineProjection();
  const phase = useWorkspaceSessionStore((s) => s.currentPhase);
  const [isAllMode, setIsAllMode] = useState(false);
  const [renaming, setRenaming] = useState<RenameState | null>(null);

  const addPageFlow = useRef<AddPageFlowHandle>(null);
  const newDocFlow = useRef<NewDocumentFlowHandle>(null);
  const order = useRef<{ pages: readonly OutlinerNode[]; elements: readonly OutlinerNode[] }>({ pages: [], elements: [] });
  const reportPages = useCallback((nodes: readonly OutlinerNode[]) => void (order.current.pages = nodes), []);
  const reportElements = useCallback((nodes: readonly OutlinerNode[]) => void (order.current.elements = nodes), []);

  const { actions, addRootNode } = useOutlineRowActions({
    activeDocId,
    getVisibleOrder: () => [...order.current.pages, ...order.current.elements],
    setRenaming,
    openAddPageMenu: (docId, anchorEl) => addPageFlow.current?.toggle(docId, anchorEl),
  });
  const addNode = () => void addRootNode(projection.allNodes.length);

  const shared = { activeDocId, actions, phase, renaming };

  return (
    <>
      <ExplorerHeader
        isAllMode={isAllMode}
        onToggleAllMode={() => setIsAllMode((v) => !v)}
        onOpenNewDocumentMenu={(el) => newDocFlow.current?.toggle(el)}
      />

      {!isAllMode && (
        <DocumentsPagesSection
          {...shared}
          allNodes={projection.allNodes}
          reportOrder={reportPages}
          onAddPage={(el) => addPageFlow.current?.toggle(activeDocId, el)}
          onAddNode={phase !== "drafting" ? addNode : undefined}
        />
      )}

      <ElementsSection
        {...shared}
        isAllMode={isAllMode}
        allNodes={projection.allNodes}
        scopedNodes={projection.visibleNodes}
        hasChildrenMap={projection.hasChildrenMap}
        rootNodeId={projection.rootNodeId}
        isZoomedIn={projection.rootNodeId !== PROJECT_ROOT_CRUMB_ID && projection.activeZoomLevel !== "project"}
        parentZoomTitle={projection.parentZoomTitle}
        reportOrder={reportElements}
        onAddNode={isAllMode && phase !== "drafting" ? addNode : undefined}
      />

      <AddPageFlow ref={addPageFlow} />
      <NewDocumentFlow ref={newDocFlow} />
    </>
  );
};

/** 머리말: 프로젝트 제목 · 새 문서 · 새로고침 · All 모드 · 페이지 프리뷰. */
const ExplorerHeader: React.FC<{
  isAllMode: boolean;
  onToggleAllMode: () => void;
  onOpenNewDocumentMenu: (anchorEl: HTMLElement) => void;
}> = ({ isAllMode, onToggleAllMode, onOpenNewDocumentMenu }) => {
  const projectTitle = useProjectStore((s) => selectActiveProject(s)?.title) || "프로젝트";
  const pagePreviewOpen = useWorkspaceLayoutStore((s) => s.pagePreviewOpen);
  const togglePagePreview = useWorkspaceLayoutStore((s) => s.togglePagePreview);

  return (
    <div className="h-12 pl-4 pr-2 border-b border-[var(--fig-border)] flex items-center justify-between gap-2 shrink-0">
      <span className="min-w-0 truncate text-[13px] font-semibold" title={projectTitle}>
        {projectTitle}
      </span>

      <div className="flex items-center shrink-0" data-testid="project-root-doc-actions">
        <button
          type="button"
          data-testid="outline-new-doc-menu-btn"
          data-new-doc-trigger=""
          onClick={(e) => onOpenNewDocumentMenu(e.currentTarget)}
          title="새 문서 (A4 · 블로그 글 · 불러오기)"
          className="fig-icon-btn"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="outline-refresh-docs-btn"
          onClick={() => void documentLifecycle().refreshDocuments().catch((err) => window.alert(String(err)))}
          title="새로고침 (에이전트 · 다른 곳에서 만든 문서 반영)"
          className="fig-icon-btn"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="all-tree-toggle-btn"
          aria-pressed={isAllMode}
          onClick={onToggleAllMode}
          title={isAllMode ? "Documents & Pages · Elements 분할 보기로 전환" : "프로젝트 전체 아웃라인 보기 (All Mode)"}
          className="fig-icon-btn !w-auto px-1.5 font-semibold"
        >
          All
        </button>
        <button
          type="button"
          data-testid="pageview-toggle-btn"
          aria-pressed={pagePreviewOpen}
          onClick={togglePagePreview}
          title={pagePreviewOpen ? "페이지 프리뷰 패널 닫기" : "페이지 프리뷰 패널(Document preview) 열기"}
          className="fig-icon-btn"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
