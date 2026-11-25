import React from "react";
import { ArrowLeft, LayoutGrid, Lock, X } from "lucide-react";

import { selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { setSplitDragData, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachable, pageRef } from "@/features/ai-workspace";
import { scrollToCanvasPage } from "@/shared/lib";

import { LivePageThumb } from "./LivePageThumb";

/**
 * 아웃라이너 왼쪽의 세로 페이지 미리보기 스트립 (Canva 썸네일 스트립의 세로형 버전).
 * 각 페이지의 실제 A4 축소 썸네일을 보여 주고, 클릭 시 캔버스가 해당 페이지로 이동한다.
 */
export const DocumentPreviewPanel: React.FC = () => {
  const open = useWorkspaceLayoutStore((s) => s.pagePreviewOpen);
  const setOpen = useWorkspaceLayoutStore((s) => s.setPagePreviewOpen);
  const setPageGridOpen = useWorkspaceLayoutStore((s) => s.setPageGridOpen);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const previewDocId = useWorkspaceSessionStore((s) => s.previewDocId);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);

  const targetDocId = previewDocId || activeDocId;
  const targetDoc = useStudioDocumentStore(selectDocument(targetDocId));

  if (!open) return null;

  if (!targetDoc) {
    return (
      <aside
        data-testid="pandadoc-side-preview-panel"
        className="w-[208px] border-r border-slate-200/90 bg-white flex flex-col shrink-0 min-h-0 select-none overflow-hidden z-20 p-4 text-center text-xs text-slate-400"
      >
        문서를 불러오는 중입니다…
      </aside>
    );
  }

  const isViewingOtherDoc = targetDoc.docId !== activeDocId;

  const selectPage = (pageId: string) => {
    if (isViewingOtherDoc) return;
    setActivePageId(pageId);
    scrollToCanvasPage(pageId);
  };

  return (
    <aside
      data-testid="pandadoc-side-preview-panel"
      className="w-[208px] border-r border-slate-200/90 bg-[#f8f9fb] flex flex-col shrink-0 min-h-0 select-none overflow-hidden z-20"
    >
      {/* 상단 헤더 */}
      <div className="h-10 px-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-1 shrink-0">
        <div className="min-w-0 flex items-center gap-1.5">
          {isViewingOtherDoc && <Lock className="w-3 h-3 text-violet-600 shrink-0" />}
          <h3
            data-testid="pandadoc-preview-header-title"
            title={targetDoc.title}
            className="text-[12px] font-bold text-slate-800 tracking-tight truncate"
          >
            {targetDoc.title}
          </h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            data-testid="open-grid-from-preview-btn"
            onClick={() => setPageGridOpen(true)}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 cursor-pointer transition-colors"
            title="전체 페이지 그리드 보기"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="close-side-preview-btn"
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
            title="세로 미리보기 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isViewingOtherDoc && (
        <div className="px-2.5 py-1.5 bg-violet-50 border-b border-violet-200/70 flex items-center justify-between shrink-0">
          <span className="text-[10.5px] font-semibold text-violet-700">참조 미리보기</span>
          <button
            type="button"
            data-testid="return-to-work-doc-btn"
            onClick={() => setPreviewDocId(null)}
            className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-violet-700 hover:text-violet-950 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            내 작업본
          </button>
        </div>
      )}

      {/* 세로 실제 A4 썸네일 스트립 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {targetDoc.pages.map((page, idx) => {
          const pageNumber = idx + 1;
          const isActive = !isViewingOtherDoc && page.pageId === activePageId;
          const attach = attachable(() => [{ ...pageRef(targetDoc, page), access: isViewingOtherDoc ? "read" : "write" }]);
          return (
            <div
              key={page.pageId}
              data-testid={`page-preview-item-${pageNumber}`}
              data-ai-entity={page.pageId}
              {...attach}
              draggable
              onDragStart={(e) => {
                attach.onDragStart?.(e);
                setSplitDragData(e, { docId: targetDoc.docId, pageId: page.pageId });
              }}
              onClick={() => selectPage(page.pageId)}
              title={`${pageNumber}. ${page.pageLabel || `${pageNumber}쪽`} (클릭: 이동 · 캔버스로 끌어다 놓아 나란히 보기)`}
              className="group flex flex-col items-center cursor-pointer"
            >
              <div
                className={`rounded-md overflow-hidden bg-white border transition-all shadow-2xs group-hover:shadow-sm ${
                  isActive
                    ? "border-indigo-500 ring-2 ring-indigo-500/35 shadow-sm"
                    : "border-slate-200/90 group-hover:border-slate-300"
                }`}
              >
                <LivePageThumb doc={targetDoc} page={page} width={168} />
              </div>
              <div className="mt-1 w-[168px] flex items-center gap-1.5 px-0.5">
                <span
                  className={`text-[10.5px] font-mono font-semibold shrink-0 ${
                    isActive ? "text-indigo-600" : "text-slate-400"
                  }`}
                >
                  {pageNumber}
                </span>
                <span
                  className={`text-[11px] truncate ${
                    isActive ? "text-slate-900 font-semibold" : "text-slate-500 group-hover:text-slate-800"
                  }`}
                >
                  {page.pageLabel || `${pageNumber}쪽`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
