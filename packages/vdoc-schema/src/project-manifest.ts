/**
 * @vibe/vdoc-schema — Multi-Document Project Manifest (`.vproj`), 4-Level Zoom Hierarchy,
 * Read-Only Reference Projects Deck, Provenance Lineage, and 3-Phase AI Staging Contracts.
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

/** AI 가 작업대에 제안하는 Staged 변경안. `targetKind` 로 `payload` 모양이 정해진다. */
export type StagedAiChange = StagedOutlineNodeChange | StagedTemplateBlockChange | StagedSlotHtmlChange;
export type StagedTargetKind = StagedAiChange["targetKind"];

export interface VProjectManifest {
  projectId: string;
  title: string;
  description: string;
  isReferenceOnly: boolean;
  activePhase: WorkbenchPhase;
  docIds: string[];
  referenceProjectIds: string[];
  storylineNodes: OutlinerNode[];
  provenanceLineage: ProvenanceRecord[];
  updatedAt: string;
}

export interface OutlineBreadcrumbItem {
  nodeId: string;
  title: string;
  zoomLevel: ZoomLevel;
}
