import React, { useState } from "react";
import { ChevronDown, ChevronUp, Columns, Eye, EyeOff, Layers, Lock } from "lucide-react";

import { useReferenceStore } from "@/entities/reference-manager";
import { REFERENCE_DECK_HEIGHT, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { attachable, referenceRef, useAttachPickStore, withPicked } from "@/features/ai-workspace";
import { useDragResize } from "@/shared/lib";
import { EmptyStateCard } from "@/shared/ui";

/**
 * 아웃라이너 아래의 레퍼런스 레이어 덱 (포토샵 레이어 패널 식) — 이 프로젝트에 연결된 레퍼런스.
 * - 눈 아이콘: AI 에 이 레퍼런스를 쓸지 (연결은 유지)
 * - "작업" 배지: 캔버스 왼쪽에 레퍼런스 작업창 띄우기 / 닫기
 * - 행 클릭: 그 레퍼런스를 지금 보는 레퍼런스로 고른다 (작업 문서는 바꾸지 않는다)
 * 레퍼런스 추가 · 핀 · 층위는 Reference Manager 에서 한다.
 */
export const ReferenceDeckSection: React.FC = () => {
  const [expanded, setExpanded] = useState(true);

  const bound = useReferenceStore((s) => s.bound);
  const activeRefId = useReferenceStore((s) => s.activeRefId);
  const setActiveRefId = useReferenceStore((s) => s.setActiveRefId);
  const setEnabled = useReferenceStore((s) => s.setEnabled);

  const openReferenceIds = useWorkspaceSessionStore((s) => s.openReferenceIds);
  const toggleReference = useWorkspaceSessionStore((s) => s.toggleReference);
  const highlightedEntityId = useWorkspaceSessionStore((s) => s.highlightedEntityId);
  const setLeftPanelTab = useWorkspaceLayoutStore((s) => s.setLeftPanelTab);
  const deckHeight = useWorkspaceLayoutStore((s) => s.referenceDeckHeight);
  const setDeckHeight = useWorkspaceLayoutStore((s) => s.setReferenceDeckHeight);
  const resetDeckHeight = useWorkspaceLayoutStore((s) => s.resetReferenceDeckHeight);

  const pickedRefs = useAttachPickStore((s) => s.picked.reference);
  const pickAnchor = React.useRef<number | null>(null);
  const { isResizing, onResizeStart } = useDragResize({ axis: "y-up", size: deckHeight, onResize: setDeckHeight });

  /** Ctrl/⌘+클릭: AI 첨부 묶음에 넣고 빼기 · Shift+클릭: 범위. 처리했으면 true. */
  const pickRow = (e: React.MouseEvent, idx: number) => {
    const picks = useAttachPickStore.getState();
    if (e.ctrlKey || e.metaKey) {
      picks.togglePick("reference", referenceRef(bound[idx].refId));
      pickAnchor.current = idx;
      return true;
    }
    if (e.shiftKey && pickAnchor.current !== null) {
      const [a, b] = pickAnchor.current < idx ? [pickAnchor.current, idx] : [idx, pickAnchor.current];
      picks.setPicks("reference", bound.slice(a, b + 1).map((r) => referenceRef(r.refId)));
      window.getSelection()?.removeAllRanges();
      return true;
    }
    if (picks.picked.reference?.length) picks.clearPicks("reference");
    pickAnchor.current = idx;
    return false;
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
        title={`위아래로 드래그하여 높이 조절 · 더블클릭 시 기본 높이(${REFERENCE_DECK_HEIGHT.default}px)`}
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
          <span className="text-[11px] font-bold text-slate-800 tracking-tight">레퍼런스 레이어</span>
          <span className="px-1 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold font-mono tabular-nums">
            {bound.length}
          </span>
          {expanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronUp className="w-3 h-3 text-slate-400" />}
        </button>
        <button
          type="button"
          data-testid="reference-deck-manage-btn"
          onClick={() => setLeftPanelTab("reference-manager")}
          title="Reference Manager 에서 추가 · 핀 · 층위 관리"
          className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-500 hover:text-slate-700 cursor-pointer shrink-0"
        >
          관리
        </button>
      </div>

      {expanded && (
        <div className="p-1.5 space-y-1 flex-1 overflow-y-auto min-h-0">
          {bound.length === 0 ? (
            <EmptyStateCard
              testId="reference-deck-empty-state"
              icon={<Lock className="w-3.5 h-3.5 text-amber-600" />}
              title="연결된 레퍼런스 없음"
              description="따라 하고 싶은 남의 완성물을 Reference Manager 에서 추가하세요."
              actionLabel="+ 레퍼런스 추가"
              onAction={() => setLeftPanelTab("reference-manager")}
            />
          ) : (
            bound.map((entry, idx) => {
              const { refId, item } = entry;
              const isSelected = refId === (activeRefId ?? bound[0]?.refId);
              const isPicked = Boolean(pickedRefs?.some((r) => r.id === refId));
              const isAiHighlighted = highlightedEntityId === refId;
              const isWorking = openReferenceIds.includes(refId);
              return (
                <div
                  key={refId}
                  data-testid={`ref-project-pill-${idx + 1}`}
                  title={item.title}
                  {...attachable(() => withPicked("reference", referenceRef(refId)))}
                  data-ai-entity={refId}
                  data-picked={isPicked ? "true" : undefined}
                  onClick={(e) => {
                    if (pickRow(e, idx)) return;
                    setActiveRefId(refId);
                  }}
                  className={`group flex items-center justify-between h-7.5 px-2 rounded text-xs transition-all cursor-pointer select-none border ${
                    isPicked || isAiHighlighted ? "ring-2 ring-amber-400 ring-offset-1 " : ""
                  }${
                    entry.enabled
                      ? isSelected
                        ? "bg-amber-50 text-amber-950 border-amber-400 font-bold shadow-2xs"
                        : "bg-white text-slate-800 border-slate-300 hover:border-slate-400 font-semibold shadow-2xs"
                      : "bg-slate-50/70 text-slate-400 border-slate-200/60 opacity-50 hover:opacity-75"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1.5">
                    <button
                      type="button"
                      title={entry.enabled ? "AI 에 사용 중 (클릭 시 끄기)" : "AI 에 쓰지 않음 (클릭 시 켜기)"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setEnabled(refId, !entry.enabled);
                      }}
                      className="p-0.5 rounded cursor-pointer shrink-0 hover:bg-slate-200/60"
                    >
                      {entry.enabled ? <Eye className="w-3.5 h-3.5 text-slate-900" /> : <EyeOff className="w-3.5 h-3.5 text-slate-300" />}
                    </button>
                    <Lock className={`w-2.5 h-2.5 shrink-0 ${entry.enabled ? "text-slate-600" : "text-slate-300"}`} />
                    <span className={`truncate text-[11px] leading-tight tracking-tight ${entry.enabled ? "" : "line-through"}`}>
                      참조{idx + 1}: {item.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={isSelected ? "open-split-ref-btn" : undefined}
                    title={isWorking ? "레퍼런스 작업창 닫기" : "레퍼런스 작업창 띄우기"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRefId(refId);
                      toggleReference(refId);
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
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
