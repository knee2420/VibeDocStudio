import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ViewMode } from "@vibe/outliner";
import {
  OutlineBoard,
  OutlineEditorProvider,
  OutlineHeader,
  OutlineTree,
  createOutlineEditorStore,
  useOutlineView,
} from "@vibe/outliner/editor";
import { ArrowRight, Eye, Loader2, Sparkles, SplitSquareHorizontal } from "lucide-react";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { createOutlineHost } from "../model/createOutlineHost";
import { createOutlinePort } from "../model/createOutlinePort";
import { workingToOutlinerNodes } from "../model/elementLabelRules";
import { useCompileAndCommit } from "../model/useCompileAndCommit";
import { useOutlineZoomSync } from "../model/useOutlineZoomSync";
import { ElementKindBadge } from "./ElementKindBadge";
import { SlashElementMenu, type SlashMenuTarget } from "./SlashElementMenu";

const OutlineCanvasBody: React.FC = () => {
  const { view } = useOutlineView();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
      {view === "board" ? <OutlineBoard /> : <OutlineTree />}
    </div>
  );
};

export interface WorkflowyOutlinerSurfaceProps {
  splitOpen: boolean;
  onToggleSplitPreview: () => void;
}

export const WorkflowyOutlinerSurface: React.FC<WorkflowyOutlinerSurfaceProps> = ({
  splitOpen,
  onToggleSplitPreview,
}) => {
  const project = useProjectStore(selectActiveProject);
  const documents = useStudioDocumentStore((s) => s.docs);
  const activeDoc = useStudioDocumentStore(selectActiveDocument);

  const outline = useWorkingOutlineStore((s) => s.outline);
  const loadedProjectId = useWorkingOutlineStore((s) => s.loadedProjectId);
  const loading = useWorkingOutlineStore((s) => s.loading);
  const saving = useWorkingOutlineStore((s) => s.saving);
  const loadWorkingOutline = useWorkingOutlineStore((s) => s.loadWorkingOutline);
  const turnIntoNode = useWorkingOutlineStore((s) => s.turnIntoNode);

  const [defaultView, setDefaultView] = useState<ViewMode>("bullets");
  const [slashTarget, setSlashTarget] = useState<SlashMenuTarget | null>(null);
  const [rootTitleDraft, setRootTitleDraft] = useState<string | null>(null);

  const { dirty, compiling, committing, compilePreview, commitToPhase3 } = useCompileAndCommit();

  useEffect(() => {
    if (!project) return;
    if (loadedProjectId === project.projectId && outline) return;
    const projectDocs = documents.filter((d) => project.docIds.includes(d.docId));
    if (project.docIds.length > 0 && projectDocs.length === 0 && !activeDoc) return;
    void loadWorkingOutline(project, projectDocs.length > 0 ? projectDocs : activeDoc ? [activeDoc] : []);
  }, [activeDoc, documents, loadWorkingOutline, loadedProjectId, outline, project]);

  const editorStore = useMemo(
    () => createOutlineEditorStore(createOutlinePort((view) => setDefaultView(view))),
    []
  );

  useOutlineZoomSync(editorStore);

  const handleTurnInto = useCallback(
    (nodeId: string, nextKind: Parameters<typeof turnIntoNode>[1]) => {
      turnIntoNode(nodeId, nextKind);
    },
    [turnIntoNode]
  );

  const host = useMemo(
    () =>
      createOutlineHost({
        renderNodeBadge: (node) => (
          <ElementKindBadge
            nodeId={node.id}
            onTurnInto={(nextKind) => handleTurnInto(node.id, nextKind)}
          />
        ),
        onSlashTrigger: ({ nodeId, caretOffset, text, anchorEl }) => {
          if (caretOffset !== 0 && text.trim().length > 0) return false;
          const rect = anchorEl?.getBoundingClientRect();
          setSlashTarget({
            nodeId,
            top: rect ? Math.min(window.innerHeight - 260, rect.bottom + 6) : 160,
            left: rect ? Math.min(window.innerWidth - 280, rect.left) : 200,
          });
          return true;
        },
      }),
    [handleTurnInto]
  );

  const rootNodes = useMemo(
    () => (outline ? workingToOutlinerNodes(outline.nodes) : []),
    [outline]
  );

  if (!project) return null;

  return (
    <div className="vdoc-outliner-theme h-full flex flex-col bg-white text-slate-900">
      <div className="border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 bg-slate-50/70">
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="font-medium text-slate-700 truncate">Workflowy Outliner</span>
          {saving ? (
            <span className="text-[11px] text-slate-400">저장 중...</span>
          ) : dirty ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
              미반영 변경
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
              문서 동기화됨
            </span>
          )}
          <span className="hidden md:inline text-[11px] text-slate-400">
            Enter 새 항목 · Tab 들여쓰기 · `/` 유형 지정
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={compiling}
            onClick={() => {
              void compilePreview();
              if (!splitOpen) onToggleSplitPreview();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50"
          >
            {compiling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            미리보기 컴파일
          </button>

          <button
            type="button"
            onClick={onToggleSplitPreview}
            title="좌측 Outliner / 우측 실시간 .vdoc 분할 보기"
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
              splitOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            분할
          </button>

          <button
            type="button"
            disabled={committing}
            onClick={() => {
              void commitToPhase3({ switchToDrafting: true });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            문서에 반영
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading && !outline ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          WorkingOutline 불러오는 중...
        </div>
      ) : (
        <OutlineEditorProvider
          store={editorStore}
          host={host}
          rootNodes={rootNodes}
          defaultView={defaultView}
        >
          <div className="px-6 pt-3 pb-1 border-b border-slate-100">
            <OutlineHeader
              rootTitle={rootTitleDraft ?? project.title}
              onUpdateRootTitle={setRootTitleDraft}
              rootPlaceholder="프로젝트 제목"
              showViewToggle
              showBreadcrumb
            />
          </div>
          <OutlineCanvasBody />
        </OutlineEditorProvider>
      )}

      {slashTarget ? (
        <SlashElementMenu
          key={slashTarget.nodeId}
          target={slashTarget}
          onSelect={handleTurnInto}
          onClose={() => setSlashTarget(null)}
        />
      ) : null}
    </div>
  );
};
