import type { OutlineNodeType } from "@vibe/outliner";
import type { LayoutBlock, StructuredTableBlockDef, VDocSlot } from "@vibe/vdoc-schema";

/**
 * `/playground` 경량 3단계(WYSIWYM → Layout Binding → WYSIWYG) 실험실 도메인 타입.
 */

export type PlaygroundMode = "wysiwym" | "wysiwyg";

/** Phase 1 에서 다루는 순수 의미 역할 (조판 용어 배제). */
export type SemanticRole = "cover" | "summary" | "group" | "section" | "body" | "form-ref";

/** Phase 2 에서 비파괴로 갈아끼우는 시각 틀 종류. */
export type LayoutChoice =
  | "hero"
  | "cover-banner"
  | "heading"
  | "callout-box"
  | "columns-grid"
  | "structured-table"
  | "rfp-spec-table"
  | "rfp-summary-table"
  | "section-block"
  | "text"
  | "form-ref";

export type SurfaceKind = "paged" | "scroll";

export type DensityPreset = "relaxed" | "standard" | "compact";

export type DocumentTheme = "modern" | "official";

export type PlaygroundPresetId =
  | "blank"
  | "workshop-request"
  | "a4-report"
  | "blog-article"
  | "rfp-complex"
  | "agui-protocol-demo";

export interface PlaygroundNode {
  id: string;
  text: string;
  note?: string;
  nodeType?: OutlineNodeType;
  isCompleted?: boolean;
  isFolded?: boolean;
  role: SemanticRole;
  layoutChoice: LayoutChoice;
  children: PlaygroundNode[];
}

/**
 * WYSIWYG 가 직접 소유하는 복합 표·양식 블록 상태 (아웃라이너에는 1줄 포인터로만 노출).
 */
export interface CustomFormState {
  blocks: LayoutBlock[];
  slots: Record<string, VDocSlot>;
}

export interface PlaygroundDocSpec {
  id: PlaygroundPresetId;
  label: string;
  badge: string;
  description: string;
  title: string;
  surfaceKind: SurfaceKind;
  density: DensityPreset;
  theme: DocumentTheme;
  nodes: PlaygroundNode[];
  customForms: Record<string, CustomFormState>;
}

export type FormAssetId =
  | "asset-survey-sheet"
  | "asset-approval-plan"
  | "asset-schedule-ops"
  | "asset-budget-compare"
  | "asset-general-doc";

export type FormAssetCategory =
  | "all"
  | "survey"
  | "approval"
  | "ops"
  | "budget"
  | "standard";

export type BlockRoleKind =
  | "title"
  | "list"
  | "table"
  | "web-form"
  | "guide"
  | "meta-table"
  | "approval-box"
  | "main-table"
  | "roster-table"
  | "schedule-table"
  | "budget-table";

export type BlockVariantId =
  | "title-underline"
  | "title-section-bar"
  | "title-with-approval"
  | "title-boxed-seal"
  | "title-web-hero"
  | "webform-card-google"
  | "webform-minimal-tally"
  | "webform-pill-chips"
  | "webform-step-accent"
  | "list-square-box"
  | "list-filled-square"
  | "list-numbered"
  | "table-grouped-compare"
  | "table-modern-flat"
  | "table-roster-ledger"
  | "table-header-below-matrix"
  | "table-eval-checklist"
  | "table-grid-4col"
  | "table-header-below"
  | "table-choice-matrix"
  | "table-stacked-box"
  | "table-banner-rows"
  | "table-roster-pivot"
  | "table-2col-kv"
  | "table-checkbox"
  | "table-3col-notes"
  | "guide-inline"
  | "guide-notice-box"
  | "guide-doc-number"
  | "meta-2x4"
  | "meta-with-approval"
  | "meta-2col-kv"
  | "approval-4col"
  | "approval-3col"
  | "approval-2col-date"
  | "main-grouped-grid"
  | "main-printable-checkbox"
  | "main-official-bullets"
  | "main-summary-matrix"
  | "roster-9col"
  | "roster-compact-sign"
  | "roster-grouped-summary"
  | "sched-3track-merged"
  | "sched-timeline-4col"
  | "sched-plan-ab"
  | "budget-dual-ab"
  | "budget-single-detail"
  | "budget-per-head";

export interface PlaygroundBlockMeta {
  blockId: string;
  pageId: string;
  role: BlockRoleKind;
  label: string;
  defaultVariant: BlockVariantId;
}

export interface LinkedPageSpec {
  id: string;
  nodeId: string;
  title: string;
  assetHint?: string;
  node: PlaygroundNode;
  isImplicit?: boolean;
}

export interface LinkedDocumentSpec {
  id: string;
  nodeId: string;
  title: string;
  docFormat?: string;
  node: PlaygroundNode;
  pages: LinkedPageSpec[];
  isImplicitDoc?: boolean;
  isFallbackFullTree?: boolean;
}

export interface SlotReverseTarget {
  nodeId: string;
  field: "text" | "note" | "cell" | "kv-key" | "kv-value";
  cellIndex?: number;
}

/**
 * WYSIWYG 시트에서 동적 `<<table>>` 블록에 가한 표 구조·병합·너비·테두리 편집 스냅샷.
 */
export interface TableBlockOverride {
  block: StructuredTableBlockDef;
  slots: Record<string, VDocSlot>;
}

/** `<<table>>` 블록 × 에셋 변형별 컴파일 결과(`<<view:table>>`) 캐시 항목. */
export interface TableViewCacheEntry {
  sourceHash: string;
  viewNodes: PlaygroundNode[];
  generatedBy: "ai" | "preset" | "rule" | "manual";
  promptNote?: string;
  modelLabel?: string;
  updatedAt: number;
}

/** 목업 내 AI 표 컴파일 에이전트 실행 상태. */
export interface AiCompileStatus {
  runningBlockId: string | null;
  runningVariantId: BlockVariantId | null;
  streamPreview: string;
  error: string | null;
  activeEngineLabel: string | null;
}
