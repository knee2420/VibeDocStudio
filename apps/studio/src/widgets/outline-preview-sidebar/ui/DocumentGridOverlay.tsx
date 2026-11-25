import React, { useEffect, useMemo } from "react";
import { FileText, LayoutGrid, X } from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { usePlaygroundDocIds } from "@/features/playground";
import { scrollToCanvasPage } from "@/shared/lib";

import { LivePageThumb } from "./LivePageThumb";

/**
 * Canva 스타일 도큐먼트별 페이지 그리드 뷰.
 * 프로젝트의 각 문서(도큐먼트)별로 섹션을 나누어 모든 페이지를 실제 A4 축소 썸네일 그리드로 보여 준다.
 * 썸네일을 클릭하면 그 페이지로 이동하면서 그리드를 닫고, 왼쪽 세로 미리보기 패널을 열어 준다.
 */
export const DocumentGridOverlay: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const setActivePageId = useStudioDocumentStore((s) => s.setActivePageId);
  const activeProject = useProjectStore(selectActiveProject);
  const playgroundIds = usePlaygroundDocIds();
  const setPageGridOpen = useWorkspaceLayoutStore((s) => s.setPageGridOpen);
  const setPagePreviewOpen = useWorkspaceLayoutStore((s) => s.setPagePreviewOpen);

  // Esc 키로 그리드 뷰 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPageGridOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPageGridOpen]);

  // 현재 프로젝트에 속한 문서들을 순서대로 묶고, 플레이그라운드 문서를 보고 있었다면 그 문서도 포함
  const projectDocs = useMemo<VDocDocument[]>(() => {
    const docMap = new Map(docs.map((d) => [d.docId, d]));
    const ordered: VDocDocument[] = [];
    const seen = new Set<string>();
    for (const id of activeProject?.docIds ?? []) {
      const d = docMap.get(id);
      if (d && !playgroundIds.has(d.docId)) {
        ordered.push(d);
        seen.add(d.docId);
      }
    }
    if (activeDocId && !seen.has(activeDocId)) {
      const cur = docMap.get(activeDocId);
      if (cur) ordered.unshift(cur);
    }
    return ordered;
  }, [docs, activeProject, playgroundIds, activeDocId]);

  const handleSelectPage = (docId: string, pageId: string) => {
    if (docId !== activeDocId) setActiveDocId(docId);
    setActivePageId(pageId);
    setPageGridOpen(false);
    // Canva 처럼 썸네일을 고르면 편집 화면으로 돌아가며 왼쪽 세로 미리보기 스트립을 띄운다
    setPagePreviewOpen(true);
    window.setTimeout(() => scrollToCanvasPage(pageId), 60);
  };

  return (
    <div
      data-testid="document-grid-overlay"
      className="flex-1 min-w-0 h-full bg-[#f4f5f7] flex flex-col overflow-hidden select-none"
    >
      {/* 상단 툴바 */}
      <header className="h-11 px-4 bg-white border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">페이지 그리드 보기</span>
          <span className="text-[11px] text-slate-400">
            문서 {projectDocs.length}개 · 총 {projectDocs.reduce((acc, d) => acc + d.pages.length, 0)}쪽
          </span>
        </div>
        <button
          type="button"
          data-testid="close-document-grid-btn"
          onClick={() => setPageGridOpen(false)}
          className="h-7 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          닫기
        </button>
      </header>

      {/* 도큐먼트별 페이지 그리드 본문 */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {projectDocs.map((doc) => (
          <section key={doc.docId} data-testid={`grid-doc-section-${doc.docId}`} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <FileText className="w-4 h-4 text-[#0d99ff] shrink-0" />
              <h2 className="text-[13.5px] font-bold text-slate-800 truncate">{doc.title}</h2>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">{doc.pages.length}쪽</span>
            </div>

            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(184px,1fr))]">
              {doc.pages.map((page, idx) => {
                const pageNumber = idx + 1;
                const isCurrent = doc.docId === activeDocId && page.pageId === activePageId;
                return (
                  <button
                    key={page.pageId}
                    type="button"
                    data-testid={`grid-page-card-${doc.docId}-${pageNumber}`}
                    onClick={() => handleSelectPage(doc.docId, page.pageId)}
                    className="group flex flex-col items-start text-left cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`rounded-lg overflow-hidden bg-white border transition-all shadow-xs group-hover:shadow-md group-hover:-translate-y-0.5 ${
                        isCurrent
                          ? "border-indigo-500 ring-2 ring-indigo-500/40 shadow-md"
                          : "border-slate-200/90 group-hover:border-indigo-300"
                      }`}
                    >
                      <LivePageThumb doc={doc} page={page} width={176} />
                    </div>
                    <div className="mt-1.5 w-[176px] flex items-center gap-1.5 px-0.5">
                      <span
                        className={`text-[11px] font-mono font-semibold shrink-0 ${
                          isCurrent ? "text-indigo-600" : "text-slate-400"
                        }`}
                      >
                        {pageNumber}
                      </span>
                      <span
                        className={`text-[11.5px] truncate ${
                          isCurrent ? "text-slate-900 font-semibold" : "text-slate-600 group-hover:text-slate-900"
                        }`}
                      >
                        {page.pageLabel || `${pageNumber}쪽`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
