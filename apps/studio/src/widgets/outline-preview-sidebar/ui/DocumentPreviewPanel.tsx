import React, { useState } from "react";
import {
  ArrowLeft,
  CopyPlus,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  PanelBottomClose,
  PanelBottomOpen,
  X,
} from "lucide-react";

import {
  getDocumentSource,
  PageThumbnail,
  selectDocument,
  useStudioDocumentStore,
  type DocumentSourceView,
} from "@/entities/vdoc-document";
import { selectCurrentReferenceProject, selectIsReferenceDocument, useProjectStore } from "@/entities/vdoc-project";
import { attachable, pageRef } from "@/features/ai-workspace";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { usePeekTrigger } from "@/features/peek-page";
import { scrollToCanvasPage } from "@/shared/lib";

const SOURCE_BADGE: Record<DocumentSourceView["kind"], { label: string; className: string; icon?: React.ReactNode }> = {
  pdf: {
    label: "PDF 렌더러",
    className: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    icon: <FileText className="w-2.5 h-2.5" />,
  },
  web: {
    label: "웹 렌더러",
    className: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    icon: <Globe className="w-2.5 h-2.5" />,
  },
  none: { label: "문서 미리보기", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
};

/**
 * 아웃라이너 왼쪽의 문서 미리보기 패널.
 * - 위: 페이지 썸네일 목록 (작업 문서면 클릭 시 캔버스가 그 페이지로 이동)
 * - 아래: 원본 PDF · 웹 페이지 · 캡처를 띄우는 작은 뷰어 (켜고 끌 수 있다)
 * 썸네일과 원본 주소는 문서 데이터(`doc.preview`)에서 읽는다.
 */
export const DocumentPreviewPanel: React.FC = () => {
  const open = useWorkspaceLayoutStore((s) => s.pagePreviewOpen);
  const setOpen = useWorkspaceLayoutStore((s) => s.setPagePreviewOpen);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const previewDocId = useWorkspaceSessionStore((s) => s.previewDocId);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);

  const targetDocId = previewDocId || activeDocId;
  const targetDoc = useStudioDocumentStore(selectDocument(targetDocId));
  const isReferenceDoc = useProjectStore(selectIsReferenceDocument(targetDocId));
  const refProject = useProjectStore(selectCurrentReferenceProject);
  const cloneNodeFromReference = useProjectStore((s) => s.cloneNodeFromReference);
  const peekTrigger = usePeekTrigger();

  const [viewerPageNumber, setViewerPageNumber] = useState(1);
  const [viewerOpen, setViewerOpen] = useState(true);

  if (!open) return null;

  if (!targetDoc) {
    return (
      <aside
        data-testid="pandadoc-side-preview-panel"
        className="w-[240px] border-r border-slate-200/90 bg-white flex flex-col shrink-0 min-h-0 select-none overflow-hidden z-20 shadow-xs p-4 text-center text-xs text-slate-400"
      >
        문서를 불러오는 중입니다…
      </aside>
    );
  }

  const isViewingOtherDoc = targetDoc.docId !== activeDocId;
  const source = getDocumentSource(targetDoc);
  const badge = SOURCE_BADGE[source.kind];

  const selectPage = (pageId: string, pageNumber: number) => {
    setViewerPageNumber(pageNumber);
    if (isViewingOtherDoc) return;
    setActivePageId(pageId);
    scrollToCanvasPage(pageId);
  };

  const cloneFirstReferenceSection = () => {
    const firstNode = refProject?.storylineNodes.find((n) => n.parentId !== null);
    if (refProject && firstNode) void cloneNodeFromReference(refProject.projectId, firstNode.nodeId);
  };

  return (
    <aside
      data-testid="pandadoc-side-preview-panel"
      className="w-[240px] border-r border-slate-200/90 bg-white flex flex-col shrink-0 min-h-0 select-none overflow-hidden z-20 transition-all shadow-xs"
    >
      <div className="px-3 py-2 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
        <h3 data-testid="pandadoc-preview-header-title" className="text-xs font-bold text-slate-800 tracking-tight truncate">
          Document preview
        </h3>
        <button
          type="button"
          data-testid="close-side-preview-btn"
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
          title="페이지 프리뷰 닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200/60 shrink-0">
        <div className="mb-1.5 flex items-center justify-between gap-1">
          {isViewingOtherDoc ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-100/80 px-1.5 py-0.5 rounded shrink-0">
              <Lock className="w-2.5 h-2.5" />
              참조 미리보기
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Work Doc</span>
          )}

          <button
            type="button"
            data-testid="toggle-bottom-renderer-btn"
            onClick={() => setViewerOpen(!viewerOpen)}
            title={viewerOpen ? "하단 실물 뷰어 접기 (OFF)" : "하단 실물 뷰어 펼치기 (ON)"}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
              viewerOpen
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold shadow-2xs"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/80 hover:text-slate-700 font-medium"
            }`}
          >
            {viewerOpen ? (
              <PanelBottomClose className="w-3 h-3 text-emerald-600" />
            ) : (
              <PanelBottomOpen className="w-3 h-3 text-slate-400" />
            )}
            <span>{viewerOpen ? "뷰어 ON" : "뷰어 OFF"}</span>
          </button>

          {isViewingOtherDoc && (
            <button
              type="button"
              data-testid="return-to-work-doc-btn"
              onClick={() => {
                setPreviewDocId(null);
                setViewerPageNumber(1);
              }}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-2.5 h-2.5" />
              내 작업본으로
            </button>
          )}
        </div>

        <div className="min-w-0">
          <p
            data-testid="pandadoc-preview-doc-title"
            title={targetDoc.title}
            className="text-[11px] font-bold text-slate-800 truncate leading-snug"
          >
            {targetDoc.title}
          </p>
          <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
            <span>{isReferenceDoc ? "Reference" : "Document"}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-slate-400" />
            <span className="font-mono tabular-nums">{targetDoc.pages.length} pages</span>
          </p>
        </div>

        {isReferenceDoc && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center justify-end">
            <button
              type="button"
              onClick={cloneFirstReferenceSection}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer hover:bg-emerald-500 shadow-2xs"
            >
              <CopyPlus className="w-2.5 h-2.5" />
              내 작업본으로 복제
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0 select-none">
        {targetDoc.pages.map((page, idx) => {
          const pageNumber = idx + 1;
          const isActive = (!isViewingOtherDoc && page.pageId === activePageId) || viewerPageNumber === pageNumber;
          return (
            <div
              key={page.pageId}
              data-testid={`page-preview-item-${pageNumber}`}
              data-ai-entity={page.pageId}
              {...attachable(() => [{ ...pageRef(targetDoc, page), access: isViewingOtherDoc ? "read" : "write" }])}
              onClick={() => selectPage(page.pageId, pageNumber)}
              {...peekTrigger({ docId: targetDoc.docId, pageId: page.pageId })}
              title={`${page.pageLabel || `Page ${pageNumber}`} (Ctrl + 호버 시 썸네일 미리보기)`}
              className={`group flex items-center justify-between h-[64px] px-3 py-1.5 cursor-pointer transition-colors relative select-none ${
                isActive
                  ? "bg-slate-100/90 text-slate-950 font-bold border-r-[3px] border-emerald-500"
                  : "bg-white text-slate-700 hover:bg-slate-50/90 border-r-[3px] border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-[36px] h-[48px] shrink-0 rounded-xs bg-white border shadow-2xs overflow-hidden relative transition-transform group-hover:scale-105 ${
                    isActive ? "border-emerald-500 ring-1 ring-emerald-400" : "border-slate-300"
                  }`}
                >
                  <PageThumbnail doc={targetDoc} pageNumber={pageNumber} />
                  <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono font-bold bg-slate-900/70 text-white px-0.5 rounded-2xs leading-none">
                    {pageNumber}p
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-800 font-semibold tracking-tight">{pageNumber} · Page</p>
                  <p
                    title={page.pageLabel || `Page ${pageNumber}`}
                    className="text-[10px] text-slate-400 font-normal truncate mt-0.5"
                  >
                    {page.pageLabel || `섹션 #${pageNumber}`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {viewerOpen && (
        <div
          data-testid="heptabase-bottom-preview-pane"
          className="h-[250px] shrink-0 border-t-2 border-slate-300 bg-slate-900 text-white flex flex-col overflow-hidden shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[10px] shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold border ${badge.className}`}>
                {badge.icon}
                {badge.label}
              </span>
              <span className="text-slate-300 font-mono text-[9px]">
                {viewerPageNumber}p / {targetDoc.pages.length}p
              </span>
            </div>
            <div className="flex items-center gap-1">
              {source.kind !== "none" && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="새 창에서 원본 보기"
                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setViewerOpen(false)}
                title="뷰어 닫기 (OFF)"
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-100 overflow-hidden relative">
            {source.kind === "pdf" ? (
              <iframe
                key={`${source.url}-${viewerPageNumber}`}
                src={`${source.url}#page=${viewerPageNumber}&toolbar=0&navpanes=0`}
                title="PDF Viewer"
                className="w-full h-full border-0 bg-white"
              />
            ) : source.kind === "web" ? (
              <iframe
                src={source.url}
                sandbox="allow-scripts allow-same-origin"
                title="Web Site Viewer"
                className="w-full h-full border-0 bg-white"
              />
            ) : (
              <div className="w-full h-full overflow-y-auto bg-slate-200/80 p-2 flex items-center justify-center">
                <div className="h-full aspect-[1/1.414] max-w-full rounded-xs shadow-md border border-slate-300 bg-white overflow-hidden">
                  <PageThumbnail doc={targetDoc} pageNumber={viewerPageNumber} fit="contain" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
