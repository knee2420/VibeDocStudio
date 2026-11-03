import React, { useState } from "react";
import { ChevronRight, CornerLeftUp, MoreHorizontal } from "lucide-react";

import { getZoomLevelMeta } from "@vibe/vdoc-schema";

import { TruncatedLabel } from "@/shared/ui";

import { useFractalZoomNavigation } from "../model/useFractalZoomNavigation";

/**
 * 4-Level Fractal Zoom Breadcrumb Bar (`Project > Document > Page/Block > Slot`).
 * Includes `[...]` overflow dropdown when deep to prevent horizontal layout blowout.
 */
export const OutlineBreadcrumbBar: React.FC = () => {
  const { projection, handleBreadcrumbClick, handleZoomOutOneLevel } =
    useFractalZoomNavigation();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const crumbs = projection.breadcrumbs;
  const levelMeta = getZoomLevelMeta(projection.activeZoomLevel);

  // If more than 3 breadcrumbs, collapse middle items into `[...]`
  const hasOverflow = crumbs.length > 3;
  const hiddenCrumbs = hasOverflow ? crumbs.slice(1, crumbs.length - 1) : [];

  return (
    <nav
      aria-label="4단계 줌 위계 브레드크럼"
      data-testid="outline-breadcrumb-bar"
      className="flex items-center gap-1.5 min-w-0 text-xs"
    >
      <span
        data-testid="active-zoom-level-badge"
        className={`px-2 py-0.5 rounded-md border font-bold text-[10px] shrink-0 ${levelMeta.colorClass}`}
      >
        {levelMeta.badge}
      </span>

      {crumbs.length > 1 && (
        <button
          type="button"
          onClick={handleZoomOutOneLevel}
          data-testid="zoom-out-parent-btn"
          title="상위 계층으로 줌아웃"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium shrink-0 cursor-pointer transition"
        >
          <CornerLeftUp className="w-3 h-3" />
          상위
        </button>
      )}

      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {/* Root Crumb */}
        {crumbs[0] && (
          <button
            type="button"
            onClick={() => handleBreadcrumbClick(crumbs[0].nodeId)}
            data-testid="breadcrumb-root-btn"
            className={`px-1.5 py-0.5 rounded max-w-[150px] text-left cursor-pointer transition ${
              crumbs.length === 1
                ? "font-bold text-slate-900 bg-slate-100"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <TruncatedLabel text={crumbs[0].title} className="text-[11px]" />
          </button>
        )}

        {/* Overflow `[...]` button when deep */}
        {hasOverflow && (
          <div className="relative flex items-center">
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={() => setOverflowOpen(!overflowOpen)}
              data-testid="breadcrumb-overflow-btn"
              title="중간 경로 펼치기"
              className="px-1.5 py-0.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {overflowOpen && (
              <div className="absolute left-0 top-6 z-40 w-56 rounded-lg bg-white border border-slate-200 shadow-lg p-1 space-y-0.5">
                {hiddenCrumbs.map((hc) => (
                  <button
                    key={hc.nodeId}
                    type="button"
                    onClick={() => {
                      handleBreadcrumbClick(hc.nodeId);
                      setOverflowOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-xs text-slate-700 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <TruncatedLabel text={hc.title} />
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {hc.zoomLevel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Remaining Visible Crumbs */}
        {(hasOverflow ? [crumbs[crumbs.length - 1]] : crumbs.slice(1)).map(
          (crumb, idx, arr) => {
            const isLast = idx === arr.length - 1;
            return (
              <React.Fragment key={crumb.nodeId}>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(crumb.nodeId)}
                  data-testid={`breadcrumb-item-${crumb.nodeId}`}
                  className={`px-1.5 py-0.5 rounded max-w-[180px] text-left cursor-pointer transition ${
                    isLast
                      ? "font-bold text-[#248567] bg-emerald-50 border border-emerald-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <TruncatedLabel text={crumb.title} className="text-[11px]" />
                </button>
              </React.Fragment>
            );
          }
        )}
      </div>
    </nav>
  );
};

