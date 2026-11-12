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

/**
 * 모든 블록 종류 — 이 목록 하나가 기준이다. 종류마다 block-kit 정의 · slot-canvas 뷰가 있어야 하고
 * (규격 검사가 확인), API 테스트도 시드 문서 · PDF 엔진 출력의 종류가 여기 있는지 본다.
 */
export const LAYOUT_BLOCK_KINDS = [
  "image",
  "text",
  "section-block",
  "structured-table",
  "table",
  "columns-grid",
  "fillable-group",
  "heading",
  "form-title",
  "composite-form-frame",
  "summary-list",
  "cover-banner",
  "callout-box",
  "link-card",
  "divider",
  "hero",
] as const;

export type LayoutBlockKind = (typeof LAYOUT_BLOCK_KINDS)[number];

export interface BaseLayoutBlock {
  blockId: string;
  kind: LayoutBlockKind;
  title: string;
  /** Fixed position on the page sheet in CSS px. When omitted, block flows in document order. */
  frame?: BlockFrameRect;
  /** Explicit block-level lock flag preventing content mutations and structural moves. */
  /** Explicit vertical space before this flow block in CSS px (when blockGap is 0). */
  spaceBefore?: number;
  locked?: boolean;
}

