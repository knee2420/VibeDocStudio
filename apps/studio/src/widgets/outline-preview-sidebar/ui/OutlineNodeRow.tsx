import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Copy,
  FilePlus2,
  FileText,
  FolderTree,
  Layers,
  LayoutGrid,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import type { PagePendingState } from "@vibe/slot-canvas";
import type { OutlinerNode } from "@vibe/vdoc-schema";

/** 아웃라인 노드가 캔버스에서 가리키는 대상 (호버 강조에 쓴다). */
export function outlineNodeTargetId(node: OutlinerNode): string {
  return node.targetSlotId || node.targetBlockId || node.targetPageId || node.nodeId;
}

const NodeIcon: React.FC<{ node: OutlinerNode }> = ({ node }) => {
  const cls = "w-3.5 h-3.5 text-slate-400 shrink-0";
  if (node.zoomLevel === "project") return <FolderTree className={cls} />;
  if (node.zoomLevel === "document") return <FileText className={cls} />;
  if (node.zoomLevel === "page") return node.targetBlockId ? <LayoutGrid className={cls} /> : <Layers className={cls} />;
  return node.isStatic ? (
    <span className="w-1.5 h-1.5 rounded-full border border-slate-300 shrink-0 mx-1" />
  ) : (
    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mx-1" />
  );
};

const hoverAction = "p-0.5 rounded hover:bg-slate-300/60 text-slate-400 hover:text-slate-700 cursor-pointer";

export interface OutlineNodeRowProps {
  node: OutlinerNode;
  isSelected: boolean;
  isHighlighted: boolean;
  /** Ctrl/Shift+클릭으로 AI 첨부 묶음에 고른 노드. */
  isPicked?: boolean;
  /** 끌기 · 우클릭으로 Composer 에 첨부 (`attachable()`). */
  attachProps?: Partial<Pick<React.HTMLAttributes<HTMLDivElement>, "draggable" | "onDragStart" | "onContextMenu">>;
  hasChildren: boolean;
  isCollapsed: boolean;
  /** 기획 노드의 구조 변경(이동 · 들여쓰기 · 삭제) 허용 여부 (1·2단계 전용). */
  editable: boolean;
  /** 문서 루트 노드 여부 (`+ 페이지` 메뉴 표시, 모든 단계 허용). */
  canAddPage?: boolean;
  /** 페이지 행 여부 (이름 변경 · 사본 만들기 · 페이지 삭제, 모든 단계 허용). */
  canManagePage?: boolean;
  /** 문서에 2페이지 이상 남아 있을 때만 페이지 삭제 허용. */
  canDeletePage?: boolean;
  /** 비동기 PDF 스캐폴딩 예약 페이지 상태 (현재 실행 중인 페이지만 스피너 회전). */
  pendingState?: PagePendingState | null;
  /** 현재 인라인 이름 편집 중일 때 초기 입력값 (undefined 면 일반 표시). */
  renamingInitialTitle?: string;
  peekHandlers: Partial<Pick<React.HTMLAttributes<HTMLDivElement>, "onMouseEnter" | "onMouseMove" | "onMouseLeave">>;
  onSelect: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onHoverChange: (hovering: boolean) => void;
  onToggleCollapse: () => void;
  onZoomIn: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onOpenAddPageMenu?: (anchorEl: HTMLElement) => void;
  onStartRename?: () => void;
  onCommitRename?: (nextTitle: string) => void;
  onCancelRename?: () => void;
  onDuplicatePage?: () => void;
  onDeletePage?: () => void;
}

/** Workflowy 식 아웃라인 한 줄: 접기 삼각형 · 수준 아이콘 · 제목(더블클릭/F2 편집) · 호버 동작. */
export const OutlineNodeRow: React.FC<OutlineNodeRowProps> = ({
  node,
  isSelected,
  isHighlighted,
  isPicked,
  attachProps,
  hasChildren,
  isCollapsed,
  editable,
  canAddPage = false,
  canManagePage = false,
  canDeletePage = true,
  pendingState = null,
  renamingInitialTitle,
  peekHandlers,
  onSelect,
  onKeyDown,
  onHoverChange,
  onToggleCollapse,
  onZoomIn,
  onMove,
  onDelete,
  onOpenAddPageMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicatePage,
  onDeletePage,
}) => {
  const isRenaming = renamingInitialTitle !== undefined;
  const [draft, setDraft] = useState(renamingInitialTitle ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingInitialTitle !== undefined) {
      setDraft(renamingInitialTitle);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [renamingInitialTitle]);

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const commitIfNeeded = () => {
    if (!isRenaming) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== renamingInitialTitle) {
      onCommitRename?.(trimmed);
    } else {
      onCancelRename?.();
    }
  };

  const canRename = canManagePage || editable;

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={isSelected}
      data-testid={`outline-node-row-${node.nodeId}`}
      data-picked={isPicked ? "true" : undefined}
      {...(isRenaming ? {} : attachProps)}
      style={{ paddingLeft: `${Math.min(node.depth, 6) * 16 + 4}px` }}
      onClick={onSelect}
      onDoubleClick={(e) => {
        if (!canRename || isRenaming) return;
        e.stopPropagation();
        onStartRename?.();
      }}
      onKeyDown={onKeyDown}
      onMouseEnter={(e) => {
        onHoverChange(true);
        peekHandlers.onMouseEnter?.(e);
      }}
      onMouseMove={peekHandlers.onMouseMove}
      onMouseLeave={(e) => {
        onHoverChange(false);
        peekHandlers.onMouseLeave?.(e);
      }}
      className={`group relative flex items-center gap-1.5 h-7 px-1.5 rounded-md transition-colors cursor-pointer text-[13px] leading-none ${
        isPicked ? "ring-1 ring-violet-400 bg-violet-50 text-violet-950 " : ""
      }${
        isSelected
          ? "bg-slate-200/80 text-slate-950 font-medium"
          : isHighlighted
            ? "bg-slate-100 text-slate-900"
            : "hover:bg-slate-100/70 text-slate-700"
      }`}
    >
      {hasChildren ? (
        <button
          type="button"
          data-testid={`fold-toggle-${node.nodeId}`}
          onClick={stop(onToggleCollapse)}
          title={isCollapsed ? "펼치기" : "접기"}
          className="w-3.5 h-3.5 rounded hover:bg-slate-300/50 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3 fill-current" /> : <ChevronDown className="w-3 h-3 fill-current" />}
        </button>
      ) : (
        <span className="w-3.5 h-3.5 shrink-0" />
      )}

      {pendingState?.status === "running" ? (
        <Loader2
          data-testid={`outline-page-spinner-${node.nodeId}`}
          className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0"
        />
      ) : pendingState?.status === "queued" ? (
        <Clock
          data-testid={`outline-page-queued-${node.nodeId}`}
          className="w-3.5 h-3.5 text-slate-400 shrink-0"
        />
      ) : pendingState?.status === "failed" || pendingState?.status === "cancelled" ? (
        <AlertTriangle
          data-testid={`outline-page-failed-${node.nodeId}`}
          className="w-3.5 h-3.5 text-amber-500 shrink-0"
        />
      ) : (
        <NodeIcon node={node} />
      )}

      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          data-testid={`rename-outline-input-${node.nodeId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitIfNeeded}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitIfNeeded();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename?.();
            }
          }}
          className="flex-1 min-w-0 h-5 px-1.5 rounded bg-white border border-emerald-500 text-xs text-slate-900 focus:outline-none"
        />
      ) : (
        /* 고정 텍스트는 회색, 위치로 지은 이름은 ⚠ */
        <span
          data-testid={`outline-node-title-${node.nodeId}`}
          title={`${node.title}${node.summary ? `\n\n${node.summary}` : ""}${
            node.nameNeedsReview ? "\n\n⚠ 이름 확인 필요 (라벨을 찾지 못해 위치로 지은 이름)" : ""
          }${canRename ? "\n\n더블클릭 또는 F2: 이름 변경" : ""}`}
          className={`truncate flex-1 min-w-0 ${node.isStatic ? "text-slate-400" : ""}`}
        >
          {node.title}
        </span>
      )}

      {!isRenaming && node.nameNeedsReview && (
        <span data-testid={`outline-node-review-${node.nodeId}`} title="이름 확인 필요" className="text-[11px] text-amber-500 shrink-0">
          ⚠
        </span>
      )}

      {!isRenaming && pendingState?.status === "running" && (
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-semibold shrink-0">
          {pendingState.iter ? `${pendingState.iter}회 검증` : "변환 중"}
        </span>
      )}

      {!isRenaming && pendingState?.status === "queued" && (
        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/80 text-[10px] font-medium shrink-0">
          대기
        </span>
      )}

      {!isRenaming && (pendingState?.status === "failed" || pendingState?.status === "cancelled") && (
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80 text-[10px] font-medium shrink-0">
          {pendingState.status === "cancelled" ? "중단" : "실패"}
        </span>
      )}

      {!isRenaming && node.provenanceSourceProjectId && (
        <span
          title={`참조 출처: ${node.provenanceSourceProjectId}`}
          className="text-[11px] text-blue-500/80 font-mono shrink-0 ml-1 hover:underline"
        >
          #참조
        </span>
      )}

      {!isRenaming && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
          <button type="button" data-testid={`zoom-bullet-${node.nodeId}`} onClick={stop(onZoomIn)} title="Zoom-In" className={hoverAction}>
            <CircleDot className="w-3 h-3" />
          </button>

          {canAddPage && onOpenAddPageMenu && (
            <button
              type="button"
              data-testid={`add-page-menu-btn-${node.nodeId}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddPageMenu(e.currentTarget);
              }}
              title="페이지 추가 (기본 페이지 · PDF · 템플릿)"
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[10px] font-semibold cursor-pointer"
            >
              <FilePlus2 className="w-3 h-3" />
              <span>+ 페이지</span>
            </button>
          )}

          {canManagePage && (
            <>
              <button
                type="button"
                data-testid={`rename-page-btn-${node.nodeId}`}
                onClick={stop(() => onStartRename?.())}
                title="페이지 이름 변경 (F2 / 더블클릭)"
                className={hoverAction}
              >
                <Pencil className="w-3 h-3" />
              </button>
              {!pendingState && (
                <button
                  type="button"
                  data-testid={`duplicate-page-btn-${node.nodeId}`}
                  onClick={stop(() => onDuplicatePage?.())}
                  title="페이지 사본 만들기"
                  className={hoverAction}
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                data-testid={`delete-page-btn-${node.nodeId}`}
                disabled={!canDeletePage}
                onClick={stop(() => {
                  if (canDeletePage) onDeletePage?.();
                })}
                title={canDeletePage ? "페이지 삭제 (Delete)" : "마지막 1페이지는 삭제할 수 없습니다"}
                className={`p-0.5 rounded ${
                  canDeletePage
                    ? "hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                    : "text-slate-300 cursor-not-allowed"
                }`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}

          {editable && (
            <>
              <button type="button" onClick={stop(() => onMove(-1))} title="위로 이동" className={hoverAction}>
                <ArrowUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={stop(() => onMove(1))} title="아래로 이동" className={hoverAction}>
                <ArrowDown className="w-3 h-3" />
              </button>
              {!canManagePage && (
                <button
                  type="button"
                  data-testid={`delete-outline-node-${node.nodeId}`}
                  onClick={stop(onDelete)}
                  title="기획 노드 삭제"
                  className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
