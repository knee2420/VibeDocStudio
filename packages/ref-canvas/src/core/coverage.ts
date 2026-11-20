import type { RefFrame } from "./types";

/** How one web-tile frame sits on the real page once tiles are laid out by their `scrollY`. */
export interface WebTilePlacement {
  readonly frameIndex: number;
  /** Uncaptured page height (px) between the previous tile's bottom and this tile's top. */
  readonly gapBeforePx: number;
  /** Rows (px) at the top of this tile already shown by the previous tile; hidden to avoid duplicates. */
  readonly cropTopPx: number;
}

export interface WebTileCoverage {
  /** Real page height (px) the tiles were taken from. */
  readonly pageHeightPx: number;
  /** Page height (px) actually present in the tiles. */
  readonly coveredPx: number;
  /** Uncaptured height (px) after the last tile. */
  readonly tailGapPx: number;
  readonly placements: ReadonlyMap<number, WebTilePlacement>;
  /** `true` when every pixel row of the page is in some tile. */
  readonly complete: boolean;
}

/**
 * Lays web-tile frames out by their real `scrollY` so the viewer never pretends that
 * non-adjacent screenshots are one continuous page: gaps become explicit and overlaps are cropped.
 */
export function computeWebTileCoverage(
  frames: readonly RefFrame[],
  pageHeightHint?: number
): WebTileCoverage {
  const tiles = frames
    .filter((f) => f.surfaceKind === "web-tile")
    .map((f) => ({ f, top: Math.max(0, f.scrollY ?? 0), height: Math.max(0, f.height) }))
    .sort((a, b) => a.top - b.top);

  const placements = new Map<number, WebTilePlacement>();
  let cursor = 0;
  let covered = 0;
  for (const { f, top, height } of tiles) {
    const bottom = top + height;
    const gapBeforePx = Math.max(0, top - cursor);
    const cropTopPx = Math.min(height, Math.max(0, cursor - top));
    placements.set(f.index, { frameIndex: f.index, gapBeforePx, cropTopPx });
    covered += Math.max(0, bottom - Math.max(top, cursor));
    cursor = Math.max(cursor, bottom);
  }

  const pageHeightPx = Math.max(cursor, Math.round(pageHeightHint ?? 0));
  const tailGapPx = Math.max(0, pageHeightPx - cursor);
  const missing = pageHeightPx - covered;
  return {
    pageHeightPx,
    coveredPx: covered,
    tailGapPx,
    placements,
    // Sub-pixel rounding between strips is not a real gap.
    complete: missing <= 2,
  };
}
