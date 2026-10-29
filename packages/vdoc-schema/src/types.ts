/**
 * @vibe/vdoc-schema
 * Core Data Contract for `.vdoc` (UTF-8 JSON) Documents
 * Combines PandaDoc Kolas Editor 4-Layer Page Anatomy + Puck Layout Tree + Maily.to Section/Column Attributes + Slot-Scoped Backdata
 */

export type SlotRole = "boilerplate" | "editable-slot" | "fillable-field";

export interface SlotConstraints {
  maxLines?: number;
  tone?: string;
  placeholder?: string;
  locked?: boolean;
  align?: "left" | "center" | "right";
  fontSize?: string;    // e.g. "10pt", "12.5px", "22px"
  lineHeight?: string;
  fontFamily?: string;  // e.g. "1.2", "1.5", "24px"
  fontWeight?: string;  // e.g. "normal", "600", "bold"
  letterSpacing?: string;
  color?: string;       // e.g. "#336699", "#383838"
}

export interface VDocSlotRect {
  x: number;      // pt or %
  y: number;      // pt or %
  width: number;  // pt or %
  height: number; // pt or %
  unit?: "pt" | "%";
}

export interface VDocSlot {
  slotId: string;
  label: string;
  role: SlotRole;
  /** Rich-text HTML content rendered & edited inside the isolated Tiptap slot */
  content: string;
  assignee?: string;
  constraints?: SlotConstraints;
  /** Linked BackdataChunk IDs from BackdataStore */
  backDataRefs: string[];
  /** 2D Bounding Box for Interactive Slot Overlay (Figma/Acrobat/Typst Hybrid) */
  rect?: VDocSlotRect;
  /** Whether the slot content has been edited / customized */
  isEdited?: boolean;
}

export interface BackdataChunk {
  chunkId: string;
  sourceTitle: string;
  sourceType: "markdown" | "transcript" | "pdf" | "sheet";
  excerpt: string;
  updatedAt: string;
  tags: string[];
}

export interface TableBorderRules {
  outer?: string;        // e.g. "none" | "1px solid #e4e4e4" | "2px solid #0f172a"
  headerTop?: string;    // e.g. "2px solid #336699"
  headerBottom?: string; // e.g. "1px solid #e2e8f0"
  rowBottom?: string;    // e.g. "1px solid #e2e8f0"
  vertical?: string;     // e.g. "none" | "1px solid #0f172a"
}

export interface TableHeaderStyle {
  bg?: string;           // e.g. "#f4f4f4" | "transparent"
  textColor?: string;    // e.g. "#336699"
  fontWeight?: string;   // e.g. "600"
  fontSize?: string;     // e.g. "13px"
  padding?: string;      // e.g. "8px 10px"
  borderTop?: string;
  borderBottom?: string;
}

export interface TableSummaryItem {
  itemId: string;
  label: string;
  value: string;
  slotId?: string;
  labelSlotId?: string;
  valueSlotId?: string;
  isTotal?: boolean;
  borderTop?: string;
  textColor?: string;
  fontSize?: string;
  fontWeight?: string;
}

export interface TableSummarySection {
  align?: "left" | "center" | "right";
  width?: string;
  items: TableSummaryItem[];
}

export interface GridColumnDef {
  slotId?: string;
  image?: {
    src: string;
    alt?: string;
    width?: string;
    height?: string;
    maxHeight?: string;
    align?: "left" | "center" | "right";
    objectFit?: "contain" | "cover" | "fill";
  };
}

/**
 * Ported from `_upstreams/maily.to/packages/core/src/editor/nodes/columns/column.ts`
 * & `_upstreams/puck/apps/demo/config/components/Layout/index.tsx`
 */
export interface TableCellSlotDef {
  cellId: string;
  slotId: string;
  isHeader?: boolean;
  whiteHeader?: boolean;
  colSpan?: number;
  rowSpan?: number;
  vAlign?: "top" | "middle" | "bottom";
  hAlign?: "left" | "center" | "right";
  compact?: boolean;
  padding?: string;
  letterSpacing?: string;
  backgroundColor?: string;
  color?: string;
  border?: string;
  /** Per-edge borders set from the table-edit panel (CSS shorthand, "hidden" for 선 없음). */
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  fontWeight?: string;
  fontSize?: string;
  lineHeight?: string;
  fontFamily?: string;
}

export interface StructuredTableSectionDef {
  sectionId: string;
  title: string;
  columnWidths: string[];
  bottomBorderThick?: boolean;
  borderRules?: TableBorderRules;
  headerStyle?: TableHeaderStyle;
  rows: {
    rowId: string;
    height?: string;
    cells: TableCellSlotDef[];
  }[];
}

export type { BlockFrameRect, LayoutBlockKind, BaseLayoutBlock } from "./base-block";
import type { LayoutBlock } from "./blocks";
export * from "./blocks";


/** Page-level typography and margins (A4 sheet = 794 × 1123 px). Omitted keeps the Studio defaults. */
export interface VDocPageLayout {
  /** Content margins in px; flowing blocks start inside them. */
  margin?: { top: number; right: number; bottom: number; left: number };
  /** Vertical gap between flowing blocks in px. */
  blockGap?: number;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  lineHeight?: string;
  /**
   * Typeset like a PDF: no kerning or ligatures, no editor minimum heights, so text runs and
   * paragraph boxes land on the coordinates of the source document.
   */
  exactText?: boolean;
}

/**
 * Matches PandaDoc Kolas Editor's 4-layer Page Anatomy dissected via REA:
 * 1. Header Toggle Area
 * 2. Page Content Area (LayoutBlock[])
 * 3. Footer Toggle Area
 * 4. Automatic PDF Page Break
 */
export interface VDocPage {
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  headerSlotId: string;
  blocks: LayoutBlock[];
  footerSlotId: string;
  hideHeaderFooter?: boolean;
  engine?: "dom" | "typst";
  typstSvg?: string;
  typstTemplate?: string;
  pageRect?: { width: number; height: number; unit?: "pt" | "mm" | "%" };
  layout?: VDocPageLayout;
}

export interface VDocCatalogManifest {
  catalogId: string;
  title: string;
  sourceOrigin: string;
  sourceId?: string;
  category: string;
  tags: string[];
  description: string;
}

export interface VDocDocument {
  version: "1.0.0";
  docId: string;
  title: string;
  status: "Draft" | "Review" | "Final";
  totalValueText?: string;
  updatedAt: string;
  variables: Record<string, string>;
  pages: VDocPage[];
  slots: Record<string, VDocSlot>;
  backdata: Record<string, BackdataChunk>;
}
