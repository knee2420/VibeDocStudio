import React, { useCallback, useRef, useState } from "react";
import { LayoutGrid, RefreshCw } from "lucide-react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { DocumentImportDialog, documentLifecycle } from "@/features/manage-documents";
import { useOutlineProjection } from "@/features/zoom-hierarchy";

import { useOutlineRowActions, type RenameState } from "../model/useOutlineRowActions";
import { useRevealCanvasSelection } from "../model/useRevealCanvasSelection";
import { AddPageFlow, type AddPageFlowHandle } from "./AddPageFlow";
import { NewDocumentMenu } from "./NewDocumentMenu";
import { ElementsSection } from "./OutlineElementsSection";
import { DocumentsPagesSection } from "./OutlineDocumentsPagesSection";
import { OutlineZoomBreadcrumb } from "./OutlineZoomBreadcrumb";

/** 새 문서 만들기: 제목을 묻고 지면 서식(A4 · 블로그 스크롤)으로 만든다. 취소하면 아무것도 하지 않는다. */
function createDocumentBySurface(surface: "paged" | "scroll"): void {
  const title = window.prompt(surface === "scroll" ? "새 블로그 글 제목" : "새 문서 제목", surface === "scroll" ? "새 글" : "새 문서");
  if (title === null) return;
  void documentLifecycle()
    .createDocument({ title: title.trim() || "새 문서", surface })
    .catch((err) => window.alert(String(err)));
}

/** 아웃라이너 본체: 머리말 · Documents & Pages 구역(머리말 `+` = 새 문서 메뉴) · Elements 구역 · 페이지 추가 흐름. */
export const OutlineExplorer: React.FC<{ activeDocId: string }> = ({ activeDocId }) => {
  const projection = useOutlineProjection();
  const phase = useWorkspaceSessionStore((s) => s.currentPhase);
  const [isAllMode, setIsAllMode] = useState(false);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  // 캔버스에서 고른 엘리먼트로 사이드바가 따라간다 (현재 페이지 · 접힌 조상 펼치기 · 줌 넓히기).
  useRevealCanvasSelection();

  const addPageFlow = useRef<AddPageFlowHandle>(null);
  // 새 문서 메뉴는 목록의 overflow 클리핑을 피하려고 뷰포트 좌표(fixed)로 띄운다.
  const [newDocMenu, setNewDocMenu] = useState<{ top: number; left: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const toggleNewDocMenu = (anchorEl: HTMLElement) =>
    setNewDocMenu((prev) => {
      if (prev) return null;
      const rect = anchorEl.getBoundingClientRect();
      return {
        top: Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - 190)),
        left: Math.min(rect.left, Math.max(8, window.innerWidth - 260)),
      };
    });
  const closeNewDocMenu = useCallback(() => setNewDocMenu(null), []);
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
      />

      <OutlineZoomBreadcrumb />

      {!isAllMode && (
        <DocumentsPagesSection
          {...shared}
          allNodes={projection.allNodes}
          zoomRootId={projection.rootNodeId}
          reportOrder={reportPages}
          onNewDocument={toggleNewDocMenu}
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
        reportOrder={reportElements}
        onAddNode={isAllMode && phase !== "drafting" ? addNode : undefined}
      />

      <AddPageFlow ref={addPageFlow} />

      <NewDocumentMenu
        anchor={newDocMenu}
        onCreatePaged={() => createDocumentBySurface("paged")}
        onCreateScroll={() => createDocumentBySurface("scroll")}
        onImportDocuments={() => setImportOpen(true)}
        onClose={closeNewDocMenu}
      />

      <DocumentImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
};

/** 머리말: 프로젝트 제목 · 새로고침 · All 모드 · 페이지 프리뷰. */
const ExplorerHeader: React.FC<{
  isAllMode: boolean;
  onToggleAllMode: () => void;
}> = ({ isAllMode, onToggleAllMode }) => {
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
