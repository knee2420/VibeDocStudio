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
    <div className="fig-panel h-10 px-3 border-b border-[var(--vds-border)] bg-white flex items-center justify-between shrink-0 select-none">
      {/* 좌측: 꺼내기/집어넣기 버튼, 타이틀 및 Choice 카운터 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {rmPlacement === "right-tab" ? (
          <button
            type="button"
            data-testid="rm-popout-btn-left"
            onClick={() => setRmPlacement("between-split")}
            className="fig-icon-btn cursor-pointer"
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
            className="fig-icon-btn cursor-pointer"
            title="우측 탭으로 다시 집어넣기 (Dock to Tab)"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="font-semibold text-[12.5px] text-[#18181b] tracking-tight truncate">
          Resource Manager
        </span>
        <span
          className="px-1.5 py-0.5 rounded bg-[#f4f4f5] text-[#71717a] text-[10px] font-medium tabular-nums"
          title="현재 Choice(체크)된 소스 수 / 전체 덤핑 소스 수"
        >
          {checkedCount}/{totalCount}
        </span>
      </div>

      {/* 우측: 도킹 및 배치 컨트롤러 */}
      <div className="flex items-center gap-1 text-[#71717a]">
        <button
          type="button"
          data-testid="rm-follow-focus"
          onClick={() => setFollow(!follow)}
          aria-pressed={follow}
          className={`flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition cursor-pointer ${
            follow
              ? "bg-[#18181b] text-white"
              : "hover:bg-[#f4f4f5] text-[#52525b]"
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
            className="fig-icon-btn cursor-pointer"
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
            className="fig-icon-btn cursor-pointer"
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
          className="fig-icon-btn cursor-pointer"
          title={rmPlacement === "right-tab" ? "우측 패널 닫기" : "스플릿 작업창 닫기"}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
