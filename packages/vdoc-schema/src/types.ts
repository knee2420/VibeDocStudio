/**
 * @vibe/vdoc-schema
 * Core Data Contract for `.vdoc` (UTF-8 JSON) Documents
 * Combines PandaDoc Kolas Editor 4-Layer Page Anatomy + Puck Layout Tree + Maily.to Section/Column Attributes + Slot-Scoped Backdata
 */

import type { StyleOverrideDelta, VDocStyleRef } from "@vibe/style-core";
import type { EvidenceLink, EvidenceLocator } from "./evidence";
import type { DocumentViewId } from "./view-registry";

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
  outerTop?: string;     // 4변 외곽선 개별 제어 (생략 시 outer 폴백)
  outerRight?: string;
  outerBottom?: string;
  outerLeft?: string;
  headerTop?: string;    // e.g. "2px solid #336699"
  headerBottom?: string; // e.g. "1px solid #e2e8f0"
  rowBottom?: string;    // e.g. "1px solid #e2e8f0"
  vertical?: string;     // e.g. "none" | "1px solid #0f172a"
  radius?: string;       // e.g. "0px" (sharp HWP grid) | "6px"
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
  /** Recursive nested blocks inside this column container (page-scale fractal layout). */
  blocks?: LayoutBlock[];
  /** 이 열을 만든 원본 `<<col>>` 불릿 id (outline ↔ vdoc 컨테이너 동형 · 역동기화용). */
  sourceNodeId?: string;
}

/**
 * Ported from `_upstreams/maily.to/packages/core/src/editor/nodes/columns/column.ts`
 * & `_upstreams/puck/apps/demo/config/components/Layout/index.tsx`
 */
export interface TableCellSlotDef {
  cellId: string;
  slotId: string;
  /** 활성 `.vstyle` 의 `styles.table[styleKey].cells[cellRole]` 과 라이브 바인딩되는 열린 역할 키. */
  cellRole?: string;
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
  whiteSpace?: "normal" | "nowrap" | "pre-wrap";
  fontVariantNumeric?: "normal" | "tabular-nums";
  listIndent?: string;
  hangingIndent?: string;
  /** Recursive nested blocks inside this table cell (lists, images, callouts, nested tables/grids). */
  blocks?: LayoutBlock[];
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
  /** 문서 단위 성격: A4 는 `"page"`, Blog/Web 은 `"section"`. 생략 시 View 프로필에서 추론. */
  unitKind?: "page" | "section";
  /** `unitKind === "section"` 일 때의 의미적 역할 힌트 (예: `"hero"`, `"tip"`, `"spot"`, `"outro"`). */
  sectionRole?: string;
  /** 섹션 단위로 역추출/보관할 수 있는 원본 Outline DSL 스냅샷 (선택). */
  outlineDsl?: string[];
  /** 양방향 `.outline` ↔ `.vdoc` 동기화를 위한 원본 섹션 불릿 ID. */
  sourceNodeId?: string;
  headerSlotId: string;
  blocks: LayoutBlock[];
  footerSlotId: string;
  hideHeaderFooter?: boolean;
  engine?: "dom" | "typst";
  typstSvg?: string;
  typstTemplate?: string;
  pageRect?: { width: number; height: number; unit?: "px" | "pt" | "mm" | "%" };
  layout?: VDocPageLayout;
  /** Section/Page-level Cascade override applied on top of the active StylePack. */
  styleOverrides?: StyleOverrideDelta;
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

/**
 * CRUD 가능한 Element/Syntax 레지스트리 및 Document Profile 참조 메타데이터.
 * 문서가 어떤 스키마 표준과 레지스트리 버전을 기준으로 정비되었는지 선언한다.
 */
export interface VDocSchemaRef {
  /** 문서 프로파일 ID (예: `"blog"`, `"a4"`, `"web"`). */
  profileId: string;
  /** 레지스트리 JSON 파일 포인터 (예: `"vault://.../schema/element-registry.json"`). */
  registryPath?: string;
  /** 사용된 레지스트리 버전 (예: `"1.0.0"`). */
  registryVersion: string;
  /** 이 문서가 활용하는 Element 정의 ID 목록 (예: `["section", "table"]`). */
  elementIds?: string[];
}

/**
 * `.vdoc` 문서가 바인딩된 원천 `.outline` 파일 및 마스터 아웃라인 내 루트 노드 포인터.
 * 1개의 마스터 `.outline` 안에 여러 개의 `<<doc:...>>` / `<<view:...>>` 문서가 공존할 수 있다 (1:N 매핑).
 */
export interface VDocOutlineRef {
  /** 볼트 내 `.outline` 파일 포인터 (예: `"vault://워크샵/2026_하반기_워크샵.outline"`). */
  outlinePath: string;
  /** 마스터 `.outline` 파일의 불변 고유 ID (`OutlineFilePayload.id`). 파일·폴더 이동 시 경로 자가 치유(Self-Healing)에 사용된다. */
  outlineId?: string;
  /** 마스터 `.outline` 안에서 이 `.vdoc` 이 바인딩된 루트 불릿 ID (`<<doc:...>>` 또는 `<<view:...>>`). */
  rootNodeId?: string;
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
  /** 활성 View 프로필 ID (`a4` · `blog` · `web` 등, Notion View 개념). 없으면 `surface`/`genre`에서 자동 추론. */
  viewId?: DocumentViewId;
  /** 장르 — 레퍼런스 층위 세트 이름 (document · blog · …). 문서 성격 표시이자 측정 기준. */
  genre?: string;
  /** CRUD 가능한 Element/Syntax 레지스트리 및 스키마 프로파일 참조. */
  schemaRef?: VDocSchemaRef;
  /** 분리된 스타일 엔진(`.vstyle.json`) 포인터 참조 (사본 복제 금지). */
  styleRef?: VDocStyleRef;
  /** 원천 레퍼런스(.ref) 포인터 (예: `"vault://...ref"`). 본문 사본을 중복 저장하지 않는다. */
  sourceRef?: string;
  /** 양방향 동기화 원천 `.outline` 파일 및 루트 불릿 포인터 (1:N 바인딩). */
  outlineRef?: VDocOutlineRef;
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
