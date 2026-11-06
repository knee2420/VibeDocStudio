import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, ChevronUp, Columns, Eye, EyeOff, Layers, Lock } from "lucide-react";

import type { VProjectManifest } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectAllReferenceProjectIds,
  selectBoundReferenceProjects,
  selectCurrentReferenceProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { REFERENCE_DECK_HEIGHT, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachable, referenceRef, useAttachPickStore, withPicked } from "@/features/ai-workspace";
import { resolvePeekTarget, usePeekTrigger } from "@/features/peek-page";
import { useDragResize } from "@/shared/lib";
import { EmptyStateCard } from "@/shared/ui";

/** "[참조 1] 제목" → "참조1: 제목" (덱에서는 짧게). */
const deckTitle = (project: VProjectManifest, index: number) =>
  project.title.replace(/^(\[참조\s*\d+\]|참조\s*\d+:?)\s*/, `참조${index + 1}: `);

/**
 * 아웃라이너 아래의 참조 레이어 덱 (포토샵 레이어 패널 식).
 * - 눈 아이콘: 덱에서 흐리게 숨기기 (숨기면 띄워 둔 작업창도 닫는다)
 * - "작업" 배지: 캔버스 왼쪽에 참조 작업창 띄우기 / 닫기
 * - 행 클릭: 문서 미리보기 패널에서 그 참조 문서 보기
 */
export const ReferenceDeckSection: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  // 덱에서 흐리게 숨긴 참조 레이어 (화면 표시만의 선택이라 서버에 저장하지 않는다).
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);

  const boundRefProjects = useProjectStore(useShallow(selectBoundReferenceProjects));
  const currentRefProject = useProjectStore(selectCurrentReferenceProject);
  const allReferenceIds = useProjectStore(useShallow(selectAllReferenceProjectIds));
  const setSelectedReferenceProjectId = useProjectStore((s) => s.setSelectedReferenceProjectId);
  const bindReferenceProjects = useProjectStore((s) => s.bindReferenceProjects);

  const openReferenceDocIds = useWorkspaceSessionStore((s) => s.openReferenceDocIds);
  const toggleReferenceDoc = useWorkspaceSessionStore((s) => s.toggleReferenceDoc);
  const openReferenceDoc = useWorkspaceSessionStore((s) => s.openReferenceDoc);
  const closeReferenceDoc = useWorkspaceSessionStore((s) => s.closeReferenceDoc);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);
  const setPagePreviewOpen = useWorkspaceLayoutStore((s) => s.setPagePreviewOpen);
  const deckHeight = useWorkspaceLayoutStore((s) => s.referenceDeckHeight);
  const setDeckHeight = useWorkspaceLayoutStore((s) => s.setReferenceDeckHeight);
  const resetDeckHeight = useWorkspaceLayoutStore((s) => s.resetReferenceDeckHeight);

  const peekTrigger = usePeekTrigger();
  const pickedRefs = useAttachPickStore((s) => s.picked.reference);
  const highlightedEntityId = useWorkspaceSessionStore((s) => s.highlightedEntityId);
  const pickAnchor = React.useRef<number | null>(null);
  const deckRef = (docId: string, idx: number) => referenceRef(docId, deckTitle(boundRefProjects[idx], idx));

  /** Ctrl/⌘+클릭: AI 첨부 묶음에 넣고 빼기 · Shift+클릭: 범위. 처리했으면 true. */
  const pickDeckRow = (e: React.MouseEvent, docId: string | undefined, idx: number) => {
    if (!docId) return false;
    const picks = useAttachPickStore.getState();
    if (e.ctrlKey || e.metaKey) {
      picks.togglePick("reference", deckRef(docId, idx));
      pickAnchor.current = idx;
      return true;
    }
    if (e.shiftKey && pickAnchor.current !== null) {
      const [a, b] = pickAnchor.current < idx ? [pickAnchor.current, idx] : [idx, pickAnchor.current];
      picks.setPicks(
        "reference",
        boundRefProjects
          .slice(a, b + 1)
          .map((p, i) => (p.docIds[0] ? deckRef(p.docIds[0], a + i) : null))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
      );
      window.getSelection()?.removeAllRanges();
      return true;
    }
    if (picks.picked.reference?.length) picks.clearPicks("reference");
    pickAnchor.current = idx;
    return false;
  };
  const { isResizing, onResizeStart } = useDragResize({ axis: "y-up", size: deckHeight, onResize: setDeckHeight });

  const toggleVisibility = (projectId: string, docId: string | undefined) => {
    setSelectedReferenceProjectId(projectId);
    if (hiddenProjectIds.includes(projectId)) {
      setHiddenProjectIds((prev) => prev.filter((id) => id !== projectId));
      if (docId) openReferenceDoc(docId);
    } else {
      setHiddenProjectIds((prev) => [...prev, projectId]);
      if (docId) closeReferenceDoc(docId);
    }
  };

  const bindAll = () => {
    void bindReferenceProjects(allReferenceIds);
    setHiddenProjectIds([]);
  };
  const unbindAll = () => {
    void bindReferenceProjects([]);
    setHiddenProjectIds([]);
  };

  return (
    <section
      data-testid="reference-deck-section"
      style={{ height: expanded ? `${deckHeight}px` : undefined }}
      className={`border-t border-slate-200/90 bg-[#fbfbfb] flex flex-col shrink-0 relative select-none ${
        isResizing ? "transition-none" : "transition-[height] duration-75"
      }`}
    >
      <div
        data-testid="reference-deck-resizer"
        onMouseDown={(e) => {
          if (!expanded) setExpanded(true);
          onResizeStart(e);
        }}
        onDoubleClick={resetDeckHeight}
        title={`위아래로 드래그하여 참조 레이어 높이 조절 · 더블클릭 시 기본 높이(${REFERENCE_DECK_HEIGHT.default}px) 복원`}
        className="absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize hover:bg-amber-400/30 active:bg-amber-500/50 flex items-center justify-center group z-30 transition-colors"
      >
        <div className="w-10 h-0.5 rounded-full bg-slate-300 group-hover:bg-amber-600 transition-colors" />
      </div>

      <div className="px-3 py-1.5 border-b border-slate-200/70 flex items-center justify-between gap-1.5 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left min-w-0 cursor-pointer hover:opacity-80 transition"
        >
          <Layers className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-[11px] font-bold text-slate-800 tracking-tight">참조 레이어</span>
          <span className="px-1 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold font-mono tabular-nums">
            {boundRefProjects.length}
          </span>
          {expanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronUp className="w-3 h-3 text-slate-400" />}
        </button>

        <button
          type="button"
          data-testid="toggle-zero-refs-btn"
          onClick={boundRefProjects.length > 0 ? unbindAll : bindAll}
          title={
            boundRefProjects.length > 0
              ? "이 프로젝트에 연결된 참조 프로젝트를 모두 해제합니다"
              : `참조 프로젝트 ${allReferenceIds.length}종을 모두 연결합니다`
          }
          className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-500 hover:text-slate-700 cursor-pointer shrink-0"
        >
          {boundRefProjects.length > 0 ? "모두 해제" : "+ 모두 연결"}
        </button>
      </div>

      {expanded && (
        <div className="p-1.5 space-y-1 flex-1 overflow-y-auto min-h-0">
          {boundRefProjects.length === 0 ? (
            <EmptyStateCard
              testId="reference-deck-empty-state"
              icon={<Lock className="w-3.5 h-3.5 text-amber-600" />}
              title="연결된 참조 레이어 없음"
              description="참조할 표준 문서를 레이어로 연결하세요."
              actionLabel={`+ ${allReferenceIds.length}종 연결`}
              onAction={bindAll}
            />
          ) : (
            boundRefProjects.map((rp, idx) => {
              const isSelected = rp.projectId === currentRefProject?.projectId;
              const docId = rp.docIds[0];
              const isOn = !hiddenProjectIds.includes(rp.projectId);
              const isPicked = Boolean(docId && pickedRefs?.some((r) => r.id === docId));
              const isAiHighlighted = Boolean(docId && highlightedEntityId === docId);
              const isWorking = Boolean(docId && openReferenceDocIds.includes(docId));

              return (
                <div
                  key={rp.projectId}
                  data-testid={`ref-project-pill-${idx + 1}`}
                  title={`${rp.title} (Ctrl + 호버 시 실물 썸네일 미리보기)`}
                  {...peekTrigger(() => resolvePeekTarget(useStudioDocumentStore.getState().docs, docId))}
                  {...(docId ? attachable(() => withPicked("reference", deckRef(docId, idx))) : {})}
                  data-ai-entity={docId}
                  data-picked={isPicked ? "true" : undefined}
                  onClick={(e) => {
                    if (pickDeckRow(e, docId, idx)) return;
                    setSelectedReferenceProjectId(rp.projectId);
                    setPagePreviewOpen(true);
                    if (docId) setPreviewDocId(docId);
                    if (!isOn) toggleVisibility(rp.projectId, docId);
                  }}
                  className={`group flex items-center justify-between h-7.5 px-2 rounded text-xs transition-all cursor-pointer select-none border ${
                    isPicked || isAiHighlighted ? "ring-2 ring-amber-400 ring-offset-1 " : ""
                  }${
                    isOn
                      ? isSelected
                        ? "bg-amber-50 text-amber-950 border-amber-400 font-bold shadow-2xs opacity-100"
                        : "bg-white text-slate-800 border-slate-300 hover:border-slate-400 font-semibold shadow-2xs opacity-100"
                      : "bg-slate-50/70 text-slate-400 border-slate-200/60 opacity-50 hover:opacity-75"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1.5">
                    <button
                      type="button"
                      title={isOn ? "보임 (클릭 시 숨김/OFF)" : "숨김 (클릭 시 보임/ON)"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVisibility(rp.projectId, docId);
                      }}
                      className={`p-0.5 rounded cursor-pointer shrink-0 transition-colors ${
                        isOn ? "text-slate-900 hover:bg-slate-200/60" : "text-slate-300 hover:text-slate-500 hover:bg-slate-200/40"
                      }`}
                    >
                      {isOn ? <Eye className="w-3.5 h-3.5 text-slate-900" /> : <EyeOff className="w-3.5 h-3.5 text-slate-300" />}
                    </button>
                    <Lock className={`w-2.5 h-2.5 shrink-0 transition-colors ${isOn ? "text-slate-600" : "text-slate-300"}`} />
                    <span
                      className={`truncate text-[11px] leading-tight tracking-tight transition-colors ${
                        isOn
                          ? isSelected
                            ? "text-amber-950 font-bold"
                            : "text-slate-800 font-semibold"
                          : "text-slate-400 font-normal line-through"
                      }`}
                    >
                      {deckTitle(rp, idx)}
                    </span>
                  </div>

                  {docId && (
                    <button
                      type="button"
                      data-testid={isSelected ? "open-split-ref-btn" : undefined}
                      title={isWorking ? "레퍼런스 작업창 닫기" : "레퍼런스 작업창 띄우기"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReferenceDoc(docId);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition flex items-center gap-1 cursor-pointer ${
                        isWorking
                          ? "bg-amber-600 text-white font-bold ring-1 ring-amber-400 shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-medium"
                      }`}
                    >
                      <Columns className="w-2.5 h-2.5" />
                      <span>{isWorking ? "작업중" : "작업"}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
