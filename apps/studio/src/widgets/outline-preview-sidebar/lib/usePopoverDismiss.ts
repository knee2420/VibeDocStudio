import { useEffect, useRef, type RefObject } from "react";

/**
 * 열린 팝오버를 바깥 클릭 · Esc 로 닫는다.
 * `triggerSelector` 에 맞는 요소(여는 버튼) 클릭은 무시한다 — 버튼 쪽 토글이 처리한다
 * (안 그러면 pointerdown 에 닫혔다가 click 에 다시 열린다).
 */
export function usePopoverDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  triggerSelector?: string
): void {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (ref.current?.contains(target)) return;
      if (triggerSelector && target?.closest?.(triggerSelector)) return;
      close.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, triggerSelector]);
}

/** 버튼 아래에 고정 좌표로 띄울 팝오버 위치 (화면 밖으로 넘치지 않게). */
export function popoverAnchorBelow(anchorEl: HTMLElement, menuHeight: number, menuWidth = 260): { top: number; left: number } {
  const rect = anchorEl.getBoundingClientRect();
  return {
    top: Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - menuHeight)),
    left: Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth)),
  };
}
