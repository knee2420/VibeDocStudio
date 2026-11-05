import React from "react";
import {
  PanelRightClose,
  SplitSquareVertical,
  X,
} from "lucide-react";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

interface Props {
  checkedCount: number;
  totalCount: number;
}

export const ResourceManagerHeader: React.FC<Props> = ({
  checkedCount,
  totalCount,
}) => {
  const rmPlacement = useWorkspaceLayoutStore((s) => s.rmPlacement);
  const setRmPlacement = useWorkspaceLayoutStore((s) => s.setRmPlacement);
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const setRightSidebarOpen = useWorkspaceLayoutStore((s) => s.setRightSidebarOpen);

  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0 select-none">
      {/* 좌측: 타이틀 및 Choice 카운터 */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-xs text-slate-800 tracking-tight flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
          Resource Manager
        </span>
        <span
          className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-bold"
          title="현재 Choice(체크)된 소스 수 / 전체 덤핑 소스 수"
        >
          {checkedCount}/{totalCount}
        </span>
      </div>

      {/* 우측: 도킹 및 배치 컨트롤러 */}
      <div className="flex items-center gap-1 text-slate-500">
        {rmPlacement === "right-tab" ? (
          <button
            type="button"
            onClick={() => setRmPlacement("between-split")}
            className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-800 transition cursor-pointer"
            title="에디터와 AI Composer 사이 독립 스플릿으로 분리 (Popout)"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRmPlacement("right-tab");
              openRightPanel("resource-manager");
            }}
            className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-800 transition cursor-pointer"
            title="우측 사이드 패널 탭으로 도킹 (Dock to Right Tab)"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (rmPlacement === "right-tab") setRightSidebarOpen(false);
            else setRmPlacement("closed");
          }}
          className="p-1 rounded hover:bg-rose-100 hover:text-rose-600 transition cursor-pointer"
          title="닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

