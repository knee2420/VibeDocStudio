import type React from "react";
import { useCallback, useRef } from "react";

/**
 * 위쪽 패널 아래 경계를 위 · 아래로 끌어 높이를 바꾼다 (아래로 끌면 커진다).
 * 시작 높이는 저장값이 아니라 지금 화면에 그려진 높이에서 잰다 — 목록이 짧아 저장값보다 작게
 * 그려져 있을 때 끌어도 바로 따라오게.
 */
export function useSplitterDrag(getCurrentHeight: () => number, onResize: (height: number) => void) {
  const latest = useRef({ getCurrentHeight, onResize });
  latest.current = { getCurrentHeight, onResize };

  return useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = latest.current.getCurrentHeight();
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";
    const onMove = (move: MouseEvent) => latest.current.onResize(startHeight + (move.clientY - startY));
    const onUp = () => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);
}
