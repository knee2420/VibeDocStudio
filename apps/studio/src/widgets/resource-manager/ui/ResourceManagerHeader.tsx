import React from "react";
import {
  Crosshair,
  PanelRightClose,
  SquareSplitHorizontal,
  X,
} from "lucide-react";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useEvidenceFocusStore } from "@/features/evidence-focus";

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
  const follow = useEvidenceFocusStore((s) => s.follow);
  const setFollow = useEvidenceFocusStore((s) => s.setFollow);
  const focusCount = useEvidenceFocusStore((s) => s.focusEvidence.length);

  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0 select-none">
      {/* 좌측: 꺼내기/집어넣기 버튼, 타이틀 및 Choice 카운터 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {rmPlacement === "right-tab" ? (
          <button
            type="button"
            data-testid="rm-popout-btn-left"
            onClick={() => setRmPlacement("between-split")}
            className="p-1 rounded hover:bg-violet-100 text-slate-500 hover:text-violet-700 transition cursor-pointer"
            title="에디터 우측 독립 스플릿 뷰로 꺼내기 (Pop-out to Split View)"
          >
            <SquareSplitHorizontal className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="rm-dockin-btn-left"
            onClick={() => {
              setRmPlacement("right-tab");
              openRightPanel("resource-manager");
            }}
            className="p-1 rounded hover:bg-violet-100 text-slate-500 hover:text-violet-700 transition cursor-pointer"
            title="우측 탭으로 다시 집어넣기 (Dock to Tab)"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        )}
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
        <button
          type="button"
          data-testid="rm-follow-focus"
          onClick={() => setFollow(!follow)}
          aria-pressed={follow}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
            follow ? "bg-amber-100 text-amber-800" : "hover:bg-slate-200/80 text-slate-500"
          }`}
          title="초점 따라가기 — 캔버스에서 칸을 고르면 그 칸의 근거 자료로 RM 이 펼쳐지고 스크롤합니다 (체크는 바꾸지 않음)"
        >
          <Crosshair className="w-3 h-3" />
          {focusCount > 0 ? `초점 ${focusCount}` : "초점"}
        </button>

        {rmPlacement === "right-tab" ? (
          <button
            type="button"
            data-testid="rm-popout-btn-right"
            onClick={() => setRmPlacement("between-split")}
            className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-800 transition cursor-pointer"
            title="에디터 우측 독립 스플릿 뷰로 꺼내기 (Pop-out)"
          >
            <SquareSplitHorizontal className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="rm-dockin-btn-right"
            onClick={() => {
              setRmPlacement("right-tab");
              openRightPanel("resource-manager");
            }}
            className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-800 transition cursor-pointer"
            title="우측 패널 탭으로 다시 집어넣기 (Dock to Tab)"
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
          title={rmPlacement === "right-tab" ? "우측 패널 닫기" : "스플릿 작업창 닫기"}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
