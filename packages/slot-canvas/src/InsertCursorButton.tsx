import React from "react";
import { Plus } from "lucide-react";

import { AFFORDANCE_BORDER } from "./tokens";

export interface InsertCursorButtonProps {
  y: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

/**
 * 페이지 왼쪽 여백 바깥에 하나만 떠서 마우스 높이(또는 가장 가까운 블록 사이 틈)를 따라다니는 `+` 삽입 버튼.
 * 시트 경계(0px)와 겹치는 투명 히트 브리지(-30px ~ +4px)로 감싸 마우스가 버튼으로 이동할 때 사라지지 않는다.
 */
export const InsertCursorButton: React.FC<InsertCursorButtonProps> = ({
  y,
  menuOpen,
  onToggleMenu,
  onHoverChange,
}) => (
  <div
    data-insert-gutter=""
    onPointerEnter={() => onHoverChange?.(true)}
    onPointerLeave={() => onHoverChange?.(false)}
    onPointerDown={(e) => e.stopPropagation()}
    style={{
      top: Math.round(y - 20),
      left: -30,
      width: 34,
      height: 40,
    }}
    className="absolute z-[36] flex items-center"
  >
    <button
      type="button"
      data-insert-cursor-btn=""
      title="블록 삽입 (+)"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.isContentEditable) activeEl.blur();
        e.currentTarget.focus({ preventScroll: true });
        onToggleMenu();
      }}
      style={{
        marginLeft: 4,
        borderColor: AFFORDANCE_BORDER,
      }}
      className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors ${
        menuOpen
          ? "bg-[#0472e3] text-white border-[#0472e3]"
          : "bg-white text-slate-500 hover:bg-neutral-100 hover:text-slate-800"
      }`}
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);
