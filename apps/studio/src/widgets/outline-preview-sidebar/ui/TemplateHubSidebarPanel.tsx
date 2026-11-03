import React, { useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ExternalLink,
  Plus,
  Search,
} from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { TruncatedLabel } from "@/shared/ui";

export const TemplateHubSidebarPanel: React.FC = () => {
  const [query, setQuery] = useState("");
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const setLeftSidebarOpen = useWorkspaceSessionStore(
    (s) => s.setLeftSidebarOpen
  );
  const setActiveActivityTab = useWorkspaceSessionStore(
    (s) => s.setActiveActivityTab
  );

  const filteredDocs = docs.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase())
  );

  const handleApplyTemplateAsNewDoc = (templateDocId: string) => {
    const target = docs.find((d) => d.docId === templateDocId);
    if (!target) return;
    insertStorylineNode(null, {
      title: `[추가 서식] ${target.title}`,
      summary: `템플릿 허브에서 추가된 문서 양식`,
      zoomLevel: "document",
      targetDocId: templateDocId,
    });
    setActiveDocId(templateDocId);
    setActiveActivityTab("explorer");
  };

  return (
    <div
      data-testid="template-hub-panel"
      className="flex-1 flex flex-col h-full overflow-hidden bg-white"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
            <h3 className="text-xs font-bold text-slate-900 truncate">
              서식·템플릿 허브
            </h3>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
            카탈로그 자산 {docs.length}종 수용
          </p>
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

      {/* Search Bar */}
      <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="표준 서식 카탈로그 검색..."
            className="w-full pl-8 pr-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Template List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredDocs.map((doc, idx) => {
          const isActive = doc.docId === activeDocId;
          return (
            <div
              key={doc.docId}
              data-testid={`template-card-${doc.docId}`}
              className={`rounded-lg border p-2.5 text-xs transition space-y-1.5 ${
                isActive
                  ? "border-emerald-500/80 bg-emerald-50/30"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-bold">
                  CATALOG #{idx + 1}
                </span>
                {isActive && (
                  <span className="text-[10px] font-semibold text-emerald-700">
                    현재 활성화됨
                  </span>
                )}
              </div>

              <div className="font-semibold text-slate-900 text-xs">
                <TruncatedLabel text={doc.title} />
              </div>

              <div className="text-[10px] text-slate-500 font-mono">
                페이지 {doc.pages?.length || 1}p · 슬롯 {Object.keys(doc.slots || {}).length}개
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveDocId(doc.docId)}
                  className="flex-1 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  열기/전환
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplateAsNewDoc(doc.docId)}
                  className="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                  프로젝트에 추가
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
