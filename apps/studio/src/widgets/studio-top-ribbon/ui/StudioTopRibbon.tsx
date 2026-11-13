import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Columns,
  PanelLeft,
  PanelRight,
  Redo2,
  Square,
  Undo2,
} from "lucide-react";

import { useActiveSlotEditorStore } from "@vibe/slot-editor";

import { useAiStagingStore } from "@/entities/ai-staging";
import {
  SaveConflictPill,
  selectActiveDocument,
  useStudioDocumentStore,
} from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { selectCurrentReferenceId, useReferenceStore } from "@/entities/reference-manager";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { VDocFileActionButtons } from "@/features/export-import-vdoc";
import { DocumentLifecycleMenuItems } from "@/features/manage-documents";
import { ImportPdfButton } from "@/features/import-pdf-form";
import { useHistoryStore } from "@/shared/lib";

import { ScaffoldJobStatusPill } from "./ScaffoldJobStatusPill";

const selectRibbonDocFields = (s: Parameters<typeof selectActiveDocument>[0]) => {
  const d = selectActiveDocument(s);
  return d ? { docId: d.docId, title: d.title, status: d.status, totalValueText: d.totalValueText } : null;
};

export const StudioTopRibbon: React.FC = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const doc = useStudioDocumentStore(useShallow(selectRibbonDocFields));
  const totalUndoCount = useHistoryStore((s) => s.past.length);
  const totalRedoCount = useHistoryStore((s) => s.future.length);
  const undoHistory = useHistoryStore((s) => s.undo);
  const redoHistory = useHistoryStore((s) => s.redo);
  const activeEditor = useActiveSlotEditorStore((s) => s.activeEditor);
  const [, setEditorTick] = useState(0);

  useEffect(() => {
    const ed = activeEditor && !activeEditor.isDestroyed ? activeEditor : null;
    if (!ed) return;
    const bump = () => setEditorTick((t) => t + 1);
    ed.on("transaction", bump);
    return () => {
      ed.off("transaction", bump);
    };
  }, [activeEditor]);

  const editor = activeEditor && !activeEditor.isDestroyed ? activeEditor : null;
  const canUndo = Boolean(editor?.can().undo()) || totalUndoCount > 0;
  const canRedo = Boolean(editor?.can().redo()) || totalRedoCount > 0;

  const activeProject = useProjectStore(selectActiveProject);
  const referenceId = useReferenceStore(selectCurrentReferenceId);

  const isAiRunning = useAiStagingStore((s) => s.isRunning);
  const abortAiRun = useAiStagingStore((s) => s.abortRun);

  const openReferenceCount = useWorkspaceSessionStore((s) => s.openReferenceIds.length);
  const openReference = useWorkspaceSessionStore((s) => s.openReference);
  const closeAllReferences = useWorkspaceSessionStore((s) => s.closeAllReferences);

  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const rightSidebarOpen = useWorkspaceLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);

  if (!doc || !activeProject) return null;

  const handleGlobalUndo = () =>
    editor?.can().undo() ? editor.chain().focus().undo().run() : void undoHistory();
  const handleGlobalRedo = () =>
    editor?.can().redo() ? editor.chain().focus().redo().run() : void redoHistory();

  const toggleMenu = (menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  };

  const textMenuBtn = (name: string) =>
    `px-2 py-1 rounded text-xs font-medium cursor-pointer transition ${
      activeMenu === name
        ? "bg-slate-200 text-slate-900"
        : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
    }`;

  return (
    <header
      data-testid="studio-top-ribbon"
      className="h-9 bg-[#f6f6f6] text-slate-700 px-2.5 flex items-center justify-between gap-3 shrink-0 z-30 select-none border-b border-slate-200/80"
    >
      {/* Left: Brand Icon + Desktop Menus (File · Edit · View) */}
      <div className="flex items-center gap-1 shrink-0">
        <img
          src="/favicon.png"
          alt="VibeDocStudio"
          className="w-5 h-5 rounded object-cover border border-slate-200 bg-white shrink-0 mr-1"
        />

        {/* File Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu("file")}
            className={textMenuBtn("file")}
          >
            File
          </button>
          {activeMenu === "file" && (
            <div className="absolute left-0 top-7 z-50 w-60 rounded-lg bg-white border border-slate-200 shadow-xl p-1 text-xs text-slate-700 space-y-0.5 [&_button]:text-slate-700 [&_button:hover]:bg-slate-100 [&_button:hover]:text-slate-900">
              <DocumentLifecycleMenuItems onActionDone={() => setActiveMenu(null)} />
              <div className="my-1 border-t border-slate-100" />
              <ImportPdfButton onActionDone={() => setActiveMenu(null)} />
              <div className="my-1 border-t border-slate-100" />
              <VDocFileActionButtons onActionDone={() => setActiveMenu(null)} />
            </div>
          )}
        </div>

        {/* Edit Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleMenu("edit")}
            className={textMenuBtn("edit")}
          >
            Edit
          </button>
          {activeMenu === "edit" && (
            <div className="absolute left-0 top-7 z-50 w-48 rounded-lg bg-white border border-slate-200 shadow-xl p-1 text-xs text-slate-700 space-y-0.5">
              <button
                type="button"
                disabled={totalUndoCount === 0}
                onClick={() => {
                  handleGlobalUndo();
                  setActiveMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 disabled:opacity-40 flex items-center justify-between cursor-pointer"
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
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 disabled:opacity-40 flex items-center justify-between cursor-pointer"
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
            className={textMenuBtn("view")}
          >
            View
          </button>
          {activeMenu === "view" && (
            <div className="absolute left-0 top-7 z-50 w-48 rounded-lg bg-white border border-slate-200 shadow-xl p-1 text-xs text-slate-700 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setLeftSidebarOpen(!leftSidebarOpen);
                  setActiveMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 flex items-center justify-between cursor-pointer"
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
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 flex items-center justify-between cursor-pointer"
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

      {/* Center: Desktop Window Title */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        <span className="text-xs text-slate-500 font-medium truncate">
          {activeProject.title} — {doc.title}
        </span>
      </div>

      {/* Right: Status Pills & Antigravity-style Layout Toggles */}
      <div className="flex items-center gap-1 shrink-0 text-xs">
        {isAiRunning && (
          <button
            type="button"
            data-testid="ai-abort-btn"
            onClick={abortAiRun}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs animate-pulse cursor-pointer mr-1"
            title="실행 중인 AI 생성 작업을 즉시 중단합니다 (Esc)"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            중단
          </button>
        )}

        <SaveConflictPill />
        <ScaffoldJobStatusPill />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canUndo}
          onClick={handleGlobalUndo}
          title="실행 취소 (Ctrl+Z)"
          className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canRedo}
          onClick={handleGlobalRedo}
          title="다시 실행 (Ctrl+Y)"
          className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        <button
          type="button"
          data-testid="collapse-left-sidebar-btn"
          onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
          title={leftSidebarOpen ? "좌측 사이드바 접기" : "좌측 사이드바 펴기"}
          className={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition ${
            leftSidebarOpen
              ? "text-slate-700 hover:bg-slate-200/70"
              : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-900"
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          data-testid="canvas-toggle-split-ref-btn"
          disabled={openReferenceCount === 0 && !referenceId}
          onClick={() =>
            openReferenceCount > 0 ? closeAllReferences() : referenceId && openReference(referenceId)
          }
          className={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition disabled:opacity-35 ${
            openReferenceCount > 0
              ? "bg-violet-100 text-violet-700"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
          }`}
          title={
            openReferenceCount > 0
              ? "참조 작업창 모두 닫기"
              : "스플릿 뷰 (레퍼런스 나란히 보기)"
          }
        >
          <Columns className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
          title={rightSidebarOpen ? "우측 사이드바 접기" : "우측 사이드바 펴기"}
          className={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition ${
            rightSidebarOpen
              ? "text-slate-700 hover:bg-slate-200/70"
              : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-900"
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
