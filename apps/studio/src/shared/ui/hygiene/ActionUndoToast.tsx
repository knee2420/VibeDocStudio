import React, { useLayoutEffect, useState } from "react";
import { RotateCcw, RotateCw, X } from "lucide-react";

export interface ActionUndoToastProps {
  message: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDismiss: () => void;
}

/** 머리말의 되돌리기 버튼 (`data-undo-anchor`). 이 버튼 아래에 붙어 뜬다. */
const ANCHOR_SELECTOR = "[data-undo-anchor]";
const MARGIN = 8;

interface Placement {
  top: number;
  right: number;
  /** 화살표의 오른쪽 거리 (버튼 가운데를 가리킨다). */
  arrowRight: number;
}

function placeUnderAnchor(): Placement | null {
  const anchor = document.querySelector(ANCHOR_SELECTOR);
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const right = Math.max(MARGIN, window.innerWidth - r.right - 4);
  const arrowRight = Math.max(10, window.innerWidth - (r.left + r.width / 2) - right - 5);
  return { top: r.bottom + 8, right, arrowRight };
}

/**
 * UI Hygiene Primitive (Law of Symmetry & Forgiving UI).
 * 구조 변경 뒤 1-클릭 · `Ctrl+Z` 되돌리기를 권하는 안내 — 머리말의 되돌리기 버튼에 붙은 작은 팝오버로 뜬다
 * (예전에는 화면 아래 가운데에 떠 캔버스 플로팅 툴바를 가렸다). 버튼을 찾지 못하면 머리말 아래 오른쪽.
 */
export const ActionUndoToast: React.FC<ActionUndoToastProps> = ({ message, canUndo, canRedo, onUndo, onRedo, onDismiss }) => {
  const [place, setPlace] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!message) return;
    const update = () => setPlace(placeUnderAnchor());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="action-undo-toast"
      style={place ? { top: place.top, right: place.right } : { top: 56, right: 16 }}
      className="fig-panel fixed z-[80] flex items-center gap-2 pl-3 pr-1.5 h-9 rounded-[8px] bg-[#1e1e1e] text-white shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15)]"
    >
      {place && (
        <span
          aria-hidden
          className="absolute -top-1 w-2.5 h-2.5 rotate-45 bg-[#1e1e1e]"
          style={{ right: place.arrowRight }}
        />
      )}
      <span className="max-w-[260px] truncate text-white/90" title={message}>
        {message}
      </span>
      <span className="h-4 w-px bg-white/15" />
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="h-6 px-2 inline-flex items-center gap-1 rounded-[5px] bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] disabled:opacity-40 font-medium cursor-default"
        title="실행 취소 (Ctrl+Z)"
      >
        <RotateCcw className="w-3 h-3" />
        되돌리기
        <span className="text-white/60">Ctrl+Z</span>
      </button>
      {canRedo && (
        <button
          type="button"
          onClick={onRedo}
          className="h-6 px-2 inline-flex items-center gap-1 rounded-[5px] hover:bg-white/10 text-white/80 cursor-default"
          title="다시 실행 (Ctrl+Y)"
        >
          <RotateCw className="w-3 h-3" />
          재실행
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="w-6 h-6 inline-flex items-center justify-center rounded-[5px] text-white/50 hover:text-white hover:bg-white/10 cursor-default"
        title="알림 닫기 (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
