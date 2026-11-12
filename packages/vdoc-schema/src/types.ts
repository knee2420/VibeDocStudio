/**
 * @vibe/vdoc-schema
 * Core Data Contract for `.vdoc` (UTF-8 JSON) Documents
 * Combines PandaDoc Kolas Editor 4-Layer Page Anatomy + Puck Layout Tree + Maily.to Section/Column Attributes + Slot-Scoped Backdata
 */

import type { EvidenceLink, EvidenceLocator } from "./evidence";

export type SlotRole = "editable-slot" | "fillable-field";

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
  /** Content before the first edit; `restoreSlotOriginal()` puts it back. */
  originalContent?: string;
  /** 누가 · 어떻게 채웠는가 (Phase 3 채움 상태 · 이력 · 검증 표시). `slotFillState()` 가 읽는다. */
  fill?: SlotFillMeta;
}

export interface SlotFillMeta {
  author: "human" | "ai";
  /** AI 가 채웠다면 그 하네스 · 실행 */
  harnessId?: string;
  runId?: string;
  at: string;
  /** 사람이 내용을 확인한 시각 — 있으면 "검증됨" */
  verifiedAt?: string;
}

export interface BackdataChunk {
  chunkId: string;
  sourceTitle: string;
  sourceType: "markdown" | "transcript" | "pdf" | "sheet";
  excerpt: string;
  updatedAt: string;
  tags: string[];
  /** 백데이터가 온 원본 위치 (있으면 인용을 눌렀을 때 원본으로 이동한다) */
  locator?: Omit<EvidenceLocator, "kind" | "refId" | "label">;
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
  /** Full-page background fill color (e.g. '#f2f6fb') recovered from imported layouts. */
  background?: string;
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
  pageRect?: { width: number; height: number; unit?: "px" | "pt" | "mm" | "%" };
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

/**
 * Static preview assets captured from the document's source (served from the studio `public/`).
 * Documents without captures omit it; the studio then shows a page placeholder instead.
 */
export interface VDocPreviewAssets {
  /** Page captures in page order. A page past the end reuses the last capture. */
  pageThumbnails?: string[];
  /** Original PDF the document was imported from. */
  sourcePdfUrl?: string;
  /** Original web page the document was transcribed from. */
  sourceWebUrl?: string;
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
  preview?: VDocPreviewAssets;
  /** 슬롯 ↔ 근거 연결 (`evidence.ts`) */
  evidenceLinks?: EvidenceLink[];
  /** 서버 저장 버전 — 저장할 때 보낸 버전이 서버와 다르면 충돌(409)이다 (다른 탭 · 다른 사람). */
  revision?: number;
  /** 지면: paged = A4 쪽 나눔(기본) · scroll = 높이가 내용 따라 늘고 쪽 사이 이음매 없는 한 단(블로그). */
  surface?: VDocSurface;
  /** 장르 — 레퍼런스 층위 세트 이름 (document · blog · …). 문서 성격 표시이자 측정 기준. */
  genre?: string;
  /** 누가 만들었나 — agent 가 만든 초안은 에이전트가 구조(블록 · 쪽)까지 직접 고칠 수 있다. */
  origin?: VDocOrigin;
  /** 속한 프로젝트 (프로젝트 manifest 의 docIds 와 짝). */
  projectId?: string;
}

export interface VDocSurface {
  kind: "paged" | "scroll";
  /** scroll 지면 폭 (px). 기본 720. */
  width?: number;
}

export interface VDocOrigin {
  createdBy: "user" | "agent" | "import";
  createdAt?: string;
  /** agent 가 만들었으면 그 작업 세션. */
  sessionId?: string;
}

/** 문서의 지면 (없으면 A4 쪽 나눔). */
export function documentSurface(doc: Pick<VDocDocument, "surface"> | null | undefined): Required<VDocSurface> {
  const kind = doc?.surface?.kind === "scroll" ? "scroll" : "paged";
  return { kind, width: doc?.surface?.width ?? (kind === "scroll" ? 720 : 794) };
}
