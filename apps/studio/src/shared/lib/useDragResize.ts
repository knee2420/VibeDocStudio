import { useCallback, useState } from "react";
import type React from "react";

export interface DragResizeOptions {
  /** 끌기 방향. `"x"` 는 오른쪽으로 끌면 커지고, `"x-left"` 는 왼쪽으로 끌면 커지고, `"y-up"` 은 위로 끌면 커진다. */
  axis: "x" | "x-left" | "y-up";
  /** 끌기를 시작할 때의 크기. */
  size: number;
  onResize: (next: number) => void;
}

/** 패널 경계 손잡이로 크기를 바꾸는 끌기 동작. 끄는 동안 `isResizing` 이 참이다. */
export function useDragResize({ axis, size, onResize }: DragResizeOptions) {
  const [isResizing, setIsResizing] = useState(false);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const start = axis === "x" || axis === "x-left" ? e.clientX : e.clientY;
      setIsResizing(true);

      const onMove = (move: MouseEvent) => {
        const delta =
          axis === "x" ? move.clientX - start : axis === "x-left" ? start - move.clientX : start - move.clientY;
        onResize(size + delta);
      };
      const onUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [axis, size, onResize]
  );

  return { isResizing, onResizeStart };
}
