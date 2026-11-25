/**
 * @vibe/vdoc-schema — AI-Native Structural Asset Schema (`.vasset`)
 *
 * 에셋(Asset) = 현재 표준 파싱 문법(`.outline` + `.vdoc`)으로 추상화해 보관하는
 * 재사용 가능한 구조(뉘앙스) 레시피.
 * - 스타일 토큰(`.vstyle`)과 분리된 순수 구조 골격(`outlineDsl` + `blocks`/`slots`)을 정본으로 보관한다.
 * - 파싱(등록)과 적용(다른 항목명·칸·구성에 뉘앙스 재구성)은 AI 베이스 파이프라인이 수행한다.
 */
import type { LayoutBlock, VDocSlot } from "../types";

export type VDocAssetKind = "a4-page" | "blog-section" | "table" | "list" | "callout" | "columns";
export type VDocAssetScope = "document" | "section" | "element";
export type AssetSchemaVersion = "v1" | "v2";
export type AssetFlowMode = "prose-form" | "grid-form" | "hybrid";
export type AssetPrimitiveKind =
  | "header-band"
  | "title-block"
  | "kv-block"
  | "prose"
  | "divider-band"
  | "clause-tree"
  | "table-grid"
  | "signoff-block"
  | "media"
  | "callout";
export type ClauseNumberingScheme = "legal-kr" | "article-kr" | "official-kr" | "decimal";

export interface AssetFieldSpec {
  readonly id: string;
  readonly label: string;
  readonly type: "string" | "date" | "currency" | "party" | "rich-text" | "image" | "list";
  readonly required?: boolean;
  readonly repeatable?: boolean;
  readonly placeholder?: string;
  /** 이 슬롯을 채울 때 에이전트가 참조해야 할 원천 리소스/RAG 힌트 */
  readonly evidenceHint?: string;
}

export interface AssetPrimitiveTraits {
  readonly border?: "none" | "underline" | "grid";
  readonly align?: "left" | "center" | "right" | "justify";
  readonly letterSpacing?: "normal" | "wide";
  readonly hangingIndent?: boolean;
  readonly firstLineIndent?: boolean;
  readonly labelWidth?: string;
  readonly variant?: string;
  readonly numberingScheme?: ClauseNumberingScheme;
}

export interface AssetPrimitiveNode {
  readonly id: string;
  readonly type: AssetPrimitiveKind;
  readonly zone?: "header" | "body" | "footer";
  readonly repeatable?: boolean;
  readonly traits?: AssetPrimitiveTraits;
  readonly fixedText?: string;
  readonly templateText?: string;
  readonly left?: string;
  readonly right?: string;
  readonly rows?: readonly { readonly label: string; readonly value: string }[];
  readonly items?: readonly {
    readonly title?: string;
    readonly lead?: string;
    readonly children?: readonly { readonly text: string }[];
  }[];
  /** table-grid 등 기존 DSL 브리지가 필요한 경우의 원천 줄 목록 */
  readonly tableDsl?: readonly string[];
}

export interface VDocAssetV2Spec {
  readonly flowMode: AssetFlowMode;
  readonly zones: {
    readonly header?: readonly AssetPrimitiveNode[];
    readonly body: readonly AssetPrimitiveNode[];
    readonly footer?: readonly AssetPrimitiveNode[];
  };
  readonly fields: readonly AssetFieldSpec[];
}

export interface VDocAssetNuance {
  /** 1~2문장: 이 양식이 주는 구조적·시각적 인상과 적합한 용도. */
  summary: string;
  /** AI가 데이터를 재구성할 때 따를 구조 변환 논리 (그룹핑, 병합, 체크박스, 복합 셀 등). */
  structureRules: string[];
  /** 선택적 시각 뉘앙스 참고 지침 (헤더 위치, 여백·정렬 인상). */
  visualRules?: string[];
  /** 사용자 데이터의 항목 수·칸 수가 다를 때 AI가 유연하게 적응하는 힌트. */
  adaptationHints?: string[];
}

export interface VDocAssetStructure {
  /** 표준 `.outline` 문법으로 추상화된 구조 골격 (`{{자리표시자}}` 포함). */
  outlineDsl: string[];
  /** 표준 `.vdoc` 블록 트리 (라이브 2D 썸네일 렌더 + 빈 상태 즉시 꽂기 + AI Few-Shot 모범답안 겸용). */
  blocks: LayoutBlock[];
  /** `blocks` 가 참조하는 슬롯 맵. */
  slots: Record<string, VDocSlot>;
  /** 페이지/섹션 단위 에셋일 때의 지면 메타 힌트. */
  pageMeta?: {
    pageLabel?: string;
    unitKind?: "page" | "section";
    sectionRole?: string;
    surfaceWidth?: number;
  };
}

export interface VDocAssetOrigin {
  sourceType: "builtin" | "vdoc-capture" | "ref-extract" | "manual";
  /** 원천 파일 포인터 (예: `vault://01. Architecture/00. System-Proposal.vdoc#tbl_5_table`). */
  sourceRef?: string;
  /** 원천 `.ref` 스캔/스크린샷 URL (멀티모달 AI 참조용). */
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VDocAsset {
  version: "1.0.0" | "2.0.0";
  /** 스키마 A/B 드라이버 식별자 (생략 시 `"v1"` 로 취급) */
  schemaVersion?: AssetSchemaVersion;
  assetId: string;
  title: string;
  scope: VDocAssetScope;
  assetKind: VDocAssetKind;
  /** 호환 대상 블록/요소 종류 (`structured-table`, `section`, `page`, `text`, `columns-grid` 등). */
  targetKind: string;
  category: string;
  tags: string[];
  nuance: VDocAssetNuance;
  structure: VDocAssetStructure;
  /** `v2` 확장 가능 프리미티브 · 영역 · 필드 계약 정본 (v1 에서는 생략) */
  v2?: VDocAssetV2Spec;
  origin: VDocAssetOrigin;
}

export interface AssetCompileValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly sanitizedBlocks: LayoutBlock[];
  readonly sanitizedSlots: Record<string, VDocSlot>;
}
