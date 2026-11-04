import React, { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronDown,
  ChevronUp,
  Columns,
  Eye,
  EyeOff,
  Layers,
  Lock,
} from "lucide-react";

import {
  selectAllReferenceProjectIds,
  selectBoundReferenceProjects,
  selectCurrentReferenceProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { EmptyStateCard } from "@/shared/ui";

/**
 * Photoshop Layer View-styled Compact Reference Deck.
 * Ultra-slim vertical footprint (each layer row h-7), Eye visibility toggle,
 * and seamless split-view canvas alignment.
 */
export const DEFAULT_REF_DECK_HEIGHT = 140;

export const ReferenceDeckSection: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const boundRefProjects = useProjectStore(useShallow(selectBoundReferenceProjects));
  const currentRefProject = useProjectStore(selectCurrentReferenceProject);
  const allReferenceIds = useProjectStore(useShallow(selectAllReferenceProjectIds));
  const setSelectedReferenceProjectId = useProjectStore(
    (s) => s.setSelectedReferenceProjectId
  );
  const bindReferenceProjects = useProjectStore((s) => s.bindReferenceProjects);
  const hydrateProjects = useProjectStore((s) => s.hydrate);
  const setPreviewDocId = useWorkspaceSessionStore((s) => s.setPreviewDocId);
  const setPageViewMode = useWorkspaceSessionStore((s) => s.setPageViewMode);
  const setPeekPage = useWorkspaceSessionStore((s) => s.setPeekPage);
  const docs = useStudioDocumentStore((s) => s.docs);

  const hoveredRefDeckItemRef = useRef<{ docId: string; pos: { x: number; y: number } } | null>(null);

  // Ctrl 키를 누르거나 뗄 때 참조 항목 썸네일 피크 반응
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Control" || e.key === "Meta") && hoveredRefDeckItemRef.current) {
        const item = hoveredRefDeckItemRef.current;
        const d = docs.find((doc) => doc.docId === item.docId);
        const pageId = d?.pages[0]?.pageId || "page_1";
        setPeekPage(pageId, item.pos, item.docId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setPeekPage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [docs, setPeekPage]);

  const splitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.splitReferenceDocId
  );
  const setSplitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.setSplitReferenceDocId
  );
  const referenceDeckHeight = useWorkspaceSessionStore(
    (s) => s.referenceDeckHeight || DEFAULT_REF_DECK_HEIGHT
  );
  const setReferenceDeckHeight = useWorkspaceSessionStore(
    (s) => s.setReferenceDeckHeight
  );

  // 마운트 시 서버의 최신 참조 프로젝트 목록을 강제 동기화 (새로고침 없이 실시간 반영)
  useEffect(() => {
    void hydrateProjects();
  }, [hydrateProjects]);

  // 사용자가 명시적으로 숨긴(OFF) 참조 레이어 목록 (기본은 모두 ON)
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);

  // 드래그하여 참조 레이어 높이 조절
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!expanded) {
      setExpanded(true);
    }
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = referenceDeckHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // 바닥에 고정된 패널이므로 마우스를 위로 올리면 (moveEvent.clientY < startY) 높이가 증가함
      const deltaY = startY - moveEvent.clientY;
      setReferenceDeckHeight(startHeight + deltaY);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const toggleVisibility = (projectId: string, docId?: string) => {
    setSelectedReferenceProjectId(projectId);
    const isCurrentlyOn = !hiddenProjectIds.includes(projectId);
    if (isCurrentlyOn) {
      // ON -> OFF: 숨김 목록에 추가 (흐리게 + 작대기/슬래시)
      setHiddenProjectIds((prev) => [...prev, projectId]);
      if (docId && splitReferenceDocId === docId) {
        setSplitReferenceDocId(null);
      }
    } else {
      // OFF -> ON: 숨김 목록에서 제거 (진하게 + 보임)
      setHiddenProjectIds((prev) => prev.filter((id) => id !== projectId));
      if (docId) {
        setSplitReferenceDocId(docId);
      }
    }
  };

  const handleToggleZeroRefs = () => {
    if (boundRefProjects.length > 0) {
      bindReferenceProjects([]);
      setHiddenProjectIds([]);
    } else {
      bindReferenceProjects(allReferenceIds);
      setHiddenProjectIds([]);
    }
  };

  return (
    <section
      data-testid="reference-deck-section"
      style={{
        height: expanded ? `${referenceDeckHeight}px` : undefined,
      }}
      className={`border-t border-slate-200/90 bg-[#fbfbfb] flex flex-col shrink-0 relative select-none ${
        isResizing ? "transition-none" : "transition-[height] duration-75"
      }`}
    >
      {/* Resizable Top Splitter Drag Handle */}
      <div
        data-testid="reference-deck-resizer"
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setReferenceDeckHeight(DEFAULT_REF_DECK_HEIGHT)}
        title="위아래로 드래그하여 참조 레이어 높이 조절 · 더블클릭 시 기본 높이(140px) 복원"
        className="absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize hover:bg-violet-400/30 active:bg-violet-500/50 flex items-center justify-center group z-30 transition-colors"
      >
        <div className="w-10 h-0.5 rounded-full bg-slate-300 group-hover:bg-violet-600 transition-colors" />
      </div>

      {/* Header - Slim 28px bar */}
      <div className="px-3 py-1.5 border-b border-slate-200/70 flex items-center justify-between gap-1.5 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left min-w-0 cursor-pointer hover:opacity-80 transition"
        >
          <Layers className="w-3.5 h-3.5 text-violet-600 shrink-0" />
          <span className="text-[11px] font-bold text-slate-800 tracking-tight">
            참조 레이어
          </span>
          <span className="px-1 py-0.2 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold font-mono tabular-nums">
            {boundRefProjects.length}
          </span>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          )}
        </button>

        <button
          type="button"
          data-testid="toggle-zero-refs-btn"
          onClick={handleToggleZeroRefs}
          title={
            boundRefProjects.length > 0
              ? "참조 0개 빈 상태(Empty State) 검증"
              : "표준 참조 프로젝트 3종 즉시 연결"
          }
          className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-500 hover:text-slate-700 cursor-pointer shrink-0"
        >
          {boundRefProjects.length > 0 ? "비우기" : "+ 복원"}
        </button>
      </div>

      {expanded && (
        <div className="p-1.5 space-y-1 flex-1 overflow-y-auto min-h-0">
          {boundRefProjects.length === 0 ? (
            <EmptyStateCard
              testId="reference-deck-empty-state"
              icon={<Lock className="w-3.5 h-3.5 text-violet-600" />}
              title="연결된 참조 레이어 없음"
              description="참조할 표준 문서를 레이어로 연결하세요."
              actionLabel="+ 3종 연결"
              onAction={() => {
                bindReferenceProjects(allReferenceIds);
                setHiddenProjectIds([]);
              }}
            />
          ) : (
            boundRefProjects.map((rp, idx) => {
              const isSelected = rp.projectId === currentRefProject?.projectId;
              const docId = rp.docIds[0];
              const isOn = !hiddenProjectIds.includes(rp.projectId);

              return (
                <div
                  key={rp.projectId}
                  data-testid={`ref-project-pill-${idx + 1}`}
                  title={`${rp.title} (Ctrl + 호버 시 실물 썸네일 미리보기)`}
                  onMouseEnter={(e) => {
                    const resolvedDocId = docId || rp.docIds[0] || rp.projectId;
                    hoveredRefDeckItemRef.current = { docId: resolvedDocId, pos: { x: e.clientX, y: e.clientY } };
                    if (e.ctrlKey || e.metaKey) {
                      const d = docs.find((doc) => doc.docId === resolvedDocId);
                      const pageId = d?.pages[0]?.pageId || "page_1";
                      setPeekPage(pageId, { x: e.clientX, y: e.clientY }, resolvedDocId);
                    }
                  }}
                  onMouseMove={(e) => {
                    const resolvedDocId = docId || rp.docIds[0] || rp.projectId;
                    hoveredRefDeckItemRef.current = { docId: resolvedDocId, pos: { x: e.clientX, y: e.clientY } };
                    if (e.ctrlKey || e.metaKey) {
                      const d = docs.find((doc) => doc.docId === resolvedDocId);
                      const pageId = d?.pages[0]?.pageId || "page_1";
                      setPeekPage(pageId, { x: e.clientX, y: e.clientY }, resolvedDocId);
                    }
                  }}
                  onMouseLeave={() => {
                    hoveredRefDeckItemRef.current = null;
                    setPeekPage(null);
                  }}
                  onClick={() => {
                    setSelectedReferenceProjectId(rp.projectId);
                    setPageViewMode(true);
                    if (docId) {
                      setPreviewDocId(docId);
                    }
                    if (!isOn) {
                      toggleVisibility(rp.projectId, docId);
                    }
                  }}
                  className={`group flex items-center justify-between h-7.5 px-2 rounded-md text-xs transition-all cursor-pointer select-none border ${
                    isOn
                      ? isSelected
                        ? "bg-violet-50 text-violet-950 border-violet-400 font-bold shadow-2xs opacity-100"
                        : "bg-white text-slate-800 border-slate-300 hover:border-slate-400 font-semibold shadow-2xs opacity-100"
                      : "bg-slate-50/70 text-slate-400 border-slate-200/60 opacity-50 hover:opacity-75"
                  }`}
                >
                  {/* Left: Eye (Visibility Toggle) + Lock + Title */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1.5">
                    <button
                      type="button"
                      title={
                        isOn
                          ? "보임 (클릭 시 숨김/OFF)"
                          : "숨김 (클릭 시 보임/ON)"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVisibility(rp.projectId, docId);
                      }}
                      className={`p-0.5 rounded cursor-pointer shrink-0 transition-colors ${
                        isOn
                          ? "text-slate-900 hover:bg-slate-200/60"
                          : "text-slate-300 hover:text-slate-500 hover:bg-slate-200/40"
                      }`}
                    >
                      {isOn ? (
                        <Eye className="w-3.5 h-3.5 text-slate-900" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </button>

                    <Lock
                      className={`w-2.5 h-2.5 shrink-0 transition-colors ${
                        isOn ? "text-slate-600" : "text-slate-300"
                      }`}
                    />

                    <span
                      className={`truncate text-[11px] leading-tight tracking-tight transition-colors ${
                        isOn
                          ? isSelected
                            ? "text-violet-950 font-bold"
                            : "text-slate-800 font-semibold"
                          : "text-slate-400 font-normal line-through"
                      }`}
                    >
                      {rp.title.replace(/^\[참조 \d\]\s*/, `참조${idx + 1}: `)}
                    </span>
                  </div>

                  {/* Right: Quick Split Badge */}
                  {docId && (
                    <button
                      type="button"
                      data-testid={isSelected ? "open-split-ref-btn" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVisibility(rp.projectId, docId);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition flex items-center gap-0.5 cursor-pointer ${
                        isOn
                          ? isSelected
                            ? "bg-violet-600 text-white font-bold"
                            : "bg-slate-200 text-slate-800 font-medium hover:bg-slate-300"
                          : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      <Columns className="w-2.5 h-2.5" />
                      <span>{isOn ? (splitReferenceDocId === docId ? "대조중" : "보임") : "꺼짐"}</span>
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
