import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CollapsedPanelRailProps {
  side: "left" | "right";
  label: string;
  badgeCount?: number;
  onExpand: () => void;
  testId?: string;
  tone?: "sky" | "amber" | "purple" | "emerald";
}

const TONE_STYLES = {
  sky: {
    btnHover: "hover:bg-sky-50 hover:text-sky-700",
    badge: "bg-sky-100 text-sky-800",
  },
  amber: {
    btnHover: "hover:bg-amber-50 hover:text-amber-800",
    badge: "bg-amber-100 text-amber-900",
  },
  purple: {
    btnHover: "hover:bg-purple-50 hover:text-purple-700",
    badge: "bg-purple-100 text-purple-800",
  },
  emerald: {
    btnHover: "hover:bg-emerald-50 hover:text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800",
  },
};

/**
 * UI Hygiene Primitive (Law of Symmetry: Collapse <-> Expand).
 * Guarantees that any collapsed sidebar leaves a visible, accessible 32px vertical rail
 * so the user is never stranded without an expand trigger.
 */
export const CollapsedPanelRail: React.FC<CollapsedPanelRailProps> = ({
  side,
  label,
  badgeCount,
  onExpand,
  testId,
  tone = "emerald",
}) => {
  const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.emerald;

  return (
    <aside
      data-testid={testId || `collapsed-rail-${side}`}
      className={`w-9 bg-white ${
        side === "left" ? "border-r" : "border-l"
      } border-slate-200 flex flex-col items-center py-3 gap-3 shrink-0 select-none z-10`}
    >
      <button
        type="button"
        onClick={onExpand}
        data-testid={`expand-rail-btn-${side}`}
        title={`${label} 펼치기`}
        className={`w-7 h-7 rounded-lg bg-slate-100 ${toneStyle.btnHover} border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer transition shadow-2xs`}
      >
        {side === "left" ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      {typeof badgeCount === "number" && (
        <span className={`px-1.5 py-0.5 rounded-full ${toneStyle.badge} text-[10px] font-bold font-mono tabular-nums`}>
          {badgeCount}
        </span>
      )}

      <div
        onClick={onExpand}
        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer tracking-wider"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </div>
    </aside>
  );
};

