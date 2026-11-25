import React, { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FileText, GitCompare, MoreHorizontal, Plus, X } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { setSplitDragData } from "@/entities/workspace-layout";
import { useActiveDiffStore } from "@/features/document-diff";
import { useWorkingPagesByDoc } from "@/features/document-revisions";
import { FigmaDiffBadge } from "@/widgets/outline-preview-sidebar/ui/FigmaDiffBadge";

/**
 * 좌측·우측 사이드바 사이(중앙 에디터 영역 최상단)에 위치하는 페이지 단위 탭 바.
 * 안티그래비티(VS Code Git) 스타일로 변경(M)·신규(U) 상태와 Diff 탭을 통합 표시한다.
 */
export const PageTabBar: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const openTabs = useStudioDocumentStore((s) => s.openTabs);
  const activeTabKey = useStudioDocumentStore((s) => s.activeTabKey);
  const openNewTab = useStudioDocumentStore((s) => s.openNewTab);
  const selectTab = useStudioDocumentStore((s) => s.selectTab);
  const closeTab = useStudioDocumentStore((s) => s.closeTab);
  const closeOtherTabs = useStudioDocumentStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useStudioDocumentStore((s) => s.closeTabsToRight);
  const closeAllTabs = useStudioDocumentStore((s) => s.closeAllTabs);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPos && !ctxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuPos(null);
      setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuPos(null);
        setCtxMenu(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuPos, ctxMenu]);
  // 변경 기록(Changes)과 같은 기준: 마지막 버전 이후 새 쪽(U) · 고친 쪽(M)
  const tabDocIds = useMemo(() => openTabs.flatMap((t) => (t.kind === "page" && t.docId ? [t.docId] : [])), [openTabs]);
  const working = useWorkingPagesByDoc(tabDocIds);

  if (openTabs.length === 0 && !activeDiff) return null;
  // 개정 이력 비교에 "(Working Tree)"가 붙던 문제: 종류별로 붙인다 (개정 번호는 label 에 이미 있다).
  const diffTabSuffix =
    activeDiff?.type === "version" ? "버전 비교" : activeDiff?.type === "revision" ? "편집 기록" : activeDiff?.type === "staged" ? "AI 제안" : "지금 작업";

  const handleSelectTab = (key: string) => {
    if (activeDiff) closeDiff();
    selectTab(key);
  };

  return (
    <div
      data-testid="studio-page-tab-bar"
      data-chrome="page-tabs"
      className="h-10 bg-[#f6f6f6] border-b border-[var(--vds-border)] px-2 flex items-end gap-0.5 shrink-0 select-none overflow-x-auto no-scrollbar"
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
          const wp = working[tabDoc.docId]?.find((w) => w.page.pageId === tabPage.pageId);
          if (wp && wp.kind !== "deleted") diffKind = wp.kind;
        }

        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            draggable={Boolean(tab.docId)}
            onDragStart={(e) => {
              if (!tab.docId) return;
              e.dataTransfer.effectAllowed = "copyMove";
              setSplitDragData(e, { docId: tab.docId, pageId: tab.pageId });
            }}
            data-diff={diffKind}
            onClick={() => handleSelectTab(tab.key)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuPos(null);
              setCtxMenu({ x: e.clientX, y: e.clientY, key: tab.key });
            }}
            title={`${tabDoc?.title ?? ""} · ${label} (우클릭: 탭 정리 · 캔버스로 끌어다 놓아 나란히 보기)`}
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
          title={`${activeDiff.label} (${diffTabSuffix})`}
          className="group flex items-center gap-1.5 h-8 px-3 text-xs cursor-default transition shrink-0 max-w-[260px] bg-white text-slate-900 font-semibold border border-b-white border-slate-200/90 rounded-t-lg -mb-px z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.03)]"
        >
          <GitCompare className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{activeDiff.label} ({diffTabSuffix})</span>
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

      {/* 우측 끝: VS Code 스타일 탭 일괄 정리 메뉴 (⋯) */}
      <div className="ml-auto self-center pl-1 shrink-0 relative">
        <button
          type="button"
          data-testid="tabbar-more-btn"
          onClick={(e) => {
            setCtxMenu(null);
            if (menuPos) {
              setMenuPos(null);
            } else {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
            }
          }}
          title="탭 정리 메뉴 (모두 닫기 · 다른 탭 닫기)"
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer transition"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>

        {menuPos && (
          <div
            ref={menuRef}
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-50 w-44 rounded-lg border border-[#e4e4e7] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] py-1 text-[11.5px] text-[#18181b]"
          >
            <button
              type="button"
              disabled={openTabs.length <= 1}
              onClick={() => {
                if (activeDiff) closeDiff();
                closeOtherTabs(activeTabKey);
                setMenuPos(null);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer"
            >
              다른 탭 모두 닫기
            </button>
            <button
              type="button"
              disabled={openTabs.findIndex((t) => t.key === activeTabKey) >= openTabs.length - 1}
              onClick={() => {
                if (activeDiff) closeDiff();
                closeTabsToRight(activeTabKey);
                setMenuPos(null);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer"
            >
              오른쪽 탭 모두 닫기
            </button>
            <div className="my-1 border-t border-[#e4e4e7]" />
            <button
              type="button"
              data-testid="tabbar-close-all-btn"
              onClick={() => {
                if (activeDiff) closeDiff();
                closeAllTabs();
                setMenuPos(null);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] text-[#dc2626] font-medium cursor-pointer"
            >
              모든 탭 닫기 ({openTabs.length})
            </button>
          </div>
        )}
      </div>

      {/* 탭 우클릭 컨텍스트 메뉴 */}
      {ctxMenu && (
        <div
          ref={menuRef}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          className="fixed z-50 w-44 rounded-lg border border-[#e4e4e7] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] py-1 text-[11.5px] text-[#18181b]"
        >
          <button
            type="button"
            onClick={() => {
              closeTab(ctxMenu.key);
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] cursor-pointer"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={openTabs.length <= 1}
            onClick={() => {
              if (activeDiff) closeDiff();
              closeOtherTabs(ctxMenu.key);
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer"
          >
            다른 탭 모두 닫기
          </button>
          <button
            type="button"
            disabled={openTabs.findIndex((t) => t.key === ctxMenu.key) >= openTabs.length - 1}
            onClick={() => {
              if (activeDiff) closeDiff();
              closeTabsToRight(ctxMenu.key);
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] disabled:opacity-40 cursor-pointer"
          >
            오른쪽 탭 모두 닫기
          </button>
          <div className="my-1 border-t border-[#e4e4e7]" />
          <button
            type="button"
            onClick={() => {
              if (activeDiff) closeDiff();
              closeAllTabs();
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#f4f4f5] text-[#dc2626] font-medium cursor-pointer"
          >
            모든 탭 닫기
          </button>
        </div>
      )}
    </div>
  );
};
