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

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectCurrentReferenceProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/** 문서 및 페이지별 정적 캡처 썸네일 URL 매핑 */
function getThumbnailUrl(docId: string, pageNumber: number): string {
  if (docId === "vdoc_ref_intl_exchange_rules") return `/thumbnails/ref1_p1.png`;
  if (docId === "vdoc_ref_reward_penalty_rules") return `/thumbnails/ref2_p${Math.min(pageNumber, 3)}.png`;
  if (docId === "vdoc_ref_seoul_startup_hub") return `/thumbnails/ref3_p${Math.min(pageNumber, 7)}.png`;
  if (docId === "vdoc_ref_toss_safezone_travel") return `/thumbnails/ref4_p1.png`;
  return `/thumbnails/doc_main_p${Math.min(pageNumber, 5)}.png`;
}

/** 문서별 원본 PDF 서빙 URL */
function getPdfUrl(docId: string): string | null {
  if (docId === "vdoc_ref_intl_exchange_rules") return `/pdfs/ref1.pdf`;
  if (docId === "vdoc_ref_reward_penalty_rules") return `/pdfs/ref2.pdf`;
  if (docId === "vdoc_ref_seoul_startup_hub") return `/pdfs/ref3.pdf`;
  return null;
}

/** 문서별 원본 웹 링크 */
function getWebUrl(docId: string): string | null {
  if (docId === "vdoc_ref_toss_safezone_travel") {
    return "https://toss.im/tossfeed/article/findyoursafezone-3b";
  }
  return null;
}

/**
 * PandaDoc "Document preview" Side Panel with Heptabase-style bottom live renderer.
 * - 상단: 작더라도 선명한 실제 페이지 캡처 썸네일 목록 (`1 · Page` 등)
 * - 하단: 헵타베이스 스타일의 소형 실물 PDF/웹사이트 렌더러 칸 (상단 ON/OFF 토글 조절)
 */
export const PandaDocDocumentPreviewPanel: React.FC = () => {
  const isPageViewMode = useWorkspaceSessionStore((s) => s.isPageViewMode);
  const setPageViewMode = useWorkspaceSessionStore((s) => s.setPageViewMode);

  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const docs = useStudioDocumentStore((s) => s.docs);

  const previewDocId = useWorkspaceSessionStore((s) => s.previewDocId);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);
  const setPeekPage = useWorkspaceSessionStore((s) => s.setPeekPage);

  const projects = useProjectStore((s) => s.projects);
  const refProj = useProjectStore(selectCurrentReferenceProject);
  const cloneNodeFromReference = useProjectStore((s) => s.cloneNodeFromReference);

  const currentDoc = docs.find((d) => d.docId === activeDocId);
  const targetDocId = previewDocId || activeDocId;
  const targetDoc = docs.find((d) => d.docId === targetDocId) || currentDoc;

  // 하단 헵타베이스 렌더러에서 현재 보고 있는 페이지 번호 (1-based)
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);

  // 사용자 지정: 하단 실물 렌더러 칸 ON/OFF 토글 상태 (기본: 열림)
  const [isBottomRendererOpen, setIsBottomRendererOpen] = useState<boolean>(true);

  if (!isPageViewMode) return null;

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

  const isReferenceDoc = projects.some(
    (p) => p.isReferenceOnly && p.docIds.includes(targetDoc.docId)
  );
  const isViewingOtherDoc = targetDoc.docId !== activeDocId;

  const handleSelectPage = (pageId: string, pageNum: number) => {
    setSelectedPageNum(pageNum);
    if (!isViewingOtherDoc) {
      setActivePageId(pageId);
      window.setTimeout(() => {
        const el = document.getElementById(`vdoc-page-${pageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 40);
    }
  };

  const handleCloneFirstSection = () => {
    const firstNode = refProj?.storylineNodes.find((n) => n.parentId !== null);
    if (refProj && firstNode) {
      cloneNodeFromReference(refProj.projectId, firstNode.nodeId);
    }
  };

  const pdfUrl = getPdfUrl(targetDoc.docId);
  const webUrl = getWebUrl(targetDoc.docId);

  return (
    <aside
      data-testid="pandadoc-side-preview-panel"
      className="w-[240px] border-r border-slate-200/90 bg-white flex flex-col shrink-0 min-h-0 select-none overflow-hidden z-20 transition-all shadow-xs"
    >
      {/* 1) Top Header Bar: Document preview + Close [X] Button */}
      <div className="px-3 py-2 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
        <h3
          data-testid="pandadoc-preview-header-title"
          className="text-xs font-bold text-slate-800 tracking-tight truncate"
        >
          Document preview
        </h3>

        <button
          type="button"
          data-testid="close-side-preview-btn"
          onClick={() => setPageViewMode(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
          title="페이지 프리뷰 닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2) Document Info Sub-Header with Live Renderer ON/OFF Toggle */}
      <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200/60 shrink-0">
        <div className="mb-1.5 flex items-center justify-between gap-1">
          {isViewingOtherDoc ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-100/80 px-1.5 py-0.5 rounded shrink-0">
              <Lock className="w-2.5 h-2.5" />
              참조 미리보기
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
              Work Doc
            </span>
          )}

          {/* User-Requested Red Box: Bottom Live Renderer ON/OFF Toggle Button */}
          <button
            type="button"
            data-testid="toggle-bottom-renderer-btn"
            onClick={() => setIsBottomRendererOpen(!isBottomRendererOpen)}
            title={
              isBottomRendererOpen
                ? "하단 실물 뷰어 접기 (OFF)"
                : "하단 실물 뷰어 펼치기 (ON)"
            }
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
              isBottomRendererOpen
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold shadow-2xs"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/80 hover:text-slate-700 font-medium"
            }`}
          >
            {isBottomRendererOpen ? (
              <PanelBottomClose className="w-3 h-3 text-emerald-600" />
            ) : (
              <PanelBottomOpen className="w-3 h-3 text-slate-400" />
            )}
            <span>{isBottomRendererOpen ? "뷰어 ON" : "뷰어 OFF"}</span>
          </button>

          {isViewingOtherDoc && (
            <button
              type="button"
              data-testid="return-to-work-doc-btn"
              onClick={() => {
                setPreviewDocId(null);
                setSelectedPageNum(1);
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
              onClick={handleCloneFirstSection}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer hover:bg-emerald-500 shadow-2xs"
            >
              <CopyPlus className="w-2.5 h-2.5" />
              내 작업본으로 복제
            </button>
          </div>
        )}
      </div>

      {/* 3) 상단: 실물 캡처 썸네일 타일 리스트 (PandaDoc 스타일) */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0 select-none">
        {targetDoc.pages.map((page, idx) => {
          const pageNum = idx + 1;
          const isActive =
            (!isViewingOtherDoc && page.pageId === activePageId) ||
            selectedPageNum === pageNum;

          return (
            <div
              key={page.pageId}
              data-testid={`page-preview-item-${pageNum}`}
              onClick={() => handleSelectPage(page.pageId, pageNum)}
              onMouseEnter={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  setPeekPage(page.pageId, { x: e.clientX, y: e.clientY }, targetDoc.docId);
                }
              }}
              onMouseMove={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  setPeekPage(page.pageId, { x: e.clientX, y: e.clientY }, targetDoc.docId);
                }
              }}
              onMouseLeave={() => {
                setPeekPage(null);
              }}
              title={`${page.pageLabel || `Page ${pageNum}`} (Ctrl + 호버 시 썸네일 미리보기)`}
              className={`group flex items-center justify-between h-[64px] px-3 py-1.5 cursor-pointer transition-colors relative select-none ${
                isActive
                  ? "bg-slate-100/90 text-slate-950 font-bold border-r-[3px] border-emerald-500"
                  : "bg-white text-slate-700 hover:bg-slate-50/90 border-r-[3px] border-transparent"
              }`}
            >
              {/* Left: 진짜 축소 썸네일 이미지 타일 (가짜 스켈레톤 라인 완전 제거) */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-[36px] h-[48px] shrink-0 rounded-xs bg-white border shadow-2xs overflow-hidden relative transition-transform group-hover:scale-105 ${
                    isActive ? "border-emerald-500 ring-1 ring-emerald-400" : "border-slate-300"
                  }`}
                >
                  <img
                    src={getThumbnailUrl(targetDoc.docId, pageNum)}
                    alt={`Page ${pageNum}`}
                    className="w-full h-full object-cover select-none pointer-events-none"
                    loading="lazy"
                  />
                  <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono font-bold bg-slate-900/70 text-white px-0.5 rounded-2xs leading-none">
                    {pageNum}p
                  </span>
                </div>

                {/* Right Text Label: "1 · Page" / Label */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-800 font-semibold tracking-tight">
                    {pageNum} · Page
                  </p>
                  <p
                    title={page.pageLabel || `Page ${pageNum}`}
                    className="text-[10px] text-slate-400 font-normal truncate mt-0.5"
                  >
                    {page.pageLabel || `섹션 #${pageNum}`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4) 하단: 헵타베이스 스타일 소형 실물 렌더러 칸 (ON/OFF 조절 기능) */}
      {isBottomRendererOpen && (
        <div
          data-testid="heptabase-bottom-preview-pane"
          className="h-[250px] shrink-0 border-t-2 border-slate-300 bg-slate-900 text-white flex flex-col overflow-hidden shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* 미니 렌더러 상단 툴바 */}
          <div className="px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[10px] shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {pdfUrl ? (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <FileText className="w-2.5 h-2.5" />
                  PDF 렌더러
                </span>
              ) : webUrl ? (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  <Globe className="w-2.5 h-2.5" />
                  웹 렌더러
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  문서 미리보기
                </span>
              )}
              <span className="text-slate-300 font-mono text-[9px]">
                {selectedPageNum}p / {targetDoc.pages.length}p
              </span>
            </div>

            <div className="flex items-center gap-1">
              {(pdfUrl || webUrl) && (
                <a
                  href={pdfUrl || webUrl || "#"}
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
                onClick={() => setIsBottomRendererOpen(false)}
                title="뷰어 닫기 (OFF)"
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 미니 렌더러 본체 뷰포트 (작은 사이즈) */}
          <div className="flex-1 bg-slate-100 overflow-hidden relative">
            {pdfUrl ? (
              <iframe
                key={`${pdfUrl}-${selectedPageNum}`}
                src={`${pdfUrl}#page=${selectedPageNum}&toolbar=0&navpanes=0`}
                title="PDF Viewer"
                className="w-full h-full border-0 bg-white"
              />
            ) : webUrl ? (
              <div className="w-full h-full flex flex-col bg-white">
                <iframe
                  src={webUrl}
                  sandbox="allow-scripts allow-same-origin"
                  title="Web Site Viewer"
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto bg-slate-200/80 p-2 flex items-center justify-center">
                <img
                  src={getThumbnailUrl(targetDoc.docId, selectedPageNum)}
                  alt={`Preview page ${selectedPageNum}`}
                  className="max-w-full max-h-full object-contain rounded-xs shadow-md border border-slate-300 bg-white"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
