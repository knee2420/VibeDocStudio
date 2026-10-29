/**
 * @vibe/vdoc-schema - Base Layout Block
 * Common abstraction for all canvas blocks in .vdoc documents.
 * Every block inherits identity, placement/frame, and lock state from this base.
 */

export interface BlockFrameRect {
  x: number;
  y: number;
  w: number;
  h?: number;
  zIndex?: number;
}

export type LayoutBlockKind =
  | "image"
  | "text"
  | "section-block"
  | "structured-table"
  | "table"
  | "columns-grid"
  | "fillable-group"
  | "heading"
  | "form-title"
  | "composite-form-frame"
  | "summary-list"
  | "cover-banner";

export interface BaseLayoutBlock {
  blockId: string;
  kind: LayoutBlockKind;
  title: string;
  /** Fixed position on the page sheet in CSS px. When omitted, block flows in document order. */
  frame?: BlockFrameRect;
  /** Explicit block-level lock flag preventing content mutations and structural moves. */
  locked?: boolean;
}

