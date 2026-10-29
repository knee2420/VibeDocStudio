import React from "react";

export interface CornerResizeMarkersProps {
  onResize: (dw: number, dh: number) => void;
  onResizeEnd?: () => void;
  color?: string;
}

/**
 * PandaDoc-style 4-corner resize markers (`oklch(0.5535 0.1001 167.8)` ≈ #248567)
 * Dragging a corner handle updates the block frame width/height interactively.
 */
export const CornerResizeMarkers: React.FC<CornerResizeMarkersProps> = ({
  onResize,
  onResizeEnd,
  color = "#248567",
}) => {
  const startDrag = (e: React.PointerEvent, corner: "nw" | "ne" | "se" | "sw") => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;

    const move = (ev: PointerEvent) => {
      let dx = ev.clientX - startX;
      let dy = ev.clientY - startY;
      if (corner === "nw") {
        dx = -dx;
        dy = -dy;
      } else if (corner === "ne") {
        dy = -dy;
      } else if (corner === "sw") {
        dx = -dx;
      }
      onResize(Math.round(dx), Math.round(dy));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      onResizeEnd?.();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const markerStyle: React.CSSProperties = {
    position: "absolute",
    width: "8px",
    height: "8px",
    backgroundColor: "#ffffff",
    border: `2px solid ${color}`,
    borderRadius: "1px",
    zIndex: 45,
  };

  return (
    <>
      {/* Top-Left */}
      <div
        style={{ ...markerStyle, top: "-4px", left: "-4px", cursor: "nwse-resize" }}
        onPointerDown={(e) => startDrag(e, "nw")}
      />
      {/* Top-Right */}
      <div
        style={{ ...markerStyle, top: "-4px", right: "-4px", cursor: "nesw-resize" }}
        onPointerDown={(e) => startDrag(e, "ne")}
      />
      {/* Bottom-Right */}
      <div
        style={{ ...markerStyle, bottom: "-4px", right: "-4px", cursor: "nwse-resize" }}
        onPointerDown={(e) => startDrag(e, "se")}
      />
      {/* Bottom-Left */}
      <div
        style={{ ...markerStyle, bottom: "-4px", left: "-4px", cursor: "nesw-resize" }}
        onPointerDown={(e) => startDrag(e, "sw")}
      />
    </>
  );
};

