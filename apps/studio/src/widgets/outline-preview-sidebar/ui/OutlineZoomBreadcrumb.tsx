import React from "react";
import { ChevronRight, CornerLeftUp, Home } from "lucide-react";

import { PROJECT_ROOT_CRUMB_ID } from "@vibe/vdoc-schema";

import { outlineCommands, useOutlineSelector } from "@/features/zoom-hierarchy";

import { compactCrumbs } from "../model/outlineSections";

/**
 * 사이드바 줌 경로 (Home › 문서 › 페이지 › …). 줌했을 때만 보인다.
 * 칸을 누르면 그 수준으로, ↑ 는 한 단계 위로 (Alt+↑ 와 같다). 상단 리본의 브레드크럼과 같은 명령을 쓴다.
 */
export const OutlineZoomBreadcrumb: React.FC = () => {
  const crumbs = useOutlineSelector((p) => p.breadcrumbs);
  const isZoomed = useOutlineSelector((p) => p.rootNodeId !== PROJECT_ROOT_CRUMB_ID && p.activeZoomLevel !== "project");
  if (!isZoomed || crumbs.length < 2) return null;

  const items = compactCrumbs(crumbs);
  const lastId = crumbs[crumbs.length - 1].nodeId;

  return (
    <nav
      aria-label="줌 경로"
      data-testid="outliner-zoom-breadcrumb"
      className="h-8 pl-2 pr-2 border-b border-[var(--fig-border)] flex items-center gap-0.5 min-w-0 shrink-0 text-[11px] text-black/50"
    >
      <button
        type="button"
        data-testid="outliner-zoom-out-btn"
        onClick={outlineCommands.zoomOutOneLevel}
        title="상위로 Zoom-Out (Alt+↑)"
        className="fig-icon-btn shrink-0"
      >
        <CornerLeftUp className="w-3.5 h-3.5" />
      </button>

      {items.map((item, i) => (
        <React.Fragment key={item.kind === "crumb" ? item.crumb.nodeId : `gap-${i}`}>
          {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-black/30" />}
          {item.kind === "gap" ? (
            <span className="shrink-0 px-0.5" title={item.hidden.map((c) => c.title).join(" › ")}>
              …
            </span>
          ) : item.crumb.nodeId === PROJECT_ROOT_CRUMB_ID ? (
            <button
              type="button"
              data-testid="outliner-zoom-root-btn"
              onClick={() => outlineCommands.breadcrumbClick(PROJECT_ROOT_CRUMB_ID)}
              title={`최상위 Home 복귀 · ${item.crumb.title}`}
              className="shrink-0 flex items-center gap-1 px-1 py-0.5 rounded hover:bg-black/5 hover:text-black/90"
            >
              <Home className="w-3 h-3" />
              Home
            </button>
          ) : (
            <button
              type="button"
              data-testid={`outliner-crumb-${item.crumb.nodeId}`}
              aria-current={item.crumb.nodeId === lastId ? "location" : undefined}
              onClick={() => outlineCommands.breadcrumbClick(item.crumb.nodeId)}
              title={item.crumb.title}
              className={`min-w-0 truncate px-1 py-0.5 rounded hover:bg-black/5 hover:text-black/90 ${
                item.crumb.nodeId === lastId ? "flex-1 text-left font-semibold text-black/90" : "max-w-[120px]"
              }`}
            >
              {item.crumb.title}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
