import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Component,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FolderTree,
  Hash,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Table,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";

import type { PagePendingState } from "@vibe/slot-canvas";
import type { OutlinerNode } from "@vibe/vdoc-schema";

import { DocumentSurfaceIcon, type DocumentSurfaceKind } from "@/shared/ui";

/** 아웃라인 노드가 캔버스에서 가리키는 대상 (호버 강조에 쓴다). */
export function outlineNodeTargetId(node: OutlinerNode): string {
  return node.targetSlotId || node.targetBlockId || node.targetPageId || node.nodeId;
}

/** 피그마 스타일 레이어 아이콘: Section / Frame / Group / Component / Text / Table */
const NodeIcon: React.FC<{ node: OutlinerNode; docSurface?: DocumentSurfaceKind }> = ({ node, docSurface = "paged" }) => {
  const cls = "w-3.5 h-3.5 shrink-0";
  if (node.zoomLevel === "project") return <FolderTree className={`${cls} text-[#8c8c8c]`} />;
  if (node.zoomLevel === "document") {
    return (
      <DocumentSurfaceIcon
        surface={docSurface}
        className={`${cls} ${docSurface === "scroll" ? "text-emerald-500" : "text-[#0d99ff]"}`}
      />
    );
  }
  if (node.zoomLevel === "page") {
    if (node.targetBlockId) {
      const titleLower = node.title.toLowerCase();
      if (titleLower.includes("섹션") || titleLower.includes("구역") || titleLower.includes("그리드")) {
        return <LayoutGrid className={`${cls} text-[#8c8c8c]`} />;
      }
      if (titleLower.includes("표") || titleLower.includes("테이블") || titleLower.includes("매트릭스")) {
        return <Table className={`${cls} text-[#8c8c8c]`} />;
      }
      return <Hash className={`${cls} text-[#8c8c8c] stroke-[2]`} />;
    }
    // 피그마는 Pages 목록의 페이지 앞에 아이콘이 없음 (완전 텍스트만 표시)
    return null;
  }

  // 슬롯 및 하위 콘텐츠 (Figma Component, Text, Table)
  const titleLower = node.title.toLowerCase();
  if (titleLower.includes("표") || titleLower.includes("[표]")) {
    return <Table className={`${cls} text-[#8c8c8c]`} />;
  }
  if (node.isStatic || titleLower.includes("컴포넌트") || titleLower.includes("템플릿")) {
    return <Component className={`${cls} text-[#7b61ff]`} />;
  }
  return <Type className={`${cls} text-[#8c8c8c] stroke-[1.8]`} />;
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
  /** 문서 지면 서식 (`paged`: A4 페이지 · `scroll`: 블로그 스크롤). */
  docSurface?: DocumentSurfaceKind;
  /** 계층 절단 시 상위 레벨을 건너뛰는 들여쓰기 오프셋 (기본 0). */
  depthOffset?: number;
  /** 문서 행 (이름 변경 · 복제 · 문서 삭제 아이콘). */
  canManageDocument?: boolean;
  /** 프로젝트 루트 행 (새 문서 메뉴 · 새로고침 아이콘 — 늘 보인다). */
  isProjectRoot?: boolean;
  onDuplicateDocument?: () => void;
  onDeleteDocument?: () => void;
  onOpenNewDocumentMenu?: (anchorEl: HTMLElement) => void;
  onRefreshDocuments?: () => void;
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
  docSurface = "paged",
  depthOffset = 0,
  canManageDocument = false,
  isProjectRoot = false,
  onDuplicateDocument,
  onDeleteDocument,
  onOpenNewDocumentMenu,
  onRefreshDocuments,
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
  const isPageOrDoc =
    node.zoomLevel === "project" ||
    node.zoomLevel === "document" ||
    (node.zoomLevel === "page" && !node.targetBlockId);

  const isComponent =
    node.isStatic ||
    node.title.toLowerCase().includes("컴포넌트") ||
    node.title.toLowerCase().includes("템플릿");

  const [isVisible, setIsVisible] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const figAction =
    "p-0.5 rounded hover:bg-black/[0.06] text-[#8c8c8c] hover:text-[#1e1e1e] cursor-pointer transition-colors";

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={isSelected}
      data-testid={`outline-node-row-${node.nodeId}`}
      data-picked={isPicked ? "true" : undefined}
      {...(isRenaming ? {} : attachProps)}
      style={{ paddingLeft: `${Math.min(Math.max(0, node.depth - depthOffset), 6) * 12 + 6}px` }}
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
      className={`group relative flex items-center gap-1.5 h-[28px] mx-1 px-1.5 rounded-[4px] select-none outline-none focus:outline-none focus:ring-0 ring-0 border-none transition-colors cursor-pointer text-[11.5px] leading-tight font-sans ${
        isPicked ? "ring-1 ring-violet-400 bg-violet-50 text-violet-950 " : ""
      }${
        isSelected
          ? isPageOrDoc
            ? "bg-black/[0.06] text-[#000000] font-semibold"
            : isComponent
              ? "bg-black/[0.05] text-[#7b61ff] font-medium"
              : "bg-[#0d99ff]/12 text-[#1e1e1e] font-medium"
          : isHighlighted
            ? "bg-black/[0.04] text-[#000000]"
            : isComponent
              ? "hover:bg-black/[0.035] text-[#7b61ff]"
              : "hover:bg-black/[0.035] text-[#333333]"
      } ${!isVisible ? "opacity-35" : ""}`}
    >
      {hasChildren ? (
        <button
          type="button"
          data-testid={`fold-toggle-${node.nodeId}`}
          onClick={stop(onToggleCollapse)}
          title={isCollapsed ? "펼치기" : "접기"}
          className="w-3 h-3 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors text-[#8c8c8c] hover:text-[#1e1e1e]"
        >
          {isCollapsed ? (
            <ChevronRight className="w-2.5 h-2.5 stroke-[2] text-current" />
          ) : (
            <ChevronDown className="w-2.5 h-2.5 stroke-[2] text-current" />
          )}
        </button>
      ) : (
        <span className="w-3 h-3 shrink-0" />
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
        <NodeIcon node={node} docSurface={docSurface} />
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
          className="flex-1 min-w-0 h-5 px-1.5 rounded bg-white border border-[#0d99ff] text-xs text-slate-900 focus:outline-none"
        />
      ) : (
        /* 피그마 레이어 타이틀 */
        <span
          data-testid={`outline-node-title-${node.nodeId}`}
          title={`${node.title}${
            node.zoomLevel === "document"
              ? `\n서식: ${docSurface === "scroll" ? "블로그 글 (스크롤)" : "A4 페이지 문서"}`
              : ""
          }${node.summary ? `\n\n${node.summary}` : ""}${
            node.nameNeedsReview ? "\n\n⚠ 이름 확인 필요 (라벨을 찾지 못해 위치로 지은 이름)" : ""
          }${canRename ? "\n\n더블클릭 또는 F2: 이름 변경" : ""}`}
          className={`truncate flex-1 min-w-0 ${node.isStatic ? "text-[#8c8c8c]" : ""}`}
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
          className="text-[10px] text-blue-500/80 font-mono shrink-0 ml-1 hover:underline"
        >
          #참조
        </span>
      )}

      {!isRenaming && isProjectRoot && (
        <div className="flex items-center gap-0.5 shrink-0 ml-1" data-testid="project-root-doc-actions">
          <button
            type="button"
            data-testid="outline-new-doc-menu-btn"
            data-new-doc-trigger=""
            onClick={(e) => {
              e.stopPropagation();
              onOpenNewDocumentMenu?.(e.currentTarget);
            }}
            title="새 문서 (A4 · 블로그 글 · 불러오기)"
            className={hoverAction}
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" data-testid="outline-refresh-docs-btn" onClick={stop(() => onRefreshDocuments?.())} title="새로고침 (에이전트 · 다른 곳에서 만든 문서 반영)" className={hoverAction}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!isRenaming && (
        <div className={`items-center gap-0.5 shrink-0 ml-1 ${isSelected || isLocked || !isVisible ? "flex" : "hidden group-hover:flex"}`}>
          {/* 피그마 레이어 잠금 / 눈 아이콘 (피그마 전용) */}
          <button
            type="button"
            title={isLocked ? "레이어 잠금 해제" : "레이어 잠금"}
            onClick={stop(() => setIsLocked(!isLocked))}
            className={figAction}
          >
            {isLocked ? <Lock className="w-3 h-3 text-[#1e1e1e]" /> : <Unlock className="w-3 h-3" />}
          </button>
          <button
            type="button"
            title={isVisible ? "레이어 숨기기" : "레이어 보이기"}
            onClick={stop(() => setIsVisible(!isVisible))}
            className={figAction}
          >
            {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-amber-500" />}
          </button>

          {canAddPage && onOpenAddPageMenu && (
            <button
              type="button"
              data-testid={`add-page-menu-btn-${node.nodeId}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddPageMenu(e.currentTarget);
              }}
              title="페이지 추가"
              className={figAction}
            >
              <FilePlus2 className="w-3 h-3" />
            </button>
          )}

          {canManageDocument && (
            <>
              <button type="button" data-testid={`rename-doc-btn-${node.nodeId}`} onClick={stop(() => onStartRename?.())} title="이름 바꾸기" className={figAction}>
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-testid={`delete-doc-btn-${node.nodeId}`}
                onClick={stop(() => onDeleteDocument?.())}
                title="문서 삭제"
                className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}

          {canManagePage && (
            <>
              <button
                type="button"
                data-testid={`rename-page-btn-${node.nodeId}`}
                onClick={stop(() => onStartRename?.())}
                title="이름 바꾸기"
                className={figAction}
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-testid={`delete-page-btn-${node.nodeId}`}
                disabled={!canDeletePage}
                onClick={stop(() => {
                  if (canDeletePage) onDeletePage?.();
                })}
                title={canDeletePage ? "페이지 삭제" : "마지막 1페이지는 삭제할 수 없습니다"}
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
              <button type="button" onClick={stop(() => onMove(-1))} title="위로 이동" className={figAction}>
                <ArrowUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={stop(() => onMove(1))} title="아래로 이동" className={figAction}>
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
