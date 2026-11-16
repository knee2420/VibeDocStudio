import React, { useCallback, useEffect, useRef, useState } from "react";
import { readStoredNumber, useDragResize, writeStoredValue } from "@/shared/lib";

export type WorkbenchPaneMode = "single" | "split";

const SPLIT_RATIO_KEY = "vdoc-center-split-ratio";
const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_SPLIT_RATIO = 0.25;
const MAX_SPLIT_RATIO = 0.75;

const clampRatio = (ratio: number) => Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));

export interface CenterWorkbenchHostProps {
  mode: WorkbenchPaneMode;
  primaryPane: React.ReactNode;
  secondaryPane?: React.ReactNode;
}

/**
 * 중앙 워크벤치 분할 호스트 — 단일(Single) ↔ 좌우 분할(Split) 뷰 전환과 경계 드래그 비율 조절을 지원한다.
 */
export const CenterWorkbenchHost: React.FC<CenterWorkbenchHostProps> = ({
  mode,
  primaryPane,
  secondaryPane,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [splitRatio, setSplitRatio] = useState(() =>
    clampRatio(readStoredNumber(SPLIT_RATIO_KEY, DEFAULT_SPLIT_RATIO))
  );

  useEffect(() => {
    if (mode !== "split" || !secondaryPane) return;
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, secondaryPane]);

  const handleResizeWidth = useCallback(
    (nextPx: number) => {
      const width = Math.max(320, hostRef.current?.clientWidth ?? containerWidth);
      const nextRatio = clampRatio(nextPx / width);
      setSplitRatio(nextRatio);
      writeStoredValue(SPLIT_RATIO_KEY, nextRatio.toFixed(4));
    },
    [containerWidth]
  );

  const { isResizing, onResizeStart } = useDragResize({
    axis: "x",
    size: containerWidth * splitRatio,
    onResize: handleResizeWidth,
  });

  if (mode === "single" || !secondaryPane) {
    return <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">{primaryPane}</div>;
  }

  const leftPct = `${(splitRatio * 100).toFixed(2)}%`;

  return (
    <div
      ref={hostRef}
      className={`flex-1 flex flex-row min-w-0 h-full overflow-hidden ${isResizing ? "select-none" : ""}`}
    >
      <section
        style={{ width: leftPct }}
        className="flex flex-col min-w-0 h-full overflow-hidden shrink-0"
      >
        {primaryPane}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="아웃라이너 · 미리보기 너비 조절"
        data-testid="center-workbench-splitter"
        title="끌어서 좌우 너비 조절 · 더블클릭: 50:50 초기화"
        onMouseDown={onResizeStart}
        onDoubleClick={() => {
          setSplitRatio(DEFAULT_SPLIT_RATIO);
          writeStoredValue(SPLIT_RATIO_KEY, DEFAULT_SPLIT_RATIO);
        }}
        className={`w-1.5 shrink-0 h-full cursor-col-resize border-x border-slate-200/80 transition-colors ${
          isResizing ? "bg-indigo-500/70" : "bg-slate-100 hover:bg-indigo-400/50"
        }`}
      />

      <section className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-100/70">
        {secondaryPane}
      </section>
    </div>
  );
};
