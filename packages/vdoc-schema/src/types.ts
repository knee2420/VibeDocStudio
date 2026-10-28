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
}

export interface BackdataChunk {
  chunkId: string;
  sourceTitle: string;
  sourceType: "markdown" | "transcript" | "pdf" | "sheet";
  excerpt: string;
  updatedAt: string;
  tags: string[];
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
}

export interface StructuredTableSectionDef {
  sectionId: string;
  title: string;
  columnWidths: string[];
  bottomBorderThick?: boolean;
  rows: {
    rowId: string;
    height?: string;
    cells: TableCellSlotDef[];
  }[];
}

export type LayoutBlock =
  | {
      blockId: string;
      kind: "form-title";
      title: string;
      slotId: string;
      underlineWidth?: string;
      underlineThickness?: string;
      letterSpacing?: string;
    }
  | {
      blockId: string;
      kind: "composite-form-frame";
      title: string;
      outerBorderWidth?: string;
      sections: StructuredTableSectionDef[];
    }
  | {
      blockId: string;
      kind: "cover-banner";
      title: string;
      backgroundTheme: "dark-architecture" | "emerald-gradient" | "slate-minimal";
      headlineSlotId: string;
      preparedBySlotId: string;
      preparedForSlotId: string;
    }
  | {
      blockId: string;
      kind: "section-block";
      title: string;
      headingSlotId: string;
      bodySlotId: string;
    }
  | {
      blockId: string;
      kind: "columns-grid";
      title: string;
      /** CSS Grid template columns, e.g. ["1fr", "1fr"] or ["1.2fr", "1fr"] */
      widths: string[];
      slotIds: string[];
    }
  | {
      blockId: string;
      kind: "structured-table";
      title: string;
      /** Explicit column widths, e.g. ["22%", "48%", "30%"] */
      columnWidths: string[];
      rows: {
        rowId: string;
        height?: string;
        cells: TableCellSlotDef[];
      }[];
    }
  | {
      blockId: string;
      kind: "fillable-group";
      title: string;
      slotId: string;
      assigneeName: string;
      fieldType: "text-area" | "signature" | "date" | "kpi-summary";
    };

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
