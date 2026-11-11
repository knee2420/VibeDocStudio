import React from "react";

import type { AlignmentGuideLine } from "@vibe/vdoc-schema";

import { ACCENT } from "./tokens";

export interface AlignmentGuidesProps {
  guides: readonly AlignmentGuideLine[];
  color?: string;
}

/**
 * 고정 좌표 블록 드래그 중 맞닿은 기준선(세로/가로 스냅 가이드)을 페이지 시트 좌표 위에 그린다.
 */
export const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({ guides, color = ACCENT }) => {
  if (guides.length === 0) return null;
  return (
    <div
      data-testid="vdoc-alignment-guides"
      className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
    >
      {guides.map((g, i) =>
        g.axis === "vertical" ? (
          <div
            key={`v-${g.pos}-${i}`}
            data-guide-axis="vertical"
            style={{
              position: "absolute",
              left: g.pos,
              top: g.start,
              height: Math.max(0, g.end - g.start),
              width: "1px",
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
        ) : (
          <div
            key={`h-${g.pos}-${i}`}
            data-guide-axis="horizontal"
            style={{
              position: "absolute",
              top: g.pos,
              left: g.start,
              width: Math.max(0, g.end - g.start),
              height: "1px",
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
        )
      )}
    </div>
  );
};

