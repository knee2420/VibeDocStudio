import type { EvidenceLocator } from "./evidence";
/**
 * @vibe/vdoc-schema — Multi-Document Project Manifest (`.vproj`), 4-Level Zoom Hierarchy,
 * Provenance Lineage, and 3-Phase AI Staging Contracts. (References are not projects — see `/api/reference`.)
 */

export type ZoomLevel = "project" | "document" | "page" | "slot";

export type WorkbenchPhase = "storylining" | "templating" | "drafting";

export type OutlinerAiStatus = "idle" | "working" | "staged" | "applied";

export interface OutlinerNode {
  nodeId: string;
  parentId: string | null;
  depth: number;
  zoomLevel: ZoomLevel;
  title: string;
  summary: string;
  targetDocId?: string | null;
  targetPageId?: string | null;
  targetBlockId?: string | null;
  targetSlotId?: string | null;
  recommendedTemplateId?: string | null;
  provenanceSourceProjectId?: string | null;
  provenanceSourceNodeId?: string | null;
  aiStatus?: OutlinerAiStatus;
  collapsed?: boolean;
  /** 고정 텍스트(서식 제목 · 안내문 · 이미지). 채울 칸이 아니라 회색으로 표시한다. */
  isStatic?: boolean;
  /** 라벨 규칙으로 이름을 찾지 못해 위치로 지은 노드. 트리에 ⚠ 로 표시한다. */
  nameNeedsReview?: boolean;
}

export interface ProvenanceRecord {
  recordId: string;
  targetProjectId: string;
  targetNodeId: string;
  sourceProjectId: string;
  sourceProjectTitle: string;
  sourceNodeId: string;
  sourceNodeTitle: string;
  clonedAt: string;
}

interface StagedAiChangeBase {
  diffId: string;
  phase: WorkbenchPhase;
  targetId: string;
  title: string;
  beforeSummary: string;
  afterSummary: string;
  sourceReferenceIds: string[];
  /** 대상 문서 (슬롯 · 블록 · 변수 변경안). 없으면 예전 변경안 — 활성 문서로 본다. */
  docId?: string;
  /** 변경안을 만들 때 대상의 내용 지문 (`contentHash`). 승인 시 다르면 그사이 사람이 고친 것 → "오래됨". */
  baseHash?: string;
  /** 같은 실행(지시 한 번)에서 나온 변경안 묶음 · 그 실행의 하네스 */
  runId?: string;
  harnessId?: string;
  createdAt?: string;
  /** AI 가 실제로 쓴 근거 (승인하면 슬롯 근거 링크로 기록된다) */
  evidence?: StagedEvidence[];
  /** 게이트 경고 (줄 수 초과 · 근거 없는 문장 …) — 막지는 않고 검토자에게 보인다 */
  warnings?: string[];
}

/** 변경안에 실린 근거: 본문 인용 id(`data-cite`) ↔ 위치. */
export interface StagedEvidence {
  citationId?: string;
  locator: EvidenceLocator;
}

/** Phase 1: 아웃라인 노드 삽입안. `node.parentId` 가 없으면 서버가 아웃라인 루트로 정한다. */
export interface StagedOutlineNodeChange extends StagedAiChangeBase {
  targetKind: "outline-node";
  payload: {
    operation: "insert_node";
    projectId: string;
    node: Partial<OutlinerNode> & { nodeId: string; title: string };
  };
}

/** Phase 2: 노드 서식 블록 배정안. */
export interface StagedTemplateBlockChange extends StagedAiChangeBase {
  targetKind: "template-block";
  payload: {
    operation: "assign_template_block";
    projectId: string;
    docId: string;
    nodeId: string;
    templateKind: string;
    rationale?: string;
  };
}

/** Phase 3: 슬롯 본문 초안. */
export interface StagedSlotHtmlChange extends StagedAiChangeBase {
  targetKind: "slot-html";
  payload: { slotId: string; html: string };
}

/** Phase 3: 블록 속성 변경안 (이미지 대체 텍스트 · 정렬 · 담당자 …). 바꿀 수 있는 속성은 블록 정의가 정한다. */
export interface StagedBlockPropsChange extends StagedAiChangeBase {
  targetKind: "block-props";
  payload: { blockId: string; props: Record<string, string | number | boolean> };
}

/** AI 가 작업대에 제안하는 Staged 변경안. `targetKind` 로 `payload` 모양이 정해진다. */
/** Phase 3: 문서 변수 값 (`doc.variables` — 본문의 `[변수]` 칩이 이 값을 보인다). */
export interface StagedVariablesChange extends StagedAiChangeBase {
  targetKind: "variables";
  payload: { variables: Record<string, string> };
}

export type StagedAiChange =
  | StagedOutlineNodeChange
  | StagedTemplateBlockChange
  | StagedSlotHtmlChange
  | StagedBlockPropsChange
  | StagedVariablesChange;
export type StagedTargetKind = StagedAiChange["targetKind"];

export interface VProjectManifest {
  projectId: string;
  title: string;
  description: string;
  activePhase: WorkbenchPhase;
  docIds: string[];
  storylineNodes: OutlinerNode[];
  provenanceLineage: ProvenanceRecord[];
  updatedAt: string;
}

export interface OutlineBreadcrumbItem {
  nodeId: string;
  title: string;
  zoomLevel: ZoomLevel;
}
