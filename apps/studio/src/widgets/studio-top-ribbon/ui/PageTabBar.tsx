import React from "react";
import { FilePlus2, FileText, GitCompare, Plus, X } from "lucide-react";

import { getBlockSlotIds } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { FigmaDiffBadge } from "@/widgets/outline-preview-sidebar/ui/FigmaDiffBadge";

/**
 * 좌측·우측 사이드바 사이(중앙 에디터 영역 최상단)에 위치하는 페이지 단위 탭 바.
 * 안티그래비티(VS Code Git) 스타일로 변경(M)·신규(U) 상태와 Diff 탭을 통합 표시한다.
 */
export const PageTabBar: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const openTabs = useStudioDocumentStore((s) => s.openTabs);
  const activeTabKey = useStudioDocumentStore((s) => s.activeTabKey);
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);
  const openNewTab = useStudioDocumentStore((s) => s.openNewTab);
  const selectTab = useStudioDocumentStore((s) => s.selectTab);
  const closeTab = useStudioDocumentStore((s) => s.closeTab);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);

  if (openTabs.length === 0 && !activeDiff) return null;

  const handleSelectTab = (key: string) => {
    if (activeDiff) closeDiff();
    selectTab(key);
  };

  return (
    <div
      data-testid="studio-page-tab-bar"
      className="h-9 bg-[#f6f6f6] border-b border-slate-200/90 px-2 flex items-end gap-0.5 shrink-0 select-none overflow-x-auto no-scrollbar"
    >
      {openTabs.map((tab) => {
        const isActive = !activeDiff && tab.key === activeTabKey;
        if (tab.kind === "new-tab") {
          return (
            <div
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectTab(tab.key)}
              title="새 탭 — 페이지 추가 출처"
              className={`group flex items-center gap-1.5 h-8 px-3 text-xs cursor-pointer transition shrink-0 ${
                isActive
                  ? "bg-white text-slate-900 font-semibold border border-b-white border-slate-200/90 rounded-t-lg -mb-px z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-t-lg"
              }`}
            >
              <FilePlus2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>새 탭</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.key);
                }}
                title="탭 닫기"
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        }

        const tabDoc = docs.find((d) => d.docId === tab.docId);
        const tabPage = tabDoc?.pages.find((p) => p.pageId === tab.pageId);
        const label = tabPage?.pageLabel || tabDoc?.title || "페이지";

        let diffKind: "added" | "edited" | undefined;
        if (tabDoc && tabPage) {
          if (tabPage.pageLabel.includes("새 페이지") && !committedPageIds.has(tabPage.pageId)) {
            diffKind = "added";
          } else {
            const blockSlots = tabPage.blocks.flatMap((b) => getBlockSlotIds(b));
            const allSlotIds = [
              ...blockSlots,
              ...(tabPage.headerSlotId ? [tabPage.headerSlotId] : []),
              ...(tabPage.footerSlotId ? [tabPage.footerSlotId] : []),
            ];
            if (allSlotIds.some((sid) => Boolean(tabDoc.slots[sid]?.isEdited))) {
              diffKind = "edited";
            }
          }
        }

        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            data-diff={diffKind}
            onClick={() => handleSelectTab(tab.key)}
            title={`${tabDoc?.title ?? ""} · ${label}`}
            className={`fig-row group flex items-center gap-1.5 h-8 px-3 text-xs cursor-pointer transition shrink-0 max-w-[230px] ${
              isActive
                ? "bg-white text-slate-900 font-semibold border border-b-white border-slate-200/90 rounded-t-lg -mb-px z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-t-lg"
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
            <span className="fig-row-label truncate">{label}</span>
            {diffKind && <FigmaDiffBadge diffState={{ kind: diffKind, isDirect: true }} />}
            {openTabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.key);
                }}
                title="탭 닫기"
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Active Diff Tab (Antigravity Working Tree style) */}
      {activeDiff && (
        <div
          role="tab"
          aria-selected={true}
          data-testid="diff-active-tab"
          title={`${activeDiff.label} (Working Tree)`}
          className="group flex items-center gap-1.5 h-8 px-3 text-xs cursor-default transition shrink-0 max-w-[260px] bg-white text-slate-900 font-semibold border border-b-white border-slate-200/90 rounded-t-lg -mb-px z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
        >
          <GitCompare className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{activeDiff.label} (Working Tree)</span>
          <button
            type="button"
            onClick={closeDiff}
            title="Diff 닫기"
            className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* '+' Button -> Opens Obsidian-style New Tab with '페이지 추가 출처' */}
      <button
        type="button"
        data-testid="tabbar-new-tab-btn"
        onClick={() => {
          if (activeDiff) closeDiff();
          openNewTab();
        }}
        title="새 탭 열기 (페이지 추가)"
        className="w-6 h-6 self-center ml-0.5 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer transition shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
