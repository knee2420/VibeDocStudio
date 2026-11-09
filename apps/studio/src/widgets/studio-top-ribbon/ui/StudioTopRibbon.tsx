import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Columns,
  RotateCcw,
  RotateCw,
  Sparkles,
  Square,
} from "lucide-react";

import { useAiStagingStore } from "@/entities/ai-staging";
import {
  DocumentStatusBadges,
  SaveConflictPill,
  selectActiveDocument,
  useStudioDocumentStore,
} from "@/entities/vdoc-document";
import {
  selectActiveProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { selectCurrentReferenceId, useReferenceStore } from "@/entities/reference-manager";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { StudioAgentSettingsButton } from "@/features/agent-settings";
import { VDocFileActionButtons } from "@/features/export-import-vdoc";
import { ImportPdfButton } from "@/features/import-pdf-form";
import { OutlineBreadcrumbBar } from "@/features/zoom-hierarchy";
import { useHistoryStore } from "@/shared/lib";

import { ExecutionPhaseStepper } from "./ExecutionPhaseStepper";
import { ShortcutHelpPopover } from "./ShortcutHelpPopover";

const selectRibbonDocFields = (s: Parameters<typeof selectActiveDocument>[0]) => {
  const d = selectActiveDocument(s);
  return d ? { docId: d.docId, title: d.title, status: d.status, totalValueText: d.totalValueText } : null;
};

export const StudioTopRibbon: React.FC = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // 슬롯 내용이 바뀌어도 리본이 다시 그려지지 않게, 리본이 쓰는 필드만 고른다.
  const doc = useStudioDocumentStore(useShallow(selectRibbonDocFields));
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const totalUndoCount = useHistoryStore((s) => s.past.length);
  const totalRedoCount = useHistoryStore((s) => s.future.length);
  const undoHistory = useHistoryStore((s) => s.undo);
  const redoHistory = useHistoryStore((s) => s.redo);

  const activeProject = useProjectStore(selectActiveProject);
  const referenceId = useReferenceStore(selectCurrentReferenceId);

  const stagingCount = useAiStagingStore((s) => s.queue.length);
  const isAiRunning = useAiStagingStore((s) => s.isRunning);
  const abortAiRun = useAiStagingStore((s) => s.abortRun);

  const openReferenceCount = useWorkspaceSessionStore((s) => s.openReferenceIds.length);
  const openReference = useWorkspaceSessionStore((s) => s.openReference);
  const closeAllReferences = useWorkspaceSessionStore((s) => s.closeAllReferences);

  const setActiveActivityTab = useWorkspaceLayoutStore((s) => s.setActiveActivityTab);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useWorkspaceLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);

  if (!doc || !activeProject) return null;

  const handleGlobalUndo = () => void undoHistory();
  const handleGlobalRedo = () => void redoHistory();

  const toggleMenu = (menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  };

  return (
    <>
      {/* 1st Tier: Global System Titlebar (IDE Menu & Window Title — Height 36px) */}
      <header
        data-testid="studio-top-ribbon"
        className="h-9 bg-slate-900 text-slate-200 px-3 flex items-center justify-between gap-3 shrink-0 z-30 select-none border-b border-slate-800"
      >
        {/* Left: Brand Icon + Global Menus */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-[#248567] text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
            V
          </div>

          <div className="flex items-center text-xs text-slate-300">
            {/* File Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu("file")}
                className={`px-2 py-1 rounded hover:bg-slate-800 cursor-pointer transition ${
                  activeMenu === "file" ? "bg-slate-800 text-white" : ""
                }`}
              >
                파일
              </button>
              {activeMenu === "file" && (
                <div className="absolute left-0 top-7 z-50 w-60 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1 text-xs text-slate-200 space-y-0.5">
                  <ImportPdfButton onActionDone={() => setActiveMenu(null)} />
                  <div className="my-1 border-t border-slate-800" />
                  <VDocFileActionButtons onActionDone={() => setActiveMenu(null)} />
                </div>
              )}
            </div>

            {/* Edit Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu("edit")}
                className={`px-2 py-1 rounded hover:bg-slate-800 cursor-pointer transition ${
                  activeMenu === "edit" ? "bg-slate-800 text-white" : ""
                }`}
              >
                편집
              </button>
              {activeMenu === "edit" && (
                <div className="absolute left-0 top-7 z-50 w-48 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1 text-xs text-slate-200 space-y-0.5">
                  <button
                    type="button"
                    disabled={totalUndoCount === 0}
                    onClick={() => {
                      handleGlobalUndo();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between cursor-pointer"
                  >
                    <span>실행 취소 (Undo)</span>
                    <span className="font-mono text-[10px] text-slate-400">Ctrl+Z</span>
                  </button>
                  <button
                    type="button"
                    disabled={totalRedoCount === 0}
                    onClick={() => {
                      handleGlobalRedo();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between cursor-pointer"
                  >
                    <span>다시 실행 (Redo)</span>
                    <span className="font-mono text-[10px] text-slate-400">Ctrl+Y</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu("view")}
                className={`px-2 py-1 rounded hover:bg-slate-800 cursor-pointer transition ${
                  activeMenu === "view" ? "bg-slate-800 text-white" : ""
                }`}
              >
                보기
              </button>
              {activeMenu === "view" && (
                <div className="absolute left-0 top-7 z-50 w-48 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1 text-xs text-slate-200 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLeftSidebarOpen(!leftSidebarOpen);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>좌측 아웃라이너 토글</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {leftSidebarOpen ? "닫기" : "열기"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRightSidebarOpen(!rightSidebarOpen);
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>우측 인스펙터 토글</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {rightSidebarOpen ? "닫기" : "열기"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Window Title Context (L1 Project / L2 Active Document Title) */}
        <div className="flex-1 flex items-center justify-center max-w-xl min-w-0 px-2 text-xs">
          <div className="flex items-center gap-2 truncate text-slate-300">
            <span className="text-[10px] font-bold text-slate-400 shrink-0 font-mono">
              [L1] {activeProject.title}
            </span>
            <span className="text-slate-500">/</span>
            <input
              type="text"
              aria-label="활성 문서 제목"
              value={doc.title}
              onChange={(e) =>
                updateCurrentDoc((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              className="font-semibold text-slate-100 bg-transparent hover:bg-slate-800 focus:bg-slate-800 focus:ring-1 focus:ring-[#248567] rounded px-1.5 py-0.5 outline-none truncate max-w-xs cursor-text"
              title="클릭하여 문서 제목 인라인 수정"
            />
            <DocumentStatusBadges doc={doc} />
          </div>
        </div>

        {/* Right: AI Abort / Staged Diff / Settings / Shortcuts */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {/* AI Streaming Abort Button */}
          {isAiRunning && (
            <button
              type="button"
              data-testid="ai-abort-btn"
              onClick={abortAiRun}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs animate-pulse cursor-pointer"
              title="실행 중인 AI 생성 작업을 즉시 중단합니다 (Esc)"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              ⏹ 중단 (Esc)
            </button>
          )}

          <SaveConflictPill />

          {/* Staged AI Diffs Pill -> Links directly to Source Control Activity */}
          <button
            type="button"
            data-testid="staged-diffs-pill"
            onClick={() => setActiveActivityTab("source-control")}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer transition font-mono tabular-nums ${
              stagingCount > 0
                ? "bg-amber-500 text-slate-950 border-amber-400 font-bold hover:bg-amber-400"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
            title="Git 소스 제어 & Staged 변경안 열기"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Staged ({stagingCount})</span>
          </button>

          <StudioAgentSettingsButton className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 cursor-pointer transition" />
          <ShortcutHelpPopover />
        </div>
      </header>

      {/* 2nd Tier: Workspace Session & Viewport Action Bar (Height 40px) */}
      <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4 shrink-0 z-20 select-none">
        {/* Left: 4-Level Fractal Breadcrumb Bar */}
        <div className="flex items-center min-w-0">
          <OutlineBreadcrumbBar />
        </div>

        {/* Center: Reversible 3-Phase Stepper */}
        <div className="flex items-center gap-2 shrink-0">
          <ExecutionPhaseStepper />
        </div>

        {/* Right: Unified Undo/Redo & Split View Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 font-mono tabular-nums">
            <button
              type="button"
              data-testid="ribbon-undo-btn"
              disabled={totalUndoCount === 0}
              onClick={handleGlobalUndo}
              title={`통합 실행 취소 (Ctrl+Z) · 이력 ${totalUndoCount}건`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-700 hover:bg-white disabled:opacity-40 cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{totalUndoCount}</span>
            </button>
            <button
              type="button"
              data-testid="ribbon-redo-btn"
              disabled={totalRedoCount === 0}
              onClick={handleGlobalRedo}
              title={`통합 다시 실행 (Ctrl+Y) · 이력 ${totalRedoCount}건`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-700 hover:bg-white disabled:opacity-40 cursor-pointer transition"
            >
              <RotateCw className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            data-testid="canvas-toggle-split-ref-btn"
            disabled={openReferenceCount === 0 && !referenceId}
            onClick={() =>
              openReferenceCount > 0 ? closeAllReferences() : referenceId && openReference(referenceId)
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border cursor-pointer transition disabled:opacity-40 ${
              openReferenceCount > 0
                ? "bg-violet-100 text-violet-900 border-violet-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
            title={openReferenceCount > 0 ? "참조 작업창 모두 닫기" : "지금 고른 레퍼런스를 캔버스 옆에 띄우기"}
          >
            <Columns className="w-3 h-3" />
            <span>스플릿 뷰</span>
          </button>
        </div>
      </div>
    </>
  );
};
