import React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  FolderTree,
  Layers,
  LayoutGrid,
  Trash2,
} from "lucide-react";

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
  /** 사용자가 만든 노드만 옮기고 지울 수 있다. */
  editable: boolean;
  peekHandlers: Partial<Pick<React.HTMLAttributes<HTMLDivElement>, "onMouseEnter" | "onMouseMove" | "onMouseLeave">>;
  onSelect: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onHoverChange: (hovering: boolean) => void;
  onToggleCollapse: () => void;
  onZoomIn: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** Workflowy 식 아웃라인 한 줄: 접기 삼각형 · 수준 아이콘 · 제목 · 호버 동작. */
export const OutlineNodeRow: React.FC<OutlineNodeRowProps> = ({
  node,
  isSelected,
  isHighlighted,
  isPicked,
  attachProps,
  hasChildren,
  isCollapsed,
  editable,
  peekHandlers,
  onSelect,
  onKeyDown,
  onHoverChange,
  onToggleCollapse,
  onZoomIn,
  onMove,
  onDelete,
}) => {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={isSelected}
      data-testid={`outline-node-row-${node.nodeId}`}
      data-picked={isPicked ? "true" : undefined}
      {...attachProps}
      style={{ paddingLeft: `${Math.min(node.depth, 6) * 16 + 4}px` }}
      onClick={onSelect}
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

      <NodeIcon node={node} />

      {/* 고정 텍스트는 회색, 위치로 지은 이름은 ⚠ */}
      <span
        data-testid={`outline-node-title-${node.nodeId}`}
        title={`${node.title}${node.summary ? `\n\n${node.summary}` : ""}${
          node.nameNeedsReview ? "\n\n⚠ 이름 확인 필요 (라벨을 찾지 못해 위치로 지은 이름)" : ""
        }`}
        className={`truncate flex-1 min-w-0 ${node.isStatic ? "text-slate-400" : ""}`}
      >
        {node.title}
      </span>
      {node.nameNeedsReview && (
        <span data-testid={`outline-node-review-${node.nodeId}`} title="이름 확인 필요" className="text-[11px] text-amber-500 shrink-0">
          ⚠
        </span>
      )}

      {node.provenanceSourceProjectId && (
        <span
          title={`참조 출처: ${node.provenanceSourceProjectId}`}
          className="text-[11px] text-blue-500/80 font-mono shrink-0 ml-1 hover:underline"
        >
          #참조
        </span>
      )}

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
        <button type="button" data-testid={`zoom-bullet-${node.nodeId}`} onClick={stop(onZoomIn)} title="Zoom-In" className={hoverAction}>
          <CircleDot className="w-3 h-3" />
        </button>
        {editable && (
          <>
            <button type="button" onClick={stop(() => onMove(-1))} title="위로 이동" className={hoverAction}>
              <ArrowUp className="w-3 h-3" />
            </button>
            <button type="button" onClick={stop(() => onMove(1))} title="아래로 이동" className={hoverAction}>
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              data-testid={`delete-outline-node-${node.nodeId}`}
              onClick={stop(onDelete)}
              title="삭제"
              className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
