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
  version: "1.0.0";
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
  origin: VDocAssetOrigin;
}

export interface AssetCompileValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly sanitizedBlocks: LayoutBlock[];
  readonly sanitizedSlots: Record<string, VDocSlot>;
}
