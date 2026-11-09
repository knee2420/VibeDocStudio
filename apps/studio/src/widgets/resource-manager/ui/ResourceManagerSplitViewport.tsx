import React from "react";
import { RM_SPLIT_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useDragResize } from "@/shared/lib";
import { ResourceManagerWidget } from "./ResourceManagerWidget";

/**
 * 에디터(Canvas)와 AI Composer 사이에 독립된 스플릿 패널로 도킹되는 Resource Manager.
 * Reference 창 및 DeckCardPreview 와 동일한 리사이즈 핸들 및 스플릿 레이아웃 사양을 갖춥니다.
 */
export const ResourceManagerSplitViewport: React.FC = () => {
  const rmPlacement = useWorkspaceLayoutStore((s) => s.rmPlacement);
  const rmSplitWidth = useWorkspaceLayoutStore((s) => s.rmSplitWidth);
  const setRmSplitWidth = useWorkspaceLayoutStore((s) => s.setRmSplitWidth);
  const resetRmSplitWidth = useWorkspaceLayoutStore((s) => s.resetRmSplitWidth);

  const { onResizeStart } = useDragResize({
    axis: "x-left",
    size: rmSplitWidth,
    onResize: setRmSplitWidth,
  });

  if (rmPlacement !== "between-split") return null;

  return (
    <aside
      data-testid="resource-manager-split-viewport"
      style={{ width: `${rmSplitWidth}px` }}
      className="relative h-full flex flex-col bg-white border-l border-r border-slate-300 shadow-sm z-20 shrink-0 transition-[width] duration-75 select-text"
    >
      {/* 0. 좌측 리사이즈 드래그 핸들 (에디터 캔버스와 스플릿 패널 경계) */}
      <div
        data-testid="rm-split-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetRmSplitWidth}
        title={`드래그하여 리소스 매니저 너비 조절 · 더블클릭 시 기본 너비(${RM_SPLIT_WIDTH.default}px) 복원`}
        className="absolute -left-1 top-0 bottom-0 w-2 hover:w-3 cursor-col-resize hover:bg-violet-400/40 active:bg-violet-600/60 transition-all z-30"
      />

      {/* 1. 리소스 매니저 본체 (자체 헤더 내에 꺼내기/집어넣기 컨트롤러 포함) */}
      <ResourceManagerWidget />
    </aside>
  );
};

