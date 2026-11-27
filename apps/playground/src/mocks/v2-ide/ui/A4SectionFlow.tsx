import React, { useEffect, useRef, useState } from "react";

/** A4 한 장 높이 (px, 794 × 1123). */
const A4_SHEET_HEIGHT_PX = 1123;

/**
 * 섹션 = 구조 단위, A4 쪽 = 출력 결과.
 * paged 지면의 섹션들을 빈 장 없이 한 줄기 A4 폭 지면에 이어 흘리고, 인쇄 쪽 경계(1123px 마다)는 표시선으로만 보여 준다.
 * 섹션마다 빈 A4 한 장을 차지하던 문제를 없애면서 '몇 쪽으로 나오는지'는 그대로 읽힌다.
 */
export function A4SectionFlow({ width, children }: { width: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const sheets = Math.max(1, Math.ceil(height / A4_SHEET_HEIGHT_PX));
  const breaks = Array.from({ length: sheets - 1 }, (_, i) => (i + 1) * A4_SHEET_HEIGHT_PX);

  return (
    <div
      ref={ref}
      data-testid="a4-section-flow"
      data-a4-sheets={sheets}
      className="relative bg-white shadow-[0_4px_28px_rgba(15,23,42,0.08),0_1px_4px_rgba(15,23,42,0.04)] ring-1 ring-slate-900/5"
      style={{ width, minWidth: width, minHeight: A4_SHEET_HEIGHT_PX }}
    >
      {children}
      {breaks.map((y, i) => (
        <div
          key={y}
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 z-10 border-t border-dashed border-rose-300/80"
          style={{ top: y }}
        >
          <span className="absolute -right-14 -top-2.5 rounded bg-rose-50 px-1 text-[10px] font-medium text-rose-400">
            {i + 2}쪽
          </span>
        </div>
      ))}
    </div>
  );
}
